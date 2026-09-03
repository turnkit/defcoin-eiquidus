var express = require('express'),
    path = require('path'),
    nodeapi = require('./lib/nodeapi'),
    favicon = require('serve-favicon'),
    logger = require('morgan'),
    cookieParser = require('cookie-parser'),
    request = require('postman-request'),
    settings = require('./lib/settings'),
    routes = require('./routes/index'),
    lib = require('./lib/explorer'),
    db = require('./lib/database'),
    package_metadata = require('./package.json');
const defcoinMiningCatalog = require('./lib/defcoin_mining_catalog');
const defcoinPeerFqdnTargets = require('./lib/defcoin_peer_fqdn_targets');
const inputguard = require('./lib/inputguard');
var app = express();
app.set('trust proxy', inputguard.isTrustedProxyAddress);
app.locals.safeJsonForScript = inputguard.safeJsonForScript;
var apiAccessList = [];
var viewPaths = [path.join(__dirname, 'views')]
var pluginRoutes = [];
const { exec } = require('child_process');
const Decimal = require('decimal.js');
const dns = require('dns');
const net = require('net');
const dnsPromises = dns.promises;
const PEER_FQDN_TIMEOUT_MS = 900;
const KNOWN_PEER_FQDN_TTL_MS = 10 * 60 * 1000;
const REVERSE_PEER_FQDN_TTL_MS = 10 * 60 * 1000;
const PUBLIC_NODE_ENDPOINT_TTL_MS = 5 * 60 * 1000;
const NETWORK_OVERVIEW_TTL_MS = 30 * 1000;
const MINING_ESTIMATE_TTL_MS = 30 * 1000;
const MAX_PEER_FQDN_LOOKUPS = 64;
const MAX_REVERSE_PEER_CACHE_ENTRIES = 256;
const PEER_FQDN_LOOKUP_CONCURRENCY = 4;
const DEFCOIN_PUBLIC_HOST = 'defcoin.dc903.org';
const DEPRIORITIZED_KNOWN_PEER_FQDNS = new Set([
  'seed.defcoin.mikej.tech'
]);
let knownPeerFqdnCache = {
  expiresAt: 0,
  builtAt: '',
  byAddress: new Map(),
  byDomain: new Map(),
  inFlight: null
};
let publicNodeEndpointCache = {
  host: '',
  expiresAt: 0,
  value: {
    address: '50.116.19.40',
    fqdn: '',
    fqdn_alias: 'defcoin.dc903.org',
    fqdn_source: 'known-seed-alias',
    seed_aggregator: ''
  }
};
let reversePeerFqdnCache = new Map();
let networkOverviewCache = {
  expiresAt: 0,
  value: null,
  inFlight: null
};
let miningEstimateCache = {
  expiresAt: 0,
  value: null,
  inFlight: null
};
const DEFCOIN_POOL_API_BASE = process.env.DEFCOIN_POOL_API_BASE || 'https://defcoin.dc903.org/poolapi';

function decimalOrZero(value) {
  try {
    if (value == null || value === '')
      return new Decimal('0');

    return new Decimal(value.toString());
  } catch (error) {
    return new Decimal('0');
  }
}

function formatHashrateLabel(value) {
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
  let rate = Number(value || 0);
  let unitIndex = 0;

  while (rate >= 1000 && unitIndex < (units.length - 1)) {
    rate /= 1000;
    unitIndex += 1;
  }

  if (!Number.isFinite(rate) || rate <= 0)
    return '-';

  return `${rate.toFixed(rate >= 100 ? 0 : 2)} ${units[unitIndex]}`;
}

function requestJson(uri) {
  return new Promise(function(resolve, reject) {
    request({
      uri: uri,
      json: true,
      gzip: true,
      timeout: 5000
    }, function(error, response, body) {
      if (error)
        return reject(error);
      if (response == null || response.statusCode < 200 || response.statusCode >= 300)
        return reject(new Error(`Unexpected status code from ${uri}`));

      return resolve(body);
    });
  });
}

async function fetchPoolApiSnapshot() {
  const baseUrl = DEFCOIN_POOL_API_BASE.replace(/\/$/, '');
  const [currencyInfo, localStats, globalStats, recentBlocks] = await Promise.all([
    requestJson(baseUrl + '/web/currency_info'),
    requestJson(baseUrl + '/local_stats'),
    requestJson(baseUrl + '/global_stats'),
    requestJson(baseUrl + '/recent_blocks')
  ]);

  return {
    currencyInfo: currencyInfo || {},
    localStats: localStats || {},
    globalStats: globalStats || {},
    recentBlocks: Array.isArray(recentBlocks) ? recentBlocks : []
  };
}

async function getMiningEstimatePayload() {
  const now = Date.now();

  if (miningEstimateCache.value != null && miningEstimateCache.expiresAt > now)
    return miningEstimateCache.value;

  if (miningEstimateCache.inFlight)
    return miningEstimateCache.inFlight;

  miningEstimateCache.inFlight = fetchPoolApiSnapshot()
    .then(buildMiningEstimatePayload)
    .then(function(value) {
      miningEstimateCache.value = value;
      miningEstimateCache.expiresAt = Date.now() + MINING_ESTIMATE_TTL_MS;
      return value;
    })
    .finally(function() {
      miningEstimateCache.inFlight = null;
    });

  return miningEstimateCache.inFlight;
}

function buildMiningEstimatePayload(snapshot) {
  const symbol = (snapshot.currencyInfo && snapshot.currencyInfo.symbol ? snapshot.currencyInfo.symbol : 'DFC');
  const localStats = snapshot.localStats || {};
  const globalStats = snapshot.globalStats || {};
  const recentBlocks = snapshot.recentBlocks || [];
  const minerRates = localStats.miner_hash_rates || {};
  const localHashrate = Object.keys(minerRates).reduce(function(sum, key) {
    return sum.plus(decimalOrZero(minerRates[key]));
  }, new Decimal('0'));
  const poolHashrate = decimalOrZero(globalStats.pool_hash_rate);
  const poolNonstaleHashrate = decimalOrZero(globalStats.pool_nonstale_hash_rate);
  const walletNetworkEstimate = decimalOrZero(globalStats.network_hashrate);
  const recentLocalHashrate = decimalOrZero(((localStats.my_hash_rates_in_last_hour || {}).actual));
  const recentShareCount = decimalOrZero(((localStats.my_share_counts_in_last_hour || {}).shares));
  const attemptsToBlock = decimalOrZero(localStats.attempts_to_block);
  const attemptsToShare = decimalOrZero(localStats.attempts_to_share);
  const blockReward = decimalOrZero(localStats.block_value);
  const feeMultiplier = Decimal.max(new Decimal('0'), new Decimal('1').minus(decimalOrZero(localStats.fee).div('100')));
  const latestPoolBlockTs = (recentBlocks.length > 0 ? Number(recentBlocks[0].ts || 0) : 0);
  const nowTs = Math.floor(Date.now() / 1000);
  const hasRecentPoolBlock = (latestPoolBlockTs > 0 && ((nowTs - latestPoolBlockTs) < (24 * 60 * 60)));
  const liveNetworkFloor = Decimal.max(localHashrate, poolHashrate, poolNonstaleHashrate);
  const networkEstimateLabel = (hasRecentPoolBlock && walletNetworkEstimate.gt(0) ? formatHashrateLabel(walletNetworkEstimate) : `>= ${formatHashrateLabel(liveNetworkFloor)} observed live`);

  return {
    checkedOn: defcoinMiningCatalog.checkedOn,
    defaultPowerCostUsdPerKwh: defcoinMiningCatalog.defaultPowerCostUsdPerKwh,
    context: {
      poolContextLabel: `${formatHashrateLabel(poolHashrate)} global pool, ${blockReward.toFixed(8)} ${symbol} reward`,
      networkContextLabel: networkEstimateLabel,
      blockRewardCoins: blockReward.toFixed(8),
      poolHashrateHps: poolHashrate.toFixed(),
      localHashrateHps: localHashrate.toFixed(),
      observedNetworkFloorHps: liveNetworkFloor.toFixed()
    },
    rigs: defcoinMiningCatalog.rigs.map(function(rig) {
      const rigHashrate = decimalOrZero(rig.hashrateHps);
      const powerCostPerDay = decimalOrZero(rig.watts).div('1000').mul(defcoinMiningCatalog.defaultPowerCostUsdPerKwh).mul('24');
      const expectedDfCPerDay = (attemptsToBlock.gt(0) ? blockReward.mul(feeMultiplier).mul(rigHashrate).mul('86400').div(attemptsToBlock) : null);
      let observedRecentDfCPerDay = null;

      if (recentLocalHashrate.gt(0) && recentShareCount.gt(0) && attemptsToShare.gt(0) && attemptsToBlock.gt(0)) {
        const observedSharesPerSecondPerHash = recentShareCount.div('3600').div(recentLocalHashrate);
        const estimatedCoinsPerShare = blockReward.mul(feeMultiplier).mul(attemptsToShare).div(attemptsToBlock);

        observedRecentDfCPerDay = rigHashrate.mul(observedSharesPerSecondPerHash).mul(estimatedCoinsPerShare).mul('86400');
      }

      return {
        id: rig.id,
        name: rig.name,
        class: rig.class,
        classLabel: rig.class,
        summary: rig.summary,
        watts: rig.watts,
        hashrateHps: rigHashrate.toFixed(),
        hashrateLabel: formatHashrateLabel(rigHashrate),
        priceRangeLabel: rig.priceRangeUsd,
        powerCostPerDayUsd: powerCostPerDay.toNumber(),
        observedRecentDfCPerDayLabel: (observedRecentDfCPerDay == null ? 'Unavailable' : `${observedRecentDfCPerDay.toFixed(4)} ${symbol}/day`),
        expectedDfCPerDayLabel: (expectedDfCPerDay == null ? 'Unavailable' : `${expectedDfCPerDay.toFixed(4)} ${symbol}/day`),
        sources: [
          {
            label: rig.priceSourceLabel,
            url: rig.priceSourceUrl
          },
          {
            label: rig.specSourceLabel,
            url: rig.specSourceUrl
          }
        ]
      };
    })
  };
}

// pass wallet rpc connection info to nodeapi
nodeapi.setWalletDetails(settings.wallet);
// dynamically build the nodeapi cmd access list by adding all non-blockchain-specific api cmds that have a value
Object.keys(settings.api_cmds).forEach(function(key, index, map) {
  if (key != 'use_rpc' && key != 'rpc_concurrent_tasks' && settings.api_cmds[key] != null && settings.api_cmds[key] != '')
    apiAccessList.push(key);
});
// dynamically find and add additional blockchain_specific api cmds
Object.keys(settings.blockchain_specific).forEach(function(key, index, map) {
  // check if this feature is enabled and has api cmds
  if (settings.blockchain_specific[key].enabled == true && Object.keys(settings.blockchain_specific[key]).indexOf('api_cmds') > -1) {
    // add all blockchain specific api cmds that have a value
    Object.keys(settings.blockchain_specific[key]['api_cmds']).forEach(function(key2, index, map) {
      if (settings.blockchain_specific[key]['api_cmds'][key2] != null && settings.blockchain_specific[key]['api_cmds'][key2] != '')
        apiAccessList.push(key2);
    });
  }
});

// whitelist the cmds in the nodeapi access list
nodeapi.setAccess('only', apiAccessList);

// determine if http traffic should be forwarded to https
if (settings.webserver.tls.enabled == true && settings.webserver.tls.always_redirect == true) {
  app.use(function(req, res, next) {
    if (req.secure) {
      // continue without redirecting
      next();
    } else {
      // Never reflect an untrusted Host header into a security redirect.
      const tlsPort = (settings.webserver.tls.port != 443 ? ':' + settings.webserver.tls.port.toString() : '');
      res.redirect(301, 'https://' + DEFCOIN_PUBLIC_HOST + tlsPort + req.url);
    }
  });
}

// determine if cors should be enabled
if (settings.webserver.cors.enabled == true) {
  app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", settings.webserver.cors.corsorigin);
    res.header('Access-Control-Allow-Methods', 'DELETE, PUT, GET, POST');
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });
}

// loop through all plugins defined in the settings
settings.plugins.allowed_plugins.forEach(function (plugin) {
  // check if this plugin is enabled
  if (plugin.enabled) {
    const pluginName = (plugin.plugin_name == null ? '' : plugin.plugin_name);

    // check if the plugin exists in the plugins directory
    if (db.fs.existsSync(`./plugins/${pluginName}`)) {
      // check if the plugin's local_plugin_settings file exists
      if (db.fs.existsSync(`./plugins/${pluginName}/lib/local_plugin_settings.js`)) {
        // load the local_plugin_settings.js file from the plugin
        let localPluginSettings = require(`./plugins/${pluginName}/lib/local_plugin_settings`);

        // loop through all local plugin settings
        Object.keys(localPluginSettings).forEach(function(key, index, map) {
          // check if this is a known setting type that should be brought into the main settings
          if (key.endsWith('_page') && typeof localPluginSettings[key] === 'object' && localPluginSettings[key]['enabled'] == true) {
            // this is a page setting
            // add the page_id to the page setting
            localPluginSettings[key].page_id = key;

            // add the menu item title to the page setting
            localPluginSettings[key].menu_title = localPluginSettings['localization'][`${key}_menu_title`];

            // check if there is already a page for this plugin
            if (plugin.pages == null) {
              // initialize the pages array
              plugin.pages = [];
            }

            // add this page setting to the main plugin data
            plugin['pages'].push(localPluginSettings[key]);
          } else if (key == 'public_apis') {
            // this is a collection of new apis
            // check if there is an ext section
            if (localPluginSettings[key]['ext'] != null) {
              // loop through all ext apis for this plugin
              Object.keys(localPluginSettings[key]['ext']).forEach(function(extKey, extIndex, extMap) {
                // add the name of the api into the object
                localPluginSettings[key]['ext'][extKey]['api_name'] = extKey;

                // loop through all parameters for this api and replace them in the description string if applicable
                for (let p = 0; p < localPluginSettings[key]['ext'][extKey]['api_parameters'].length; p++)
                  localPluginSettings['localization'][`${extKey}_description`] = localPluginSettings['localization'][`${extKey}_description`].replace(new RegExp(`\\{${(p + 1)}}`, 'g'), localPluginSettings[key]['ext'][extKey]['api_parameters'][p]['parameter_name']);

                // add the localized api description into the object
                localPluginSettings[key]['ext'][extKey]['api_desc'] = localPluginSettings['localization'][`${extKey}_description`];
              });
            }

            // copy the entire public_apis section from the plugin into the main settings
            plugin.public_apis = localPluginSettings[key];
          }
        });
      }

      // check if the plugin's routes/index.js file exists
      if (db.fs.existsSync(`./plugins/${pluginName}/routes/index.js`)) {
        // get the plugin routes and save them to an array
        pluginRoutes.push(require(`./plugins/${pluginName}/routes/index`));

        // check if the plugin has a views directory
        if (db.fs.existsSync(`./plugins/${pluginName}/views`)) {
          // get the list of files in the views directory
          const files = db.fs.readdirSync(`./plugins/${pluginName}/views`);

          // filter the list of files to check if any have the .pug extension
          const pugFiles = files.filter(file => path.extname(file) === '.pug');

          // check if the plugin has 1 or more views
          if (pugFiles.length > 0) {
            // add this plugins view path to the list of view paths
            viewPaths.push(path.resolve(`./plugins/${pluginName}/views`));
          }
        }
      }
    }
  }
});

// view engine setup
app.set('views', viewPaths);
app.set('view engine', 'pug');

var default_favicon = '';

// loop through the favicons
Object.keys(settings.shared_pages.favicons).forEach(function(key, index, map) {
  // remove the public directory from the path if exists
  if (settings.shared_pages.favicons[key] != null && settings.shared_pages.favicons[key].indexOf('public/') > -1)
    settings.shared_pages.favicons[key] = settings.shared_pages.favicons[key].replace(/public\//g, '');

  // check if the favicon file exists
  if (!db.fs.existsSync(path.join('./public', settings.shared_pages.favicons[key])))
    settings.shared_pages.favicons[key] = '';
  else if (default_favicon == '')
    default_favicon = settings.shared_pages.favicons[key];
});

if (default_favicon != '')
  app.use(favicon(path.join('./public', default_favicon)));

app.use(logger('dev'));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb', parameterLimit: 20 }));
app.use(cookieParser());
app.use(inputguard.setSecurityHeaders);
app.use(inputguard.guardExpressRequest);
app.use(express.static(path.join(__dirname, 'public')));

// routes
app.use('/api', nodeapi.app);
app.use('/', routes);

// loop through all plugin routes and add them to the app
pluginRoutes.forEach(function (r) {
  app.use('/', r);
});

app.get('/ext/mining-estimates', async function(req, res) {
  try {
    res.json(await getMiningEstimatePayload());
  } catch (error) {
    res.status(503).json({
      error: true,
      message: 'Unable to retrieve live pool data for mining estimates right now.'
    });
  }
});

// post method to claim an address using verifymessage functionality
app.post('/claim', function(req, res) {
  req.body.address = inputguard.cleanBoundedText(req.body.address, 80);
  req.body.signature = inputguard.cleanBoundedText(req.body.signature, inputguard.MAX_RPC_SIGNATURE_LENGTH);
  req.body.message = inputguard.cleanBoundedText(req.body.message, inputguard.MAX_RPC_MESSAGE_LENGTH);

  if (!inputguard.isAddressLike(req.body.address) || req.body.signature === '' || req.body.message === '')
    return inputguard.reject(res, 400, 'Invalid claim request');

  // validate captcha if applicable
  validate_captcha(settings.claim_address_page.enable_captcha, req.body, function(captcha_error) {
    // check if there was a problem with captcha
    if (captcha_error) {
      // show the captcha error
      res.json({'status': 'failed', 'error': true, 'message': 'The captcha validation failed'});
    } else {
      // filter bad words if enabled
      filter_bad_words((req.body.message == null || req.body.message == '' ? '' : req.body.message), function(claim_error, message) {
        // check if there was an error or if the message was filtered
        if (claim_error != null) {
          // an error occurred with loading the bad-words filter
          res.json({'status': 'failed', 'error': true, 'message': 'Error loading the bad-words filter: ' + claim_error});
        } else if (message == req.body.message) {
          // call the verifymessage api
          lib.verify_message(req.body.address, req.body.signature, req.body.message, function(body) {
            if (body == false)
              res.json({'status': 'failed', 'error': true, 'message': 'Invalid signature'});
            else if (body == true) {
              db.update_claim_name(req.body.address, req.body.message, function(val) {
                // check if the update was successful
                if (val == '')
                  res.json({'status': 'success'});
                else if (val == 'no_address')
                  res.json({'status': 'failed', 'error': true, 'message': 'Wallet address ' + req.body.address + ' is not valid or does not have any transactions'});
                else
                  res.json({'status': 'failed', 'error': true, 'message': 'Wallet address or signature is invalid'});
              });
            } else
              res.json({'status': 'failed', 'error': true, 'message': 'Wallet address or signature is invalid'});
          });
        } else {
          // message was filtered which would change the signature
          res.json({'status': 'failed', 'error': true, 'message': 'Display name contains bad words and cannot be saved: ' + message});
        }
      });
    }
  });
});

function validate_captcha(captcha_enabled, data, cb) {
  // check if captcha is enabled for the requested feature
  if (captcha_enabled == true) {
    // determine the captcha type
    if (settings.captcha.google_recaptcha3.enabled == true) {
      if (data.google_recaptcha3 != null) {
        const request = require('postman-request');

        request({method: 'POST', uri: 'https://www.google.com/recaptcha/api/siteverify', form: {secret: settings.captcha.google_recaptcha3.secret_key, response: data.google_recaptcha3}, json: true, timeout: 5000}, function (error, response, body) {
          if (error) {
            // an error occurred while trying to validate the captcha
            return cb(true);
          } else if (body == null || body == '' || typeof body !== 'object') {
            // return data is invalid
            return cb(true);
          } else if (body.score == null || body.score < settings.captcha.google_recaptcha3.pass_score) {
            // captcha challenge failed
            return cb(true);
          } else {
            // captcha challenge passed
            return cb(false);
          }
        });
      } else {
        // a captcha response wasn't received
        return cb(true);
      }
    } else if (settings.captcha.google_recaptcha2.enabled == true) {
      if (data.google_recaptcha2 != null) {
        const request = require('postman-request');

        request({method: 'POST', uri: 'https://www.google.com/recaptcha/api/siteverify', form: {secret: settings.captcha.google_recaptcha2.secret_key, response: data.google_recaptcha2}, json: true, timeout: 5000}, function (error, response, body) {
          if (error) {
            // an error occurred while trying to validate the captcha
            return cb(true);
          } else if (body == null || body == '' || typeof body !== 'object') {
            // return data is invalid
            return cb(true);
          } else if (body.success == null || body.success == false) {
            // captcha challenge failed
            return cb(true);
          } else {
            // captcha challenge passed
            return cb(false);
          }
        });
      } else {
        // a captcha response wasn't received
        return cb(true);
      }
    } else if (settings.captcha.hcaptcha.enabled == true) {
      if (data.hcaptcha != null) {
        const request = require('postman-request');

        request({method: 'POST', uri: 'https://hcaptcha.com/siteverify', form: {secret: settings.captcha.hcaptcha.secret_key, response: data.hcaptcha}, json: true, timeout: 5000}, function (error, response, body) {
          if (error) {
            // an error occurred while trying to validate the captcha
            return cb(true);
          } else if (body == null || body == '' || typeof body !== 'object') {
            // return data is invalid
            return cb(true);
          } else if (body.success == null || body.success == false) {
            // captcha challenge failed
            return cb(true);
          } else {
            // captcha challenge passed
            return cb(false);
          }
        });
      } else {
        // a captcha response wasn't received
        return cb(true);
      }
    } else {
      // no captcha options are enabled
      return cb(false);
    }
  } else {
    // captcha is not enabled for this feature
    return cb(false);
  }
}

function filter_bad_words(msg, cb) {
  // check if the bad-words filter is enabled
  if (settings.claim_address_page.enable_bad_word_filter == true) {
    // import the bad-words dependency
    import('bad-words').then(function(module) {
      // load the bad-words filter
      const bad_word_lib = module.Filter;
      const bad_word_filter = new bad_word_lib();

       // return the filtered msg
      return cb(null, bad_word_filter.clean(msg));
    })
    .catch(function(err) {
      return cb(err, null);
    });
  } else {
    // return the msg without filtering for bad words
    return cb(null, msg);
  }
}

// post method to receive data from a plugin
app.post('/plugin-request', function(req, res) {
  const pluginLockName = 'plugin';
  let authenticatedData = null;

  try {
    authenticatedData = JSON.parse(req.body.data);
  } catch {
    return res.status(400).json({'status': 'failed', 'error': true, 'message': 'POST data is missing or not in the correct format'});
  }

  if (authenticatedData == null || typeof authenticatedData !== 'object' || Array.isArray(authenticatedData) || authenticatedData.plugin_data == null)
    return res.status(400).json({'status': 'failed', 'error': true, 'message': 'POST data is missing or not in the correct format'});

  if (!inputguard.constantTimeSecretEqual(settings.plugins.plugin_secret_code, authenticatedData.plugin_data.secret_code))
    return res.status(403).json({'status': 'failed', 'error': true, 'message': 'Secret code is missing or incorrect'});

  if (authenticatedData.plugin_data.coin_name == null || authenticatedData.plugin_data.coin_name == '')
    return res.status(400).json({'status': 'failed', 'error': true, 'message': 'Coin name is missing'});

  // check if another plugin request is already running
  if (lib.is_locked([pluginLockName], true) == true)
    res.json({'status': 'failed', 'error': true, 'message': `Another plugin request is already running..`});
  else {
    // create a new plugin lock before checking the rest of the locks to minimize problems with running scripts at the same time
    lib.create_lock(pluginLockName);

    // check the backup, restore and delete locks since those functions would be problematic when updating data
    if (lib.is_locked(['backup', 'restore', 'delete'], true) == true) {
      lib.remove_lock(pluginLockName);
      res.json({'status': 'failed', 'error': true, 'message': `Another script has locked the database..`});
    } else {
      // all lock tests passed. OK to run plugin request

      // Continue with the exact object that passed the constant-time check;
      // do not parse and compare attacker-controlled credentials a second time.
      const dataObject = authenticatedData;

      // check if the dataObject was populated
      if (dataObject == null || JSON.stringify(dataObject) === '{}') {
        lib.remove_lock(pluginLockName);
        res.json({'status': 'failed', 'error': true, 'message': 'POST data is missing or not in the correct format'});
      } else {
        // check if the coin name was specified
        if (dataObject.plugin_data.coin_name == null || dataObject.plugin_data.coin_name == '') {
          lib.remove_lock(pluginLockName);
          res.json({'status': 'failed', 'error': true, 'message': 'Coin name is missing'});
        } else {
          const tableData = dataObject.table_data;

          // check if the table_data seems valid
          if (tableData == null || !Array.isArray(tableData)) {
            lib.remove_lock(pluginLockName);
            res.json({'status': 'failed', 'error': true, 'message': `table_data from POST data is missing or empty`});
          } else {
            const pluginName = (dataObject.plugin_data.plugin_name == null ? '' : dataObject.plugin_data.plugin_name);
            const pluginObj = settings.plugins.allowed_plugins.find(item => item.plugin_name === pluginName && pluginName != '');

            // check if the requested plugin was found in the settings
            if (pluginObj == null) {
              lib.remove_lock(pluginLockName);
              res.json({'status': 'failed', 'error': true, 'message': `Plugin '${pluginName}' is not defined in settings`});
            } else {
              // check if the requested plugin is enabled
              if (!pluginObj.enabled) {
                lib.remove_lock(pluginLockName);
                res.json({'status': 'failed', 'error': true, 'message': `Plugin '${pluginName}' is not enabled`});
              } else {
                // check if the plugin exists in the plugins directory
                if (!db.fs.existsSync(`./plugins/${pluginName}`)) {
                  lib.remove_lock(pluginLockName);
                  res.json({'status': 'failed', 'error': true, 'message': `Plugin '${pluginName}' is not installed in the plugins directory`});
                } else {
                  // check if the plugin's server_functions file exists
                  if (!db.fs.existsSync(`./plugins/${pluginName}/lib/server_functions.js`)) {
                    lib.remove_lock(pluginLockName);
                    res.json({'status': 'failed', 'error': true, 'message': `Plugin '${pluginName}' is missing the /lib/server_functions.js file`});
                  } else {
                    // load the server_functions.js file from the plugin
                    const serverFunctions = require(`./plugins/${pluginName}/lib/server_functions`);

                    // check if the process_plugin_request function exists
                    if (typeof serverFunctions.process_plugin_request !== 'function') {
                      lib.remove_lock(pluginLockName);
                      res.json({'status': 'failed', 'error': true, 'message': `Plugin '${pluginName}' is missing the process_plugin_request function`});
                    } else {
                      // call the process_plugin_request function to process the new table data
                      serverFunctions.process_plugin_request(dataObject.plugin_data.coin_name, tableData, settings.sync.update_timeout, function(response) {
                        lib.remove_lock(pluginLockName);
                        res.json(response);
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
});

// extended apis
app.use('/ext/getmoneysupply', function(req, res) {
  // check if the getmoneysupply api is enabled
  if (settings.api_page.enabled == true && settings.api_page.public_apis.ext.getmoneysupply.enabled == true) {
    // lookup stats
    db.get_stats(settings.coin.name, function (stats) {
      res.setHeader('content-type', 'text/plain');
      res.end((stats && stats.supply ? stats.supply.toString() : '0'));
    });
  } else
    res.end(settings.localization.method_disabled);
});

app.use('/ext/getaddress/:hash', function(req, res) {
  // check if the getaddress api is enabled
  if (settings.api_page.enabled == true && settings.api_page.public_apis.ext.getaddress.enabled == true) {
    if (!inputguard.isAddressLike(req.params.hash))
      return inputguard.reject(res, 400, 'Invalid address');

    db.get_address(req.params.hash, false, function(address) {
      db.get_address_txs_ajax(req.params.hash, 0, settings.api_page.public_apis.ext.getaddresstxs.max_items_per_query, function(txs, count) {
        if (address) {
          let last_txs = [];

          for (i = 0; i < txs.length; i++) {
            if (typeof txs[i].txid !== "undefined") {
              let out = new Decimal('0');
              let vin = new Decimal('0');
              let tx_type = 'vout';
              let row = {};

              txs[i].vout.forEach(function (r) {
                if (r.addresses == req.params.hash)
                  out = out.add(new Decimal(r.amount.toString()).toString());
              });

              txs[i].vin.forEach(function (s) {
                if (s.addresses == req.params.hash)
                  vin = vin.add(new Decimal(s.amount.toString()).toString());
              });

              if (vin.gt(out))
                tx_type = 'vin';

              row['addresses'] = txs[i].txid;
              row['type'] = tx_type;

              last_txs.push(row);
            }
          }

          const a_ext = {
            address: address.a_id,
            sent: new Decimal(address.sent.toString()).div(100000000).toString(),
            received: new Decimal(address.received.toString()).div(100000000).toString(),
            balance: new Decimal(address.balance.toString()).div(100000000).toString().replace(/(^-+)/mg, ''),
            last_txs: last_txs
          };

          res.send(a_ext);
        } else
          res.send({ error: 'address not found.', hash: req.params.hash});
      });
    });
  } else
    res.end(settings.localization.method_disabled);
});

app.use('/ext/gettx/:txid', function(req, res) {
  // check if the gettx api is enabled
  if (settings.api_page.enabled == true && settings.api_page.public_apis.ext.gettx.enabled == true) {
    var txid = req.params.txid;

    if (!inputguard.isHash64(txid))
      return inputguard.reject(res, 400, 'Invalid transaction id');

    db.get_tx(txid, function(tx) {
      if (tx) {
        lib.get_blockcount(function(blockcount) {
          res.send({ active: 'tx', tx: tx, confirmations: (blockcount - tx.blockindex + 1), blockcount: (blockcount ? blockcount : 0)});
        });
      } else {
        lib.get_rawtransaction(txid, function(rtx) {
          if (rtx && rtx.txid) {
            lib.prepare_vin(rtx, function(vin, tx_type_vin) {
              lib.prepare_vout(rtx.vout, rtx.txid, vin, ((typeof rtx.vjoinsplit === 'undefined' || rtx.vjoinsplit == null) ? [] : rtx.vjoinsplit), function(rvout, rvin, tx_type_vout) {
                const total = lib.calculate_total(rvout);

                if (!rtx.confirmations > 0) {
                  var utx = {
                    txid: rtx.txid,
                    vin: rvin,
                    vout: rvout,
                    total: total.toFixed(8),
                    timestamp: rtx.time,
                    blockhash: '-',
                    blockindex: -1
                  };

                  res.send({ active: 'tx', tx: utx, confirmations: rtx.confirmations, blockcount:-1});
                } else {
                  var utx = {
                    txid: rtx.txid,
                    vin: rvin,
                    vout: rvout,
                    total: total.toFixed(8),
                    timestamp: rtx.time,
                    blockhash: rtx.blockhash,
                    blockindex: rtx.blockheight
                  };

                  lib.get_blockcount(function(blockcount) {
                    res.send({ active: 'tx', tx: utx, confirmations: rtx.confirmations, blockcount: (blockcount ? blockcount : 0)});
                  });
                }
              });
            });
          } else
            res.send({ error: 'tx not found.', hash: txid});
        });
      }
    });
  } else
    res.end(settings.localization.method_disabled);
});

app.use('/ext/getbalance/:hash', function(req, res) {
  // check if the getbalance api is enabled
  if (settings.api_page.enabled == true && settings.api_page.public_apis.ext.getbalance.enabled == true) {
    if (!inputguard.isAddressLike(req.params.hash))
      return inputguard.reject(res, 400, 'Invalid address');

    db.get_address(req.params.hash, false, function(address) {
      if (address) {
        res.setHeader('content-type', 'text/plain');
        res.end(new Decimal(address.balance.toString()).div(100000000).toString().replace(/(^-+)/mg, ''));
      } else
        res.send({ error: 'address not found.', hash: req.params.hash });
    });
  } else
    res.end(settings.localization.method_disabled);
});

app.use('/ext/getdistribution', function(req, res) {
  // check if the getdistribution api is enabled
  if (settings.api_page.enabled == true && settings.api_page.public_apis.ext.getdistribution.enabled == true) {
    db.get_richlist(settings.coin.name, function(richlist) {
      db.get_stats(settings.coin.name, function(stats) {
        db.get_distribution(richlist, stats, function(dist) {
          res.send(dist);
        });
      });
    });
  } else
    res.end(settings.localization.method_disabled);
});

app.use('/ext/getcurrentprice', function(req, res) {
  // check if the getcurrentprice api is enabled
  if (settings.api_page.enabled == true && settings.api_page.public_apis.ext.getcurrentprice.enabled == true) {
    db.get_stats(settings.coin.name, function (stats) {
      const currency = lib.get_market_currency_code();

      eval('var p_ext = { "last_price_' + currency.toLowerCase() + '": new Decimal(stats.last_price.toString()).toFixed(), "last_price_usd": new Decimal(stats.last_usd_price.toString()).toFixed(), }');
      res.send(p_ext);
    });
  } else
    res.end(settings.localization.method_disabled);
});

app.use('/ext/getbasicstats', function(req, res) {
  // check if the getbasicstats api is enabled
  if (settings.api_page.enabled == true && settings.api_page.public_apis.ext.getbasicstats.enabled == true) {
    // lookup stats
    db.get_stats(settings.coin.name, function (stats) {
      const currency = lib.get_market_currency_code();

      // check if the masternode count api is enabled
      if (settings.api_page.public_apis.rpc.getmasternodecount.enabled == true && settings.api_cmds['getmasternodecount'] != null && settings.api_cmds['getmasternodecount'] != '') {
        // masternode count api is available
        lib.get_masternodecount(function(masternodestotal) {
          eval('var p_ext = { "block_count": (stats.count ? stats.count : 0), "money_supply": new Decimal(stats.supply == null ? "0" : stats.supply.toString()).toFixed(), "last_price_' + currency.toLowerCase() + '": new Decimal(stats.last_price.toString()).toFixed(), "last_price_usd": new Decimal(stats.last_usd_price.toString()).toFixed(), "masternode_count": (masternodestotal == null ? 0 : masternodestotal.total) }');
          res.send(p_ext);
        });
      } else {
        // masternode count api is not available
        eval('var p_ext = { "block_count": (stats.count ? stats.count : 0), "money_supply": new Decimal(stats.supply == null ? "0" : stats.supply.toString()).toFixed(), "last_price_' + currency.toLowerCase() + '": new Decimal(stats.last_price.toString()).toFixed(), "last_price_usd": new Decimal(stats.last_usd_price.toString()).toFixed() }');
        res.send(p_ext);
      }
    });
  } else
    res.end(settings.localization.method_disabled);
});

app.use('/ext/getlasttxs/:min', function(req, res) {
  // check if the getlasttxs api is enabled or else check the headers to see if it matches an internal ajax request from the explorer itself (TODO: come up with a more secure method of whitelisting ajax calls from the explorer)
  if ((settings.api_page.enabled == true && settings.api_page.public_apis.ext.getlasttxs.enabled == true) || (req.headers['x-requested-with'] != null && req.headers['x-requested-with'].toLowerCase() == 'xmlhttprequest' && req.headers.referer != null && req.headers.accept.indexOf('text/javascript') > -1 && req.headers.accept.indexOf('application/json') > -1)) {
    var min = req.params.min, start, length, internal = false;
    // split url suffix by forward slash and remove blank entries
    var split = req.url.split('/').filter(function(v) { return v; });
    // determine how many parameters were passed
    switch (split.length) {
      case 2:
        // capture start and length
        start = split[0];
        length = split[1];
        break;
      default:
        if (split.length == 1) {
          // capture start
          start = split[0];
        } else if (split.length >= 2) {
          // capture start and length
          start = split[0];
          length = split[1];
          // check if this is an internal request
          if (split.length > 2 && split[2] == 'internal')
            internal = true;
        }

        break;
    }

    // fix parameters
    const maxLength = settings.api_page.public_apis.ext.getlasttxs.max_items_per_query;
    length = inputguard.boundedInt(length, maxLength, 1, maxLength);
    start = inputguard.boundedInt(start, 0, 0, inputguard.MAX_API_OFFSET);
    min = inputguard.boundedAmountSats(min, 0);

    db.get_last_txs(start, length, min, internal, function(data, count) {
      // check if this is an internal request
      if (internal) {
        // display data formatted for internal datatable
        res.json({"data": data, "recordsTotal": count, "recordsFiltered": count});
      } else {
        // display data in more readable format for public api
        res.json(data);
      }
    });
  } else
    res.end(settings.localization.method_disabled);
});

app.use('/ext/getaddresstxs/:address/:start/:length', function(req, res) {
  // check if the getaddresstxs api is enabled or else check the headers to see if it matches an internal ajax request from the explorer itself (TODO: come up with a more secure method of whitelisting ajax calls from the explorer)
  if ((settings.api_page.enabled == true && settings.api_page.public_apis.ext.getaddresstxs.enabled == true) || (req.headers['x-requested-with'] != null && req.headers['x-requested-with'].toLowerCase() == 'xmlhttprequest' && req.headers.referer != null && req.headers.accept.indexOf('text/javascript') > -1 && req.headers.accept.indexOf('application/json') > -1)) {
    let internal = false;

    if (!inputguard.isAddressLike(req.params.address))
      return inputguard.reject(res, 400, 'Invalid address');

    // split url suffix by forward slash and remove blank entries
    const split = req.url.split('/').filter(function(v) { return v; });

    // check if this is an internal request
    if (split.length > 0 && split[0] == 'internal')
      internal = true;

    // fix parameters
    const maxLength = settings.api_page.public_apis.ext.getaddresstxs.max_items_per_query;
    req.params.length = inputguard.boundedInt(req.params.length, maxLength, 1, maxLength);
    req.params.start = inputguard.boundedInt(req.params.start, 0, 0, inputguard.MAX_API_OFFSET);

    db.get_address_txs_ajax(req.params.address, req.params.start, req.params.length, function(txs, count) {
      let data = [];

      for (i = 0; i < txs.length; i++) {
        if (typeof txs[i].txid !== "undefined") {
          const balance = new Decimal(txs[i].balance.toString());
          let out = new Decimal('0');
          let vin = new Decimal('0');

          txs[i].vout.forEach(function(r) {
            if (r.addresses == req.params.address)
              out = out.add(new Decimal(r.amount.toString()));
          });

          txs[i].vin.forEach(function(s) {
            if (s.addresses == req.params.address)
              vin = vin.add(new Decimal(s.amount.toString()));
          });

          if (internal) {
            let row = [];
            let updown = '';
            let amount = new Decimal('0');
            let amountString = '';
            let rowclass = 'table-info';

            if (out.gt(0) && vin.gt(0)) {
              amount = out.sub(vin);

              if (amount.lt(0)) {
                amountString = lib.format_decimal_string(amount.mul(-1).div(100000000), { minFractionDigits: 2, maxFractionDigits: 8 });
                updown = '-';
              } else if (amount.gt(0)) {
                amountString = lib.format_decimal_string(amount.div(100000000), { minFractionDigits: 2, maxFractionDigits: 8 });
                updown = '+';
              } else
                amountString = lib.format_decimal_string(amount.div(100000000), { minFractionDigits: 2, maxFractionDigits: 8 });
            } else if (out.gt(0)) {
              amountString = lib.format_decimal_string(out.div(100000000), { minFractionDigits: 2, maxFractionDigits: 8 });
              updown = '+';
              rowclass = 'table-success';
            } else {
              amountString = lib.format_decimal_string(vin.div(100000000), { minFractionDigits: 2, maxFractionDigits: 8 });
              updown = '-';
              rowclass = 'table-danger';
            }

            row.push(txs[i].timestamp);
            row.push(txs[i].txid);
            row.push(lib.format_decimal_string(balance.div(100000000), { minFractionDigits: 2, maxFractionDigits: 8 }));
            row.push(amountString);
            row.push(updown);
            row.push(rowclass);

            data.push(row);
          } else {
            data.push({
              timestamp: txs[i].timestamp,
              txid: txs[i].txid,
              sent: out.div(100000000).toString(),
              received: vin.div(100000000).toString(),
              balance: balance.div(100000000).toString()
            });
          }
        }
      }

      // check if this is an internal request
      if (internal) {
        // display data formatted for internal datatable
        res.json({"data": data, "recordsTotal": count, "recordsFiltered": count});
      } else {
        // display data in more readable format for public api
        res.json(data);
      }
    });
  } else
    res.end(settings.localization.method_disabled);
});

function get_connection_and_block_counts(get_data, cb) {
  // check if the connection and block counts should be returned
  if (get_data) {
    lib.get_connectioncount(function(connections) {
      lib.get_blockcount(function(blockcount) {
        return cb(connections, blockcount);
      });
    });
  } else
    return cb(null, null);
}

function normalize_peer_key(address, port) {
  return `${((address || '') + '').replace(/^\[/, '').replace(/\]$/, '').trim().toLowerCase()}|${port == null ? '' : port.toString().trim()}`;
}

function sanitize_peer_address(address) {
  return ((address || '') + '').replace(/^\[/, '').replace(/\]$/, '').trim();
}

async function map_with_concurrency(items, limit, iterator) {
  const source = Array.isArray(items) ? items : [];
  const results = new Array(source.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < source.length) {
      const index = nextIndex++;
      results[index] = await iterator(source[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, limit), source.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

function promise_with_timeout(promise, timeoutMs, fallback) {
  return new Promise(function(resolve) {
    let settled = false;
    const timer = setTimeout(function() {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, timeoutMs);

    Promise.resolve(promise).then(function(value) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }
    }).catch(function() {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      }
    });
  });
}

function is_local_wallet_peer(address) {
  const normalizedAddress = sanitize_peer_address(address).toLowerCase();

  return normalizedAddress === '127.0.0.1' || normalizedAddress === '::1' || normalizedAddress === 'localhost';
}

function normalize_peer_hostname(hostname) {
  if (hostname == null || hostname === '')
    return '';

  return hostname.toString().trim().replace(/\.$/, '').toLowerCase();
}

async function resolve_domain_ips_with_tools(domain) {
  const hostname = normalize_peer_hostname(domain);
  const lookups = [];

  if (hostname === '')
    return [];

  if (dnsPromises != null && typeof dnsPromises.resolve4 === 'function') {
    lookups.push(
      dnsPromises.resolve4(hostname).catch(function() {
        return [];
      })
    );
  }

  if (dnsPromises != null && typeof dnsPromises.resolve6 === 'function') {
    lookups.push(
      dnsPromises.resolve6(hostname).catch(function() {
        return [];
      })
    );
  }

  const results = await Promise.all(lookups);
  const ips = new Set();

  results.flat().forEach(function(ip) {
    if (net.isIP(ip) !== 0)
      ips.add(ip);
  });

  return Array.from(ips).slice(0, MAX_PEER_FQDN_LOOKUPS);
}

async function resolve_reverse_hostnames_with_tools(address) {
  const ip = sanitize_peer_address(address);

  if (ip === '' || net.isIP(ip) === 0)
    return [];

  const now = Date.now();
  const cached = reversePeerFqdnCache.get(ip);

  if (cached != null && cached.expiresAt > now)
    return cached.value.slice();

  if (cached != null && cached.inFlight != null)
    return cached.inFlight;

  if (dnsPromises == null || typeof dnsPromises.reverse !== 'function')
    return [];

  const inFlight = promise_with_timeout(dnsPromises.reverse(ip), PEER_FQDN_TIMEOUT_MS, []).then(function(values) {
    const hostnames = Array.from(new Set((Array.isArray(values) ? values : []).map(normalize_peer_hostname).filter(Boolean))).slice(0, 4);
    reversePeerFqdnCache.set(ip, {
      expiresAt: Date.now() + REVERSE_PEER_FQDN_TTL_MS,
      value: hostnames,
      inFlight: null
    });

    while (reversePeerFqdnCache.size > MAX_REVERSE_PEER_CACHE_ENTRIES)
      reversePeerFqdnCache.delete(reversePeerFqdnCache.keys().next().value);

    return hostnames.slice();
  });

  reversePeerFqdnCache.set(ip, { expiresAt: 0, value: [], inFlight: inFlight });
  return inFlight;
}

function remember_known_peer_fqdn(byAddress, byDomain, target, ips) {
  const domain = normalize_peer_hostname(target.domain);
  const addressCount = ips.length;

  if (domain === '' || addressCount === 0)
    return;

  byDomain.set(domain, {
    domain: domain,
    ips: ips,
    port: target.port || '',
    type: target.type || 'known',
    source: target.source || 'known Defcoin domain',
    priority: target.priority || 999,
    addressCount: addressCount
  });

  ips.forEach(function(ip) {
    const key = sanitize_peer_address(ip);

    if (key === '')
      return;

    if (!byAddress.has(key))
      byAddress.set(key, []);

    byAddress.get(key).push({
      domain: domain,
      port: target.port || '',
      type: target.type || 'known',
      source: target.source || 'known Defcoin domain',
      priority: target.priority || 999,
      addressCount: addressCount
    });
  });
}

async function refresh_known_peer_fqdn_cache(force) {
  const now = Date.now();

  if (!force && knownPeerFqdnCache.expiresAt > now)
    return knownPeerFqdnCache;

  if (knownPeerFqdnCache.inFlight != null)
    return knownPeerFqdnCache.inFlight;

  knownPeerFqdnCache.inFlight = (async function() {
    const byAddress = new Map();
    const byDomain = new Map();

    await map_with_concurrency(defcoinPeerFqdnTargets, PEER_FQDN_LOOKUP_CONCURRENCY, async function(target) {
      const resolvedIps = await resolve_domain_ips_with_tools(target.domain);
      const ips = new Set(resolvedIps);

      (Array.isArray(target.staticIps) ? target.staticIps : []).forEach(function(ip) {
        const sanitizedIp = sanitize_peer_address(ip);

        if (net.isIP(sanitizedIp) !== 0)
          ips.add(sanitizedIp);
      });

      remember_known_peer_fqdn(byAddress, byDomain, target, Array.from(ips));
    });

    knownPeerFqdnCache = {
      expiresAt: Date.now() + KNOWN_PEER_FQDN_TTL_MS,
      builtAt: new Date().toISOString(),
      byAddress: byAddress,
      byDomain: byDomain,
      inFlight: null
    };

    return knownPeerFqdnCache;
  })();

  return knownPeerFqdnCache.inFlight;
}

function choose_known_peer_fqdn(entries, port) {
  const entry = choose_known_peer_fqdn_entry(entries, port);

  return entry != null ? (entry.domain || '') : '';
}

function choose_known_peer_fqdn_entry(entries, port) {
  if (!Array.isArray(entries) || entries.length === 0)
    return null;

  const normalizedPort = (port == null ? '' : port.toString().trim());
  const matchingEntries = entries.filter(function(entry) {
    return !entry.port || !normalizedPort || entry.port === normalizedPort;
  });
  const hasPreferredKnownName = matchingEntries.some(function(entry) {
    return !DEPRIORITIZED_KNOWN_PEER_FQDNS.has(entry.domain || '');
  });
  const ranked = entries.slice().sort(function(a, b) {
    const aPortPenalty = (a.port && normalizedPort && a.port !== normalizedPort) ? 50 : 0;
    const bPortPenalty = (b.port && normalizedPort && b.port !== normalizedPort) ? 50 : 0;
    const aAggregatePenalty = Math.max(0, (a.addressCount || 1) - 1) * 10;
    const bAggregatePenalty = Math.max(0, (b.addressCount || 1) - 1) * 10;
    const aAggregatorPenalty = (hasPreferredKnownName && DEPRIORITIZED_KNOWN_PEER_FQDNS.has(a.domain || '')) ? 1000 : 0;
    const bAggregatorPenalty = (hasPreferredKnownName && DEPRIORITIZED_KNOWN_PEER_FQDNS.has(b.domain || '')) ? 1000 : 0;

    return ((a.priority || 999) + aPortPenalty + aAggregatePenalty + aAggregatorPenalty)
      - ((b.priority || 999) + bPortPenalty + bAggregatePenalty + bAggregatorPenalty);
  });

  return ranked[0] || null;
}

function is_seed_aggregator_entry(entry) {
  return entry != null && entry.type === 'seed' && (entry.addressCount || 0) > 1;
}

function choose_seed_aggregator_fqdn(entries) {
  if (!Array.isArray(entries) || entries.length === 0)
    return '';

  const ranked = entries
    .filter(is_seed_aggregator_entry)
    .slice()
    .sort(function(a, b) {
      return (a.priority || 999) - (b.priority || 999);
    });

  return ranked.length > 0 ? (ranked[0].domain || '') : '';
}

function get_cached_known_peer_fqdn(address, port) {
  const entry = get_cached_known_peer_fqdn_entry(address, port);

  return entry != null ? (entry.domain || '') : '';
}

function get_cached_known_peer_fqdn_entry(address, port) {
  const sanitizedAddress = sanitize_peer_address(address);

  if (sanitizedAddress === '')
    return null;

  return choose_known_peer_fqdn_entry(knownPeerFqdnCache.byAddress.get(sanitizedAddress), port);
}

function get_cached_seed_aggregator_fqdn(address) {
  const sanitizedAddress = sanitize_peer_address(address);

  if (sanitizedAddress === '')
    return '';

  return choose_seed_aggregator_fqdn(knownPeerFqdnCache.byAddress.get(sanitizedAddress));
}

function serialize_known_peer_fqdn_cache(cache) {
  const byAddress = {};
  const byDomain = {};

  (cache.byAddress || new Map()).forEach(function(entries, address) {
    byAddress[address] = entries.map(function(entry) {
      return {
        domain: entry.domain,
        port: entry.port,
        type: entry.type,
        source: entry.source,
        priority: entry.priority,
        address_count: entry.addressCount
      };
    });
  });

  (cache.byDomain || new Map()).forEach(function(entry, domain) {
    byDomain[domain] = {
      ips: entry.ips,
      port: entry.port,
      type: entry.type,
      source: entry.source,
      priority: entry.priority,
      address_count: entry.addressCount
    };
  });

  return {
    built_at: cache.builtAt,
    expires_at: cache.expiresAt ? new Date(cache.expiresAt).toISOString() : '',
    by_address: byAddress,
    by_domain: byDomain
  };
}

function build_seed_aggregator_summaries() {
  const summaries = [];
  const byAddress = knownPeerFqdnCache.byAddress || new Map();

  (knownPeerFqdnCache.byDomain || new Map()).forEach(function(entry) {
    if (!is_seed_aggregator_entry(entry))
      return;

    const resolved = (entry.ips || []).map(function(ip) {
      const bestKnown = choose_known_peer_fqdn_entry(byAddress.get(ip), entry.port);
      const knownName = bestKnown != null && bestKnown.domain !== entry.domain
        ? bestKnown.domain
        : '';

      return {
        address: ip,
        known_name: knownName
      };
    }).sort(function(a, b) {
      const aText = (a.known_name || a.address || '').toLowerCase();
      const bText = (b.known_name || b.address || '').toLowerCase();

      return aText.localeCompare(bText);
    });

    summaries.push({
      domain: entry.domain,
      address_count: entry.addressCount || resolved.length,
      resolved: resolved
    });
  });

  return summaries.sort(function(a, b) {
    return (a.domain || '').localeCompare(b.domain || '');
  });
}

function get_peer_fqdn_cache_key(peer) {
  return normalize_peer_key(peer.address, peer.port);
}

async function resolve_peer_fqdn(peer) {
  const address = sanitize_peer_address(peer.address);

  if (address == null || address === '')
    return { fqdn: '', fqdn_alias: '', fqdn_source: '', seed_aggregator: '' };

  if (is_local_wallet_peer(address))
    return { fqdn: 'localhost', fqdn_alias: '', fqdn_source: 'local', seed_aggregator: '' };

  if (net.isIP(address) === 0) {
    const hostname = normalize_peer_hostname(address);

    return {
      fqdn: '',
      fqdn_alias: hostname,
      fqdn_source: (hostname === '' ? '' : 'configured-hostname'),
      seed_aggregator: ''
    };
  }

  await refresh_known_peer_fqdn_cache(false);

  const cachedKnownFqdn = get_cached_known_peer_fqdn(address, peer.port);
  const seedAggregator = get_cached_seed_aggregator_fqdn(address);
  const reverseHostnames = await Promise.race([
    resolve_reverse_hostnames_with_tools(address),
    new Promise((resolve) => {
      setTimeout(function() {
        resolve([]);
      }, PEER_FQDN_TIMEOUT_MS);
    })
  ]);
  const reverseFqdn = Array.isArray(reverseHostnames) && reverseHostnames.length > 0
    ? normalize_peer_hostname(reverseHostnames[0])
    : '';

  if (reverseFqdn !== '') {
    return {
      fqdn: reverseFqdn,
      fqdn_alias: (cachedKnownFqdn !== '' && cachedKnownFqdn !== reverseFqdn ? cachedKnownFqdn : ''),
      fqdn_source: (cachedKnownFqdn !== '' && cachedKnownFqdn !== reverseFqdn ? 'reverse-dns-with-seed-alias' : 'reverse-dns'),
      seed_aggregator: seedAggregator
    };
  }

  if (cachedKnownFqdn !== '') {
    return {
      fqdn: '',
      fqdn_alias: cachedKnownFqdn,
      fqdn_source: 'known-seed-alias',
      seed_aggregator: seedAggregator
    };
  }

  return { fqdn: '', fqdn_alias: '', fqdn_source: '', seed_aggregator: seedAggregator };
}

async function annotate_peer_fqdns(peerGroups) {
  const groups = (peerGroups || []).filter(group => Array.isArray(group));
  const lookup = new Map();

  groups.forEach(function(group) {
    group.forEach(function(peer) {
      if (peer == null)
        return;

      const cacheKey = get_peer_fqdn_cache_key(peer);

      if (cacheKey === '|')
        return;

      if (!lookup.has(cacheKey))
        lookup.set(cacheKey, []);

      lookup.get(cacheKey).push(peer);
    });
  });

  const lookupEntries = Array.from(lookup.entries()).slice(0, MAX_PEER_FQDN_LOOKUPS);
  await map_with_concurrency(lookupEntries, PEER_FQDN_LOOKUP_CONCURRENCY, async function(entry) {
    const peers = entry[1];
    const fqdnInfo = await resolve_peer_fqdn(peers[0]);

    peers.forEach(function(peer) {
      peer.fqdn = fqdnInfo.fqdn;
      peer.fqdn_alias = fqdnInfo.fqdn_alias;
      peer.fqdn_source = fqdnInfo.fqdn_source;
      peer.seed_aggregator = fqdnInfo.seed_aggregator;
    });
  });
}

setImmediate(function() {
  refresh_known_peer_fqdn_cache(true).catch(function(err) {
    console.log('Known Defcoin FQDN cache refresh failed: ' + (err && err.message ? err.message : err));
  });
});

async function resolve_public_node_endpoint() {
  const publicHost = DEFCOIN_PUBLIC_HOST;
  const now = Date.now();

  if (publicHost !== '' && publicNodeEndpointCache.host === publicHost && publicNodeEndpointCache.expiresAt > now)
    return Object.assign({}, publicNodeEndpointCache.value);

  const fallbackValue = Object.assign({}, publicNodeEndpointCache.value);

  if (publicHost === '')
    return fallbackValue;

  let resolvedAddress = fallbackValue.address;

  try {
    const resolved = await Promise.race([
      dnsPromises.lookup(publicHost, { family: 4 }),
      new Promise((resolve) => {
        setTimeout(function() {
          resolve(null);
        }, PEER_FQDN_TIMEOUT_MS);
      })
    ]);

    if (resolved != null && resolved.address != null && resolved.address !== '')
      resolvedAddress = resolved.address;
  } catch (err) {
    resolvedAddress = fallbackValue.address;
  }

  let fqdnInfo = {
    fqdn: '',
    fqdn_alias: '',
    fqdn_source: '',
    seed_aggregator: ''
  };

  try {
    fqdnInfo = await resolve_peer_fqdn({
      address: resolvedAddress,
      port: '1337'
    });
  } catch (err) {
    fqdnInfo = {
      fqdn: '',
      fqdn_alias: '',
      fqdn_source: '',
      seed_aggregator: ''
    };
  }

  const normalizedPublicHost = normalize_peer_hostname(publicHost);
  const publicHostAlias = (normalizedPublicHost !== '' && normalizedPublicHost !== fqdnInfo.fqdn)
    ? normalizedPublicHost
    : '';
  const fqdnAlias = publicHostAlias || fqdnInfo.fqdn_alias || '';
  const fqdnSource = fqdnInfo.fqdn !== ''
    ? (fqdnAlias !== '' ? 'reverse-dns-with-seed-alias' : 'reverse-dns')
    : (fqdnAlias !== '' ? 'known-seed-alias' : '');

  publicNodeEndpointCache = {
    host: publicHost,
    expiresAt: now + PUBLIC_NODE_ENDPOINT_TTL_MS,
    value: {
      address: resolvedAddress,
      fqdn: fqdnInfo.fqdn || '',
      fqdn_alias: fqdnAlias,
      fqdn_source: fqdnSource,
      seed_aggregator: fqdnInfo.seed_aggregator || ''
    }
  };

  return Object.assign({}, publicNodeEndpointCache.value);
}

function annotate_public_node_endpoint(overview, publicEndpoint) {
  if (overview == null || !Array.isArray(overview.raw_only_peers) || publicEndpoint == null)
    return;

  overview.raw_only_peers.forEach(function(peer) {
    if (peer.connection_badge !== 'this-node')
      return;

    peer.address = publicEndpoint.address || peer.address;
    peer.fqdn = publicEndpoint.fqdn || '';
    peer.fqdn_alias = publicEndpoint.fqdn_alias || '';
    peer.fqdn_source = publicEndpoint.fqdn_source || '';
    peer.seed_aggregator = publicEndpoint.seed_aggregator || '';
    peer.port = '1337';
    peer.country = 'This node';
  });
}

function parse_wallet_peer_address(rawAddress) {
  let address = (rawAddress || '').toString().trim();
  let port = null;

  if (address.startsWith('[') && address.indexOf(']:') > -1) {
    port = address.substring(address.lastIndexOf(':') + 1);
    address = address.substring(1, address.lastIndexOf(']:'));
  } else if ((address.match(/:/g) || []).length === 1) {
    port = address.substring(address.lastIndexOf(':') + 1);
    address = address.substring(0, address.lastIndexOf(':'));
  } else if (address.startsWith('[') && address.endsWith(']'))
    address = address.substring(1, address.length - 1);

  return {
    address: address,
    port: (port == null || port === '' ? null : port)
  };
}

function build_network_overview(connection_count, listed_connection_peers, addnode_peers, onetry_peers, raw_wallet_peers) {
  const connectionPeers = (listed_connection_peers || []).map(peer => Object.assign({}, peer));
  const addnodePeers = (addnode_peers || []).map(peer => Object.assign({}, peer));
  const onetryPeers = (onetry_peers || []).map(peer => Object.assign({}, peer));
  const rawPeers = Array.isArray(raw_wallet_peers) ? raw_wallet_peers : [];
  const cachedConnectionLookup = new Map(connectionPeers.map(peer => [normalize_peer_key(peer.address, peer.port), Object.assign({}, peer)]));
  const liveConnectionPeers = [];
  const seenLiveConnectionKeys = new Set();
  const seenRawOnlyKeys = new Set();
  const rawOnlyPeers = [];

  rawPeers.forEach(function(peer) {
    const parsedPeer = parse_wallet_peer_address(peer.addr);
    const peerKey = normalize_peer_key(parsedPeer.address, parsedPeer.port);
    const peerVersion = parseInt(peer.version) || 0;
    const cleanSubver = ((peer.subver || '') + '').replace(/\//g, '').trim();
    const peerMagic = ((peer.p2p_magic || '') + '').trim();
    const peerNodeId = (peer.id == null ? '' : peer.id.toString());
    const peerServicesText = ((peer.services || '') + '').trim();
    const peerServicesNames = (Array.isArray(peer.servicesnames) ? peer.servicesnames.join(', ') : '');
    const peerPingMs = (typeof peer.pingtime === 'number' && isFinite(peer.pingtime) ? Math.round(peer.pingtime * 1000) : null);
    const peerBytesSent = (peer.bytessent == null ? null : (parseInt(peer.bytessent, 10) || 0));
    const peerBytesReceived = (peer.bytesrecv == null ? null : (parseInt(peer.bytesrecv, 10) || 0));
    const handshakePending = (peerVersion === 0 && cleanSubver === '');
    const isLocalPeer = is_local_wallet_peer(parsedPeer.address);
    const peerServices = parseInt((peer.services || '0').toString(), 16) || 0;
    const isDefcoinFullNode =
      peerVersion > 0 &&
      (peerServices & 1) === 1 &&
      (cleanSubver.indexOf('Defcoin') === 0 || cleanSubver.indexOf('DFC') === 0);

    if (peerKey === '|')
      return;

    if (isDefcoinFullNode && !isLocalPeer) {
      if (!seenLiveConnectionKeys.has(peerKey)) {
        seenLiveConnectionKeys.add(peerKey);

        const cachedPeer = cachedConnectionLookup.get(peerKey);

        liveConnectionPeers.push(Object.assign(
          {
            address: (parsedPeer.address == null || parsedPeer.address === '' ? 'Connected peer' : parsedPeer.address),
            node_id: peerNodeId,
            port: parsedPeer.port,
            magic: (peerMagic === '' ? 'pending' : peerMagic),
            protocol: peerVersion.toString(),
            version: cleanSubver,
            services: peerServicesText,
            services_names: peerServicesNames,
            ping_ms: peerPingMs,
            sent_bytes: peerBytesSent,
            received_bytes: peerBytesReceived,
            country: (peer.inbound === true ? 'Wallet in' : 'Wallet out'),
            country_code: '',
            ipv6: (parsedPeer.address != null && parsedPeer.address.length > 15),
            table_type: 'C',
            connection_note: (peer.inbound === true ? 'wallet inbound' : 'wallet outbound')
          },
          (cachedPeer || {}),
          {
            address: (cachedPeer && cachedPeer.address ? cachedPeer.address : parsedPeer.address),
            node_id: peerNodeId,
            port: (cachedPeer && cachedPeer.port ? cachedPeer.port : parsedPeer.port),
            magic: (peerMagic === '' ? 'pending' : peerMagic),
            protocol: (cachedPeer && cachedPeer.protocol ? cachedPeer.protocol : peerVersion.toString()),
            version: cleanSubver,
            services: peerServicesText,
            services_names: peerServicesNames,
            ping_ms: peerPingMs,
            sent_bytes: peerBytesSent,
            received_bytes: peerBytesReceived
          }
        ));
      }

      return;
    }

    if (!seenRawOnlyKeys.has(peerKey)) {
      seenRawOnlyKeys.add(peerKey);

      let badge = 'wallet-only';
      let country = (peer.inbound === true ? 'Wallet in only' : 'Wallet out only');
      let note = (peer.inbound === true ? 'wallet inbound' : 'wallet outbound');

      if (isLocalPeer) {
        badge = 'this-node';
        country = 'This node';
        note = (peer.inbound === true ? 'this node inbound' : 'this node outbound');
      } else if (handshakePending) {
        badge = 'handshake-pending';
        country = (peer.inbound === true ? 'Pending in' : 'Pending out');
        note = (peer.inbound === true ? 'inbound handshake pending' : 'outbound handshake pending');
      }

      rawOnlyPeers.push({
        address: (parsedPeer.address == null || parsedPeer.address === '' ? 'Unresolved wallet connection' : parsedPeer.address),
        node_id: peerNodeId,
        port: parsedPeer.port,
        magic: (peerMagic === '' ? 'pending' : peerMagic),
        protocol: (peerVersion == 0 ? '-' : peerVersion.toString()),
        version: (handshakePending ? 'Handshake pending' : (cleanSubver || 'Wallet-only connection')),
        services: peerServicesText,
        services_names: peerServicesNames,
        ping_ms: peerPingMs,
        sent_bytes: peerBytesSent,
        received_bytes: peerBytesReceived,
        country: country,
        country_code: '',
        ipv6: (parsedPeer.address != null && parsedPeer.address.length > 15),
        table_type: 'W',
        connection_badge: badge,
        connection_note: note
      });
    }
  });

  const safeConnectionCount = (connection_count == null || connection_count === '' ? null : parseInt(connection_count));
  const computedConnections = Math.max(liveConnectionPeers.length + rawOnlyPeers.length, rawPeers.length);
  const totalConnections = (safeConnectionCount == null || isNaN(safeConnectionCount)
    ? computedConnections
    : Math.max(safeConnectionCount, computedConnections));
  const unresolvedConnectionCount = rawOnlyPeers.filter(peer => peer.connection_badge === 'handshake-pending').length;
  const localServiceCount = rawOnlyPeers.filter(peer => peer.connection_badge === 'this-node').length;
  const walletOnlyConnectionCount = rawOnlyPeers.filter(peer => peer.connection_badge === 'wallet-only').length;

  return {
    connection_count: totalConnections,
    listed_connection_count: liveConnectionPeers.length,
    raw_peer_count: rawPeers.length,
    raw_only_connection_count: rawOnlyPeers.length,
    wallet_only_connection_count: walletOnlyConnectionCount,
    local_service_count: localServiceCount,
    unresolved_connection_count: unresolvedConnectionCount,
    connection_peers: liveConnectionPeers,
    addnode_peers: addnodePeers,
    onetry_peers: onetryPeers,
    raw_only_peers: rawOnlyPeers
  };
}

function get_tip_staleness(cb) {
  const staleThresholdSeconds = 24 * 60 * 60;

  lib.get_blockcount(function(blockcount) {
    if (blockcount == null)
      return cb(false, null);

    lib.get_blockhash(blockcount, function(blockhash) {
      if (!blockhash)
        return cb(false, blockcount);

      lib.get_block(blockhash, function(block) {
        const tipTimestamp = (block && (block.time || block.mediantime) ? (block.time || block.mediantime) : null);
        const isStale = (tipTimestamp != null && ((Math.floor(Date.now() / 1000) - tipTimestamp) > staleThresholdSeconds));

        return cb(isStale, blockcount);
      });
    });
  });
}

app.use('/ext/getsummary', function(req, res) {
  const isInternal = (req.headers['x-requested-with'] != null && req.headers['x-requested-with'].toLowerCase() == 'xmlhttprequest' && req.headers.referer != null && req.headers.accept.indexOf('text/javascript') > -1 && req.headers.accept.indexOf('application/json') > -1);

  // check if the getsummary api is enabled or else check the headers to see if it matches an internal ajax request from the explorer itself (TODO: come up with a more secure method of whitelisting ajax calls from the explorer)
  if ((settings.api_page.enabled == true && settings.api_page.public_apis.ext.getsummary.enabled == true) || isInternal) {
    // check if this is a footer-only method that should only return the connection count and block count
    if (req.headers['footer-only'] != null && req.headers['footer-only'] == 'true') {
      // only return the connection count and block count
      get_connection_and_block_counts(true, function(connections, blockcount) {
        res.send({
          connections: (connections ? connections : '-'),
          blockcount: (blockcount ? blockcount : '-')
        });
      });
    } else {
      // get the connection and block counts only if this is NOT an internal call
      get_connection_and_block_counts(!isInternal, function(connections, blockcount) {
        get_tip_staleness(function(isStale, liveBlockcount) {
          lib.get_hashrate(function(hashrate) {
            db.get_stats(settings.coin.name, function (stats) {
              lib.get_masternodecount(function(masternodestotal) {
                lib.get_difficulty(function(difficulty) {
                  let difficultyHybrid = '';

                  if (isStale) {
                    difficulty = 'STALE';
                    difficultyHybrid = '';
                    hashrate = 'STALE';
                  } else {
                    if (difficulty && difficulty['proof-of-work']) {
                      if (settings.shared_pages.difficulty == 'Hybrid') {
                        difficultyHybrid = 'POS: ' + (isInternal ? lib.format_decimal_string(new Decimal(difficulty['proof-of-stake'].toString()), { minFractionDigits: 2, maxFractionDigits: 8 }) : new Decimal(difficulty['proof-of-stake'].toString()).toString());
                        difficulty = 'POW: ' + (isInternal ? lib.format_decimal_string(new Decimal(difficulty['proof-of-work'].toString()), { minFractionDigits: 2, maxFractionDigits: 8 }) : new Decimal(difficulty['proof-of-work'].toString()).toString());
                      } else if (settings.shared_pages.difficulty == 'POW')
                        difficulty = (isInternal ? lib.format_decimal_string(new Decimal(difficulty['proof-of-work'].toString()), { minFractionDigits: 2, maxFractionDigits: 8 }) : new Decimal(difficulty['proof-of-work'].toString()).toString());
                      else
                        difficulty = (isInternal ? lib.format_decimal_string(new Decimal(difficulty['proof-of-stake'].toString()), { minFractionDigits: 2, maxFractionDigits: 8 }) : new Decimal(difficulty['proof-of-stake'].toString()).toString());
                    } else
                      difficulty = (isInternal ? lib.format_decimal_string(new Decimal(difficulty.toString()), { minFractionDigits: 2, maxFractionDigits: 8 }) : new Decimal(difficulty.toString()).toString());

                    if (hashrate == `${settings.localization.ex_error}: ${settings.localization.check_console}`)
                      hashrate = 0;
                  }

                  let mn_total = 0;
                  let mn_enabled = 0;

                  // check if the masternode count api is enabled
                  if (settings.api_page.public_apis.rpc.getmasternodecount.enabled == true && settings.api_cmds['getmasternodecount'] != null && settings.api_cmds['getmasternodecount'] != '') {
                    // masternode count api is available
                    if (masternodestotal) {
                      if (masternodestotal.total)
                        mn_total = masternodestotal.total;

                      if (masternodestotal.enabled)
                        mn_enabled = masternodestotal.enabled;
                    }
                  }

                  let send_data = {
                    difficulty: (difficulty == null || difficulty == '' ? '-' : difficulty),
                    difficultyHybrid: difficultyHybrid,
                    supply: new Decimal(stats == null || stats.supply == null ? '0' : stats.supply.toString()).toFixed(),
                    hashrate: (isStale ? 'STALE' : new Decimal(hashrate.toString()).toFixed()),
                    lastPrice: new Decimal(stats == null || stats.last_price == null ? '0' : stats.last_price.toString()).toFixed(),
                    lastUSDPrice: new Decimal(stats == null || stats.last_usd_price == null ? '0' : stats.last_usd_price.toString()).toFixed(),
                    connections: (connections ? connections : '-'),
                    blockcount: (blockcount ? blockcount : (liveBlockcount || '-')),
                    masternodeCountOnline: (masternodestotal && mn_enabled != 0 ? mn_enabled : '-'),
                    masternodeCountOffline: (masternodestotal && mn_total != 0 ? Math.floor(mn_total - mn_enabled) : '-')
                  };

                  if (isInternal) {
                    send_data.marketcap = lib.format_decimal_string(new Decimal(new Decimal(send_data.lastPrice.toString()).toFixed(8)).mul(send_data.supply), { minFractionDigits: 2, maxFractionDigits: 8 });
                    send_data.usdMarketcap = lib.format_decimal_string(new Decimal(new Decimal(send_data.lastUSDPrice.toString()).toFixed(8)).mul(send_data.supply), { minFractionDigits: 2, maxFractionDigits: 8 });
                    send_data.lastPrice = lib.format_decimal_string(new Decimal(send_data.lastPrice.toString()), { minFractionDigits: 2, maxFractionDigits: 8 });
                    send_data.lastUSDPrice = lib.format_decimal_string(new Decimal(send_data.lastUSDPrice.toString()), { minFractionDigits: 2, maxFractionDigits: 8 });
                    send_data.supply = lib.format_decimal_string(new Decimal(new Decimal(send_data.supply.toString()).toFixed(0)), { minFractionDigits: 0, maxFractionDigits: 0 });

                    if (!isStale)
                      send_data.hashrate = lib.format_decimal_string(new Decimal(hashrate.toString()), { minFractionDigits: 2, maxFractionDigits: 8 });
                  }

                  res.send(send_data);
                });
              });
            });
          });
        });
      });
    }
  } else
    res.end(settings.localization.method_disabled);
});

app.get(['/ext/getnetworkpeers', '/ext/getnetworkpeers/{*splat}'], function(req, res) {
  if (settings.api_page.enabled == true && settings.api_page.public_apis.ext.getnetworkpeers.enabled == true) {
    // split url suffix by forward slash and remove blank entries
    const split = req.url.split('/').filter(function(v) { return v; });
    let internal = false;

    // check if this is an internal request
    if (split.length > 0 && split[0] == 'internal')
      internal = true;

    // get list of peers
    db.get_peers(!internal, function(connection_peers, addnode_peers, onetry_peers) {
      // return peer data
      if (internal)
        res.json({'connection_peers': connection_peers, 'addnode_peers': addnode_peers, 'onetry_peers': onetry_peers});
      else {
        // remove ipv6 and table_type fields before outputting the api data
        connection_peers.forEach(function (peer) {
          delete peer.ipv6;
          delete peer.table_type;
        });

        res.json(connection_peers);
      }
    });
  } else
    res.end(settings.localization.method_disabled);
});

app.get('/ext/getpeerfqdncache/internal', function(req, res) {
  refresh_known_peer_fqdn_cache(false).then(function(cache) {
    return res.json(serialize_known_peer_fqdn_cache(cache));
  }).catch(function() {
    return res.status(503).json({ error: 'cache unavailable' });
  });
});

function build_network_overview_snapshot() {
  return new Promise(function(resolve) {
    lib.get_connectioncount(function(connectionCount) {
      db.get_peers(false, function(connectionPeers, addnodePeers, onetryPeers) {
        lib.get_peerinfo(function(rawWalletPeers) {
          const overview = build_network_overview(connectionCount, connectionPeers, addnodePeers, onetryPeers, rawWalletPeers);

          annotate_peer_fqdns([
            overview.connection_peers,
            overview.addnode_peers,
            overview.onetry_peers,
            overview.raw_only_peers
          ]).then(function() {
            overview.seed_aggregators = build_seed_aggregator_summaries();

            return resolve_public_node_endpoint().then(function(publicEndpoint) {
              annotate_public_node_endpoint(overview, publicEndpoint);
              return resolve(overview);
            }).catch(function() {
              return resolve(overview);
            });
          }).catch(function() {
            return resolve(overview);
          });
        });
      });
    });
  });
}

async function get_network_overview_snapshot() {
  const now = Date.now();

  if (networkOverviewCache.value != null && networkOverviewCache.expiresAt > now)
    return networkOverviewCache.value;

  if (networkOverviewCache.inFlight != null)
    return networkOverviewCache.inFlight;

  const previousValue = networkOverviewCache.value;
  const inFlight = build_network_overview_snapshot().then(function(value) {
    networkOverviewCache.value = value;
    networkOverviewCache.expiresAt = Date.now() + NETWORK_OVERVIEW_TTL_MS;
    return value;
  }).catch(function(error) {
    if (previousValue != null)
      return previousValue;

    throw error;
  }).finally(function() {
    if (networkOverviewCache.inFlight === inFlight)
      networkOverviewCache.inFlight = null;
  });

  networkOverviewCache.inFlight = inFlight;
  return inFlight;
}

app.get(['/ext/getnetworkoverview', '/ext/getnetworkoverview/internal'], function(req, res) {
  get_network_overview_snapshot().then(function(overview) {
    return res.json(overview);
  }).catch(function() {
    return res.status(503).json({ error: 'network overview unavailable' });
  });
});

// get the list of masternodes from local collection
app.use('/ext/getmasternodelist', function(req, res) {
  // check if the getmasternodelist api is enabled or else check the headers to see if it matches an internal ajax request from the explorer itself (TODO: come up with a more secure method of whitelisting ajax calls from the explorer)
  if ((settings.api_page.enabled == true && settings.api_page.public_apis.ext.getmasternodelist.enabled == true) || (req.headers['x-requested-with'] != null && req.headers['x-requested-with'].toLowerCase() == 'xmlhttprequest' && req.headers.referer != null && req.headers.accept.indexOf('text/javascript') > -1 && req.headers.accept.indexOf('application/json') > -1)) {
    // get the masternode list from local collection
    db.get_masternodes(function(masternodes) {
      // loop through masternode list and remove the mongo _id and __v keys
      for (i = 0; i < masternodes.length; i++) {
        delete masternodes[i]['_doc']['_id'];
        delete masternodes[i]['_doc']['__v'];
      }

      // return masternode list
      res.send(masternodes);
    });
  } else
    res.end(settings.localization.method_disabled);
});

// returns a list of masternode reward txs for a single masternode address from a specific block height
app.use('/ext/getmasternoderewards/:hash/:since', function(req, res) {
  // check if the getmasternoderewards api is enabled
  if (settings.api_page.enabled == true && settings.api_page.public_apis.ext.getmasternoderewards.enabled == true) {
    if (!inputguard.isAddressLike(req.params.hash))
      return inputguard.reject(res, 400, 'Invalid address');

    const since = inputguard.boundedInt(req.params.since, 0, 0, inputguard.MAX_CHAIN_HEIGHT);

    db.get_masternode_rewards(req.params.hash, since, function(rewards) {
      if (rewards != null) {
        // loop through the tx list to fix vout values and remove unnecessary data such as the always empty vin array and the mongo _id and __v keys
        for (i = 0; i < rewards.length; i++) {
          // remove unnecessary data keys
          delete rewards[i]['vin'];
          delete rewards[i]['_id'];
          delete rewards[i]['__v'];
          // convert amounts from satoshis
          rewards[i]['total'] = new Decimal(rewards[i]['total'].toString()).div(100000000).toString();
          rewards[i]['vout']['amount'] = new Decimal(rewards[i]['vout']['amount'].toString()).div(100000000).toString();
        }

        // return list of masternode rewards
        res.json(rewards);
      } else
        res.send({error: "failed to retrieve masternode rewards", hash: req.params.hash, since: since});
    });
  } else
    res.end(settings.localization.method_disabled);
});

// returns the total masternode rewards received for a single masternode address from a specific block height
app.use('/ext/getmasternoderewardstotal/:hash/:since', function(req, res) {
  // check if the getmasternoderewardstotal api is enabled
  if (settings.api_page.enabled == true && settings.api_page.public_apis.ext.getmasternoderewardstotal.enabled == true) {
    if (!inputguard.isAddressLike(req.params.hash))
      return inputguard.reject(res, 400, 'Invalid address');

    const since = inputguard.boundedInt(req.params.since, 0, 0, inputguard.MAX_CHAIN_HEIGHT);

    db.get_masternode_rewards_totals(req.params.hash, since, function(total_rewards) {
      if (total_rewards != null) {
        // return the total of masternode rewards
        res.setHeader('content-type', 'text/plain');
        res.end(total_rewards.toFixed(8));
      } else
        res.send({error: "failed to retrieve masternode rewards", hash: req.params.hash, since: since});
    });
  } else
    res.end(settings.localization.method_disabled);
});

// get the list of orphans from local collection
app.use('/ext/getorphanlist/:start/:length', function(req, res) {
  // check the headers to see if it matches an internal ajax request from the explorer itself (TODO: come up with a more secure method of whitelisting ajax calls from the explorer)
  if (req.headers['x-requested-with'] != null && req.headers['x-requested-with'].toLowerCase() == 'xmlhttprequest' && req.headers.referer != null && req.headers.accept.indexOf('text/javascript') > -1 && req.headers.accept.indexOf('application/json') > -1) {
    // fix parameters
    req.params.start = inputguard.boundedInt(req.params.start, 0, 0, inputguard.MAX_API_OFFSET);
    req.params.length = inputguard.boundedInt(req.params.length, 10, 1, 100);

    // get the orphan list from local collection
    db.get_orphans(req.params.start, req.params.length, function(orphans, count) {
      var data = [];

      for (i = 0; i < orphans.length; i++) {
        var row = [];

        row.push(orphans[i].blockindex);
        row.push(orphans[i].orphan_blockhash);
        row.push(orphans[i].good_blockhash);
        row.push(orphans[i].prev_blockhash);
        row.push(orphans[i].next_blockhash);

        data.push(row);
      }

      // display data formatted for internal datatable
      res.json({"data": data, "recordsTotal": count, "recordsFiltered": count});
    });
  } else
    res.end(settings.localization.method_disabled);
});

// get the last updated date for a particular section
app.use('/ext/getlastupdated/:section', function(req, res) {
  // check the headers to see if it matches an internal ajax request from the explorer itself (TODO: come up with a more secure method of whitelisting ajax calls from the explorer)
  if (req.headers['x-requested-with'] != null && req.headers['x-requested-with'].toLowerCase() == 'xmlhttprequest' && req.headers.referer != null && req.headers.accept.indexOf('text/javascript') > -1 && req.headers.accept.indexOf('application/json') > -1) {
    // fix parameters
    if (req.params.section == null || !inputguard.isSafeToken(req.params.section))
      req.params.section = '';

    switch (req.params.section.toLowerCase()) {
      case 'blockchain':
      case 'movement':
        // lookup last updated date
        db.get_stats(settings.coin.name, function (stats) {
          res.json({'last_updated_date': stats.blockchain_last_updated});
        });
        break;
      default:
        res.send({error: 'Cannot find last updated date'});
    }
  } else
    res.end(settings.localization.method_disabled);
});

app.use('/ext/getnetworkchartdata', function(req, res) {
  db.get_network_chart_data(function(data) {
    if (data)
      res.send(data);
    else
      res.send();
  });
});

var market_data = [];
var market_count = 0;

// check if markets are enabled
if (settings.markets_page.enabled == true) {
  // dynamically populate market data
  Object.keys(settings.markets_page.exchanges).forEach(function (key, index, map) {
    // check if market is enabled via settings
    if (settings.markets_page.exchanges[key].enabled == true) {
      // check if market is installed/supported
      if (db.fs.existsSync('./lib/markets/' + key + '.js')) {
        // load market file
        var exMarket = require('./lib/markets/' + key);
        // save market_name and market_logo from market file to settings
        eval('market_data.push({id: "' + key + '", name: "' + (exMarket.market_name == null ? '' : exMarket.market_name) + '", alt_name: "' + (exMarket.market_name_alt == null ? '' : exMarket.market_name_alt) + '", logo: "' + (exMarket.market_logo == null ? '' : exMarket.market_logo) + '", alt_logo: "' + (exMarket.market_logo_alt == null ? '' : exMarket.market_logo_alt) + '", trading_pairs: []});');
        // loop through all trading pairs for this market
        for (var i = 0; i < settings.markets_page.exchanges[key].trading_pairs.length; i++) {
          var isAlt = false;
          var pair = settings.markets_page.exchanges[key].trading_pairs[i].toUpperCase(); // ensure trading pair setting is always uppercase
          var coin_symbol = pair.split('/')[0];
          var pair_symbol = pair.split('/')[1];

          // determine if using the alt name + logo
          if (exMarket.market_url_template != null && exMarket.market_url_template != '') {
            switch ((exMarket.market_url_case == null || exMarket.market_url_case == '' ? 'l' : exMarket.market_url_case.toLowerCase())) {
              case 'l':
              case 'lower':
                isAlt = (exMarket.isAlt != null ? exMarket.isAlt({coin: coin_symbol.toLowerCase(), exchange: pair_symbol.toLowerCase()}) : false);
                break;
              case 'u':
              case 'upper':
                isAlt = (exMarket.isAlt != null ? exMarket.isAlt({coin: coin_symbol.toUpperCase(), exchange: pair_symbol.toUpperCase()}) : false);
                break;
              default:
            }
          }

          // add trading pair to market_data
          market_data[market_data.length - 1].trading_pairs.push({
            pair: pair,
            isAlt: isAlt
          });

          // increment the market count
          market_count++;
        }

        // sort trading pairs by alt status
        market_data[market_data.length - 1].trading_pairs.sort(function(a, b) {
          if (a.isAlt < b.isAlt)
            return -1;
          else if (a.isAlt > b.isAlt)
            return 1;
          else
            return 0;
        });
      }
    }
  });

  // sort market data by market name
  market_data.sort(function(a, b) {
    var name1 = a.name.toLowerCase();
    var name2 = b.name.toLowerCase();

    if (name1 < name2)
      return -1;
    else if (name1 > name2)
      return 1;
    else
      return 0;
  });

  // fix default exchange name case
  if (settings.markets_page.default_exchange.exchange_name != null)
    settings.markets_page.default_exchange.exchange_name = settings.markets_page.default_exchange.exchange_name.toLowerCase();
  else
    settings.markets_page.default_exchange.exchange_name = '';

  // fix default exchange trading pair case
  if (settings.markets_page.default_exchange.trading_pair != null)
    settings.markets_page.default_exchange.trading_pair = settings.markets_page.default_exchange.trading_pair.toUpperCase();
  else
    settings.markets_page.default_exchange.trading_pair = '';

  var ex = settings.markets_page.exchanges;
  var ex_name = settings.markets_page.default_exchange.exchange_name;
  var ex_pair = settings.markets_page.default_exchange.trading_pair;
  var ex_keys = Object.keys(ex);
  var ex_error = '';

  // check to ensure default market and trading pair exist and are enabled
  if (ex[ex_name] == null) {
    // exchange name does not exist in exchanges list
    ex_error = 'Default exchange name is not valid' + ': ' + ex_name;
  } else if (!ex[ex_name].enabled) {
    // exchange is not enabled
    ex_error = 'Default exchange is disabled in settings' + ': ' + ex_name;
  } else if (ex[ex_name].trading_pairs.findIndex(p => p.toUpperCase() == ex_pair.toUpperCase()) == -1) {
    // invalid default exchange trading pair
    ex_error = 'Default exchange trading pair is not valid' + ': ' + ex_pair;
  }

  // check if there was an error msg
  if (ex_error != '') {
    // there was an error, so find the next available market from settings.json
    var new_default_index = -1;

    // find the first enabled exchange with at least one trading pair
    for (var i = 0; i < ex_keys.length; i++) {
      if (ex[ex_keys[i]]['enabled'] === true && ex[ex_keys[i]]['trading_pairs'].length > 0) {
        // found a match so save the index
        new_default_index = i;
        // stop looking for more matches
        break;
      }
    }

    // check if a valid and enabled market was found
    if (new_default_index == -1) {
      // no valid markets found
      console.log('WARNING: ' + ex_error + '. ' + 'No valid or enabled markets found in settings.json. The markets feature will be temporarily disabled. To restore markets functionality, please enable at least 1 market and ensure at least 1 valid trading pair is added. Finally, restart the explorer to resolve the problem');
      // disable the markets feature for this session
      settings.markets_page.enabled = false;
    } else {
      // a valid and enabled market was found to replace the default
      console.log('WARNING: ' + ex_error + '. ' + 'Default exchange will be set to' + ': ' + ex_keys[new_default_index] + '[' + ex[ex_keys[new_default_index]].trading_pairs[0].toUpperCase() + ']');
      // set new default exchange data
      settings.markets_page.default_exchange.exchange_name = ex_keys[new_default_index];
      settings.markets_page.default_exchange.trading_pair = ex[ex_keys[new_default_index]].trading_pairs[0].toUpperCase();
    }
  }
}

// check if home_link_logo file exists
if (!db.fs.existsSync(path.join('./public', settings.shared_pages.page_header.home_link_logo)))
  settings.shared_pages.page_header.home_link_logo = '';

// always disable the rpc masternode list cmd from public apis
settings.api_page.public_apis.rpc.getmasternodelist = { "enabled": false };

// locals
app.set('explorer_version', package_metadata.version);
app.set('localization', settings.localization);
app.set('coin', settings.coin);
app.set('network_history', settings.network_history);
app.set('shared_pages', settings.shared_pages);
app.set('index_page', settings.index_page);
app.set('block_page', settings.block_page);
app.set('transaction_page', settings.transaction_page);
app.set('address_page', settings.address_page);
app.set('error_page', settings.error_page);
app.set('masternodes_page', settings.masternodes_page);
app.set('movement_page', settings.movement_page);
app.set('network_page', settings.network_page);
app.set('richlist_page', settings.richlist_page);
app.set('markets_page', settings.markets_page);
app.set('api_page', settings.api_page);
app.set('claim_address_page', settings.claim_address_page);
app.set('orphans_page', settings.orphans_page);
app.set('captcha', settings.captcha);
app.set('labels', settings.labels);
app.set('default_coingecko_ids', settings.default_coingecko_ids);
app.set('api_cmds', settings.api_cmds);
app.set('blockchain_specific', settings.blockchain_specific);
app.set('plugins', settings.plugins);

// determine panel offset based on which panels are enabled
var paneltotal = 5;
var panelcount = (settings.shared_pages.page_header.panels.network_panel.enabled == true && settings.shared_pages.page_header.panels.network_panel.display_order > 0 ? 1 : 0) +
  (settings.shared_pages.page_header.panels.difficulty_panel.enabled == true && settings.shared_pages.page_header.panels.difficulty_panel.display_order > 0 ? 1 : 0) +
  (settings.shared_pages.page_header.panels.masternodes_panel.enabled == true && settings.shared_pages.page_header.panels.masternodes_panel.display_order > 0 ? 1 : 0) +
  (settings.shared_pages.page_header.panels.coin_supply_panel.enabled == true && settings.shared_pages.page_header.panels.coin_supply_panel.display_order > 0 ? 1 : 0) +
  (settings.shared_pages.page_header.panels.price_panel.enabled == true && settings.shared_pages.page_header.panels.price_panel.display_order > 0 ? 1 : 0) +
  (settings.shared_pages.page_header.panels.usd_price_panel.enabled == true && settings.shared_pages.page_header.panels.usd_price_panel.display_order > 0 ? 1 : 0) +
  (settings.shared_pages.page_header.panels.market_cap_panel.enabled == true && settings.shared_pages.page_header.panels.market_cap_panel.display_order > 0 ? 1 : 0) +
  (settings.shared_pages.page_header.panels.usd_market_cap_panel.enabled == true && settings.shared_pages.page_header.panels.usd_market_cap_panel.display_order > 0 ? 1 : 0) +
  (settings.shared_pages.page_header.panels.logo_panel.enabled == true && settings.shared_pages.page_header.panels.logo_panel.display_order > 0 ? 1 : 0) +
  (settings.shared_pages.page_header.panels.spacer_panel_1.enabled == true && settings.shared_pages.page_header.panels.spacer_panel_1.display_order > 0 ? 1 : 0) +
  (settings.shared_pages.page_header.panels.spacer_panel_2.enabled == true && settings.shared_pages.page_header.panels.spacer_panel_2.display_order > 0 ? 1 : 0) +
  (settings.shared_pages.page_header.panels.spacer_panel_3.enabled == true && settings.shared_pages.page_header.panels.spacer_panel_3.display_order > 0 ? 1 : 0);
app.set('paneloffset', paneltotal + 1 - panelcount);

// determine panel order
var panel_order = new Array();

if (settings.shared_pages.page_header.panels.network_panel.enabled == true && settings.shared_pages.page_header.panels.network_panel.display_order > 0) panel_order.push({name: 'network_panel', val: settings.shared_pages.page_header.panels.network_panel.display_order});
if (settings.shared_pages.page_header.panels.difficulty_panel.enabled == true && settings.shared_pages.page_header.panels.difficulty_panel.display_order > 0) panel_order.push({name: 'difficulty_panel', val: settings.shared_pages.page_header.panels.difficulty_panel.display_order});
if (settings.shared_pages.page_header.panels.masternodes_panel.enabled == true && settings.shared_pages.page_header.panels.masternodes_panel.display_order > 0) panel_order.push({name: 'masternodes_panel', val: settings.shared_pages.page_header.panels.masternodes_panel.display_order});
if (settings.shared_pages.page_header.panels.coin_supply_panel.enabled == true && settings.shared_pages.page_header.panels.coin_supply_panel.display_order > 0) panel_order.push({name: 'coin_supply_panel', val: settings.shared_pages.page_header.panels.coin_supply_panel.display_order});
if (settings.shared_pages.page_header.panels.price_panel.enabled == true && settings.shared_pages.page_header.panels.price_panel.display_order > 0) panel_order.push({name: 'price_panel', val: settings.shared_pages.page_header.panels.price_panel.display_order});
if (settings.shared_pages.page_header.panels.usd_price_panel.enabled == true && settings.shared_pages.page_header.panels.usd_price_panel.display_order > 0) panel_order.push({name: 'usd_price_panel', val: settings.shared_pages.page_header.panels.usd_price_panel.display_order});
if (settings.shared_pages.page_header.panels.market_cap_panel.enabled == true && settings.shared_pages.page_header.panels.market_cap_panel.display_order > 0) panel_order.push({name: 'market_cap_panel', val: settings.shared_pages.page_header.panels.market_cap_panel.display_order});
if (settings.shared_pages.page_header.panels.usd_market_cap_panel.enabled == true && settings.shared_pages.page_header.panels.usd_market_cap_panel.display_order > 0) panel_order.push({name: 'usd_market_cap_panel', val: settings.shared_pages.page_header.panels.usd_market_cap_panel.display_order});
if (settings.shared_pages.page_header.panels.logo_panel.enabled == true && settings.shared_pages.page_header.panels.logo_panel.display_order > 0) panel_order.push({name: 'logo_panel', val: settings.shared_pages.page_header.panels.logo_panel.display_order});
if (settings.shared_pages.page_header.panels.spacer_panel_1.enabled == true && settings.shared_pages.page_header.panels.spacer_panel_1.display_order > 0) panel_order.push({name: 'spacer_panel_1', val: settings.shared_pages.page_header.panels.spacer_panel_1.display_order});
if (settings.shared_pages.page_header.panels.spacer_panel_2.enabled == true && settings.shared_pages.page_header.panels.spacer_panel_2.display_order > 0) panel_order.push({name: 'spacer_panel_2', val: settings.shared_pages.page_header.panels.spacer_panel_2.display_order});
if (settings.shared_pages.page_header.panels.spacer_panel_3.enabled == true && settings.shared_pages.page_header.panels.spacer_panel_3.display_order > 0) panel_order.push({name: 'spacer_panel_3', val: settings.shared_pages.page_header.panels.spacer_panel_3.display_order});

panel_order.sort(function(a,b) { return a.val - b.val; });

for (var i = 1; i < 6; i++)
  app.set('panel'+i.toString(), ((panel_order.length >= i) ? panel_order[i-1].name : ''));

app.set('market_data', market_data);
app.set('market_count', market_count);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler - will print stacktrace when in development mode, otherwise no stacktraces will be leaked to the user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: (app.get('env') === 'development' ? err : {})
  });
});

// determine if tls features should be enabled
if (settings.webserver.tls.enabled == true) {
  function readCertsSync() {
    var tls_options = {};

    try {
      tls_options = {
        key: db.fs.readFileSync(settings.webserver.tls.key_file),
        cert: db.fs.readFileSync(settings.webserver.tls.cert_file),
        ca: db.fs.readFileSync(settings.webserver.tls.chain_file)
      };
    } catch(e) {
      console.warn('There was a problem reading tls certificates. Check that the certificate, chain and key paths are correct.');
    }

    return tls_options;
  }

  const https = require('https');
  let httpd = https.createServer(readCertsSync(), app).listen(settings.webserver.tls.port);

  try {
    let waitForCertsToRefresh;

    // watch for changes to the certificate directory
    db.fs.watch(path.dirname(settings.webserver.tls.key_file), () => {
      clearTimeout(waitForCertsToRefresh);

      // refresh certificates as they are changed on disk
      waitForCertsToRefresh = setTimeout(() => {
        httpd.setSecureContext(readCertsSync());
      }, 1000);
    });
  } catch(e) {
    console.warn('There was a problem reading tls certificates. Check that the certificate, chain and key paths are correct.');
  }
}

// get the latest git commit id (if exists)
exec('git rev-parse HEAD', (err, stdout, stderr) => {
  // check if the commit id was returned
  if (stdout != null && stdout != '') {
    // set the explorer revision code based on the git commit id
    app.set('revision', stdout.substring(0, 7));
  }
});

module.exports = app;

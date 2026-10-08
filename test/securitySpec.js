describe('security boundaries', function() {
  describe('output encoding', function() {
    const inputguard = require('../lib/inputguard');
    const { defcoinEscapeHtml } = require('../public/js/custom');

    it('serializes attacker-controlled text without ending a script element', function() {
      const payload = "</script><img src=x onerror='globalThis.pwned=1'>&\u2028\u2029";
      const serialized = inputguard.safeJsonForScript({ value: payload });

      expect(serialized).not.toContain('<');
      expect(serialized).not.toContain('>');
      expect(serialized).not.toContain('&');
      expect(serialized).not.toContain('\u2028');
      expect(serialized).not.toContain('\u2029');
      expect(JSON.parse(serialized).value).toEqual(payload);
    });

    it('encodes every HTML metacharacter used by signed names and miner identities', function() {
      expect(defcoinEscapeHtml(`<img src=x onerror="x()">'&`))
        .toEqual('&lt;img src=x onerror=&quot;x()&quot;&gt;&#39;&amp;');
    });
  });

  describe('paper-wallet entropy', function() {
    it('fails closed instead of seeding key generation from Math.random', function() {
      const fs = require('fs');
      const source = fs.readFileSync('public/paperwallet-static/defcoin-paperwallet.html', 'utf8');
      const start = source.indexOf('var sr = window.SecureRandom');
      const end = source.indexOf('</script>', start);
      const secureRandomSource = source.slice(start, end);

      expect(start).toBeGreaterThan(-1);
      expect(secureRandomSource).toContain('Secure key generation requires Web Crypto getRandomValues');
      expect(secureRandomSource).not.toContain('while (sr.pptr < sr.poolSize)');
      expect(secureRandomSource).not.toContain('65536 * Math.random()');
    });
  });

  describe('proxy identity', function() {
    const inputguard = require('../lib/inputguard');

    it('trusts only local reverse-proxy connections', function() {
      expect(inputguard.isTrustedProxyAddress('127.0.0.1')).toBeTrue();
      expect(inputguard.isTrustedProxyAddress('::ffff:127.0.0.1')).toBeTrue();
      expect(inputguard.isTrustedProxyAddress('::1')).toBeTrue();
      expect(inputguard.isTrustedProxyAddress('203.0.113.10')).toBeFalse();
      expect(inputguard.isTrustedProxyAddress('evil127.0.0.1')).toBeFalse();
    });
  });

  describe('browser security headers', function() {
    const inputguard = require('../lib/inputguard');

    it('blocks framing and plugin objects without disabling existing scripts', function() {
      const headers = {};
      const res = {
        setHeader: function(name, value) { headers[name] = value; }
      };
      const next = jasmine.createSpy('next');

      inputguard.setSecurityHeaders({}, res, next);

      expect(headers['X-Content-Type-Options']).toEqual('nosniff');
      expect(headers['X-Frame-Options']).toEqual('DENY');
      expect(headers['Content-Security-Policy']).toContain("object-src 'none'");
      expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
      expect(headers['Content-Security-Policy']).not.toContain('script-src');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('malformed request limits', function() {
    const inputguard = require('../lib/inputguard');

    function guardedRequest(overrides) {
      const req = Object.assign({originalUrl: '/', path: '/', query: {}, body: {}}, overrides || {});
      const res = {headersSent: false};
      res.status = jasmine.createSpy('status').and.returnValue(res);
      res.send = jasmine.createSpy('send').and.returnValue(res);
      const next = jasmine.createSpy('next');

      inputguard.guardExpressRequest(req, res, next);
      return {res, next};
    }

    it('rejects oversized URLs before route processing', function() {
      const result = guardedRequest({originalUrl: '/' + 'a'.repeat(2049)});
      expect(result.res.status).toHaveBeenCalledOnceWith(414);
      expect(result.next).not.toHaveBeenCalled();
    });

    it('rejects nested and attacker-sized parameter shapes', function() {
      const nested = guardedRequest({query: {filter: {operator: '$where'}}});
      const oversizedArray = guardedRequest({body: {values: new Array(9).fill('x')}});

      expect(nested.res.status).toHaveBeenCalledOnceWith(400);
      expect(oversizedArray.res.status).toHaveBeenCalledOnceWith(400);
      expect(nested.next).not.toHaveBeenCalled();
      expect(oversizedArray.next).not.toHaveBeenCalled();
    });

    it('bounds numeric database offsets without precision loss', function() {
      expect(inputguard.boundedInt('999999999999999999999', 7, 0, 100)).toEqual(7);
      expect(inputguard.boundedInt('-1', 7, 0, 100)).toEqual(0);
      expect(inputguard.boundedInt('101', 7, 0, 100)).toEqual(100);
    });
  });

  describe('wallet JSON-RPC framing', function() {
    const EventEmitter = require('events');
    const JsonRpcClient = require('../lib/jsonrpc').Client;

    function fakeTransport(responseBody, capture) {
      return {
        request: function(options) {
          const request = new EventEmitter();
          request.setTimeout = function() {};
          request.abort = function() {};
          request.end = function(body) {
            capture.options = options;
            capture.body = body;

            const response = new EventEmitter();
            response.statusCode = 200;
            response.headers = {};
            response.destroy = function() {};

            process.nextTick(function() {
              request.emit('response', response);
              response.emit('data', Buffer.from(responseBody));
              response.emit('end');
            });
          };
          return request;
        }
      };
    }

    it('uses the UTF-8 byte count for request framing', function(done) {
      const capture = {};
      const responseBody = JSON.stringify({result: true, error: null});
      const client = new JsonRpcClient({host: '127.0.0.1', port: 1, timeout: 1000, transport: fakeTransport(responseBody, capture)});

      client.call('echo', ['Defcoin π'], function(result) {
        expect(result).toBeTrue();
        expect(JSON.parse(capture.body).params).toEqual(['Defcoin π']);
        expect(capture.options.headers['Content-Length']).toEqual(Buffer.byteLength(capture.body, 'utf8'));
        done();
      }, function(err) {
        done.fail(err);
      });
    });

    it('aborts an oversized wallet response before unbounded buffering', function(done) {
      const capture = {};
      const responseBody = JSON.stringify({result: 'x'.repeat(2048), error: null});
      const client = new JsonRpcClient({host: '127.0.0.1', port: 1, timeout: 1000, maxResponseBytes: 128, transport: fakeTransport(responseBody, capture)});

      client.call('large', [], function() {
        done.fail('oversized response reached the success callback');
      }, function(err) {
        expect(err.code).toEqual('ERESPONSETOOLARGE');
        done();
      });
    });
  });

  describe('mining history response bounds', function() {
    const history = require('../lib/defcoin_hashrate_history');
    const JobState = require('../models/defcoinhistoricaljobstate');
    const statsClient = require('../lib/defcoin_stats_client');

    it('retains endpoints while capping each chart source', function() {
      const rows = [];
      for (let i = 0; i < 20; i++) {
        rows.push({sourceId: 'a', value: i});
        rows.push({sourceId: 'b', value: i});
      }

      const sampled = history.downsampleRows(rows, 5, 'sourceId');
      const sourceA = sampled.filter(function(row) { return row.sourceId === 'a'; });
      const sourceB = sampled.filter(function(row) { return row.sourceId === 'b'; });

      expect(sourceA.length).toEqual(5);
      expect(sourceB.length).toEqual(5);
      expect(sourceA[0].value).toEqual(0);
      expect(sourceA[sourceA.length - 1].value).toEqual(19);
      expect(sourceB[0].value).toEqual(0);
      expect(sourceB[sourceB.length - 1].value).toEqual(19);
      expect(history.MAX_POINTS_PER_SOURCE).toEqual(600);
    });

    it('caps imported historical charts globally and coalesces cold loads', function() {
      const importedHistory = require('../lib/defcoinstats_history');
      const source = require('fs').readFileSync('lib/defcoinstats_history.js', 'utf8');

      expect(importedHistory.MAX_POINTS_PER_SOURCE).toEqual(600);
      expect(importedHistory.MAX_TOTAL_POINTS).toEqual(5000);
      expect(importedHistory.MAX_SOURCES).toEqual(64);
      expect(source).toContain('if (chartInFlight)');
      expect(source).toContain('return chartInFlight;');
    });

    it('caches imported historical charts after the cold load', async function() {
      const ImportedSample = require('../models/defcoinstatshistoricalsample');
      const importedHistory = require('../lib/defcoinstats_history');
      const originalAggregate = ImportedSample.aggregate;
      let aggregateCalls = 0;

      try {
        ImportedSample.aggregate = function() {
          return {
            exec: function() {
              aggregateCalls += 1;
              return Promise.resolve([]);
            }
          };
        };

        const first = await importedHistory.getChartData();
        const second = await importedHistory.getChartData();

        expect(second).toBe(first);
        expect(aggregateCalls).toEqual(1);
      } finally {
        ImportedSample.aggregate = originalAggregate;
      }
    });

    it('elects one cluster worker per history bucket', async function() {
      const originalUpdateOne = JobState.updateOne;
      const sampledAt = new Date('2026-09-03T12:00:00.000Z');

      try {
        JobState.updateOne = function() {
          return Promise.resolve({modifiedCount: 1, upsertedCount: 0});
        };
        expect(await history.claimSampleBucket(sampledAt)).toBeTrue();

        JobState.updateOne = function() {
          return Promise.resolve({modifiedCount: 0, upsertedCount: 0});
        };
        expect(await history.claimSampleBucket(sampledAt)).toBeFalse();

        JobState.updateOne = function() {
          const err = new Error('duplicate key');
          err.code = 11000;
          return Promise.reject(err);
        };
        expect(await history.claimSampleBucket(sampledAt)).toBeFalse();
      } finally {
        JobState.updateOne = originalUpdateOne;
      }
    });

    it('does no upstream or history work when another worker owns the bucket', async function() {
      spyOn(JobState, 'updateOne').and.returnValue(Promise.resolve({modifiedCount: 0, upsertedCount: 0}));
      spyOn(statsClient, 'fetchMiningStats');

      expect(await history.sampleNow()).toEqual({skipped: true});
      expect(statsClient.fetchMiningStats).not.toHaveBeenCalled();
    });

    it('keeps public mining-stat routes read-only', function() {
      const fs = require('fs');
      const source = fs.readFileSync('routes/index.js', 'utf8');
      const start = source.indexOf("router.get(['/mining-stats', '/standalone/mining-stats']");
      const end = source.indexOf('\nrouter.get(', start + 1);
      const routeSource = source.slice(start, end);

      expect(start).toBeGreaterThan(-1);
      expect(routeSource).not.toContain('recordSnapshot');
      expect(routeSource).not.toContain('sampleNow');
    });
  });

  describe('plugin authentication', function() {
    const inputguard = require('../lib/inputguard');

    it('rejects blank and mismatched service credentials', function() {
      expect(inputguard.constantTimeSecretEqual('', '')).toBeFalse();
      expect(inputguard.constantTimeSecretEqual('configured-secret', 'wrong-secret')).toBeFalse();
      expect(inputguard.constantTimeSecretEqual('configured-secret', 'configured-secret')).toBeTrue();
    });
  });

  describe('production credential gate', function() {
    const settings = require('../lib/settings');
    let original;

    beforeEach(function() {
      original = {
        dbUser: settings.dbsettings.user,
        dbPassword: settings.dbsettings.password,
        walletUsername: settings.wallet.username,
        walletPassword: settings.wallet.password,
        useRpc: settings.api_cmds.use_rpc,
        pluginSecret: settings.plugins.plugin_secret_code,
        allowedPlugins: settings.plugins.allowed_plugins
      };
    });

    afterEach(function() {
      settings.dbsettings.user = original.dbUser;
      settings.dbsettings.password = original.dbPassword;
      settings.wallet.username = original.walletUsername;
      settings.wallet.password = original.walletPassword;
      settings.api_cmds.use_rpc = original.useRpc;
      settings.plugins.plugin_secret_code = original.pluginSecret;
      settings.plugins.allowed_plugins = original.allowedPlugins;
    });

    it('permits redacted defaults only outside production', function() {
      expect(settings.assertProductionSecrets('development')).toBeTrue();
      expect(function() { settings.assertProductionSecrets('production'); })
        .toThrowError(/Production credentials are missing or too short/);
    });

    it('accepts strong service credentials without exposing their values', function() {
      const testSecret = 'test-' + 'x'.repeat(20);
      settings.dbsettings.user = 'explorer';
      settings.dbsettings.password = testSecret;
      settings.wallet.username = 'explorer-rpc';
      settings.wallet.password = testSecret;
      settings.api_cmds.use_rpc = true;
      settings.plugins.allowed_plugins = [];

      expect(settings.assertProductionSecrets('production')).toBeTrue();
    });

    it('requires a strong plugin secret when any plugin is enabled', function() {
      const testSecret = 'test-' + 'x'.repeat(20);
      settings.dbsettings.user = 'explorer';
      settings.dbsettings.password = testSecret;
      settings.wallet.username = 'explorer-rpc';
      settings.wallet.password = testSecret;
      settings.plugins.allowed_plugins = [{plugin_name: 'sample', enabled: true}];
      settings.plugins.plugin_secret_code = 'short';

      expect(function() { settings.assertProductionSecrets('production'); })
        .toThrowError(/plugins\.plugin_secret_code/);
    });

    it('rejects the legacy internal-HTTP RPC mode in production', function() {
      const testSecret = 'test-' + 'x'.repeat(20);
      settings.dbsettings.user = 'explorer';
      settings.dbsettings.password = testSecret;
      settings.wallet.username = 'explorer-rpc';
      settings.wallet.password = testSecret;
      settings.api_cmds.use_rpc = false;
      settings.plugins.allowed_plugins = [];

      expect(function() { settings.assertProductionSecrets('production'); })
        .toThrowError(/api_cmds\.use_rpc must be true/);
    });
  });

  describe('disabled faucet', function() {
    const FaucetClaim = require('../models/faucetclaim');
    const FaucetConfig = require('../models/faucetconfig');
    const faucet = require('../lib/faucet');

    it('returns before creating persistent claim telemetry', async function() {
      spyOn(FaucetConfig, 'findOne').and.returnValue({
        lean: async function() {
          return { key: 'default', value: { enabled: false } };
        }
      });
      spyOn(FaucetClaim, 'create');

      const result = await faucet.submitClaim({
        address: 'D123456789ABCDEFGHJKLMNPQRSTUVWXYZab',
        userAgent: '<script>alert(1)</script>',
        ip: '203.0.113.10'
      });

      expect(result.ok).toBeFalse();
      expect(result.statusCode).toEqual(503);
      expect(FaucetClaim.create).not.toHaveBeenCalled();
    });
  });

  describe('pool page markup escaping', function() {
    it('escapes every recent-block value inserted into table markup', function() {
      const fs = require('fs');
      const source = fs.readFileSync('public/js/defcoin-pool.js', 'utf8');
      const start = source.indexOf('function renderBlockTable(recentBlocks)');
      const end = source.indexOf('\n  function pagerAvailableWidth()', start);
      const renderBlockTable = source.slice(start, end);

      expect(start).toBeGreaterThan(-1);
      expect(renderBlockTable).toContain('${escapeHtml(formatRelativeTime(block.ts))}');
      expect(renderBlockTable).toContain('${escapeHtml(formatTimestamp(block.ts))}');
      expect(renderBlockTable).toContain('${escapeHtml(height)}');
      expect(renderBlockTable).not.toContain('>${height}</a>');
    });
  });

  describe('peer geolocation resilience', function() {
    it('bounds the external lookup and does not abort peer sync when enrichment fails', function() {
      const fs = require('fs');
      const explorerSource = fs.readFileSync('lib/explorer.js', 'utf8');
      const lookupStart = explorerSource.indexOf('get_geo_location: function(address, cb)');
      const lookupEnd = explorerSource.indexOf('\n  is_unique:', lookupStart);
      const lookupSource = explorerSource.slice(lookupStart, lookupEnd);
      const syncSource = fs.readFileSync('scripts/sync.js', 'utf8');
      const syncStart = syncSource.indexOf('lib.get_geo_location(address');
      const syncEnd = syncSource.indexOf('\n                    });', syncStart);
      const geolocationSync = syncSource.slice(syncStart, syncEnd);

      expect(lookupStart).toBeGreaterThan(-1);
      expect(lookupSource).toContain('timeout: GEOLOCATION_TIMEOUT_MS');
      expect(lookupSource).toContain('maxResponseSize: GEOLOCATION_MAX_RESPONSE_BYTES');
      expect(lookupSource).toContain('followRedirect: false');
      expect(syncStart).toBeGreaterThan(-1);
      expect(geolocationSync).not.toContain('exit(1)');
      expect(geolocationSync).toContain('peerList = peerList.concat(newPeers)');
    });
  });

  describe('wallet RPC authorization', function() {
    const nodeapi = require('../lib/nodeapi');
    const settings = require('../lib/settings');
    let originalApiEnabled;
    let originalMethodEnabled;

    beforeEach(function() {
      originalApiEnabled = settings.api_page.enabled;
      originalMethodEnabled = settings.api_page.public_apis.rpc.getconnectioncount.enabled;
      settings.api_page.enabled = true;
      settings.api_page.public_apis.rpc.getconnectioncount.enabled = false;
      nodeapi.setAccess('only', ['getconnectioncount']);
      nodeapi.setWalletDetails({
        cmd: function() {
          fail('disabled RPC method reached the wallet client');
        }
      });
    });

    afterEach(async function() {
      settings.api_page.enabled = originalApiEnabled;
      settings.api_page.public_apis.rpc.getconnectioncount.enabled = originalMethodEnabled;

    });

    it('does not let a forged Host header enable a disabled method', async function() {
      const req = {
        path: '/getconnectioncount',
        headers: { host: 'evil127.0.0.1' }
      };
      const res = { end: jasmine.createSpy('end') };
      const next = jasmine.createSpy('next');

      nodeapi.hasAccess(req, res, next);

      expect(res.end).toHaveBeenCalledOnceWith(settings.localization.method_disabled);
      expect(next).not.toHaveBeenCalled();
    });
  });
});

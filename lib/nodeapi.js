var onode = require('./node'),
    express = require('express'),
    settings = require('./settings'),
    inputguard = require('./inputguard');

module.exports = function() {
  function hasAccess(req, res, next) {
    var method = req.path.substring(1, req.path.length);
    var method_enabled = false;

    if (!inputguard.isRpcMethod(method))
      return inputguard.reject(res, 400, 'Invalid API method');

    if (settings.api_page.public_apis.rpc[method] != null) {
      method_enabled = settings.api_page.public_apis.rpc[method].enabled;
    } else {
      Object.keys(settings.blockchain_specific).forEach(function(key) {
        if (settings.blockchain_specific[key].enabled == true && settings.blockchain_specific[key]['public_apis'] != null && settings.blockchain_specific[key]['public_apis'][method] != null)
          method_enabled = settings.blockchain_specific[key]['public_apis'][method].enabled;
      });
    }

    // Public HTTP RPC methods must be enabled explicitly. Internal application
    // work calls the wallet library directly rather than trusting request headers.
    if (!settings.api_page.enabled || method_enabled == null || !method_enabled)
      return res.end(settings.localization.method_disabled);

    if (method == 'getnetworkhashps' && !settings.shared_pages.show_hashrate)
      return res.end('-');

    if (accesslist.type == 'all')
      return next();

    if ('undefined' == typeof accesslist[method]) {
      if (accesslist.type == 'only')
        return res.end('This method is restricted');

      return next();
    }

    if (accesslist[method] == true)
      return next();

    return res.end('This method is restricted');
  }

  function express_app() {
    var app = express();

    app.use(inputguard.guardExpressRequest);

    app.get('/{*splat}', hasAccess, function(req, res) {
      var method = req.path.substring(1, req.path.length);

      if (!inputguard.isRpcMethod(method))
        return inputguard.reject(res, 400, 'Invalid API method');

      if ('undefined' != typeof requires_passphrase[method]) {
        if (wallet_passphrase)
          client.walletPassphrase(wallet_passphrase, 10);
        else
          res.send('A wallet passphrase is needed and has not been set.');
      }

      const query_parameters = req.query;
      let params = [];

      Object.keys(query_parameters).forEach(function(parameter) {
        params.push(inputguard.safeRpcParam(query_parameters[parameter]));
      });

      var command = [];

      switch (method) {
        case 'getnetworkhashps':
        case 'getmininginfo':
        case 'getdifficulty':
        case 'getconnectioncount':
        case 'getblockcount':
        case 'getblockhash':
        case 'getblock':
        case 'getrawtransaction':
        case 'getsupply':
        case 'getinfo':
        case 'getblockchaininfo':
        case 'getpeerinfo':
        case 'gettxoutsetinfo':
        case 'getmaxmoney':
        case 'getmaxvote':
        case 'getvote':
        case 'getphase':
        case 'getreward':
        case 'getnextrewardestimate':
        case 'getnextrewardwhenstr':
        case 'getvotelist':
        case 'getmasternodecount':
        case 'getmasternodelist':
        case 'verifymessage':
        case 'sendmany':
          command = specialApiCase(method, query_parameters);
          if (command == null)
            return inputguard.reject(res, 400, 'Invalid API parameters');
          break;
        default:
          command = [{
            method: method,
            params: params
          }];

          break;
      }

      client.cmd(command, function(err, response) {
        if (err) {
          console.log(err);
          res.send(`${settings.localization.ex_error}: ${settings.localization.check_console}`);
        } else {
          if (typeof response === 'object')
            res.json(response);
          else {
            res.setHeader('content-type', 'text/plain');
            res.end(response.toString());
          }
        }
      });
    });

    function prepareRpcCommand(cmd, addParams) {
      var method_name = '';
      var params = addParams || [];

      // Check for null/blank string
      if (cmd != null && cmd.trim() != '') {
        // Split cmd by spaces
        var split = cmd.split(' ');

        for (i=0; i<split.length; i++) {
          if (i==0)
            method_name = split[i];
          else
            params.push(split[i]);
        }
      }

      return { method: method_name, parameters: params };
    }

    function specialApiCase(method_name, query_parameters) {
      var params = [];

      switch (method_name) {
        case 'getnetworkhashps':
        case 'getmininginfo':
        case 'getdifficulty':
        case 'getconnectioncount':
        case 'getblockcount':
        case 'getinfo':
        case 'getblockchaininfo':
        case 'getpeerinfo':
        case 'gettxoutsetinfo':
        case 'getvotelist':
        case 'getmasternodecount':
        case 'getmasternodelist':
          var cmd = prepareRpcCommand(settings.api_cmds[method_name]);

          method_name = cmd.method;
          params = cmd.parameters;

          break;
        case 'getmaxmoney':
        case 'getmaxvote':
        case 'getvote':
        case 'getphase':
        case 'getreward':
        case 'getnextrewardestimate':
        case 'getnextrewardwhenstr':
        case 'getsupply':
          var cmd = prepareRpcCommand(settings.blockchain_specific.heavycoin.api_cmds[method_name]);

          method_name = cmd.method;
          params = cmd.parameters;

          break;
        case 'getblockhash':
          const height = inputguard.boundedInt((query_parameters.height != null ? query_parameters.height : query_parameters.index), null, 0, inputguard.MAX_CHAIN_HEIGHT);

          if (height == null)
            return null;

          params.push(height);

          var cmd = prepareRpcCommand(settings.api_cmds.getblockhash, params);

          method_name = cmd.method;
          params = cmd.parameters;

          break;
        case 'getblock':
          if (!inputguard.isHash64(query_parameters.hash))
            return null;

          params.push(query_parameters.hash);

          var cmd = prepareRpcCommand(settings.api_cmds.getblock, params);
          
          method_name = cmd.method;
          params = cmd.parameters;

          break;
        case 'getrawtransaction':
          if (!inputguard.isHash64(query_parameters.txid))
            return null;

          params.push(query_parameters.txid);
          params.push(inputguard.boundedInt(query_parameters.decrypt, 0, 0, 1));

          var cmd = prepareRpcCommand(settings.api_cmds.getrawtransaction, params);

          method_name = cmd.method;
          params = cmd.parameters;

          break;
        case 'verifymessage':
          const verifyAddress = query_parameters.address;
          const verifyMessage = inputguard.cleanBoundedText(query_parameters.message, inputguard.MAX_RPC_MESSAGE_LENGTH);
          let verifySignature = inputguard.cleanBoundedText(query_parameters.signature, inputguard.MAX_RPC_SIGNATURE_LENGTH);

          if (!inputguard.isAddressLike(verifyAddress) || verifyMessage === '' || verifySignature === '')
            return null;

          while (verifySignature.indexOf(' ') > -1)
            verifySignature = verifySignature.replace(' ', '+');

          params.push(verifyAddress);
          params.push(verifySignature);
          params.push(verifyMessage);

          var cmd = prepareRpcCommand(settings.api_cmds.verifymessage, params);

          method_name = cmd.method;
          params = cmd.parameters;

          break;
        case 'sendmany':
          var after_account = false;
          var before_min_conf = true;
          var address_info = {};

          Object.keys(query_parameters).forEach(function(parameter) {
            if (parameter == 'minconf') {
              before_min_conf = false;
              params.push(address_info);
            }

            let param = inputguard.safeRpcParam(query_parameters[parameter]);

            if (after_account && before_min_conf)
              address_info[parameter] = param;
            else
              params.push(param);

            if (parameter == 'account')
              after_account = true;
          });

          if (before_min_conf)
            params.push(address_info);

          break;
      }

      return [{
        method: method_name,
        params: params
      }];
    }

    return app;
  };

  var accesslist = {};
  var client = {};
  var wallet_passphrase = null;
  var requires_passphrase = {
    'dumpprivkey': true,
    'importprivkey': true,
    'keypoolrefill': true,
    'sendfrom': true,
    'sendmany': true,
    'sendtoaddress': true,
    'signmessage': true,
    'signrawtransaction': true
  };

  accesslist.type = 'all';

  function setAccess(type, access_list) {
    // reset
    accesslist = {};
    accesslist.type = type;

    if (type == "only") {
      for (i = 0; i < access_list.length; i++)
        accesslist[access_list[i]] = true;
    }

    if (type == "restrict") {
      for (i = 0; i < access_list.length; i++)
        accesslist[access_list[i]] = false;
    }

    // default is for security reasons. Prevents accidental theft of coins/attack
    if (type == 'default-safe') {
      var restrict_list = ['dumpprivkey', 'walletpassphrasechange', 'stop'];

      accesslist.type = 'restrict';

      for (i = 0; i < restrict_list.length; i++)
        accesslist[restrict_list[i]] = false;
    }

    if (type == 'read-only') {
      var restrict_list = ['addmultisigaddress', 'addnode', 'backupwallet', 'createmultisig', 'createrawtransaction', 'encryptwallet', 'importprivkey', 'keypoolrefill', 'lockunspent', 'move', 'sendfrom', 'sendmany', 'sendrawtransaction', 'sendtoaddress', 'setaccount', 'setgenerate', 'settxfee', 'signmessage', 'signrawtransaction', 'stop', 'submitblock', 'walletlock', 'walletpassphrasechange'];

      accesslist.type = 'restrict';

      for (i = 0; i < restrict_list.length; i++)
        accesslist[restrict_list[i]] = false;
    }
  };

  function setWalletDetails(details) {
    if ('undefined' == typeof details.rpc)
      client = new onode.Client(details);
    else
      client = details;
  };

  function setWalletPassphrase(passphrase) {
    wallet_passphrase = passphrase;
  };

  return {
    app: express_app(),
    hasAccess: hasAccess,
    setAccess: setAccess,
    setWalletDetails: setWalletDetails,
    setWalletPassphrase: setWalletPassphrase
  }
}();

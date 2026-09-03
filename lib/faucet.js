const crypto = require('crypto');
const Decimal = require('decimal.js');
const db = require('./database');
const explorer = require('./explorer');
const inputguard = require('./inputguard');
const FaucetClaim = require('../models/faucetclaim');
const FaucetBan = require('../models/faucetban');
const FaucetConfig = require('../models/faucetconfig');
const FaucetLedger = require('../models/faucetledger');

const DECIMAL_ZERO = new Decimal('0');
const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  donationAddress: '',
  payoutAddress: '',
  reserveFloorCoins: '5',
  minPayoutCoins: '0.05',
  maxPayoutCoins: '2',
  dailyBudgetFraction: 0.01,
  dailyBudgetCapCoins: '5',
  subnetLimitHours: 24,
  ipLimitHours: 24,
  addressLimitHours: 24,
  userAgentLimitHours: 24,
  banEscalationThreshold: 3,
  captcha: {
    provider: 'turnstile',
    enabled: false,
    siteKey: '',
    secretKey: ''
  }
});

function decimalString(value) {
  if (value == null || value === '') {
    return DECIMAL_ZERO.toString();
  }

  try {
    return new Decimal(value).toString();
  } catch (error) {
    return DECIMAL_ZERO.toString();
  }
}

function normalizeIp(ip) {
  return String(ip || '')
    .replace(/^::ffff:/, '')
    .replace(/^::1$/, '127.0.0.1')
    .trim();
}

function subnetOf(ip) {
  const normalizedIp = normalizeIp(ip);

  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalizedIp)) {
    return normalizedIp.split('.').slice(0, 3).join('.') + '.0/24';
  }

  if (normalizedIp.indexOf(':') > -1) {
    return normalizedIp.split(':').slice(0, 4).join(':') + '::/64';
  }

  return normalizedIp;
}

function hashUserAgent(userAgent) {
  const normalized = String(userAgent || '').trim().toLowerCase();
  if (normalized === '') {
    return '';
  }

  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function hoursAgo(hours) {
  const date = new Date();
  date.setHours(date.getHours() - Number(hours || 0));
  return date;
}

async function getOrCreateConfig() {
  let config = await FaucetConfig.findOne({ key: 'default' }).lean();

  if (!config) {
    const created = await FaucetConfig.create({
      key: 'default',
      value: DEFAULT_CONFIG
    });
    config = created.toObject();
  }

  return Object.assign({}, DEFAULT_CONFIG, config.value || {});
}

function getBalanceForAddress(address) {
  return new Promise((resolve) => {
    if (!address) {
      resolve(DECIMAL_ZERO);
      return;
    }

    db.get_address(address, false, function(result) {
      if (!result || result.balance == null) {
        resolve(DECIMAL_ZERO);
        return;
      }

      try {
        resolve(new Decimal(result.balance.toString()).div(100000000));
      } catch (error) {
        resolve(DECIMAL_ZERO);
      }
    });
  });
}

async function getChestStatus(config) {
  const donationAddress = String(config.donationAddress || '').trim();
  const payoutAddress = String(config.payoutAddress || '').trim();
  const balanceCoins = donationAddress ? await getBalanceForAddress(donationAddress) : DECIMAL_ZERO;

  return {
    donationAddress: donationAddress,
    payoutAddress: payoutAddress,
    balanceCoins: balanceCoins,
    balanceLabel: balanceCoins.toFixed(8),
    enabled: !!config.enabled
  };
}

async function getRecentApprovedClaimCount() {
  return FaucetClaim.countDocuments({
    status: 'sent',
    createdAt: { $gte: hoursAgo(24) }
  });
}

function computePayout(balanceCoins, config, recentApprovedClaimCount) {
  const reserveFloor = new Decimal(decimalString(config.reserveFloorCoins));
  const minPayout = new Decimal(decimalString(config.minPayoutCoins));
  const maxPayout = new Decimal(decimalString(config.maxPayoutCoins));
  const dailyBudgetCap = new Decimal(decimalString(config.dailyBudgetCapCoins));
  const available = Decimal.max(balanceCoins.minus(reserveFloor), DECIMAL_ZERO);
  const percentageBudget = available.mul(new Decimal(String(config.dailyBudgetFraction || 0)));
  const dailyBudget = Decimal.min(percentageBudget, dailyBudgetCap);

  if (dailyBudget.lte(0)) {
    return DECIMAL_ZERO;
  }

  const divisor = new Decimal(Math.max(1, Number(recentApprovedClaimCount || 0) + 1));
  const suggested = dailyBudget.div(divisor);

  return Decimal.max(minPayout, Decimal.min(maxPayout, suggested));
}

async function checkBanOrRateLimit(config, ip, address, userAgentHashValue) {
  const normalizedIp = normalizeIp(ip);
  const subnet = subnetOf(normalizedIp);
  const addressValue = String(address || '').trim();
  const now = new Date();
  const activeBan = await FaucetBan.findOne({
    active: true,
    $or: [
      { ip: normalizedIp },
      { subnet: subnet },
      { address: addressValue },
      { userAgentHash: userAgentHashValue }
    ],
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: now } }
    ]
  }).lean();

  if (activeBan) {
    return {
      allowed: false,
      code: 'banned',
      message: activeBan.reason || 'This faucet request path is currently banned.'
    };
  }

  const windows = [
    { key: 'ip', value: normalizedIp, hours: config.ipLimitHours, message: 'This IP already claimed from the faucet in the last 24 hours.' },
    { key: 'subnet', value: subnet, hours: config.subnetLimitHours, message: 'This network already claimed from the faucet in the last 24 hours.' },
    { key: 'address', value: addressValue, hours: config.addressLimitHours, message: 'This wallet address already claimed from the faucet in the last 24 hours.' },
    { key: 'userAgentHash', value: userAgentHashValue, hours: config.userAgentLimitHours, message: 'This browser fingerprint already claimed from the faucet in the last 24 hours.' }
  ];

  for (const window of windows) {
    if (!window.value) {
      continue;
    }

    const existingClaim = await FaucetClaim.findOne({
      [window.key]: window.value,
      status: 'sent',
      createdAt: { $gte: hoursAgo(window.hours) }
    }).lean();

    if (existingClaim) {
      return {
        allowed: false,
        code: 'rate_limited',
        message: window.message
      };
    }
  }

  return {
    allowed: true,
    ip: normalizedIp,
    subnet: subnet
  };
}

function validateAddress(address) {
  return new Promise((resolve) => {
    explorer.validate_address(address, function(result) {
      if (result && result.isvalid === true) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

function sendToAddress(address, amountCoins) {
  return new Promise((resolve, reject) => {
    explorer.send_to_address(address, amountCoins.toFixed(8), 'DC903 Defcoin faucet payout', function(result) {
      if (result == null || result.error || String(result).indexOf('Error:') === 0) {
        reject(new Error(String(result || 'Unknown wallet RPC failure')));
      } else {
        resolve(String(result));
      }
    });
  });
}

async function validateCaptcha(config, token) {
  if (!config.captcha || !config.captcha.enabled) {
    return true;
  }

  if (config.captcha.provider !== 'turnstile' || !config.captcha.secretKey || !token) {
    return false;
  }

  return new Promise((resolve) => {
    const request = require('postman-request');
    request({
      method: 'POST',
      url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      form: {
        secret: config.captcha.secretKey,
        response: token
      },
      json: true,
      timeout: 5000
    }, function(error, response, body) {
      resolve(!error && body && body.success === true);
    });
  });
}

async function recordStrike(details, reason, config) {
  const recentStrikes = await FaucetClaim.countDocuments({
    status: 'rejected',
    ip: details.ip,
    createdAt: { $gte: hoursAgo(24 * 7) }
  });

  if ((recentStrikes + 1) < Number(config.banEscalationThreshold || DEFAULT_CONFIG.banEscalationThreshold)) {
    return null;
  }

  return FaucetBan.create({
    ip: details.ip,
    subnet: details.subnet,
    address: details.address,
    userAgentHash: details.userAgentHash,
    active: true,
    reason: reason,
    strikeCount: recentStrikes + 1,
    expiresAt: null
  });
}

async function getPublicStatus() {
  const config = await getOrCreateConfig();
  const chest = await getChestStatus(config);
  const recentApprovedClaimCount = await getRecentApprovedClaimCount();
  const suggestedPayout = computePayout(chest.balanceCoins, config, recentApprovedClaimCount);

  return {
    config: config,
    chest: chest,
    recentApprovedClaimCount: recentApprovedClaimCount,
    suggestedPayoutCoins: suggestedPayout,
    suggestedPayoutLabel: suggestedPayout.gt(0) ? suggestedPayout.toFixed(8) : '0.00000000'
  };
}

async function submitClaim(details) {
  const config = await getOrCreateConfig();

  if (!config.enabled) {
    return {
      ok: false,
      statusCode: 503,
      message: 'The faucet is built but currently disabled until a dedicated donation chest is configured and funded.'
    };
  }

  const address = inputguard.cleanBoundedText(details.address, 80);
  const userAgent = inputguard.cleanBoundedText(details.userAgent, 512);
  const captchaToken = inputguard.cleanBoundedText(details.captchaToken, 2048);
  const userAgentHashValue = hashUserAgent(userAgent);
  const captchaOkay = await validateCaptcha(config, captchaToken);
  const status = await getPublicStatus();

  const baseClaim = {
    ip: normalizeIp(details.ip),
    subnet: subnetOf(details.ip),
    address: address,
    userAgent: userAgent,
    userAgentHash: userAgentHashValue,
    requestedAmount: status.suggestedPayoutCoins.toFixed(8)
  };

  if (!inputguard.isAddressLike(address)) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Enter a Defcoin destination address before claiming.'
    };
  }

  if (!captchaOkay) {
    await FaucetClaim.create(Object.assign({}, baseClaim, {
      status: 'rejected',
      reason: 'Captcha validation failed.'
    }));

    return {
      ok: false,
      statusCode: 400,
      message: 'Captcha validation failed.'
    };
  }

  const validAddress = await validateAddress(address);
  if (!validAddress) {
    await FaucetClaim.create(Object.assign({}, baseClaim, {
      status: 'rejected',
      reason: 'Destination address failed wallet validation.'
    }));

    return {
      ok: false,
      statusCode: 400,
      message: 'That does not look like a valid Defcoin destination address.'
    };
  }

  const rateLimitCheck = await checkBanOrRateLimit(config, details.ip, address, userAgentHashValue);
  if (!rateLimitCheck.allowed) {
    await FaucetClaim.create(Object.assign({}, baseClaim, {
      status: 'rejected',
      reason: rateLimitCheck.message
    }));
    await recordStrike(Object.assign({}, baseClaim, rateLimitCheck), rateLimitCheck.message, config);

    return {
      ok: false,
      statusCode: rateLimitCheck.code === 'banned' ? 403 : 429,
      message: rateLimitCheck.message
    };
  }

  if (!status.chest.payoutAddress || !status.chest.donationAddress) {
    await FaucetClaim.create(Object.assign({}, baseClaim, {
      status: 'rejected',
      reason: 'Faucet payout or donation address is not configured.'
    }));

    return {
      ok: false,
      statusCode: 503,
      message: 'The faucet payout path is not configured yet.'
    };
  }

  if (status.suggestedPayoutCoins.lte(0) || status.chest.balanceCoins.lte(new Decimal(decimalString(config.reserveFloorCoins)))) {
    await FaucetClaim.create(Object.assign({}, baseClaim, {
      status: 'rejected',
      reason: 'The faucet chest does not currently have spendable reserve above the configured floor.'
    }));

    return {
      ok: false,
      statusCode: 503,
      message: 'The faucet chest is currently too low to pay out safely.'
    };
  }

  try {
    const txid = await sendToAddress(address, status.suggestedPayoutCoins);
    const claim = await FaucetClaim.create(Object.assign({}, baseClaim, {
      status: 'sent',
      txid: txid
    }));

    await FaucetLedger.create({
      claimId: claim._id,
      direction: 'debit',
      address: address,
      amount: status.suggestedPayoutCoins.toFixed(8),
      txid: txid,
      note: 'DC903 Defcoin faucet payout'
    });

    return {
      ok: true,
      statusCode: 200,
      txid: txid,
      payoutLabel: status.suggestedPayoutCoins.toFixed(8),
      message: `Sent ${status.suggestedPayoutCoins.toFixed(8)} DFC to ${address}.`
    };
  } catch (error) {
    await FaucetClaim.create(Object.assign({}, baseClaim, {
      status: 'error',
      reason: error.message
    }));

    return {
      ok: false,
      statusCode: 502,
      message: 'The faucet wallet RPC did not complete the payout.'
    };
  }
}

module.exports = {
  DEFAULT_CONFIG,
  computePayout,
  getPublicStatus,
  submitClaim
};

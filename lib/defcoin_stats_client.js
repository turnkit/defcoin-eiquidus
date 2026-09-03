const http = require('http');
const https = require('https');
const {URL} = require('url');
const historyData = require('./defcoin_history_data');

const DEFCOIN_STATS_URL = 'http://defcoinstats.com';
const CACHE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

const ACTIVE_POOL_DEFINITIONS = Object.freeze([
  {
    id: 'dc903',
    name: 'DC903 Defcoin P2Pool',
    siteUrl: 'https://defcoin.dc903.org/pool',
    statsUrl: 'https://defcoin.dc903.org/pool',
    apiBase: 'http://127.0.0.1:13372',
    stratumUrl: 'stratum+tcp://defcoin.dc903.org:13372',
    sourceNote: 'Live dc903 P2Pool API',
    backend: 'P2Pool'
  },
  {
    id: 'defcoin-io',
    name: 'Defcoin.io P2Pool Node',
    siteUrl: 'https://defcoin.io/',
    statsUrl: 'http://135.148.43.189:13372/static/',
    apiBase: 'http://135.148.43.189:13372',
    stratumUrl: 'stratum+tcp://135.148.43.189:13372',
    sourceNote: 'Live P2Pool API from the Defcoin.io published node',
    backend: 'P2Pool'
  },
  {
    id: 'defcoin-host-usb',
    name: 'defcoin.host P2Pool Node',
    siteUrl: 'https://defcoin.host/',
    statsUrl: 'http://135.148.43.188:13371/static/',
    apiBase: 'http://135.148.43.188:13371',
    stratumUrl: 'stratum+tcp://135.148.43.188:13371',
    sourceNote: 'Live defcoin.host P2Pool API. defcoin.host also lists 135.148.43.189:13372, which is the same endpoint shown here as Defcoin.io, so that shared endpoint appears only once.',
    backend: 'P2Pool'
  }
]);

let cachedStats = null;
let cachedAt = 0;
let fetchInFlight = null;

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}

function normalizeName(value) {
  return stripTags(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseHashrate(value) {
  const text = stripTags(value);
  if (!text || /^down$/i.test(text)) {
    return null;
  }
  const number = Number(text.replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function formatHashrate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '-';
  }

  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
  let rate = numeric;
  let unitIndex = 0;
  while (rate >= 1000 && unitIndex < units.length - 1) {
    rate /= 1000;
    unitIndex += 1;
  }

  return `${rate.toFixed(rate >= 100 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatDefcoinStatsHashrate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 'Down';
  }
  return numeric.toFixed(2);
}

function fetchTextUrl(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, {timeout: REQUEST_TIMEOUT_MS}, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`${parsed.hostname} returned HTTP ${res.statusCode}`));
        return;
      }

      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > MAX_RESPONSE_BYTES) {
          req.destroy(new Error(`${parsed.hostname} response exceeded 1 MB`));
        }
      });
      res.on('end', () => resolve(body));
    });

    req.on('timeout', () => req.destroy(new Error(`${parsed.hostname} request timed out`)));
    req.on('error', reject);
  });
}

async function fetchJsonUrl(url) {
  const text = await fetchTextUrl(url);
  return JSON.parse(text);
}

function parsePoolRows(homeHtml) {
  const rows = [];
  const rowPattern = /<tr>\s*<td>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let match;

  while ((match = rowPattern.exec(homeHtml)) !== null) {
    const nameCell = match[1];
    const rateCell = match[2];
    const link = /href=['"]pool\.php\?id=(\d+)['"][^>]*>([\s\S]*?)<\/a>/i.exec(nameCell);
    const other = /href=['"]other\.html['"][^>]*>([\s\S]*?)<\/a>/i.exec(nameCell);
    const name = stripTags(link ? link[2] : (other ? other[1] : nameCell));
    const reportedHashrate = parseHashrate(rateCell);

    if (link) {
      rows.push({
        id: Number(link[1]),
        name,
        reportedHashrate,
        detailPath: `/pool.php?id=${Number(link[1])}`,
        sourceUrl: `${DEFCOIN_STATS_URL}/pool.php?id=${Number(link[1])}`
      });
    } else if (other) {
      rows.push({
        id: null,
        name: 'Other / Solo-mining estimate',
        reportedHashrate,
        detailPath: '/other.html',
        isOther: true,
        sourceUrl: `${DEFCOIN_STATS_URL}/other.html`
      });
    }
  }

  return rows;
}

function parsePoolDetail(html, fallback) {
  const nameMatch = /Name:\s*([^<]+)<BR>/i.exec(html);
  const urlMatch = /URL:\s*<a\s+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i.exec(html);
  const rateMatch = /Current Hashrate:\s*([^<]+)<BR>/i.exec(html);
  const currentHashrate = parseHashrate(rateMatch ? rateMatch[1] : null);

  return Object.assign({}, fallback, {
    name: nameMatch ? stripTags(nameMatch[1]) : fallback.name,
    normalizedName: normalizeName(nameMatch ? nameMatch[1] : fallback.name),
    url: urlMatch ? decodeHtml(urlMatch[1]) : null,
    urlLabel: urlMatch ? stripTags(urlMatch[2]) : null,
    currentHashrate
  });
}

async function fetchDefcoinStatsSnapshot() {
  const homeHtml = await fetchTextUrl(`${DEFCOIN_STATS_URL}/`);
  const rows = parsePoolRows(homeHtml);
  const poolRows = rows.filter((row) => row.id != null);
  const other = rows.find((row) => row.isOther) || null;
  const detailedPools = await Promise.all(poolRows.map(async (row) => {
    try {
      return parsePoolDetail(await fetchTextUrl(`${DEFCOIN_STATS_URL}${row.detailPath}`), row);
    } catch (err) {
      return Object.assign({}, row, {
        normalizedName: normalizeName(row.name),
        currentHashrate: row.reportedHashrate,
        error: err.message
      });
    }
  }));

  return {rows, detailedPools, other};
}

function sumObjectValues(values) {
  return Object.values(values || {}).reduce((sum, value) => {
    const numeric = Number(value || 0);
    return sum + (Number.isFinite(numeric) ? numeric : 0);
  }, 0);
}

async function fetchActivePool(definition) {
  const [localStats, globalStats] = await Promise.all([
    fetchJsonUrl(`${definition.apiBase}/local_stats`),
    fetchJsonUrl(`${definition.apiBase}/global_stats`)
  ]);
  const minerHashRates = localStats.miner_hash_rates || {};
  const localHashrate = sumObjectValues(minerHashRates);
  const recentHashrate = Number((localStats.my_hash_rates_in_last_hour || {}).actual || 0);
  const globalHashrate = Number(globalStats.pool_hash_rate || 0);
  const endpointHashrate = recentHashrate || localHashrate;
  const recentShares = Number((localStats.my_share_counts_in_last_hour || {}).shares || 0);
  const isLive = globalHashrate > 0 || localHashrate > 0 || recentHashrate > 0 || recentShares > 0;

  return Object.assign({}, definition, {
    live: isLive,
    endpointHashrate,
    localHashrate,
    recentHashrate,
    globalHashrate,
    p2poolHashrate: globalHashrate,
    networkHashrate: Number(globalStats.network_hashrate || 0),
    minerCount: Object.keys(minerHashRates).length,
    recentShares,
    totalShares: Number((localStats.shares || {}).total || 0),
    staleShares: Number((localStats.shares || {}).dead || 0),
    fee: Number(localStats.fee || 0),
    donationProportion: Number(localStats.donation_proportion || 0),
    version: localStats.version || '-',
    protocolVersion: localStats.protocol_version || '-',
    checkedAt: new Date().toISOString()
  });
}

async function fetchActivePools() {
  const poolResults = await Promise.all(ACTIVE_POOL_DEFINITIONS.map(async (definition) => {
    try {
      return await fetchActivePool(definition);
    } catch (err) {
      return Object.assign({}, definition, {
        live: false,
        error: err.message,
        checkedAt: new Date().toISOString()
      });
    }
  }));

  return {
    activePools: poolResults.filter((pool) => pool.live),
    configuredPoolErrors: poolResults.filter((pool) => !pool.live)
  };
}

function yearFromCapture(capture) {
  if (!capture || !capture.label) {
    return 'Unknown';
  }
  return capture.label.slice(0, 4);
}

function timestampFromCapture(capture) {
  if (!capture || !capture.label) {
    return 0;
  }
  return Number(capture.label.replace(/-/g, '')) || 0;
}

function buildHistoricalPools(defcoinStatsSnapshot) {
  const activeHistoricalNames = new Set(['defcoin io', 'defcoin host']);
  const defcoinStatsByName = new Map();
  (defcoinStatsSnapshot.detailedPools || []).forEach((pool) => {
    defcoinStatsByName.set(normalizeName(pool.name), pool);
  });

  const historicalPools = (historyData.retiredPools || [])
    .filter((pool) => !activeHistoricalNames.has(normalizeName(pool.name)))
    .map((pool) => {
      const defcoinStatsPool = defcoinStatsByName.get(normalizeName(pool.name)) || null;
      return Object.assign({}, pool, {
        backend: pool.backend || (defcoinStatsPool && defcoinStatsPool.backend) || '',
        groupYear: yearFromCapture(pool.firstSeen),
        lastSeenSort: timestampFromCapture(pool.lastSeen),
        firstSeenSort: timestampFromCapture(pool.firstSeen),
        defcoinStatsPool
      });
    })
    .sort((a, b) => {
      if (a.firstSeenSort !== b.firstSeenSort) return a.firstSeenSort - b.firstSeenSort;
      if (a.lastSeenSort !== b.lastSeenSort) return b.lastSeenSort - a.lastSeenSort;
      return a.name.localeCompare(b.name);
    });

  const groups = [];
  const byYear = new Map();
  historicalPools.forEach((pool) => {
    const year = pool.groupYear;
    if (!byYear.has(year)) {
      byYear.set(year, []);
      groups.push({year, pools: byYear.get(year)});
    }
    byYear.get(year).push(pool);
  });

  groups.sort((a, b) => {
    if (a.year === 'Unknown') return 1;
    if (b.year === 'Unknown') return -1;
    return Number(a.year) - Number(b.year);
  });

  return groups;
}

async function fetchMiningStats(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && cachedStats && now - cachedAt < CACHE_MS) {
    return cachedStats;
  }

  // Collapse concurrent refreshes into one upstream request set. This keeps a
  // burst of legitimate page views from multiplying work against every pool.
  if (fetchInFlight)
    return fetchInFlight;

  fetchInFlight = (async function() {
    const [activeResult, defcoinStatsResult] = await Promise.all([
      fetchActivePools(),
      fetchDefcoinStatsSnapshot().then((snapshot) => ({snapshot})).catch((err) => ({error: err.message}))
    ]);
    const defcoinStatsSnapshot = defcoinStatsResult.snapshot || {detailedPools: [], other: null};

    cachedStats = {
      sourceUrl: DEFCOIN_STATS_URL,
      updatedAt: new Date().toISOString(),
      activePools: activeResult.activePools,
      configuredPoolErrors: activeResult.configuredPoolErrors,
      historicalPoolGroups: buildHistoricalPools(defcoinStatsSnapshot),
      defcoinStatsOther: defcoinStatsSnapshot.other || null,
      defcoinStatsError: defcoinStatsResult.error || null,
      defcoinStatsPoolCount: (defcoinStatsSnapshot.detailedPools || []).length,
      formatHashrate,
      formatDefcoinStatsHashrate
    };
    cachedAt = Date.now();
    return cachedStats;
  })();

  try {
    return await fetchInFlight;
  } finally {
    fetchInFlight = null;
  }
}

module.exports = {
  fetchMiningStats,
  formatHashrate,
  formatDefcoinStatsHashrate
};

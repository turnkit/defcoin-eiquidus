const DefcoinHashrateSample = require('../models/defcoinhashratesample');
const DefcoinBlockHashrateBucket = require('../models/defcoinblockhashratebucket');
const DefcoinHistoricalJobState = require('../models/defcoinhistoricaljobstate');
const defcoinStatsClient = require('./defcoin_stats_client');

const SAMPLE_INTERVAL_MS = 15 * 60 * 1000;
const STALE_POOL_GRACE_MS = 60 * 60 * 1000;
const RETENTION_DAYS = 1095;
const DEFAULT_CHART_DAYS = RETENTION_DAYS;
// Keep first/last points and the full time range while bounding the rendered
// page. The previous 2,400-per-source payload exceeded 2 MiB in production and
// could take longer than the smoke-check timeout to serialize and transfer.
const MAX_POINTS_PER_SOURCE = 600;
const CHART_CACHE_MS = 10 * 60 * 1000;
const SAMPLER_JOB = 'defcoin-hashrate-sampler';
const SOURCE_COLORS = Object.freeze({
  network: '#d2c443',
  'p2pool-total': '#8a9099',
  'chain-p2pool-likely': '#f59e0b',
  dc903: '#45cd94',
  'defcoin-io': '#58a6ff',
  'defcoin-host-usb': '#c084fc'
});

let samplerStarted = false;
let lastPruneBucket = null;
let cachedChart = null;
let cachedChartAt = 0;
let chartInFlight = null;

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function bucketDate(date) {
  return new Date(Math.floor(date.getTime() / SAMPLE_INTERVAL_MS) * SAMPLE_INTERVAL_MS);
}

function median(values) {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return 0;
  }
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function suppressStalePoolRows(rows) {
  const stateBySource = new Map();

  return rows.filter((row) => {
    if (row.sourceKind !== 'pool') {
      return true;
    }

    const sampleTime = row.sampledAt instanceof Date ? row.sampledAt.getTime() : new Date(row.sampledAt).getTime();
    const shares = asNumber(row.shares);
    const state = stateBySource.get(row.sourceId) || {
      lastShares: null,
      lastShareChangeAt: null
    };

    let keep = false;
    if (state.lastShares === null || shares > state.lastShares) {
      state.lastShares = shares;
      state.lastShareChangeAt = sampleTime;
      keep = shares > 0;
    } else if (shares === state.lastShares && state.lastShareChangeAt !== null) {
      keep = sampleTime - state.lastShareChangeAt <= STALE_POOL_GRACE_MS;
    }

    stateBySource.set(row.sourceId, state);
    return keep;
  });
}

function downsampleRows(rows, maxPoints, sourceKey) {
  const limit = (Number.isSafeInteger(maxPoints) && maxPoints > 0 ? maxPoints : 1);

  if (!Array.isArray(rows) || rows.length <= limit)
    return Array.isArray(rows) ? rows.slice() : [];

  const groups = new Map();
  rows.forEach(function(row) {
    const key = (sourceKey == null ? 'all' : String(row[sourceKey] || ''));
    if (!groups.has(key))
      groups.set(key, []);
    groups.get(key).push(row);
  });

  const selected = new Set();
  groups.forEach(function(group) {
    if (group.length <= limit) {
      group.forEach(function(row) { selected.add(row); });
      return;
    }

    if (limit === 1) {
      selected.add(group[group.length - 1]);
      return;
    }

    for (let i = 0; i < limit; i++) {
      const index = Math.round(i * (group.length - 1) / (limit - 1));
      selected.add(group[index]);
    }
  });

  return rows.filter(function(row) { return selected.has(row); });
}

function buildRecords(stats, sampledAt) {
  const pools = Array.isArray(stats && stats.activePools) ? stats.activePools : [];
  const records = [];
  const networkHashrate = median(pools.map((pool) => asNumber(pool.networkHashrate)));
  const p2poolHashrate = median(pools.map((pool) => asNumber(pool.p2poolHashrate || pool.globalHashrate)));

  if (networkHashrate > 0) {
    records.push({
      sourceId: 'network',
      sourceName: 'Estimated Defcoin network',
      sourceKind: 'network',
      hashrate: networkHashrate,
      networkHashrate,
      p2poolHashrate,
      miners: pools.reduce((sum, pool) => sum + asNumber(pool.minerCount), 0),
      shares: pools.reduce((sum, pool) => sum + asNumber(pool.totalShares), 0),
      live: true,
      note: 'Median whole-network hashrate reported by answering P2Pool APIs'
    });
  }

  if (p2poolHashrate > 0) {
    records.push({
      sourceId: 'p2pool-total',
      sourceName: 'P2Pool total',
      sourceKind: 'p2pool',
      hashrate: p2poolHashrate,
      networkHashrate,
      p2poolHashrate,
      miners: pools.reduce((sum, pool) => sum + asNumber(pool.minerCount), 0),
      shares: pools.reduce((sum, pool) => sum + asNumber(pool.totalShares), 0),
      live: true,
      note: 'Median total P2Pool sharechain hashrate reported by answering P2Pool APIs'
    });
  }

  pools.forEach((pool) => {
    const endpointHashrate = asNumber(pool.endpointHashrate) || asNumber(pool.recentHashrate) || asNumber(pool.localHashrate);
    const poolP2poolHashrate = asNumber(pool.p2poolHashrate || pool.globalHashrate);
    const poolNetworkHashrate = asNumber(pool.networkHashrate);
    records.push({
      sourceId: pool.id,
      sourceName: pool.name,
      sourceKind: 'pool',
      hashrate: endpointHashrate,
      endpointHashrate,
      p2poolHashrate: poolP2poolHashrate,
      networkHashrate: poolNetworkHashrate,
      miners: asNumber(pool.minerCount),
      shares: asNumber(pool.totalShares),
      live: !!pool.live,
      note: pool.sourceNote || ''
    });
  });

  return records.filter((record) => record.sourceId && record.hashrate > 0).map((record) => {
    const sampleBucketDate = bucketDate(sampledAt);
    return Object.assign({}, record, {
      bucket: sampleBucketDate.toISOString(),
      sampledAt: sampleBucketDate
    });
  });
}

async function pruneOldSamples(currentBucket) {
  if (lastPruneBucket === currentBucket) {
    return;
  }

  lastPruneBucket = currentBucket;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await DefcoinHashrateSample.deleteMany({sampledAt: {$lt: cutoff}});
}

async function recordSnapshot(stats, sampledAt = new Date()) {
  const records = buildRecords(stats, sampledAt);
  if (!records.length) {
    return {written: 0};
  }

  const writes = records.map((record) => ({
    updateOne: {
      filter: {bucket: record.bucket, sourceId: record.sourceId},
      update: {$set: record, $setOnInsert: {createdAt: new Date()}},
      upsert: true
    }
  }));

  await DefcoinHashrateSample.bulkWrite(writes, {ordered: false});
  await DefcoinHashrateSample.deleteMany({
    bucket: records[0].bucket,
    sourceId: {$nin: records.map((record) => record.sourceId)}
  });
  await pruneOldSamples(records[0].bucket);
  return {written: records.length};
}

async function claimSampleBucket(sampledAt) {
  const bucket = bucketDate(sampledAt).toISOString();

  try {
    const result = await DefcoinHistoricalJobState.updateOne(
      {job: SAMPLER_JOB, 'stats.bucket': {$ne: bucket}},
      {
        $set: {
          status: 'running',
          updatedAt: new Date(),
          stats: {bucket: bucket}
        }
      },
      {upsert: true}
    );
    return result.modifiedCount > 0 || result.upsertedCount > 0;
  } catch (err) {
    // Competing cluster workers can both attempt the initial upsert. The
    // schema's unique job index elects one writer; the loser must not retry.
    if (err && err.code === 11000) {
      return false;
    }
    throw err;
  }
}

async function sampleNow() {
  const sampledAt = new Date();
  if (!await claimSampleBucket(sampledAt)) {
    return {skipped: true};
  }
  const stats = await defcoinStatsClient.fetchMiningStats(false);
  return recordSnapshot(stats, sampledAt);
}

function startSampler() {
  if (samplerStarted) {
    return;
  }
  samplerStarted = true;

  setTimeout(() => {
    sampleNow().catch((err) => console.log(`Defcoin hashrate sampler error: ${err.message}`));
  }, 90 * 1000);

  setInterval(() => {
    sampleNow().catch((err) => console.log(`Defcoin hashrate sampler error: ${err.message}`));
  }, SAMPLE_INTERVAL_MS);
}

async function loadChartData(chartDays) {
  const since = new Date(Date.now() - chartDays * 24 * 60 * 60 * 1000);
  const [rows, blockBuckets, blockJob] = await Promise.all([
    DefcoinHashrateSample.find({sampledAt: {$gte: since}})
      .sort({sampledAt: 1, sourceKind: 1, sourceName: 1})
      .lean()
      .exec(),
    DefcoinBlockHashrateBucket.find({
      bucketStart: {$gte: since},
      $or: [
        {p2poolLikelyHashrate: {$gt: 0}},
        {p2poolConfirmedHashrate: {$gt: 0}}
      ]
    })
      .sort({bucketStart: 1})
      .lean()
      .exec(),
    require('../models/defcoinhistoricaljobstate').findOne({job: 'p2pool-block-history'}).lean().exec().catch(() => null)
  ]);
  const chartRows = downsampleRows(suppressStalePoolRows(rows), MAX_POINTS_PER_SOURCE, 'sourceId');
  const chartBlockBuckets = downsampleRows(blockBuckets, MAX_POINTS_PER_SOURCE);
  const sourceById = new Map();

  chartRows.forEach((row) => {
    if (!sourceById.has(row.sourceId)) {
      sourceById.set(row.sourceId, {
        id: row.sourceId,
        name: row.sourceName,
        kind: row.sourceKind,
        color: SOURCE_COLORS[row.sourceId] || '#d8dee9'
      });
    }
  });
  if (chartBlockBuckets.length) {
    if (chartBlockBuckets.some((row) => asNumber(row.p2poolLikelyHashrate) > 0)) {
      sourceById.set('chain-p2pool-likely', {
        id: 'chain-p2pool-likely',
        name: 'Blockchain-derived likely P2Pool',
        kind: 'p2pool',
        color: SOURCE_COLORS['chain-p2pool-likely']
      });
    }
    if (chartBlockBuckets.some((row) => asNumber(row.p2poolConfirmedHashrate) > 0)) {
      sourceById.set('chain-p2pool-confirmed', {
        id: 'chain-p2pool-confirmed',
        name: 'Raw-block confirmed P2Pool marker',
        kind: 'p2pool',
        color: '#6cccee'
      });
    }
  }

  return {
    sampleIntervalMinutes: SAMPLE_INTERVAL_MS / 60000,
    retentionDays: RETENTION_DAYS,
    chartDays,
    updatedAt: rows.length ? rows[rows.length - 1].sampledAt : null,
    blockHistory: {
      bucketCount: blockBuckets.length,
      renderedBucketCount: chartBlockBuckets.length,
      jobStatus: blockJob ? blockJob.status : 'not-started',
      lastHeight: blockJob ? blockJob.lastHeight : 0,
      message: blockJob ? blockJob.message : ''
    },
    sources: Array.from(sourceById.values()),
    samples: chartRows.map((row) => ({
      t: row.sampledAt instanceof Date ? row.sampledAt.getTime() : new Date(row.sampledAt).getTime(),
      bucket: row.bucket,
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      sourceKind: row.sourceKind,
      hashrate: asNumber(row.hashrate),
      endpointHashrate: asNumber(row.endpointHashrate),
      p2poolHashrate: asNumber(row.p2poolHashrate),
      networkHashrate: asNumber(row.networkHashrate),
      miners: asNumber(row.miners),
      live: !!row.live
    })).concat(chartBlockBuckets.flatMap((row) => {
      const samples = [];
      if (asNumber(row.p2poolLikelyHashrate) > 0) {
        samples.push({
          t: row.bucketStart instanceof Date ? row.bucketStart.getTime() : new Date(row.bucketStart).getTime(),
          bucket: row.bucket,
          sourceId: 'chain-p2pool-likely',
          sourceName: 'Blockchain-derived likely P2Pool',
          sourceKind: 'p2pool',
          hashrate: asNumber(row.p2poolLikelyHashrate),
          endpointHashrate: 0,
          p2poolHashrate: asNumber(row.p2poolLikelyHashrate),
          networkHashrate: asNumber(row.networkHashrate),
          miners: 0,
          live: false,
          likelyBlocks: asNumber(row.p2poolLikelyBlockCount),
          totalBlocks: asNumber(row.blockCount)
        });
      }
      if (asNumber(row.p2poolConfirmedHashrate) > 0) {
        samples.push({
          t: row.bucketStart instanceof Date ? row.bucketStart.getTime() : new Date(row.bucketStart).getTime(),
          bucket: row.bucket,
          sourceId: 'chain-p2pool-confirmed',
          sourceName: 'Raw-block confirmed P2Pool marker',
          sourceKind: 'p2pool',
          hashrate: asNumber(row.p2poolConfirmedHashrate),
          endpointHashrate: 0,
          p2poolHashrate: asNumber(row.p2poolConfirmedHashrate),
          networkHashrate: asNumber(row.networkHashrate),
          miners: 0,
          live: false,
          confirmedBlocks: asNumber(row.p2poolConfirmedBlockCount),
          totalBlocks: asNumber(row.blockCount)
        });
      }
      return samples;
    }))
  };
}

async function getChartData(options) {
  const chartDays = Number(options && options.days) || DEFAULT_CHART_DAYS;
  const now = Date.now();

  if (cachedChart && cachedChart.chartDays === chartDays && now - cachedChartAt < CHART_CACHE_MS)
    return cachedChart;

  if (chartInFlight && chartInFlight.days === chartDays)
    return chartInFlight.promise;

  const promise = loadChartData(chartDays);
  chartInFlight = {days: chartDays, promise: promise};

  try {
    cachedChart = await promise;
    cachedChartAt = Date.now();
    return cachedChart;
  } finally {
    if (chartInFlight && chartInFlight.promise === promise)
      chartInFlight = null;
  }
}

module.exports = {
  SAMPLE_INTERVAL_MS,
  MAX_POINTS_PER_SOURCE,
  downsampleRows,
  claimSampleBucket,
  recordSnapshot,
  sampleNow,
  startSampler,
  getChartData
};

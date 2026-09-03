const DefcoinStatsHistoricalSample = require('../models/defcoinstatshistoricalsample');

const SOURCE_COLORS = Object.freeze({
  'defcoinstats-network': '#d2c443',
  'defcoinstats-pool-1': '#58a6ff',
  'defcoinstats-pool-2': '#45cd94',
  'defcoinstats-pool-3': '#c084fc',
  'defcoinstats-pool-4': '#f97316',
  'defcoinstats-pool-5': '#fb7185',
  'defcoinstats-pool-7': '#2dd4bf',
  'defcoinstats-pool-8': '#a3e635',
  'defcoinstats-pool-9': '#facc15',
  'defcoinstats-pool-10': '#ef4444',
  'defcoinstats-other': '#9ca3af'
});

const MAX_POINTS_PER_SOURCE = 600;
const MAX_TOTAL_POINTS = 5000;
const MAX_SOURCES = 64;
const CACHE_MS = 10 * 60 * 1000;
let cachedChart = null;
let cachedAt = 0;
let chartInFlight = null;

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function loadChartData() {
  const sourceRows = await DefcoinStatsHistoricalSample.aggregate([
    {$match: {sourceKind: {$in: ['network', 'pool', 'other']}}},
    {$group: {
      _id: '$sourceId',
      sourceName: {$first: '$sourceName'},
      sourceKind: {$first: '$sourceKind'},
      sourceUrl: {$first: '$sourceUrl'},
      rawPoints: {$sum: 1},
      minT: {$min: '$t'},
      maxT: {$max: '$t'},
      latestImport: {$max: '$importedAt'}
    }},
    {$sort: {_id: 1}},
    {$limit: MAX_SOURCES}
  ]).exec();
  const sources = [];
  const samples = [];
  const maxPointsForSource = Math.max(1, Math.min(
    MAX_POINTS_PER_SOURCE,
    Math.floor(MAX_TOTAL_POINTS / Math.max(1, sourceRows.length))
  ));
  let rawSampleCount = 0;
  let updatedAt = null;

  for (const source of sourceRows) {
    const sourceId = source._id;
    rawSampleCount += asNumber(source.rawPoints);
    if (!updatedAt || (source.latestImport && source.latestImport > updatedAt)) {
      updatedAt = source.latestImport;
    }
    sources.push({
      id: sourceId,
      name: source.sourceName,
      kind: source.sourceKind,
      color: SOURCE_COLORS[sourceId] || '#d8dee9',
      rawPoints: source.rawPoints,
      sourceUrl: source.sourceUrl || ''
    });

    const span = Math.max(1, asNumber(source.maxT) - asNumber(source.minT));
    const bucketSeconds = Math.max(1, Math.ceil(span / maxPointsForSource));
    const rows = await DefcoinStatsHistoricalSample.aggregate([
      {$match: {sourceId, sourceKind: source.sourceKind, hashrate: {$gt: 0}}},
      {$group: {
        _id: {$floor: {$divide: [{$subtract: ['$t', source.minT]}, bucketSeconds]}},
        t: {$min: '$t'},
        sourceId: {$first: '$sourceId'},
        sourceName: {$first: '$sourceName'},
        sourceKind: {$first: '$sourceKind'},
        hashrate: {$avg: '$hashrate'},
        rawValue: {$avg: '$rawValue'}
      }},
      {$sort: {t: 1}},
      {$limit: maxPointsForSource + 1}
    ]).allowDiskUse(false).exec();

    rows.forEach((row) => {
      samples.push({
        t: asNumber(row.t) * 1000,
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        sourceKind: row.sourceKind,
        hashrate: asNumber(row.hashrate),
        rawValue: asNumber(row.rawValue)
      });
    });
  }

  cachedChart = {
    maxPointsPerSource: maxPointsForSource,
    importedSources: sources.length,
    rawSampleCount,
    updatedAt,
    sources,
    samples
  };
  cachedAt = now;
  return cachedChart;
}

async function getChartData() {
  const now = Date.now();
  if (cachedChart && now - cachedAt < CACHE_MS) {
    return cachedChart;
  }
  if (chartInFlight) {
    return chartInFlight;
  }

  const promise = loadChartData();
  chartInFlight = promise;
  try {
    return await promise;
  } finally {
    if (chartInFlight === promise) {
      chartInFlight = null;
    }
  }
}

module.exports = {
  MAX_POINTS_PER_SOURCE,
  MAX_TOTAL_POINTS,
  MAX_SOURCES,
  getChartData
};

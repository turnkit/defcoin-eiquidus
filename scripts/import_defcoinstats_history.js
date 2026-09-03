#!/usr/bin/env node

const http = require('http');
const mongoose = require('mongoose');
const settings = require('../lib/settings');
const DefcoinStatsHistoricalSample = require('../models/defcoinstatshistoricalsample');
const DefcoinHistoricalJobState = require('../models/defcoinhistoricaljobstate');

const DEFCOIN_STATS_URL = 'http://defcoinstats.com';
const PERIOD_ALL = 8;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const BULK_CHUNK = 1000;
const MAX_OTHER_POOL_GAP_SECONDS = 3 * 60 * 60;

const SOURCES = [
  {sourceId: 'defcoinstats-network', sourceKind: 'network', sourceName: 'DefcoinStats network estimate', path: `/hash-net.php?period=${PERIOD_ALL}`, unit: 'khps_raw_to_hps'},
  {sourceId: 'defcoinstats-difficulty', sourceKind: 'difficulty', sourceName: 'DefcoinStats network difficulty', path: `/diff-net.php?period=${PERIOD_ALL}`, unit: 'difficulty'},
  {sourceId: 'defcoinstats-pool-1', sourceKind: 'pool', sourceName: 'DefcoinStats Pool 1', poolId: 1, path: `/hash-pool.php?id=1&period=${PERIOD_ALL}`, unit: 'khps_raw_to_hps'},
  {sourceId: 'defcoinstats-pool-2', sourceKind: 'pool', sourceName: 'DefcoinStats Pool 2', poolId: 2, path: `/hash-pool.php?id=2&period=${PERIOD_ALL}`, unit: 'khps_raw_to_hps'},
  {sourceId: 'defcoinstats-pool-3', sourceKind: 'pool', sourceName: 'DefcoinStats Pool 3', poolId: 3, path: `/hash-pool.php?id=3&period=${PERIOD_ALL}`, unit: 'khps_raw_to_hps'},
  {sourceId: 'defcoinstats-pool-4', sourceKind: 'pool', sourceName: 'DefcoinStats Pool 4', poolId: 4, path: `/hash-pool.php?id=4&period=${PERIOD_ALL}`, unit: 'khps_raw_to_hps'},
  {sourceId: 'defcoinstats-pool-5', sourceKind: 'pool', sourceName: 'DefcoinStats Pool 5', poolId: 5, path: `/hash-pool.php?id=5&period=${PERIOD_ALL}`, unit: 'khps_raw_to_hps'},
  {sourceId: 'defcoinstats-pool-7', sourceKind: 'pool', sourceName: 'DefcoinStats Pool 7', poolId: 7, path: `/hash-pool.php?id=7&period=${PERIOD_ALL}`, unit: 'khps_raw_to_hps'},
  {sourceId: 'defcoinstats-pool-8', sourceKind: 'pool', sourceName: 'DefcoinStats Pool 8', poolId: 8, path: `/hash-pool.php?id=8&period=${PERIOD_ALL}`, unit: 'khps_raw_to_hps'},
  {sourceId: 'defcoinstats-pool-9', sourceKind: 'pool', sourceName: 'DefcoinStats Pool 9', poolId: 9, path: `/hash-pool.php?id=9&period=${PERIOD_ALL}`, unit: 'khps_raw_to_hps'},
  {sourceId: 'defcoinstats-pool-10', sourceKind: 'pool', sourceName: 'DefcoinStats Pool 10', poolId: 10, path: `/hash-pool.php?id=10&period=${PERIOD_ALL}`, unit: 'khps_raw_to_hps'}
];

const OTHER_SOURCE = {
  sourceId: 'defcoinstats-other',
  sourceKind: 'other',
  sourceName: 'Other / solo-mining estimate',
  sourceUrl: `${DEFCOIN_STATS_URL}/other.html`,
  unit: 'computed_hps'
};

function dbString() {
  return `mongodb://${encodeURIComponent(settings.dbsettings.user)}:${encodeURIComponent(settings.dbsettings.password)}@${settings.dbsettings.address}:${settings.dbsettings.port}/${settings.dbsettings.database}`;
}

function fetchText(path) {
  const url = new URL(path, DEFCOIN_STATS_URL);
  return new Promise((resolve, reject) => {
    const req = http.get(url, {timeout: REQUEST_TIMEOUT_MS}, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`${url.href} returned HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > MAX_RESPONSE_BYTES) {
          req.destroy(new Error(`${url.href} exceeded ${MAX_RESPONSE_BYTES} bytes`));
        }
      });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => req.destroy(new Error(`${url.href} timed out`)));
    req.on('error', reject);
  });
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function hydratePoolName(source) {
  if (!source.poolId) {
    return source;
  }
  try {
    const detail = await fetchText(`/pool.php?id=${source.poolId}`);
    const nameMatch = /Name:\s*([^<]+)<BR>/i.exec(detail);
    const urlMatch = /URL:\s*<a\s+href=['"]([^'"]+)['"]/i.exec(detail);
    return Object.assign({}, source, {
      sourceName: nameMatch ? stripTags(nameMatch[1]) : source.sourceName,
      sourceUrl: urlMatch ? urlMatch[1] : `${DEFCOIN_STATS_URL}/pool.php?id=${source.poolId}`
    });
  } catch (err) {
    return Object.assign({}, source, {
      sourceUrl: `${DEFCOIN_STATS_URL}/pool.php?id=${source.poolId}`,
      detailError: err.message
    });
  }
}

async function updateJob(status, message, stats) {
  await DefcoinHistoricalJobState.updateOne(
    {job: 'defcoinstats-history-import'},
    {
      $set: {
        status,
        message: message || '',
        stats: stats || {},
        pid: process.pid,
        updatedAt: new Date(),
        finishedAt: status === 'complete' || status === 'failed' ? new Date() : null
      },
      $setOnInsert: {startedAt: new Date()}
    },
    {upsert: true}
  );
}

async function bulkWrite(records) {
  for (let i = 0; i < records.length; i += BULK_CHUNK) {
    const chunk = records.slice(i, i + BULK_CHUNK);
    await DefcoinStatsHistoricalSample.bulkWrite(chunk.map((record) => ({
      updateOne: {
        filter: {sourceId: record.sourceId, sourceKind: record.sourceKind, t: record.t},
        update: {$set: record},
        upsert: true
      }
    })), {ordered: false});
  }
}

async function importSource(source) {
  source = await hydratePoolName(source);
  const text = await fetchText(source.path);
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) {
    throw new Error(`${source.sourceId} did not return an array`);
  }

  const now = new Date();
  const records = rows
    .filter((row) => Array.isArray(row) && Number.isFinite(Number(row[0])) && Number.isFinite(Number(row[1])))
    .map((row) => {
      const t = Number(row[0]);
      const rawValue = Number(row[1]);
      const isDifficulty = source.sourceKind === 'difficulty';
      const sourceUrl = source.sourceUrl || `${DEFCOIN_STATS_URL}${source.path}`;
      return {
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        sourceKind: source.sourceKind,
        sourceUrl,
        poolId: source.poolId || null,
        period: PERIOD_ALL,
        t,
        sampledAt: new Date(t * 1000),
        rawValue,
        hashrate: isDifficulty ? null : rawValue * 1000,
        difficulty: isDifficulty ? rawValue : null,
        unit: source.unit,
        importedAt: now,
        meta: {
          importedFrom: 'defcoinstats',
          originalPath: source.path
        }
      };
    });

  await bulkWrite(records);
  return records.length;
}

function nearestTimedSample(rows, pointer, t) {
  if (!rows.length) {
    return {sample: null, pointer};
  }

  while (pointer < rows.length - 1 && rows[pointer + 1].t <= t) {
    pointer += 1;
  }

  const left = rows[pointer];
  const right = pointer < rows.length - 1 ? rows[pointer + 1] : null;
  let sample = left;
  if (right && Math.abs(right.t - t) < Math.abs(left.t - t)) {
    sample = right;
  }

  return {sample, pointer};
}

async function importOtherSource() {
  const networkRows = await DefcoinStatsHistoricalSample.find(
    {sourceId: 'defcoinstats-network', sourceKind: 'network'},
    {t: 1, hashrate: 1}
  ).sort({t: 1}).lean().exec();

  const poolIds = (await DefcoinStatsHistoricalSample.distinct('sourceId', {sourceKind: 'pool'})).sort();
  const knownPoolHashrates = new Array(networkRows.length).fill(0);
  const contributingPoolCounts = new Array(networkRows.length).fill(0);
  const now = new Date();
  const records = [];

  for (const sourceId of poolIds) {
    const poolRows = await DefcoinStatsHistoricalSample.find(
      {sourceId, sourceKind: 'pool'},
      {t: 1, hashrate: 1}
    ).sort({t: 1}).lean().exec();
    let pointer = 0;

    networkRows.forEach((network, index) => {
      const t = Number(network.t);
      const result = nearestTimedSample(poolRows, pointer, t);
      pointer = result.pointer;
      if (!result.sample) {
        return;
      }

      const gapSeconds = Math.abs(Number(result.sample.t) - t);
      if (gapSeconds <= MAX_OTHER_POOL_GAP_SECONDS) {
        knownPoolHashrates[index] += Number(result.sample.hashrate || 0);
        contributingPoolCounts[index] += 1;
      }
    });
  }

  networkRows.forEach((network, index) => {
    const t = Number(network.t);
    const networkHashrate = Number(network.hashrate || 0);
    const knownPoolHashrate = knownPoolHashrates[index];
    const contributingPoolCount = contributingPoolCounts[index];

    const otherHashrate = networkHashrate - knownPoolHashrate;
    records.push({
      sourceId: OTHER_SOURCE.sourceId,
      sourceName: OTHER_SOURCE.sourceName,
      sourceKind: OTHER_SOURCE.sourceKind,
      sourceUrl: OTHER_SOURCE.sourceUrl,
      poolId: null,
      period: PERIOD_ALL,
      t,
      sampledAt: new Date(t * 1000),
      rawValue: otherHashrate / 1000,
      hashrate: otherHashrate,
      difficulty: null,
      unit: OTHER_SOURCE.unit,
      importedAt: now,
      meta: {
        importedFrom: 'defcoinstats',
        computedFrom: 'network-minus-known-pools',
        networkHashrate,
        knownPoolHashrate,
        contributingPoolCount,
        maxPoolGapSeconds: MAX_OTHER_POOL_GAP_SECONDS,
        knownPoolSourceCount: poolIds.length
      }
    });
  });

  await bulkWrite(records);
  return records.length;
}

async function main() {
  const totals = {};
  await mongoose.connect(dbString());
  await updateJob('running', 'Importing DefcoinStats historical chart arrays', {sources: 0, rows: 0});

  let rows = 0;
  try {
    for (const source of SOURCES) {
      const count = await importSource(source);
      totals[source.sourceId] = count;
      rows += count;
      console.log(`${source.sourceId}: ${count} rows`);
      await updateJob('running', `Imported ${source.sourceId}`, {sources: Object.keys(totals).length, rows, totals});
    }
    const otherCount = await importOtherSource();
    totals[OTHER_SOURCE.sourceId] = otherCount;
    rows += otherCount;
    console.log(`${OTHER_SOURCE.sourceId}: ${otherCount} rows`);
    await updateJob('running', `Imported ${OTHER_SOURCE.sourceId}`, {sources: Object.keys(totals).length, rows, totals});
    await updateJob('complete', `Imported ${rows} DefcoinStats rows`, {sources: Object.keys(totals).length, rows, totals});
    console.log(`Imported ${rows} DefcoinStats historical rows`);
  } catch (err) {
    await updateJob('failed', err.message, {sources: Object.keys(totals).length, rows, totals});
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});

#!/usr/bin/env node

const mongoose = require('mongoose');
const settings = require('../lib/settings');
const Tx = require('../models/tx');
const DefcoinStatsHistoricalSample = require('../models/defcoinstatshistoricalsample');
const DefcoinBlockHashrateBucket = require('../models/defcoinblockhashratebucket');
const DefcoinHistoricalJobState = require('../models/defcoinhistoricaljobstate');

const BUCKET_SECONDS = 15 * 60;
const DUST_DONATION_ADDRESS = 'DQ8AwqR2XJE9G5dSEfspJYH7Spre85dj6L';
const DEFAULT_BATCH_SIZE = 2000;
const DEFAULT_SLEEP_MS = 75;
const DEFAULT_OVERLAP_BLOCKS = 1000;
const MAX_NETWORK_SAMPLE_GAP_SECONDS = 3 * 60 * 60;
const BUCKET_WRITE_BATCH = 500;

function argNumber(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  const value = match ? Number(match.slice(prefix.length)) : fallback;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function dbString() {
  return `mongodb://${encodeURIComponent(settings.dbsettings.user)}:${encodeURIComponent(settings.dbsettings.password)}@${settings.dbsettings.address}:${settings.dbsettings.port}/${settings.dbsettings.database}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function positiveOutputCount(vout) {
  return (Array.isArray(vout) ? vout : []).filter((output) => Number(output && output.amount) > 0 && output.addresses && output.addresses !== 'hidden_address' && output.addresses !== 'unknown_address').length;
}

function hasDustDonation(vout) {
  return (Array.isArray(vout) ? vout : []).some((output) => output && output.addresses === DUST_DONATION_ADDRESS);
}

function isCoinbase(tx) {
  const vin = Array.isArray(tx && tx.vin) ? tx.vin : [];
  return vin.some((input) => input && input.addresses === 'coinbase');
}

function classifyCoinbase(tx) {
  const multiPayout = positiveOutputCount(tx.vout) >= 2;
  const dustDonation = hasDustDonation(tx.vout);
  return {
    likelyP2Pool: multiPayout || dustDonation,
    multiPayout,
    dustDonation
  };
}

function bucketTimestamp(timestamp) {
  return Math.floor(Number(timestamp || 0) / BUCKET_SECONDS) * BUCKET_SECONDS;
}

async function updateJob(status, message, lastHeight, stats) {
  await DefcoinHistoricalJobState.updateOne(
    {job: 'p2pool-block-history'},
    {
      $set: {
        status,
        message: message || '',
        lastHeight: lastHeight || 0,
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

async function loadNetworkSamples() {
  const rows = await DefcoinStatsHistoricalSample.find({sourceId: 'defcoinstats-network', sourceKind: 'network', hashrate: {$gt: 0}})
    .sort({t: 1})
    .select({_id: 0, t: 1, hashrate: 1})
    .lean()
    .exec();
  return rows.map((row) => ({t: Number(row.t), hashrate: Number(row.hashrate)}));
}

function nearestNetworkHashrate(networkSamples, timestamp, pointerState) {
  if (!networkSamples.length) {
    return null;
  }
  while (pointerState.index < networkSamples.length - 1 && networkSamples[pointerState.index + 1].t <= timestamp) {
    pointerState.index += 1;
  }
  const left = networkSamples[pointerState.index];
  const right = networkSamples[Math.min(networkSamples.length - 1, pointerState.index + 1)];
  const chosen = !right || Math.abs(timestamp - left.t) <= Math.abs(timestamp - right.t) ? left : right;
  if (!chosen || Math.abs(timestamp - chosen.t) > MAX_NETWORK_SAMPLE_GAP_SECONDS) {
    return null;
  }
  return chosen.hashrate;
}

function makeBucket(timestamp) {
  const bucketTs = bucketTimestamp(timestamp);
  return {
    bucketTimestamp: bucketTs,
    bucket: new Date(bucketTs * 1000).toISOString(),
    bucketStart: new Date(bucketTs * 1000),
    bucketEnd: new Date((bucketTs + BUCKET_SECONDS) * 1000),
    firstHeight: 0,
    lastHeight: 0,
    firstTimestamp: 0,
    lastTimestamp: 0,
    blockCount: 0,
    p2poolLikelyBlockCount: 0,
    p2poolConfirmedBlockCount: 0,
    p2poolUnknownBlockCount: 0,
    p2poolMultiPayoutCount: 0,
    p2poolDustMarkerCount: 0
  };
}

function addBlock(bucket, tx, classification) {
  bucket.blockCount += 1;
  bucket.firstHeight = bucket.firstHeight ? Math.min(bucket.firstHeight, tx.blockindex) : tx.blockindex;
  bucket.lastHeight = Math.max(bucket.lastHeight || 0, tx.blockindex);
  bucket.firstTimestamp = bucket.firstTimestamp ? Math.min(bucket.firstTimestamp, tx.timestamp) : tx.timestamp;
  bucket.lastTimestamp = Math.max(bucket.lastTimestamp || 0, tx.timestamp);
  if (classification.likelyP2Pool) bucket.p2poolLikelyBlockCount += 1;
  else bucket.p2poolUnknownBlockCount += 1;
  if (classification.multiPayout) bucket.p2poolMultiPayoutCount += 1;
  if (classification.dustDonation) bucket.p2poolDustMarkerCount += 1;
}

function buildBucketRecord(bucket, networkSamples, pointerState) {
  if (!bucket || !bucket.blockCount) {
    return null;
  }
  const midpoint = bucket.bucketTimestamp + Math.floor(BUCKET_SECONDS / 2);
  const networkHashrate = nearestNetworkHashrate(networkSamples, midpoint, pointerState);
  const p2poolLikelyShare = bucket.p2poolLikelyBlockCount / bucket.blockCount;
  const p2poolLikelyHashrate = networkHashrate ? networkHashrate * p2poolLikelyShare : null;
  const now = new Date();
  return Object.assign({}, bucket, {
    networkHashrate,
    networkHashrateSource: networkHashrate ? 'defcoinstats-network-nearest' : '',
    p2poolLikelyHashrate,
    p2poolLikelyShare,
    method: 'coinbase-payout-shape',
    complete: true,
    sampledAt: now,
    updatedAt: now,
    createdAt: now
  });
}

async function writeBucketRecords(records) {
  if (!records.length) {
    return;
  }
  await DefcoinBlockHashrateBucket.bulkWrite(records.map((record) => ({
    updateOne: {
      filter: {bucketTimestamp: record.bucketTimestamp},
      update: {
        $set: (() => {
          const fields = Object.assign({}, record, {createdAt: undefined});
          delete fields.p2poolConfirmedBlockCount;
          delete fields.p2poolConfirmedHashrate;
          delete fields.p2poolConfirmedShare;
          delete fields.p2poolMarkerMethod;
          delete fields.p2poolMarkerUpdatedAt;
          return fields;
        })(),
        $setOnInsert: {createdAt: record.createdAt}
      },
      upsert: true
    }
  })), {ordered: false});
}

async function queueBucketWrite(queue, bucket, networkSamples, pointerState, force) {
  const record = buildBucketRecord(bucket, networkSamples, pointerState);
  if (record) {
    queue.push(record);
  }
  if (force || queue.length >= BUCKET_WRITE_BATCH) {
    await writeBucketRecords(queue.splice(0, queue.length));
  }
}

async function main() {
  const batchSize = argNumber('batch', DEFAULT_BATCH_SIZE);
  const sleepMs = argNumber('sleep-ms', DEFAULT_SLEEP_MS);
  const maxBlocks = argNumber('max-blocks', 0);
  const overlapBlocks = argNumber('overlap-blocks', DEFAULT_OVERLAP_BLOCKS);
  const reset = process.argv.includes('--reset');
  await mongoose.connect(dbString());

  try {
    const previousJob = await DefcoinHistoricalJobState.findOne({job: 'p2pool-block-history'}).lean().exec();
    const previousHeight = Number(previousJob && previousJob.lastHeight || 0);
    const startAfter = reset ? 0 : Math.max(0, previousHeight - overlapBlocks);
    if (reset) {
      await DefcoinBlockHashrateBucket.deleteMany({});
    }
    const networkSamples = await loadNetworkSamples();
    const pointerState = {index: 0};
    const buckets = new Map();
    let processedTx = 0;
    let processedBlocks = 0;
    let lastHeight = startAfter;

    await updateJob('running', `Scanning coinbase transactions after height ${startAfter}`, lastHeight, {
      batchSize,
      sleepMs,
      networkSamples: networkSamples.length,
      overlapBlocks: reset ? 0 : overlapBlocks
    });

    const cursor = Tx.find({blockindex: {$gt: startAfter}})
      .sort({blockindex: 1})
      .hint({blockindex: 1})
      .select({_id: 0, vin: 1, vout: 1, blockindex: 1, timestamp: 1})
      .lean()
      .cursor({batchSize});

    for await (const tx of cursor) {
      processedTx += 1;
      if (!isCoinbase(tx)) {
        continue;
      }

      const txBucket = bucketTimestamp(tx.timestamp);
      let bucket = buckets.get(txBucket);
      if (!bucket) {
        bucket = makeBucket(tx.timestamp);
        buckets.set(txBucket, bucket);
      }

      addBlock(bucket, tx, classifyCoinbase(tx));
      processedBlocks += 1;
      lastHeight = tx.blockindex;

      if (processedBlocks % batchSize === 0) {
        await updateJob('running', `Scanned through height ${lastHeight}`, lastHeight, {processedTx, processedBlocks, buckets: buckets.size});
        if (sleepMs > 0) {
          await sleep(sleepMs);
        }
      }
      if (maxBlocks > 0 && processedBlocks >= maxBlocks) {
        break;
      }
    }

    await updateJob('writing', `Writing ${buckets.size} hashrate buckets`, lastHeight, {processedTx, processedBlocks, buckets: buckets.size});
    const sortedBuckets = Array.from(buckets.values()).sort((a, b) => a.bucketTimestamp - b.bucketTimestamp);
    if (!reset && sortedBuckets.length) {
      await DefcoinBlockHashrateBucket.deleteMany({bucketTimestamp: {$in: sortedBuckets.map((bucket) => bucket.bucketTimestamp)}});
    }
    for (let i = 0; i < sortedBuckets.length; i += BUCKET_WRITE_BATCH) {
      const records = sortedBuckets.slice(i, i + BUCKET_WRITE_BATCH)
        .map((bucket) => buildBucketRecord(bucket, networkSamples, pointerState))
        .filter(Boolean);
      await writeBucketRecords(records);
      if (i % (BUCKET_WRITE_BATCH * 20) === 0) {
        await updateJob('writing', `Wrote ${Math.min(i + BUCKET_WRITE_BATCH, sortedBuckets.length)} of ${sortedBuckets.length} hashrate buckets`, lastHeight, {processedTx, processedBlocks, buckets: sortedBuckets.length});
      }
      if (sleepMs > 0) {
        await sleep(Math.min(250, sleepMs));
      }
    }
    await updateJob(maxBlocks > 0 ? 'partial' : 'complete', `Scanned ${processedBlocks} coinbase blocks`, lastHeight, {processedTx, processedBlocks, maxBlocks});
    console.log(`Scanned ${processedBlocks} coinbase blocks through height ${lastHeight}`);
  } catch (err) {
    const previousJob = await DefcoinHistoricalJobState.findOne({job: 'p2pool-block-history'}).lean().exec().catch(() => null);
    await updateJob('failed', err.message, Number(previousJob && previousJob.lastHeight || 0), {});
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});

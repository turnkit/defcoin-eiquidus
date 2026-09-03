#!/usr/bin/env node

const fs = require('fs');
const mongoose = require('mongoose');
const settings = require('../lib/settings');
const DefcoinBlockHashrateBucket = require('../models/defcoinblockhashratebucket');

const BUCKET_SECONDS = 15 * 60;

function dbString() {
  return `mongodb://${encodeURIComponent(settings.dbsettings.user)}:${encodeURIComponent(settings.dbsettings.password)}@${settings.dbsettings.address}:${settings.dbsettings.port}/${settings.dbsettings.database}`;
}

function argPath() {
  const prefix = '--file=';
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : process.argv[2];
}

function normalizeBucketTimestamp(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 100000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

async function main() {
  const filePath = argPath();
  if (!filePath) {
    throw new Error('Usage: node scripts/import_p2pool_marker_buckets.js --file=/path/to/p2pool-confirmed-buckets.json');
  }
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const buckets = Array.isArray(payload.buckets) ? payload.buckets : [];
  await mongoose.connect(dbString());
  const now = new Date();
  let imported = 0;
  let skipped = 0;
  const operations = [];

  for (const bucket of buckets) {
    const bucketTimestamp = normalizeBucketTimestamp(bucket.bucketTimestamp);
    const confirmedCount = Number(bucket.p2poolConfirmedBlockCount || 0);
    if (!bucketTimestamp || confirmedCount <= 0) {
      skipped += 1;
      continue;
    }
    const existing = await DefcoinBlockHashrateBucket.findOne({bucketTimestamp}).lean().exec();
    const blockCount = Number(existing && existing.blockCount || bucket.blockCount || 0);
    const networkHashrate = Number(existing && existing.networkHashrate || 0);
    const confirmedShare = blockCount > 0 ? confirmedCount / blockCount : 0;
    const confirmedHashrate = networkHashrate > 0 && confirmedShare > 0 ? networkHashrate * confirmedShare : null;
    const bucketStart = new Date(bucketTimestamp * 1000);
    const bucketEnd = new Date((bucketTimestamp + BUCKET_SECONDS) * 1000);
    operations.push({
      updateOne: {
        filter: {bucketTimestamp},
        update: {
          $set: {
            bucket: bucketStart.toISOString(),
            bucketStart,
            bucketEnd,
            bucketTimestamp,
            blockCount,
            p2poolConfirmedBlockCount: confirmedCount,
            p2poolConfirmedShare: confirmedShare,
            p2poolConfirmedHashrate: confirmedHashrate,
            p2poolMarkerMethod: payload.source || 'local raw blk*.dat exact coinbase marker scan',
            p2poolMarkerUpdatedAt: now,
            updatedAt: now
          },
          $setOnInsert: {
            createdAt: now,
            firstTimestamp: bucketTimestamp,
            lastTimestamp: bucketTimestamp + BUCKET_SECONDS
          }
        },
        upsert: true
      }
    });
    imported += 1;
  }

  if (operations.length) {
    await DefcoinBlockHashrateBucket.bulkWrite(operations, {ordered: false});
  }
  await mongoose.disconnect();
  console.log(JSON.stringify({imported, skipped, sourceFile: filePath}, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DefcoinBlockHashrateBucketSchema = new Schema({
  bucket: {type: String, required: true, index: true},
  bucketStart: {type: Date, required: true, index: true},
  bucketEnd: {type: Date, required: true},
  bucketTimestamp: {type: Number, required: true},
  firstHeight: {type: Number, default: 0, index: true},
  lastHeight: {type: Number, default: 0, index: true},
  firstTimestamp: {type: Number, default: 0},
  lastTimestamp: {type: Number, default: 0},
  blockCount: {type: Number, default: 0},
  p2poolLikelyBlockCount: {type: Number, default: 0},
  p2poolConfirmedBlockCount: {type: Number, default: 0},
  p2poolUnknownBlockCount: {type: Number, default: 0},
  p2poolMultiPayoutCount: {type: Number, default: 0},
  p2poolDustMarkerCount: {type: Number, default: 0},
  networkHashrate: {type: Number, default: null},
  networkHashrateSource: {type: String, default: ''},
  p2poolLikelyHashrate: {type: Number, default: null},
  p2poolLikelyShare: {type: Number, default: 0},
  p2poolConfirmedHashrate: {type: Number, default: null},
  p2poolConfirmedShare: {type: Number, default: 0},
  p2poolMarkerMethod: {type: String, default: ''},
  p2poolMarkerUpdatedAt: {type: Date, default: null},
  method: {type: String, default: 'coinbase-payout-shape'},
  complete: {type: Boolean, default: true, index: true},
  sampledAt: {type: Date, default: Date.now, index: true},
  createdAt: {type: Date, default: Date.now},
  updatedAt: {type: Date, default: Date.now}
}, {id: false});

DefcoinBlockHashrateBucketSchema.index({bucketTimestamp: 1}, {unique: true});

module.exports = mongoose.model('DefcoinBlockHashrateBucket', DefcoinBlockHashrateBucketSchema);

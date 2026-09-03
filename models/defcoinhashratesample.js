const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DefcoinHashrateSampleSchema = new Schema({
  bucket: {type: String, required: true, index: true},
  sampledAt: {type: Date, required: true, index: true},
  sourceId: {type: String, required: true, index: true},
  sourceName: {type: String, required: true},
  sourceKind: {type: String, required: true, index: true},
  hashrate: {type: Number, default: 0},
  endpointHashrate: {type: Number, default: 0},
  p2poolHashrate: {type: Number, default: 0},
  networkHashrate: {type: Number, default: 0},
  miners: {type: Number, default: 0},
  shares: {type: Number, default: 0},
  live: {type: Boolean, default: false},
  note: {type: String, default: ''},
  createdAt: {type: Date, default: Date.now}
}, {id: false});

DefcoinHashrateSampleSchema.index({bucket: 1, sourceId: 1}, {unique: true});

module.exports = mongoose.model('DefcoinHashrateSample', DefcoinHashrateSampleSchema);

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DefcoinHistoricalJobStateSchema = new Schema({
  job: {type: String, required: true, unique: true, index: true},
  status: {type: String, default: 'idle', index: true},
  lastHeight: {type: Number, default: 0, index: true},
  startedAt: {type: Date, default: null},
  updatedAt: {type: Date, default: Date.now},
  finishedAt: {type: Date, default: null},
  pid: {type: Number, default: 0},
  message: {type: String, default: ''},
  stats: {type: Object, default: {}}
}, {id: false});

module.exports = mongoose.model('DefcoinHistoricalJobState', DefcoinHistoricalJobStateSchema);

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DefcoinStatsHistoricalSampleSchema = new Schema({
  sourceId: {type: String, required: true, index: true},
  sourceName: {type: String, required: true},
  sourceKind: {type: String, required: true, index: true},
  sourceUrl: {type: String, default: ''},
  poolId: {type: Number, default: null, index: true},
  period: {type: Number, default: 8},
  t: {type: Number, required: true, index: true},
  sampledAt: {type: Date, required: true, index: true},
  rawValue: {type: Number, default: 0},
  hashrate: {type: Number, default: null},
  difficulty: {type: Number, default: null},
  unit: {type: String, default: ''},
  importedAt: {type: Date, default: Date.now},
  meta: {type: Object, default: {}}
}, {id: false});

DefcoinStatsHistoricalSampleSchema.index({sourceId: 1, sourceKind: 1, t: 1}, {unique: true});
DefcoinStatsHistoricalSampleSchema.index({sourceKind: 1, t: 1});
DefcoinStatsHistoricalSampleSchema.index({sourceKind: 1, sourceId: 1, t: 1});

module.exports = mongoose.model('DefcoinStatsHistoricalSample', DefcoinStatsHistoricalSampleSchema);

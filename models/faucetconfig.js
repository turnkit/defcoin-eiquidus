const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FaucetConfigSchema = new Schema({
  key: { type: String, unique: true, index: true },
  value: { type: Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now }
}, { id: false });

module.exports = mongoose.model('FaucetConfig', FaucetConfigSchema);

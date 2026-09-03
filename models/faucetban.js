const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FaucetBanSchema = new Schema({
  ip: { type: String, index: true, default: '' },
  subnet: { type: String, index: true, default: '' },
  address: { type: String, index: true, default: '' },
  userAgentHash: { type: String, index: true, default: '' },
  active: { type: Boolean, default: true, index: true },
  strikeCount: { type: Number, default: 0 },
  reason: { type: String, default: '' },
  expiresAt: { type: Date, default: null, index: true },
  createdAt: { type: Date, default: Date.now }
}, { id: false });

module.exports = mongoose.model('FaucetBan', FaucetBanSchema);

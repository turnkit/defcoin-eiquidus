const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const D0 = () => mongoose.Types.Decimal128.fromString('0');

const FaucetClaimSchema = new Schema({
  ip: { type: String, index: true, default: '' },
  subnet: { type: String, index: true, default: '' },
  address: { type: String, index: true, default: '' },
  userAgent: { type: String, default: '' },
  userAgentHash: { type: String, index: true, default: '' },
  requestedAmount: { type: Schema.Types.Decimal128, default: D0 },
  status: { type: String, index: true, default: 'rejected' },
  reason: { type: String, default: '' },
  txid: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
}, { id: false });

module.exports = mongoose.model('FaucetClaim', FaucetClaimSchema);

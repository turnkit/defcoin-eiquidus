const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const D0 = () => mongoose.Types.Decimal128.fromString('0');

const FaucetLedgerSchema = new Schema({
  claimId: { type: Schema.Types.ObjectId, index: true, default: null },
  direction: { type: String, default: 'debit', index: true },
  address: { type: String, index: true, default: '' },
  amount: { type: Schema.Types.Decimal128, default: D0 },
  txid: { type: String, default: '' },
  note: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
}, { id: false });

module.exports = mongoose.model('FaucetLedger', FaucetLedgerSchema);

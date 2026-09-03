'use strict';

const crypto = require('crypto');

const MAX_URL_LENGTH = 2048;
const MAX_SEGMENT_LENGTH = 256;
const MAX_QUERY_KEYS = 20;
const MAX_QUERY_VALUE_LENGTH = 512;
const MAX_BODY_KEYS = 20;
const MAX_BODY_VALUE_LENGTH = 2048;
const MAX_SEARCH_LENGTH = 128;
const MAX_QR_LENGTH = 256;
const MAX_API_OFFSET = 10000;
const MAX_CHAIN_HEIGHT = 999999999;
const MAX_RPC_MESSAGE_LENGTH = 512;
const MAX_RPC_SIGNATURE_LENGTH = 256;

const HASH64_RE = /^[0-9a-fA-F]{64}$/;
const HEIGHT_RE = /^(0|[1-9][0-9]{0,8})$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{26,50}$/;
const SPECIAL_ADDRESS_RE = /^(coinbase|hidden_address|unknown_address)$/i;
const RPC_METHOD_RE = /^[a-z][a-z0-9_]{0,63}$/;
const SAFE_TOKEN_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const CONTROL_RE = /[\x00-\x08\x0E-\x1F\x7F]/;

function toText(value) {
  if (value == null)
    return '';

  if (Array.isArray(value))
    return value.map(toText).join(',');

  return String(value).trim();
}

function isHash64(value) {
  return HASH64_RE.test(toText(value));
}

function isHeight(value) {
  return HEIGHT_RE.test(toText(value)) && Number(toText(value)) <= MAX_CHAIN_HEIGHT;
}

function isAddressLike(value) {
  const text = toText(value);
  return SPECIAL_ADDRESS_RE.test(text) || BASE58_RE.test(text);
}

function isSafeToken(value) {
  return SAFE_TOKEN_RE.test(toText(value));
}

function isRpcMethod(value) {
  return RPC_METHOD_RE.test(toText(value));
}

function isTrustedProxyAddress(value) {
  const normalized = String(value || '').replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1';
}

function boundedInt(value, fallback, min, max) {
  const text = toText(value);

  if (!/^-?\d+$/.test(text))
    return fallback;

  const parsed = Number(text);

  if (!Number.isSafeInteger(parsed))
    return fallback;

  return Math.min(Math.max(parsed, min), max);
}

function boundedAmountSats(value, fallback) {
  const text = toText(value);

  if (!/^\d{1,12}(\.\d{1,8})?$/.test(text))
    return fallback;

  const parsed = Number(text);

  if (!Number.isFinite(parsed) || parsed < 0)
    return fallback;

  return Math.min(Math.round(parsed * 100000000), Number.MAX_SAFE_INTEGER);
}

function cleanSearch(value) {
  const text = toText(value);

  if (text.length === 0 || text.length > MAX_SEARCH_LENGTH || CONTROL_RE.test(text))
    return '';

  return text;
}

function cleanQrPayload(value) {
  const text = toText(value);

  if (text.length === 0 || text.length > MAX_QR_LENGTH || CONTROL_RE.test(text))
    return '';

  return text;
}

function cleanBoundedText(value, maxLength) {
  const text = toText(value);

  if (text.length > maxLength || CONTROL_RE.test(text))
    return '';

  return text;
}

function safeJsonForScript(value) {
  const json = JSON.stringify(value == null ? null : value);

  return json
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function constantTimeSecretEqual(expected, supplied) {
  const expectedText = String(expected || '');
  const suppliedText = String(supplied || '');

  if (expectedText === '' || suppliedText === '' || expectedText.length > 512 || suppliedText.length > 512)
    return false;

  const expectedDigest = crypto.createHash('sha256').update(expectedText).digest();
  const suppliedDigest = crypto.createHash('sha256').update(suppliedText).digest();
  return crypto.timingSafeEqual(expectedDigest, suppliedDigest);
}

function safeRpcParam(value) {
  const text = cleanBoundedText(value, MAX_QUERY_VALUE_LENGTH);

  if (text === '')
    return '';

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const parsed = Number(text);

    if (Number.isFinite(parsed) && Math.abs(parsed) <= Number.MAX_SAFE_INTEGER)
      return parsed;
  }

  return text;
}

function reject(res, status, message) {
  if (res.headersSent)
    return;

  res.status(status || 400);

  if (res.req && /json/i.test(res.req.headers.accept || ''))
    return res.json({ error: message || 'Invalid request' });

  return res.send(message || 'Invalid request');
}

function checkObjectShape(obj, maxKeys, maxValueLength) {
  if (obj == null || typeof obj !== 'object')
    return true;

  const keys = Object.keys(obj);

  if (keys.length > maxKeys)
    return false;

  return keys.every(function(key) {
    if (toText(key).length > 64)
      return false;

    const value = obj[key];

    if (Array.isArray(value))
      return value.length <= 8 && value.every(entry => toText(entry).length <= maxValueLength && !CONTROL_RE.test(toText(entry)));

    if (value != null && typeof value === 'object')
      return false;

    const text = toText(value);
    return text.length <= maxValueLength && !CONTROL_RE.test(text);
  });
}

function guardExpressRequest(req, res, next) {
  const url = req.originalUrl || req.url || '';

  if (url.length > MAX_URL_LENGTH)
    return reject(res, 414, 'Request URI is too long');

  const path = req.path || '';
  const segments = path.split('/').filter(Boolean);

  if (segments.some(segment => segment.length > MAX_SEGMENT_LENGTH || CONTROL_RE.test(segment)))
    return reject(res, 414, 'Request path segment is too long');

  if (!checkObjectShape(req.query, MAX_QUERY_KEYS, MAX_QUERY_VALUE_LENGTH))
    return reject(res, 400, 'Malformed query parameters');

  if (!checkObjectShape(req.body, MAX_BODY_KEYS, MAX_BODY_VALUE_LENGTH))
    return reject(res, 400, 'Malformed request body');

  return next();
}

function setSecurityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
  return next();
}

module.exports = {
  MAX_API_OFFSET,
  MAX_CHAIN_HEIGHT,
  MAX_RPC_MESSAGE_LENGTH,
  MAX_RPC_SIGNATURE_LENGTH,
  isHash64,
  isHeight,
  isAddressLike,
  isSafeToken,
  isRpcMethod,
  isTrustedProxyAddress,
  boundedInt,
  boundedAmountSats,
  cleanSearch,
  cleanQrPayload,
  cleanBoundedText,
  safeJsonForScript,
  constantTimeSecretEqual,
  safeRpcParam,
  guardExpressRequest,
  setSecurityHeaders,
  reject
};

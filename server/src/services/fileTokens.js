/**
 * Short-lived HMAC tokens for upload parts and file downloads.
 *
 * Iframes, <video>, plain links and the offline cache cannot send an Authorization
 * header, so the API hands out signed URLs (?sig=). A token proves one action
 * ('u' upload, 'd' download) on one file id until it expires.
 */
const crypto = require('node:crypto');
const limits = require('../config/fileLimits');

let devSecret = null;

function secret(env) {
  const configured = env?.FILE_TOKEN_SECRET || process.env.FILE_TOKEN_SECRET;
  if (configured) return configured;
  if ((env?.NODE_ENV || process.env.NODE_ENV) === 'production') {
    throw new Error('FILE_TOKEN_SECRET is not configured.');
  }
  devSecret ||= crypto.randomBytes(32).toString('hex');
  return devSecret;
}

const b64 = value => Buffer.from(value).toString('base64url');
const mac = (env, payload) => crypto.createHmac('sha256', secret(env)).update(payload).digest();

/** claims: { a:'u'|'d', f:fileId, u:userId, s?:shard, z?:size, n?:chunks } */
function sign(env, claims, ttlSeconds) {
  const payload = b64(JSON.stringify({ ...claims, e: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${payload}.${b64(mac(env, payload))}`;
}

/** Returns the claims when the signature, expiry, action and file id all match; otherwise null. */
function verify(env, sig, { a, f }) {
  if (typeof sig !== 'string') return null;
  const [payload, signature, extra] = sig.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  try {
    const expected = mac(env, payload);
    // Compare the canonical text form, so a re-spelled (non-canonical) base64 signature is rejected too.
    const given = Buffer.from(signature);
    const wanted = Buffer.from(b64(expected));
    if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!claims || claims.e < Date.now() / 1000 || claims.a !== a || claims.f !== f) return null;
    return claims;
  } catch {
    return null;
  }
}

const downloadSig = (env, fileId, userId) => sign(env, { a: 'd', f: fileId, u: userId }, limits.DOWNLOAD_TOKEN_TTL_S);

function downloadUrl(env, file, userId) {
  return `/api/files/${file.id}/content?sig=${downloadSig(env, file.id, userId)}`;
}

/** Signed URL for an older base64 upload; `kind` is 'materials' or 'performance-tasks'. */
function legacyUrl(env, kind, filename, userId) {
  const base = kind === 'materials' ? '/api/materials/download/' : '/api/performance-tasks/files/';
  return `${base}${encodeURIComponent(filename)}?sig=${downloadSig(env, `legacy:${kind}/${filename}`, userId)}`;
}

module.exports = { sign, verify, downloadUrl, legacyUrl };

/**
 * Byte routes for uploaded files, written against the web-standard Request/Response so the
 * same code runs inside the Cloudflare Worker (matched before Express) and under Express
 * (see routes/fileRoutes.js) for local development and tests.
 *
 *   PUT      /api/files/:id/parts/:index?sig=   store one chunk (the upload token carries shard, size and chunk count)
 *   GET|HEAD /api/files/:id/content?sig=        stream the file, with Range support
 *
 * Neither route reads cookies or Authorization headers: the signed `sig` is the credential.
 */
const path = require('node:path');
const db = require('../config/database');
const limits = require('../config/fileLimits');
const store = require('./chunkStore');
const tokens = require('./fileTokens');

const PARTS = /^\/api\/files\/([A-Za-z0-9-]{1,36})\/parts\/(\d{1,6})$/;
const CONTENT = /^\/api\/files\/([A-Za-z0-9-]{1,36})\/content$/;
const INLINE = new Set(['.pdf', '.mp4', '.png', '.jpg', '.jpeg', '.gif', '.webp']);

function match(pathname, method) {
  if (method === 'PUT') return PARTS.test(pathname);
  if (method === 'GET' || method === 'HEAD') return CONTENT.test(pathname);
  return false;
}

function problem(status, message, extra = {}) {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra }
  });
}

async function putPart(request, env, id, indexText, sig) {
  const claims = tokens.verify(env, sig, { a: 'u', f: id });
  if (!claims) return problem(403, 'This upload link is not valid or has expired. Start the upload again.');
  const index = Number(indexText);
  if (!(index >= 0 && index < claims.n)) return problem(400, 'Part number out of range.');
  const expected = index === claims.n - 1 ? claims.z - limits.CHUNK_BYTES * (claims.n - 1) : limits.CHUNK_BYTES;
  if (Number(request.headers.get('content-length')) !== expected) return problem(400, 'Part size mismatch');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength !== expected) return problem(400, 'Part size mismatch');
  // A finished upload is sealed: its token must not let anyone rewrite checked bytes.
  const { rows } = await db.query(`SELECT 1 AS open FROM files WHERE id = ? AND status = 'pending' LIMIT 1`, [id]);
  if (!rows.length) return problem(409, 'This upload is already finished or was cancelled. Start the upload again.');
  await store.backend(env, claims.s).putChunk(id, index, bytes);
  return new Response(JSON.stringify({ index, size: bytes.byteLength }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

/** Returns null (no Range header), 'invalid', or an inclusive { start, end }. */
function parseRange(header, size) {
  if (!header) return null;
  const parsed = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!parsed || (parsed[1] === '' && parsed[2] === '')) return 'invalid';
  if (parsed[1] === '') {
    const suffix = Number(parsed[2]);
    return suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : 'invalid';
  }
  const start = Number(parsed[1]);
  const end = parsed[2] === '' ? size - 1 : Math.min(Number(parsed[2]), size - 1);
  return start >= size || end < start ? 'invalid' : { start, end };
}

function disposition(name) {
  const type = INLINE.has(path.extname(name).toLowerCase()) ? 'inline' : 'attachment';
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Reads READ_GROUP chunks per pull so a download costs a handful of queries, never the whole file in memory. */
function streamRange(chunks, key, start, end) {
  const size = limits.CHUNK_BYTES;
  const last = Math.floor(end / size);
  let next = Math.floor(start / size);
  return new ReadableStream({
    async pull(controller) {
      try {
        const to = Math.min(next + limits.READ_GROUP - 1, last);
        const rows = await chunks.readChunks(key, next, to);
        if (rows.length !== to - next + 1) throw new Error('A stored part is missing.');
        for (const row of rows) {
          const base = row.chunk_index * size;
          const from = Math.max(start, base) - base;
          const until = Math.min(end, base + row.data.byteLength - 1) - base;
          controller.enqueue(row.data.subarray(from, until + 1));
        }
        next = to + 1;
        if (next > last) controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  }, { highWaterMark: 0 });
}

async function getContent(request, env, id, sig) {
  if (!tokens.verify(env, sig, { a: 'd', f: id })) return problem(403, 'This link expired. Reopen the file.');
  const { rows } = await db.query(`SELECT * FROM files WHERE id = ? AND status = 'ready' LIMIT 1`, [id]);
  const file = rows[0];
  if (!file) return problem(404, 'This file is no longer available.');
  const total = Number(file.size_bytes);
  const range = parseRange(request.headers.get('range'), total);
  if (range === 'invalid') return problem(416, 'Requested range not satisfiable.', { 'Content-Range': `bytes */${total}` });
  const { start, end } = range || { start: 0, end: total - 1 };
  const headers = {
    'Content-Type': file.content_type,
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
    'Content-Disposition': disposition(file.original_name),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store'
  };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
  const status = range ? 206 : 200;
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  return new Response(streamRange(store.backend(env, Number(file.shard)), file.storage_key, start, end), { status, headers });
}

async function handle(request, env) {
  const url = new URL(request.url);
  const sig = url.searchParams.get('sig');
  try {
    const part = request.method === 'PUT' ? PARTS.exec(url.pathname) : null;
    if (part) return await putPart(request, env, part[1], part[2], sig);
    const content = request.method === 'GET' || request.method === 'HEAD' ? CONTENT.exec(url.pathname) : null;
    if (content) return await getContent(request, env, content[1], sig);
    return problem(404, 'Not found.');
  } catch (error) {
    console.error('[FILES] Byte route failed:', error.message);
    return problem(500, 'The file service had a problem. Please try again.');
  }
}

module.exports = { match, handle };

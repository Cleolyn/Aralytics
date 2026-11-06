/**
 * /api/files
 *
 *   bytes  PUT part / GET content, authorised by a signed ?sig= (mounted before body parsing)
 *   api    JSON endpoints behind the normal session guard
 *
 * On Cloudflare the byte routes are answered by worker.js before Express runs; here they are
 * adapted so local development and the tests exercise the same handler.
 */
const { Readable } = require('node:stream');
const express = require('express');
const limits = require('../config/fileLimits');
const fileContent = require('../services/fileContent');
const files = require('../services/fileService');
const tokens = require('../services/fileTokens');
const { verifyToken } = require('../middleware/auth');
const { fail } = require('../services/enrollmentService');

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const bytes = express.Router();

async function adapter(req, res, next) {
  try {
    // Local stand-in for the Worker: parts are small, so the body is read here (with a cap) and handed over whole.
    let body;
    if (req.method === 'PUT') {
      const received = [];
      let total = 0;
      for await (const chunk of req) {
        total += chunk.length;
        if (total > limits.CHUNK_BYTES * 2) {
          res.setHeader('Connection', 'close');
          return res.status(413).json({ success: false, message: 'Part size mismatch' });
        }
        received.push(chunk);
      }
      body = Buffer.concat(received);
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
    const request = new Request(`http://${req.headers.host || 'localhost'}${req.originalUrl}`, { method: req.method, headers, body });
    const response = await fileContent.handle(request, files.envOf(req));
    res.status(response.status);
    response.headers.forEach((value, name) => res.setHeader(name, value));
    if (!response.body) return res.end();
    Readable.fromWeb(response.body).on('error', next).pipe(res);
  } catch (error) {
    next(error);
  }
}

bytes.put('/:id/parts/:index', adapter);
bytes.get('/:id/content', adapter);

const api = express.Router();
api.use(verifyToken);

api.post('/', wrap(async (req, res) => {
  const reserved = await files.reserve(files.envOf(req), req.user, req.body || {});
  res.status(201).json({ success: true, ...reserved });
}));

api.get('/', wrap(async (req, res) => {
  const purpose = req.query.purpose;
  if (purpose && !['material', 'submission', 'personal'].includes(purpose)) throw fail(400, 'Unknown file purpose.');
  res.json({
    success: true,
    files: await files.listOwn(files.envOf(req), req.user, purpose),
    usage: await files.usage(req.user, purpose)
  });
}));

api.post('/:id/complete', wrap(async (req, res) => {
  const env = files.envOf(req);
  const row = await files.complete(env, req.user, req.params.id);
  res.json({ success: true, file: files.publicFile(row, tokens.downloadUrl(env, row, req.user.id)) });
}));

api.get('/:id', wrap(async (req, res) => {
  const env = files.envOf(req);
  const row = await files.getFile(req.params.id);
  if (!row || !await files.canRead(req.user, row)) throw fail(404, 'File not found.');
  res.json({ success: true, file: files.publicFile(row, row.status === 'ready' ? tokens.downloadUrl(env, row, req.user.id) : null) });
}));

api.delete('/:id', wrap(async (req, res) => {
  const row = await files.getFile(req.params.id);
  if (!row || (row.owner_id !== req.user.id && req.user.role !== 'ADMIN')) throw fail(404, 'File not found.');
  if (row.purpose !== 'personal' && row.status === 'ready') throw fail(409, 'Delete the lesson or resubmit instead.');
  await files.deleteFiles(files.envOf(req), [row]);
  res.json({ success: true, id: row.id });
}));

module.exports = { bytes, api };

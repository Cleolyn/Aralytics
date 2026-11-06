/**
 * Chunk storage backends.
 *
 *   shard >= 1  Cloudflare D1 database bound as env.FILES_DB_<shard> (table file_chunks)
 *   shard 0     local disk (local development, tests, or any host without D1 bindings)
 *
 * Every backend stores whole chunks addressed by (key, index).
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const db = require('../config/database');
const limits = require('../config/fileLimits');

const MAX_SHARDS = 10;
const KEY = /^[A-Za-z0-9_-]{1,64}$/;

/** D1 returns BLOBs as ArrayBuffer (older versions returned a number array). */
function toBytes(value) {
  if (value == null) return new Uint8Array(0);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value);
  throw new Error('Unsupported binary value from storage.');
}

const toArrayBuffer = bytes => {
  const view = toBytes(bytes);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
};

/** Shard numbers that have a D1 binding, ascending. */
function shards(env) {
  const bound = [];
  for (let n = 1; n <= MAX_SHARDS; n++) if (env?.[`FILES_DB_${n}`]) bound.push(n);
  return bound;
}

/** The smaller of the site cap and what the bound shards can hold (local disk counts as one). */
function siteCap(env) {
  return Math.min(limits.SITE_CAP_BYTES, Math.max(1, shards(env).length) * limits.SHARD_CAP_BYTES);
}

function d1Backend(database) {
  return {
    async putChunk(key, index, bytes) {
      const buffer = toArrayBuffer(bytes);
      await database.prepare(`INSERT INTO file_chunks (object_key, chunk_index, size, data) VALUES (?, ?, ?, ?)
        ON CONFLICT(object_key, chunk_index) DO UPDATE SET size = excluded.size, data = excluded.data`)
        .bind(key, index, buffer.byteLength, buffer).run();
    },
    async readChunks(key, from, to) {
      const { results } = await database.prepare(`SELECT chunk_index, data FROM file_chunks
        WHERE object_key = ? AND chunk_index >= ? AND chunk_index <= ? ORDER BY chunk_index`).bind(key, from, to).all();
      return results.map(row => ({ chunk_index: Number(row.chunk_index), data: toBytes(row.data) }));
    },
    async stats(key) {
      const row = await database.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM file_chunks WHERE object_key = ?').bind(key).first();
      return { count: Number(row?.count || 0), bytes: Number(row?.bytes || 0) };
    },
    async head(key, n) {
      const row = await database.prepare('SELECT substr(data, 1, ?) AS data FROM file_chunks WHERE object_key = ? AND chunk_index = 0').bind(n, key).first();
      return row ? toBytes(row.data) : new Uint8Array(0);
    },
    async deleteKeys(keys) {
      for (let i = 0; i < keys.length; i += 50) {
        const group = keys.slice(i, i + 50);
        await database.prepare(`DELETE FROM file_chunks WHERE object_key IN (${group.map(() => '?').join(',')})`).bind(...group).run();
      }
    }
  };
}

function diskBackend() {
  const root = () => path.resolve(process.env.FILES_LOCAL_ROOT || path.join(__dirname, '../../uploads/files'));
  const dir = key => {
    if (!KEY.test(key)) throw new Error('Invalid storage key.');
    return path.join(root(), key);
  };
  const part = (key, index) => path.join(dir(key), `${Number(index)}.part`);
  const indexes = async key => {
    try {
      return (await fs.readdir(dir(key))).filter(name => name.endsWith('.part')).map(name => parseInt(name, 10)).sort((a, b) => a - b);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  };
  return {
    async putChunk(key, index, bytes) {
      await fs.mkdir(dir(key), { recursive: true });
      await fs.writeFile(part(key, index), toBytes(bytes));
    },
    async readChunks(key, from, to) {
      const out = [];
      for (let i = from; i <= to; i++) {
        try { out.push({ chunk_index: i, data: new Uint8Array(await fs.readFile(part(key, i))) }); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      return out;
    },
    async stats(key) {
      let bytes = 0;
      const found = await indexes(key);
      for (const i of found) bytes += (await fs.stat(part(key, i))).size;
      return { count: found.length, bytes };
    },
    async head(key, n) {
      try {
        const handle = await fs.open(part(key, 0), 'r');
        try {
          const buffer = Buffer.alloc(n);
          const { bytesRead } = await handle.read(buffer, 0, n, 0);
          return new Uint8Array(buffer.subarray(0, bytesRead));
        } finally { await handle.close(); }
      } catch (error) {
        if (error.code === 'ENOENT') return new Uint8Array(0);
        throw error;
      }
    },
    async deleteKeys(keys) {
      for (const key of keys) await fs.rm(dir(key), { recursive: true, force: true });
    }
  };
}

function backend(env, shard) {
  if (!shard) return diskBackend();
  const database = env?.[`FILES_DB_${shard}`];
  if (!database) throw new Error(`Storage shard ${shard} is not available.`);
  return d1Backend(database);
}

/** Bytes in use (pending + ready files) per shard. */
async function shardUsage(connection = db) {
  const { rows } = await connection.query(`SELECT shard, SUM(size_bytes) AS used FROM files
    WHERE status IN ('pending', 'ready') GROUP BY shard`);
  return new Map(rows.map(row => [Number(row.shard), Number(row.used || 0)]));
}

/**
 * Chooses where a new file goes: the bound shard with the most free space that still fits it.
 * Returns 0 when no shard is bound (local disk), or null when nothing fits.
 */
async function pickShard(env, size, connection = db) {
  const bound = shards(env);
  if (!bound.length) return 0;
  const usage = await shardUsage(connection);
  let best = null;
  let bestFree = -1;
  for (const shard of bound) {
    const free = limits.SHARD_CAP_BYTES - (usage.get(shard) || 0);
    if (free >= size && free > bestFree) { best = shard; bestFree = free; }
  }
  return best;
}

module.exports = { shards, siteCap, backend, pickShard, shardUsage, toBytes, MAX_SHARDS };

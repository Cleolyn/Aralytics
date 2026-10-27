import { api } from '../services/api';
import { materialUrl } from './learning';

export const MATERIAL_CACHE = 'aralytics-materials-v3';
const IDB_NAME = 'aralytics_offline_db';
const IDB_VERSION = 1;

const key = (userId, type) => `aralytics:${type}:${userId}`;
function read(userId, type, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key(userId, type))) || fallback;
  } catch {
    return fallback;
  }
}
function write(userId, type, value) {
  try {
    localStorage.setItem(key(userId, type), JSON.stringify(value));
  } catch {}
}

// ---------------------------------------------------------------------------
// IndexedDB Wrapper for Offline Asset Metadata & Outbox Mutation Queue
// ---------------------------------------------------------------------------
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('materials_catalog')) {
        db.createObjectStore('materials_catalog', { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains('mutation_outbox')) {
        const store = db.createObjectStore('mutation_outbox', { keyPath: 'idempotency_key' });
        store.createIndex('by_user', 'user_id', { unique: false });
        store.createIndex('by_timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function idbSaveCatalog(userId, materials) {
  const db = await openOfflineDB();
  if (!db) return;
  return new Promise(resolve => {
    const tx = db.transaction('materials_catalog', 'readwrite');
    tx.objectStore('materials_catalog').put({ userId, materials, updated_at: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function idbGetCatalog(userId) {
  const db = await openOfflineDB();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction('materials_catalog', 'readonly');
    const req = tx.objectStore('materials_catalog').get(userId);
    req.onsuccess = () => resolve(req.result?.materials || null);
    req.onerror = () => resolve(null);
  });
}

async function idbEnqueueMutation(mutation) {
  const db = await openOfflineDB();
  if (!db) return;
  return new Promise(resolve => {
    const tx = db.transaction('mutation_outbox', 'readwrite');
    tx.objectStore('mutation_outbox').put(mutation);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function idbGetOutbox(userId) {
  const db = await openOfflineDB();
  if (!db) return [];
  return new Promise(resolve => {
    const tx = db.transaction('mutation_outbox', 'readonly');
    const req = tx.objectStore('mutation_outbox').getAll();
    req.onsuccess = () => {
      const items = (req.result || [])
        .filter(item => item.user_id === userId)
        .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
      resolve(items);
    };
    req.onerror = () => resolve([]);
  });
}

async function idbRemoveMutations(keys) {
  const db = await openOfflineDB();
  if (!db || !keys.length) return;
  return new Promise(resolve => {
    const tx = db.transaction('mutation_outbox', 'readwrite');
    const store = tx.objectStore('mutation_outbox');
    keys.forEach(k => store.delete(k));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function emitSyncStatus(detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aralytics:sync-status', { detail }));
  }
}

export async function cachedMaterials() {
  if (!('caches' in window)) return new Set();
  const cache = await caches.open(MATERIAL_CACHE);
  return new Set((await cache.keys()).map(r => r.url));
}

export async function loadMaterials(userId) {
  try {
    const res = await api.getMaterials();
    if (!res.success) throw new Error(res.message);
    write(userId, 'catalog', res.materials);
    await idbSaveCatalog(userId, res.materials);
    return res.materials;
  } catch (err) {
    if (navigator.onLine) throw err;
    const cached = await cachedMaterials();
    const catalog = (await idbGetCatalog(userId)) || read(userId, 'catalog', []);
    const downloadedOnly = catalog.filter(m => cached.has(materialUrl(m.storage_url)));
    return downloadedOnly.length > 0 ? downloadedOnly : catalog;
  }
}

export async function loadReadingLogs(userId) {
  let logs = read(userId, 'reading', []);
  if (navigator.onLine) {
    const res = await api.getReadLogs();
    if (!res.success) throw new Error(res.message);
    logs = res.logs || [];
    write(userId, 'reading', logs);
  }
  const outbox = await idbGetOutbox(userId);
  const localQueue = read(userId, 'read-queue', []);
  return [...logs, ...localQueue, ...outbox];
}

export async function syncReading(userId) {
  if (!navigator.onLine) return;
  const idbQueue = await idbGetOutbox(userId);
  const localQueue = read(userId, 'read-queue', []);
  const combinedMap = new Map();

  for (const item of [...localQueue, ...idbQueue]) {
    const idempKey = item.idempotency_key || `${userId}:${item.material_id}:${item.read_at}`;
    combinedMap.set(idempKey, {
      ...item,
      idempotency_key: idempKey,
      timestamp: item.timestamp || item.read_at || new Date().toISOString()
    });
  }

  const queue = Array.from(combinedMap.values()).sort((a, b) =>
    String(a.timestamp).localeCompare(String(b.timestamp))
  );

  if (!queue.length) return;

  emitSyncStatus({ state: 'syncing', count: queue.length, message: `Syncing ${queue.length} offline item(s)…` });
  try {
    const res = await api.syncOfflineReadLogs(queue);
    if (!res.success) throw new Error(res.message);
    const sent = new Set(queue.map(l => `${l.material_id}:${l.read_at}`));
    write(
      userId,
      'read-queue',
      read(userId, 'read-queue', []).filter(l => !sent.has(`${l.material_id}:${l.read_at}`))
    );
    await idbRemoveMutations(queue.map(l => l.idempotency_key));
    emitSyncStatus({
      state: 'synced',
      count: queue.length,
      message: `Saved ${queue.length} reading update(s).`
    });
  } catch (err) {
    emitSyncStatus({ state: 'error', count: queue.length, message: 'Offline changes will sync when your internet comes back.' });
    throw err;
  }
}

export async function markRead(userId, materialId) {
  const now = new Date().toISOString();
  const idempotencyKey = `${userId}:READ:${materialId}`;
  const log = {
    idempotency_key: idempotencyKey,
    user_id: userId,
    action: 'MARK_READ',
    material_id: materialId,
    read_at: now,
    timestamp: now
  };
  const logs = read(userId, 'reading', []).filter(l => l.material_id !== materialId);
  write(userId, 'reading', [...logs, log]);
  const queue = read(userId, 'read-queue', []).filter(l => l.material_id !== materialId);
  write(userId, 'read-queue', [...queue, log]);
  await idbEnqueueMutation(log);
  if (navigator.onLine) {
    await syncReading(userId);
  } else {
    emitSyncStatus({ state: 'queued', count: 1, message: 'Saved offline. Will sync when you are back online.' });
  }
}

export async function downloadMaterial(material) {
  if (!navigator.onLine) throw new Error('Connect to the internet to save this lesson.');
  if (!('caches' in window)) throw new Error('Offline downloads are not supported in this browser.');
  const url = materialUrl(material.storage_url);
  if (!url || new URL(url).origin !== window.location.origin) throw new Error('This file is on another website. Open it online or save it in your browser.');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not save this lesson. Please try again.');
  if (response.headers.get('content-type')?.includes('text/html')) throw new Error('This link opens a web page instead of a file. Ask your teacher for the direct file link.');
  const cache = await caches.open(MATERIAL_CACHE);
  await cache.put(url, response);
}

export async function removeDownload(material) {
  const cache = await caches.open(MATERIAL_CACHE);
  await cache.delete(materialUrl(material.storage_url));
}

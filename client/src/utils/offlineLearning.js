import { api } from '../services/api';
import { materialUrl } from './learning';
export const MATERIAL_CACHE = 'aralytics-materials-v3';
const key = (userId, type) => `aralytics:${type}:${userId}`;
function read(userId,type,fallback) { try { return JSON.parse(localStorage.getItem(key(userId,type))) || fallback; } catch { return fallback; } }
function write(userId,type,value) { localStorage.setItem(key(userId,type),JSON.stringify(value)); }
export async function cachedMaterials() {
  if (!('caches' in window)) return new Set();
  const cache = await caches.open(MATERIAL_CACHE);
  return new Set((await cache.keys()).map(r => r.url));
}
export async function loadMaterials(userId) {
  try { const res = await api.getMaterials(); if (!res.success) throw new Error(res.message); write(userId,'catalog',res.materials); return res.materials; }
  catch (err) {
    if (navigator.onLine) throw err;
    const cached = await cachedMaterials();
    return read(userId,'catalog',[]).filter(m => cached.has(materialUrl(m.storage_url)));
  }
}
export async function loadReadingLogs(userId) {
  let logs = read(userId,'reading',[]);
  if (navigator.onLine) { const res = await api.getReadLogs(); if (!res.success) throw new Error(res.message); logs = res.logs || []; write(userId,'reading',logs); }
  return [...logs,...read(userId,'read-queue',[])];
}
export async function syncReading(userId) {
  const queue = read(userId,'read-queue',[]);
  if (!navigator.onLine || !queue.length) return;
  const res = await api.syncOfflineReadLogs(queue);
  if (!res.success) throw new Error(res.message);
  // Preserve records added while the request was in flight.
  const sent = new Set(queue.map(l => `${l.material_id}:${l.read_at}`));
  write(userId,'read-queue',read(userId,'read-queue',[]).filter(l => !sent.has(`${l.material_id}:${l.read_at}`)));
}
export async function markRead(userId,materialId) {
  const log = { material_id: materialId, read_at: new Date().toISOString() };
  const logs = read(userId,'reading',[]).filter(l => l.material_id !== materialId); write(userId,'reading',[...logs,log]);
  const queue = read(userId,'read-queue',[]).filter(l => l.material_id !== materialId); write(userId,'read-queue',[...queue,log]);
  await syncReading(userId);
}
export async function downloadMaterial(material) {
  if (!navigator.onLine) throw new Error('Connect to the internet to download this lesson.');
  if (!('caches' in window)) throw new Error('Offline downloads are not supported in this browser.');
  const url = materialUrl(material.storage_url);
  if (!url || new URL(url).origin !== window.location.origin) throw new Error('This resource is hosted elsewhere. Open it online or save it using your browser.');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not download this resource. Please try again.');
  if (response.headers.get('content-type')?.includes('text/html')) throw new Error('The resource link returned a web page. Ask your teacher for the file link.');
  const cache = await caches.open(MATERIAL_CACHE);
  await cache.put(url,response);
}
export async function removeDownload(material) {
  const cache = await caches.open(MATERIAL_CACHE);
  await cache.delete(materialUrl(material.storage_url));
}

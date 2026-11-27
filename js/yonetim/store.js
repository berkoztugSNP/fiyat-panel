// Yönetim Paneli veri katmanı. Şu an veriler bu tarayıcıda (IndexedDB) saklanır; arayüz yalnızca bu dosyadaki
// işlevleri kullanır, böylece ileride ortak bir veritabanına (ör. Supabase) geçiş tek dosyada yapılır.
const DB_NAME = 'sina-yonetim', VERSION = 1;
export const STORES = ['orders', 'ads', 'expenses', 'meta', 'audit'];
let dbp = null;
const open = () => (dbp ??= new Promise((res, rej) => {
  const r = indexedDB.open(DB_NAME, VERSION);
  r.onupgradeneeded = () => { const db = r.result; for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, s === 'audit' ? { autoIncrement: true } : { keyPath: s === 'meta' ? 'k' : 'id' }); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
}));
const tx = async (stores, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(stores, mode); let out; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); out = fn(t); }); };
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// Bellek kopyası: hesaplamalar eşzamanlı ve tek kaynaktan yapılır
export const D = { orders: [], ads: [], expenses: [], meta: {}, ready: false, user: '' };
const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function init(user) {
  D.user = user;
  const db = await open();
  for (const s of ['orders', 'ads', 'expenses']) D[s] = await reqP(db.transaction(s).objectStore(s).getAll());
  D.meta = Object.fromEntries((await reqP(db.transaction('meta').objectStore('meta').getAll())).map((m) => [m.k, m.v]));
  D.ready = true;
}
// Kayıt ekle/güncelle. Değişen alanlar denetim kaydına yazılır (kim, ne zaman, ne).
export async function put(store, obj, note) {
  const list = D[store], i = list.findIndex((x) => x.id === obj.id), before = i >= 0 ? list[i] : null;
  const rec = { ...obj, updatedAt: new Date().toISOString(), updatedBy: D.user, createdAt: before?.createdAt ?? new Date().toISOString() };
  const changed = before ? Object.keys(rec).filter((k) => !['updatedAt', 'updatedBy'].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(rec[k])) : ['(yeni kayıt)'];
  if (before && !changed.length) return before;
  await tx([store, 'audit'], 'readwrite', (t) => { t.objectStore(store).put(rec); t.objectStore('audit').add({ at: rec.updatedAt, by: D.user, store, id: rec.id, changed, note: note ?? null }); });
  if (i >= 0) list[i] = rec; else list.push(rec);
  emit(); return rec;
}
export async function bulkPut(store, objs, note) {
  const now = new Date().toISOString(), map = new Map(D[store].map((x) => [x.id, x]));
  const recs = objs.map((o) => ({ ...o, updatedAt: now, updatedBy: D.user, createdAt: map.get(o.id)?.createdAt ?? now }));
  await tx([store, 'audit'], 'readwrite', (t) => { const os = t.objectStore(store); for (const r of recs) os.put(r); t.objectStore('audit').add({ at: now, by: D.user, store, id: null, changed: [`${recs.length} kayıt`], note: note ?? 'toplu işlem' }); });
  for (const r of recs) map.set(r.id, r);
  D[store] = [...map.values()]; emit();
}
export async function del(store, id, note) {
  await tx([store, 'audit'], 'readwrite', (t) => { t.objectStore(store).delete(id); t.objectStore('audit').add({ at: new Date().toISOString(), by: D.user, store, id, changed: ['(silindi)'], note: note ?? null }); });
  D[store] = D[store].filter((x) => x.id !== id); emit();
}
export async function setMeta(k, v) { await tx(['meta', 'audit'], 'readwrite', (t) => { t.objectStore('meta').put({ k, v }); t.objectStore('audit').add({ at: new Date().toISOString(), by: D.user, store: 'meta', id: k, changed: [k], note: null }); }); D.meta[k] = v; emit(); }
export async function auditLog(limit = 200) { const db = await open(); const all = await reqP(db.transaction('audit').objectStore('audit').getAll()); return all.slice(-limit).reverse(); }
// Yedek: tüm veriyi tek JSON dosyasına alır / dosyadan geri yükler
export async function exportAll() { return { app: 'sina-yonetim', version: VERSION, exportedAt: new Date().toISOString(), orders: D.orders, ads: D.ads, expenses: D.expenses, meta: D.meta }; }
export async function importAll(json) {
  if (json?.app !== 'sina-yonetim') throw new Error('Bu dosya bir Yönetim Paneli yedeği değil.');
  await tx(['orders', 'ads', 'expenses', 'meta', 'audit'], 'readwrite', (t) => {
    for (const s of ['orders', 'ads', 'expenses']) { const os = t.objectStore(s); os.clear(); for (const r of json[s] ?? []) os.put(r); }
    const m = t.objectStore('meta'); m.clear(); for (const [k, v] of Object.entries(json.meta ?? {})) m.put({ k, v });
    t.objectStore('audit').add({ at: new Date().toISOString(), by: D.user, store: '*', id: null, changed: ['yedekten geri yükleme'], note: json.exportedAt });
  });
  await init(D.user); emit();
}

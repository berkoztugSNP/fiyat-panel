// Müşteri Hizmetleri veri katmanı. Kayıtlar ortak bir Google E-Tablosunda tutulur (ekipteki herkes aynı kayıtları görür);
// tablo bağlı değilse yalnızca bu tarayıcıda (IndexedDB) saklanır. Arayüz yalnızca bu dosyadaki işlevleri kullanır.
export const COLS = ['id', 'date', 'customer', 'phone', 'type', 'channel', 'product', 'status', 'fee', 'feeAmount', 'note', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deleted'];
const HEAD = ['Kayıt no', 'Tarih', 'Müşteri', 'Telefon', 'Konu', 'Kanal', 'Ürün', 'Durum', 'Ücret', 'Ücret tutarı', 'Görüşme notu', 'Oluşturma', 'Oluşturan', 'Güncelleme', 'Güncelleyen', 'Silindi'];
export const M = { rows: [], ready: false, shared: false, error: null, at: null, user: '' };
const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
export const uid = () => 'K' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
let cfg = null;

/* ---------- Google E-Tabloları (hizmet hesabıyla) ---------- */
let tok = null, tokExp = 0;
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function token() {
  if (tok && Date.now() < tokExp) return tok;
  const k = cfg.key, now = Math.floor(Date.now() / 1000), enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const der = Uint8Array.from(atob(k.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const uri = k.token_uri || 'https://oauth2.googleapis.com/token';
  const head = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: uri, iat: now, exp: now + 3300 });
  const jwt = head + '.' + b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head)));
  const j = await (await fetch(uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) })).json();
  if (!j.access_token) throw new Error('Google oturumu açılamadı: ' + (j.error_description ?? j.error ?? 'bilinmeyen hata'));
  tok = j.access_token; tokExp = Date.now() + 50 * 60e3; return tok;
}
async function api(path, opt = {}) {
  const r = await fetch(`${cfg.api || 'https://sheets.googleapis.com'}/v4/spreadsheets/${cfg.sheetId}${path}`, { ...opt, headers: { authorization: 'Bearer ' + (await token()), 'content-type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 403 || r.status === 404 ? 'Kayıt tablosuna erişilemiyor. Tablonun hizmet hesabıyla "Düzenleyen" olarak paylaşıldığını kontrol edin.' : (j.error?.message ?? 'HTTP ' + r.status));
  return j;
}
const toRow = (r) => COLS.map((c) => r[c] ?? '');
const fromRow = (a) => Object.fromEntries(COLS.map((c, i) => [c, a[i] === '' || a[i] == null ? null : a[i]]));
const sheets = {
  async load() {
    const v = (await api('/values/A:P?valueRenderOption=UNFORMATTED_VALUE')).values ?? [];
    if (!v.length) { await api('/values/A1:P1?valueInputOption=RAW', { method: 'PUT', body: JSON.stringify({ values: [HEAD] }) }); return []; }
    return v.slice(1).map((a, i) => ({ ...fromRow(a), _row: i + 2 })).filter((r) => r.id);
  },
  async add(rec) { await api('/values/A:P:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { method: 'POST', body: JSON.stringify({ values: [toRow(rec)] }) }); },
  async update(rec) {
    // Satır numarası her seferinde kayıt numarasından yeniden bulunur (araya satır girmiş olabilir)
    const ids = ((await api('/values/A:A?valueRenderOption=UNFORMATTED_VALUE')).values ?? []).map((x) => x[0]), n = ids.indexOf(rec.id);
    if (n < 1) throw new Error('Kayıt tabloda bulunamadı; liste yenilenip tekrar denenmeli.');
    await api(`/values/A${n + 1}:P${n + 1}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [toRow(rec)] }) });
  },
};

/* ---------- Yalnızca bu tarayıcı (tablo bağlı değilken) ---------- */
let dbp = null;
const idb = () => (dbp ??= new Promise((res, rej) => { const r = indexedDB.open('sina-mh', 1); r.onupgradeneeded = () => r.result.createObjectStore('cases', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
const idbReq = (mode, fn) => idb().then((db) => new Promise((res, rej) => { const t = db.transaction('cases', mode), q = fn(t.objectStore('cases')); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }));
const local = { load: () => idbReq('readonly', (s) => s.getAll()), add: (rec) => idbReq('readwrite', (s) => s.put(rec)), update: (rec) => idbReq('readwrite', (s) => s.put(rec)) };

const be = () => (M.shared ? sheets : local);
export async function init(user, config) { M.user = user; cfg = config?.sheetId && config?.key ? config : null; M.shared = !!cfg; await reload(); }
let loading = null;
export function reload() {
  return (loading ??= (async () => {
    try { const rows = await be().load(); M.rows = rows.filter((r) => !r.deleted).map((r) => ({ ...r, phone: r.phone == null ? null : String(r.phone), customer: String(r.customer ?? '') })); M.error = null; M.at = new Date().toISOString(); }
    catch (e) { M.error = e.message || String(e); }
    M.ready = true; loading = null; emit();
  })());
}
export async function save(rec) {
  const now = new Date().toISOString(), old = rec.id ? M.rows.find((r) => r.id === rec.id) : null;
  const next = { ...(old ?? {}), ...rec, id: rec.id ?? uid(), createdAt: old?.createdAt ?? now, createdBy: old?.createdBy ?? M.user, updatedAt: now, updatedBy: M.user };
  delete next._row;
  if (old) await be().update(next); else await be().add(next);
  M.rows = old ? M.rows.map((r) => (r.id === next.id ? next : r)) : [...M.rows, next];
  emit(); return next;
}
export async function remove(id) { const r = M.rows.find((x) => x.id === id); if (!r) return; const next = { ...r, deleted: 1, updatedAt: new Date().toISOString(), updatedBy: M.user }; delete next._row; await be().update(next); M.rows = M.rows.filter((x) => x.id !== id); emit(); }

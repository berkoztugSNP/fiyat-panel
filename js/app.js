import { buildSegments, equivalents, versusRef, median, bucketLabel, CT_BUCKETS, segKey, norm, classify, compareNote, clarityRank, colorRank } from './core.js';
import { parseMerchantFeed } from './feed.js';
import { parseSavedPage } from './parse.js';
import { initShell, toast, openLayer, closeLayer, updateNav, setBadge, swapView, cssv, isDark } from './ui.js';
import * as YON from './yonetim/app.js';
const MANUAL = 'blue'; // ürünleri kayıtlı sayfalardan elle yüklenen marka

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tl = (n) => (n == null ? '—' : Math.round(n).toLocaleString('tr-TR') + ' TL');
const pct = (n, d = 1) => (n == null ? '—' : (n > 0 ? '+' : '') + n.toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: d }) + '%');
const dstr = (d) => { const [y, m, g] = d.split('-'); return `${g}.${m}.${y}`; };
const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M14 15.5h12l3 4-9 9.5-9-9.5zM11 19.5h18" fill="none" stroke="#b9b9bf" stroke-width="1.1" stroke-linejoin="round"/></svg>');
const img = (p, cls = '') => `<img class="${cls} fadein" src="${esc(p.img || PLACEHOLDER)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">`;

const S = { data: null, products: [], byId: new Map(), segments: null, ref: null, user: '', charts: [] };
const brand = (b) => S.data.brands[b];
const chip = (b) => `<span class="chip b-${b}">${esc(brand(b).short)}</span>`;
const SERIES = { sina: ['#ebbecb', '#c78a9d'], zen: ['#8e1b2a', '#8e1b2a'], blue: ['#1b2a5c', '#1b2a5c'], ddiamond: ['#e0a800', '#b98a00'], lizay: ['#c62828', '#c62828'], atasay: ['#d35400', '#d35400'] };

/* ---------- Giriş & şifre çözme ---------- */
async function unlock(user, pass) {
  const uj = await (await fetch('users.json?_=' + Date.now(), { cache: 'no-store' })).json();
  const u = user.trim().toLocaleLowerCase('tr-TR');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sina-panel:' + u)));
  const uid = btoa(String.fromCharCode(...hash)).slice(0, 22);
  const rec = uj.users.find((x) => x.uid === uid);
  if (!rec) throw new Error('auth');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const kek = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(rec.salt), iterations: uj.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let raw;
  try { raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(rec.iv), additionalData: new TextEncoder().encode(u) }, kek, b64d(rec.wk)); } catch { throw new Error('auth'); }
  return { key: btoa(String.fromCharCode(...new Uint8Array(raw))), v: uj.v, user: u };
}
async function loadData(keyB64) {
  const buf = new Uint8Array(await (await fetch('data.enc?_=' + Date.now(), { cache: 'no-store' })).arrayBuffer());
  const key = await crypto.subtle.importKey('raw', b64d(keyB64), 'AES-GCM', false, ['decrypt']);
  const gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
  const txt = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(txt);
}
function showLogin(msg) {
  $('#app').hidden = true; $('#login').hidden = false;
  const e = $('#loginErr'); e.hidden = !msg; e.textContent = msg ?? '';
  if (msg) { const c = $('.login-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); $('#lp').focus(); }
}
$('#pwEye').onclick = (e) => { const i = $('#lp'), show = i.type === 'password'; i.type = show ? 'text' : 'password'; e.target.textContent = show ? 'Gizle' : 'Göster'; e.target.setAttribute('aria-pressed', show); i.focus(); };
$('#loginForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = $('#loginBtn'); btn.disabled = true; btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true'); $('#loginErr').hidden = true;
  try {
    // Telefon klavyeleri sona boşluk ekleyebilir ya da görünmez karakter bırakabilir; şifreler kayıtta kırpıldığı için burada da kırpılır
    const pw = $('#lp').value.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\u2018\u2019]/g, "'").trim();
    const s = await unlock($('#lu').value.replace(/[\u200B-\u200D\uFEFF]/g, ''), pw);
    sessionStorage.setItem('sp_s', JSON.stringify(s));
    $('#lp').value = '';
    await start(s);
  } catch (e) {
    showLogin(e.message === 'auth' ? 'Kullanıcı adı veya şifre hatalı. Kontrol edip tekrar deneyin.' : 'Veriler yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
  } finally { btn.disabled = false; btn.classList.remove('busy'); btn.removeAttribute('aria-busy'); }
});
const logout = () => { sessionStorage.removeItem('sp_s'); location.hash = ''; location.reload(); };
$('#logout').addEventListener('click', logout);

async function start(s) {
  S.data = await loadData(s.key);
  S.user = s.user;
  S.localFeed = null;
  try {
    const lf = JSON.parse(localStorage.getItem('sp_feed') ?? 'null');
    const fb = Object.keys(S.data.brands).find((b) => S.data.brands[b].ref);
    if (lf && fb) { if (!S.data.brands[fb].feedAt || lf.uploadedAt > S.data.brands[fb].feedAt) applyFeed(fb, lf); else localStorage.removeItem('sp_feed'); }
  } catch {}
  S.localManual = 0;
  try {
    const lm = JSON.parse(localStorage.getItem('sp_manual') ?? 'null');
    if (lm?.items && S.data.brands[MANUAL]) {
      // sunucuda daha yeni kaydı olan ürünler yerel depodan düşer
      const srv = new Map(S.data.products.filter((p) => p.brand === MANUAL).map((p) => [p.code, p.capturedAt ?? '']));
      for (const [c, it] of Object.entries(lm.items)) if ((srv.get(c) ?? '') >= it.capturedAt) delete lm.items[c];
      const left = Object.values(lm.items);
      if (left.length) { applyManual(left); S.localManual = left.length; localStorage.setItem('sp_manual', JSON.stringify(lm)); } else localStorage.removeItem('sp_manual');
    }
  } catch {}
  reindex();
  const withData = Object.keys(S.data.brands).filter((b) => brand(b).count > 0);
  const natural = Object.keys(S.data.brands).find((b) => brand(b).ref);
  const saved = localStorage.getItem('sp_ref');
  S.ref = withData.includes(saved) ? saved : withData.includes(natural) ? natural : withData[0] ?? null;
  S.natural = natural;
  const sel = $('#refSel');
  sel.innerHTML = withData.map((b) => `<option value="${b}">${esc(brand(b).name)}</option>`).join('');
  sel.value = S.ref ?? '';
  sel.onchange = () => { S.ref = sel.value; localStorage.setItem('sp_ref', S.ref); S.evCache = null; route(); };
  $('#who').textContent = 'Oturum: ' + s.user; $('#whoM').textContent = 'Oturum: ' + s.user;
  $('#login').hidden = true; $('#app').hidden = false;
  initShell({
    logout, onTheme: () => { if (S.data) route(true); },
    pages: [...Object.entries(TITLES).map(([id, t]) => ({ id, title: t[0], icon: ICONS[id] })), ...Object.entries(YON.TITLES).map(([id, t]) => ({ id: 'y/' + id, title: 'Yönetim · ' + t[0], icon: 'i-wallet' }))],
    searchProducts: (q) => { const ws = q.split(' ').filter(Boolean); return S.products.filter((p) => ws.every((w) => (p._n ??= norm(p.name + ' ' + p.code)).includes(norm(w)))).slice(0, 8).map((p) => ({ id: p.id, title: p.name, meta: `${brand(p.brand).short} · ${tl(p.price)}`, thumb: img(p, 'thumb') })); },
    openProduct: (id) => openProduct(id),
  });
  $('#alertBtn').onclick = openAlerts; alertBadge();
  bindLogoHold();
  // Yönetim Paneli: aynı kabuğu kullanır, verisi ayrı tutulur
  await YON.init({ user: s.user, data: S.data.yonetim, publish: S.data.publish, toast, openLayer, cssv, openDrawer, closeDrawer, chart, resetCharts: () => { S.charts.forEach((c) => c.destroy()); S.charts = []; themeCharts(); }, afterImport: () => YON.route(location.hash.replace(/^#\/y\/?/, '')) });
  banners(); route();
}

function reindex() {
  S.products = S.data.products.filter((p) => p.active && p.price);
  S.byId = new Map(S.data.products.map((p) => [p.id, p]));
  S.segments = buildSegments(S.products);
  S.evCache = null;
}
// Yüklenen ürün beslemesini bellekteki veriye uygular (b: referans marka)
function applyFeed(b, feed) {
  const today = feed.uploadedAt.slice(0, 10), prev = new Map(S.data.products.filter((p) => p.brand === b).map((p) => [p.code, p]));
  const next = feed.products.map((p) => { const o = prev.get(p.code); return { id: `${b}:${p.code}`, brand: b, code: p.code, name: p.name, url: p.url, img: p.image, price: p.price, list: p.listPrice ?? null, stock: p.inStock, active: true, ayar: p.ayar, metalColor: p.metalColor, metal: p.metal, gram: p.gram, stones: p.stones, first: o?.first ?? today, last: today, hist: o?.hist, ...classify(p) }; });
  S.data.products = S.data.products.filter((p) => p.brand !== b).concat(next);
  Object.assign(S.data.brands[b], { count: next.length, status: 'ok', error: null, lastOk: today, source: 'xml', feedAt: feed.uploadedAt, feedBy: feed.by });
  S.localFeed = { at: feed.uploadedAt, published: !!feed.published };
}
// Yeni besleme ile mevcut veriyi kıyaslar
function feedDiff(b, products) {
  const prev = new Map(S.data.products.filter((p) => p.brand === b && p.active).map((p) => [p.code, p]));
  let changed = 0, added = 0; const codes = new Set();
  for (const p of products) { codes.add(p.code); const o = prev.get(p.code); if (!o) added++; else if (o.price !== p.price) changed++; }
  return { changed, added, removed: [...prev.keys()].filter((c) => !codes.has(c)).length, had: prev.size };
}
// Elle yüklenen ürünleri (kayıtlı sayfalardan okunan) bellekteki veriye işler
function applyManual(items) {
  const b = MANUAL, prev = new Map(S.data.products.filter((p) => p.brand === b).map((p) => [p.code, p]));
  for (const { capturedAt, ...p } of items) {
    const o = prev.get(p.code), day = (capturedAt ?? new Date().toISOString()).slice(0, 10);
    const hist = o && o.price !== p.price ? [...(o.hist ?? [[o.first, o.price]]), [day, p.price]] : o?.hist;
    prev.set(p.code, { id: `${b}:${p.code}`, brand: b, code: p.code, name: p.name, url: p.url, img: p.image, price: p.price, list: p.listPrice ?? null, stock: p.inStock, active: true, ayar: p.ayar, metalColor: p.metalColor, gram: p.gram, stones: p.stones, first: o?.first ?? day, last: day, hist, capturedAt, ...classify(p) });
  }
  S.data.products = S.data.products.filter((p) => p.brand !== b).concat([...prev.values()]);
  const act = [...prev.values()].filter((p) => p.active).length;
  Object.assign(S.data.brands[b], { count: act, status: 'ok', error: null, source: 'manual', lastOk: new Date().toISOString().slice(0, 10) });
}
async function ghFile(path) {
  const { repo, token, branch } = S.data.publish;
  const api = `https://api.github.com/repos/${repo}/contents/${path}`, h = { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json' };
  const cur = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: { ...h, accept: 'application/vnd.github.raw+json' } });
  const meta = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: h });
  return { api, h, branch, text: cur.ok ? await cur.text() : null, sha: meta.ok ? (await meta.json()).sha : undefined };
}
const b64utf8 = (text) => { const bytes = new TextEncoder().encode(text); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); };
async function publishManual(items, user) {
  const f = await ghFile('data/manual/blue.json');
  const doc = f.text ? JSON.parse(f.text) : { items: {} };
  for (const it of items) doc.items[it.code] = it;
  const r = await fetch(f.api, { method: 'PUT', headers: f.h, body: JSON.stringify({ message: `Blue Diamond: ${items.length} ürün sayfası yüklendi (${user})`, content: b64utf8(JSON.stringify(doc)), branch: f.branch, sha: f.sha }) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
}
async function publishFeed(text, user) {
  const { repo, token, branch } = S.data.publish, path = 'data/manual/sina.xml';
  const api = `https://api.github.com/repos/${repo}/contents/${path}`, h = { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json' };
  let sha; const cur = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: h }); if (cur.ok) sha = (await cur.json()).sha;
  const bytes = new TextEncoder().encode(text); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const r = await fetch(api, { method: 'PUT', headers: h, body: JSON.stringify({ message: `Sina XML yüklendi (${user})`, content: btoa(bin), branch, sha }) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
}

/* ---------- Fiyat uyarıları: biz ucuzken rakip fiyat düşürüp altımıza indi ---------- */
const alertList = () => [...(S.data.alerts ?? [])].sort((a, b) => (a.at < b.at ? 1 : -1));
function alertBadge() {
  const seen = localStorage.getItem('sp_alert_seen') ?? '';
  const n = alertList().filter((a) => a.at > seen).length, el = $('#alertBadge');
  el.hidden = !n; el.textContent = n > 99 ? '99+' : n;
  $('#alertBtn').setAttribute('aria-label', n ? `Fiyat uyarıları, ${n} yeni` : 'Fiyat uyarıları');
}
function openAlerts() {
  const list = alertList(), seen = localStorage.getItem('sp_alert_seen') ?? '';
  let html = '', day = '';
  for (const a of list.slice(0, 150)) {
    if (a.date !== day) { day = a.date; html += `<div class="al-day">${dstr(day)}</div>`; }
    const sp = S.byId.get(a.sina.id), cp = S.byId.get(a.comp.id);
    const still = sp?.active && cp?.active && cp.price < sp.price;
    const nowTxt = !sp?.active || !cp?.active ? '<span class="verdict eq">Ürün artık listede yok</span>' : still ? `<span class="verdict risk">Hâlâ bizden ${pct(Math.abs((cp.price / sp.price - 1) * 100)).replace('+', '')} ucuz</span>` : '<span class="verdict good">Artık altımızda değil</span>';
    html += `<div class="al${a.at > seen ? ' new' : ''}" data-pid="${esc(a.sina.id)}" tabindex="0" role="button">${img(sp ?? { img: null }, 'thumb')}<div>
      <div class="al-t">${esc(a.sina.name)}</div>
      <div class="al-c">${chip(a.comp.brand)} ${esc(a.comp.name)}<br>Rakip: <s>${tl(a.comp.old)}</s> → <b>${tl(a.comp.price)}</b> · Biz: <b>${tl(a.sina.price)}</b></div>
      <div class="al-m">${nowTxt}<span>${esc(a.spec ?? '')}</span></div></div></div>`;
  }
  $('#alertsBody').innerHTML = html || `<div class="empty"><b>Henüz uyarı yok</b>Rakipten ucuz olduğumuz bir üründe rakip fiyat düşürüp altımıza inerse burada görünür ve e-posta gönderilir.</div>`;
  openLayer($('#alerts'), { focus: $('#alerts .icon-btn') });
  if (list[0]) { localStorage.setItem('sp_alert_seen', list[0].at); alertBadge(); }
}

function banners() {
  const out = [];
  for (const [b, i] of Object.entries(S.data.brands)) {
    if (i.status === 'blocked') out.push(`<div class="banner"><b>${esc(i.name)} verisi alınamıyor.</b> Site, otomatik erişimi bot korumasıyla engelliyor${i.lastOk ? ` (son başarılı güncelleme: ${dstr(i.lastOk)})` : ' ve henüz hiç veri alınamadı'}. Çözüm adımları için <a href="#/durum">Veri Durumu</a> sayfasına bakın.</div>`);
    else if (i.status === 'error') out.push(`<div class="banner"><b>${esc(i.name)} son güncellemede hata verdi:</b> ${esc(i.error)}. ${i.lastOk ? 'Gösterilen veriler ' + dstr(i.lastOk) + ' tarihlidir.' : ''}</div>`);
  }
  if (S.natural && S.ref && S.ref !== S.natural && !(brand(S.natural).count > 0)) out.push(`<div class="banner">${esc(brand(S.natural).name)} ürün verisi gelene kadar karşılaştırmalar geçici olarak <b>${esc(brand(S.ref).name)}</b> referans alınarak gösteriliyor. Referansı sağ üstten değiştirebilirsiniz.</div>`);
  if (S.localManual) out.push(`<div class="banner">${esc(brand(MANUAL).name)} için yüklediğiniz ${S.localManual} ürün şimdilik yalnızca bu tarayıcıda görünüyor.</div>`);
  const nb = S.natural && brand(S.natural);
  if (S.localFeed && !S.localFeed.published) out.push(`<div class="banner">${esc(nb.name)} verisi bu tarayıcıda yüklediğiniz XML'den geliyor (${new Date(S.localFeed.at).toLocaleString('tr-TR')}). Diğer kullanıcılar bunu henüz görmüyor.</div>`);
  else if (S.localFeed) out.push(`<div class="banner">Yüklediğiniz XML yayınlandı; diğer kullanıcılara birkaç dakika içinde yansır.</div>`);
  if (nb?.feedAt && (Date.now() - new Date(nb.feedAt)) / 864e5 > 7) out.push(`<div class="banner"><b>${esc(nb.name)} XML'i ${Math.floor((Date.now() - new Date(nb.feedAt)) / 864e5)} gündür güncellenmedi.</b> Karşılaştırmalar eski fiyatlarımıza göre yapılıyor olabilir. <a href="#/durum">Yeni XML yükleyin</a>.</div>`);
  if (nb && nb.source !== 'xml' && nb.count === 0 && nb.status !== 'blocked') out.push(`<div class="banner"><b>${esc(nb.name)} ürün verisi yok.</b> <a href="#/durum">Veri Durumu</a> sayfasından ürün XML'ini yükleyin.</div>`);
  $('#banners').innerHTML = out.join('');
}

/* ---------- Analiz yardımcıları ---------- */
const refName = () => (S.ref ? brand(S.ref).short : '');
// Rakip fiyatının referansa göre konumu
function posHtml(v) {
  if (!v) return '<span class="pos eq">Muadil yok</span>';
  const d = v.diffPct;
  if (Math.abs(d) < 1) return `<span class="pos eq">≈ Bizimle aynı seviyede</span>`;
  return d < 0 ? `<span class="pos cheap">▼ Bizden ${pct(Math.abs(d)).replace('+', '')} ucuz</span>` : `<span class="pos exp">▲ Bizden ${pct(d).replace('+', '')} pahalı</span>`;
}
function events() {
  if (S.evCache) return S.evCache;
  S.evCache = S.data.events.map((e) => {
    const p = S.byId.get(e.id);
    const v = p && p.active && e.type !== 'removed' ? versusRef(p, S.ref, S.segments) : null;
    let cross = null;
    if (v && e.type === 'price') { const was = e.old / v.refMed - 1, is = e.price / v.refMed - 1; if (was >= 0 && is < 0) cross = 'under'; else if (was <= 0 && is > 0) cross = 'over'; }
    return { ...e, p, v, cross };
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0)));
  return S.evCache;
}
const EV_LABEL = { price: 'Fiyat değişti', new: 'Yeni ürün', removed: 'Satıştan kalktı', back: 'Yeniden satışta', instock: 'Stoğa girdi', outofstock: 'Stok tükendi' };
function evRow(e) {
  const p = e.p ?? { name: e.name, brand: e.brand };
  let right = '';
  if (e.type === 'price') right = `<div class="num"><s class="muted">${tl(e.old)}</s> → <b>${tl(e.price)}</b></div><div class="chg ${e.pct > 0 ? 'up' : 'down'} num">${e.pct > 0 ? '▲ Zam' : '▼ İndirim'} ${pct(e.pct)}</div>`;
  else right = `<div class="num"><b>${tl(e.price)}</b></div>`;
  const cross = e.cross === 'under' ? ` · <b class="pos cheap">Fiyatımızın altına indi</b>` : e.cross === 'over' ? ` · <b class="pos exp">Fiyatımızın üstüne çıktı</b>` : '';
  return `<div class="ev" data-pid="${esc(e.id)}" tabindex="0" role="button">${img(p, 'thumb')}
    <div><div class="ev-t">${chip(e.brand)} ${esc(EV_LABEL[e.type] ?? e.type)} · ${esc(e.name)}</div>
    <div class="small muted">${e.brand === S.ref ? 'Kendi ürünümüz' : posHtml(e.v)}${cross}</div></div>
    <div class="ev-r">${right}</div></div>`;
}
function specLine(p) {
  return [p.ct != null ? p.ct.toLocaleString('tr-TR') + ' ct' : null, p.color, p.clarity, p.ayar ? p.ayar + ' ayar' : null, p.metalColor ? p.metalColor + ' altın' : null].filter(Boolean).join(' · ');
}
function pcard(p, extra = '') {
  return `<button class="pcard" data-pid="${esc(p.id)}"><div class="pimg">${img(p)}${chip(p.brand)}</div><div class="pbody">
    <div class="pname">${esc(p.name)}</div><div class="pspec">${esc(specLine(p)) || '&nbsp;'}</div>${extra}
    <div class="pprice num">${tl(p.price)}${p.list ? `<s>${tl(p.list)}</s>` : ''}</div></div></button>`;
}
// Segment bazında referans–rakip farkı
function segRows() {
  const rows = [];
  for (const s of S.segments.values()) {
    const r = { s, diff: {} };
    const ref = s.stats[S.ref];
    for (const b of Object.keys(S.data.brands)) if (b !== S.ref && s.stats[b] && ref) r.diff[b] = (s.stats[b].med / ref.med - 1) * 100;
    const ds = Object.values(r.diff);
    r.avg = ds.length ? ds.reduce((a, c) => a + c, 0) / ds.length : null;
    r.brands = Object.keys(s.stats).length;
    rows.push(r);
  }
  return rows;
}

/* ---------- Grafikler ---------- */
function chart(el, cfg) {
  const c = new Chart(el, cfg); S.charts.push(c); return c;
}
Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
function themeCharts() {
  Chart.defaults.color = cssv('--text-2'); Chart.defaults.borderColor = cssv('--hairline');
  Object.assign(Chart.defaults.plugins.tooltip, { backgroundColor: isDark() ? '#2a2a2f' : '#1d1d1f', titleColor: '#fff', bodyColor: '#fff', padding: 11, cornerRadius: 11, boxPadding: 5, usePointStyle: true, titleFont: { weight: '600' }, displayColors: true });
  Chart.defaults.font.size = 12;
}
Chart.defaults.plugins.legend.display = false;
const legend = (bs) => `<div class="legend">${bs.map((b) => `<span><i class="dot" style="background:${SERIES[b][0]}"></i>${esc(brand(b).name)}</span>`).join('')}</div>`;
const dsFor = (b, data, type = 'bar') => ({ label: brand(b).name, data, backgroundColor: SERIES[b][0], borderColor: SERIES[b][1], borderWidth: type === 'bar' ? 1 : 2, borderRadius: 6, borderSkipped: false, pointRadius: 3.5, pointHoverRadius: 6, pointBackgroundColor: SERIES[b][0], pointBorderColor: SERIES[b][1], tension: 0.25, spanGaps: true, maxBarThickness: 26 });
const moneyAxis = { ticks: { callback: (v) => (v >= 1000 ? (v / 1000).toLocaleString('tr-TR') + ' B' : v) }, grid: { color: () => cssv('--hairline') }, border: { display: false }, title: { display: true, text: 'Medyan fiyat (TL)' } };
const tipCfg = { mode: 'index', intersect: false, callbacks: { label: (c) => ` ${c.dataset.label}: ${tl(c.parsed.y)}${c.dataset.ns?.[c.dataIndex] ? ' · ' + c.dataset.ns[c.dataIndex] + ' ürün' : ''}` } };

/* ---------- Sayfalar ---------- */
const brandsWithData = () => Object.keys(S.data.brands).filter((b) => brand(b).count > 0);
const uniq = (a) => [...new Set(a)];
const opt = (list, cur, all) => (all ? `<option value="">${all}</option>` : '') + list.map((x) => `<option value="${esc(x)}"${String(x) === String(cur) ? ' selected' : ''}>${esc(x)}</option>`).join('');

const pages = {
  genel(view) {
    const bs = brandsWithData(), evs = events();
    const lastDate = S.data.runs.at(-1)?.date;
    const todayEv = evs.filter((e) => e.date === lastDate && e.type === 'price');
    const up = todayEv.filter((e) => e.pct > 0).length, down = todayEv.length - up;
    const week = evs.filter((e) => e.type === 'price' && (new Date(lastDate) - new Date(e.date)) / 864e5 < 7);
    const rows = segRows().filter((r) => r.avg != null);
    const cheaper = rows.filter((r) => r.avg > 1).length, pricier = rows.filter((r) => r.avg < -1).length;
    const avgPos = rows.length ? median(rows.map((r) => r.avg)) : null;
    const cats = uniq(S.products.map((p) => p.cat));
    const catCount = (c) => S.products.filter((p) => p.cat === c).length;
    cats.sort((a, b) => catCount(b) - catCount(a));
    const topCats = cats.filter((c) => c !== 'Diğer').slice(0, 7);
    view.innerHTML = `
    <div class="grid g4">
      <div class="card kpi"><div class="l">Takip edilen ürün</div><div class="v num">${S.products.length.toLocaleString('tr-TR')}</div><div class="s">${bs.map((b) => `${esc(brand(b).short)} ${brand(b).count.toLocaleString('tr-TR')}`).join(' · ')}</div></div>
      <div class="card kpi"><div class="l">Son güncellemede fiyat değişimi</div><div class="v num">${todayEv.length.toLocaleString('tr-TR')}</div><div class="s">${todayEv.length ? `<span class="chg up">▲ ${up} zam</span> · <span class="chg down">▼ ${down} indirim</span>` : lastDate ? dstr(lastDate) + ' taramasında değişiklik yok' : ''}</div></div>
      <div class="card kpi"><div class="l">Son 7 günde fiyat değişimi</div><div class="v num">${week.length.toLocaleString('tr-TR')}</div><div class="s">${week.length ? 'Ortalama değişim ' + pct(week.reduce((a, e) => a + e.pct, 0) / week.length) : 'Karşılaştırma için en az iki günlük veri gerekir'}</div></div>
      <div class="card kpi"><div class="l">${esc(refName())} pazar konumu</div><div class="v num">${avgPos == null ? '—' : pct(avgPos)}</div><div class="s">${rows.length ? `Rakipler ortak ${rows.length} segmentte medyan olarak bizden ${avgPos >= 0 ? 'pahalı' : 'ucuz'} · ${cheaper} segmentte biz ucuz, ${pricier} segmentte biz pahalıyız` : 'Ortak segment bulunamadı'}</div></div>
    </div>
    <div class="grid g2">
      <div class="card"><div class="card-head"><div><h2>Kategoriye göre medyan fiyat</h2><p class="muted small">Her markanın o kategorideki aktif ürünlerinin medyan satış fiyatı</p></div>${legend(bs)}</div><div class="chart-box"><canvas id="c1" role="img" aria-label="Kategoriye göre medyan fiyat grafiği"></canvas></div></div>
      <div class="card"><div class="card-head"><div><h2>Karata göre fiyat eğrisi</h2><p class="muted small">Aynı ürün grubunda karat aralığı başına medyan fiyat</p></div>
        <div class="filters"><div><label for="g_cat">Kategori</label><select id="g_cat">${opt(topCats, 'Yüzük')}</select></div><div><label for="g_model">Model</label><select id="g_model"></select></div></div></div>
        <div class="chart-box"><canvas id="c2" role="img" aria-label="Karata göre medyan fiyat grafiği"></canvas></div><div style="margin-top:8px">${legend(bs)}</div></div>
    </div>
    <div class="grid g2">
      <div class="card"><div class="card-head"><div><h2>Son bildirimler</h2><p class="muted small">Rakip fiyat hareketleri ve bize göre konumları</p></div><a class="btn small" href="#/bildirimler">Tümünü gör</a></div>
        <div class="feed">${evs.slice(0, 7).map(evRow).join('') || `<div class="empty"><b>Henüz fiyat hareketi yok</b>İlk tarama ${lastDate ? dstr(lastDate) : ''} tarihinde yapıldı. Değişimler bir sonraki günlük güncellemeden itibaren burada listelenir.</div>`}</div></div>
      <div class="card"><div class="card-head"><div><h2>En büyük fiyat farkları</h2><p class="muted small">${esc(refName())} medyanına göre rakiplerin en çok ayrıştığı segmentler (en az 3'er ürün)</p></div><a class="btn small" href="#/kiyas">Model kıyaslama</a></div>
        <div id="gaps"></div></div>
    </div>`;
    chart($('#c1'), { type: 'bar', data: { labels: topCats, datasets: bs.map((b) => { const lists = topCats.map((c) => S.products.filter((p) => p.brand === b && p.cat === c).map((p) => p.price)); return { ...dsFor(b, lists.map((l) => median(l))), ns: lists.map((l) => l.length) }; }) }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { tooltip: tipCfg }, scales: { y: moneyAxis, x: { grid: { display: false } } } } });
    let c2;
    const drawCurve = () => {
      const cat = $('#g_cat').value;
      const models = uniq(S.products.filter((p) => p.cat === cat).map((p) => p.model));
      const cnt = (m) => S.products.filter((p) => p.cat === cat && p.model === m && p.gem === 'Pırlanta' && p.ct != null).length;
      models.sort((a, b) => cnt(b) - cnt(a));
      const ms = $('#g_model'); const cur = models.includes(ms.value) ? ms.value : models.includes('Tektaş') ? 'Tektaş' : models[0];
      ms.innerHTML = opt(models, cur);
      const lists = (b) => CT_BUCKETS.map((_, i) => S.products.filter((p) => p.brand === b && p.cat === cat && p.model === cur && p.gem === 'Pırlanta' && p.bucket === i).map((p) => p.price));
      const all = bs.map((b) => lists(b));
      const keep = CT_BUCKETS.map((_, i) => all.some((l) => l[i].length));
      const idx = keep.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
      c2?.destroy();
      c2 = chart($('#c2'), { type: 'line', data: { labels: idx.map((i) => CT_BUCKETS[i][2].replace(' ct', '')), datasets: bs.map((b, k) => ({ ...dsFor(b, idx.map((i) => median(all[k][i])), 'line'), ns: idx.map((i) => all[k][i].length) })) }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { tooltip: tipCfg }, scales: { y: moneyAxis, x: { grid: { display: false }, title: { display: true, text: 'Pırlanta karatı (ct)' } } } } });
    };
    $('#g_cat').onchange = drawCurve; $('#g_model').onchange = drawCurve; drawCurve();
    const gaps = rows.filter((r) => r.s.cat !== 'Diğer' && Object.values(r.s.stats).every((x) => x.n >= 3)).sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg)).slice(0, 7);
    $('#gaps').innerHTML = gaps.length ? `<div class="tbl-wrap"><table><thead><tr><th>Segment</th><th class="r">${esc(refName())} medyan</th><th class="r">Rakip farkı</th></tr></thead><tbody>${gaps.map((r) => `<tr class="click" data-seg="${esc(r.s.key)}"><td>${esc(r.s.label)}</td><td class="r num">${tl(r.s.stats[S.ref].med)}</td><td class="r">${Object.entries(r.diff).map(([b, d]) => `<div class="num">${chip(b)} <span class="pos ${d < 0 ? 'cheap' : 'exp'}">${pct(d)}</span></div>`).join('')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><b>Karşılaştırılabilir segment yok</b>Referans marka ile rakiplerin ortak ürün grubu bulunamadı.</div>';
  },

  bildirimler(view) {
    const evs = events();
    const last = evs[0]?.date; if (last) { localStorage.setItem('sp_seen', last); badge(); }
    const f = (S.f_ev ??= { brand: '', type: '', pos: '', days: '30' });
    view.innerHTML = `<div class="card"><div class="filters">
      <div><label for="e_b">Marka</label><select id="e_b">${`<option value="">Tüm markalar</option>` + Object.keys(S.data.brands).map((b) => `<option value="${b}"${f.brand === b ? ' selected' : ''}>${esc(brand(b).name)}</option>`).join('')}</select></div>
      <div><label for="e_t">Olay türü</label><select id="e_t"><option value="">Tüm olaylar</option>${Object.entries(EV_LABEL).map(([k, v]) => `<option value="${k}"${f.type === k ? ' selected' : ''}>${v}</option>`).join('')}<option value="zam"${f.type === 'zam' ? ' selected' : ''}>Yalnızca zamlar</option><option value="ind"${f.type === 'ind' ? ' selected' : ''}>Yalnızca indirimler</option></select></div>
      <div><label for="e_p">Bize göre konum</label><select id="e_p"><option value="">Hepsi</option><option value="cheap"${f.pos === 'cheap' ? ' selected' : ''}>Bizden ucuz</option><option value="exp"${f.pos === 'exp' ? ' selected' : ''}>Bizden pahalı</option><option value="cross"${f.pos === 'cross' ? ' selected' : ''}>Fiyatımızı geçenler</option></select></div>
      <div><label for="e_d">Dönem</label><select id="e_d">${[['1', 'Son güncelleme'], ['7', 'Son 7 gün'], ['30', 'Son 30 gün'], ['180', 'Son 6 ay']].map(([k, v]) => `<option value="${k}"${f.days === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
    </div></div><div class="card" id="evList"></div>`;
    const draw = () => {
      Object.assign(f, { brand: $('#e_b').value, type: $('#e_t').value, pos: $('#e_p').value, days: $('#e_d').value });
      const lastDate = S.data.runs.at(-1)?.date ?? last;
      const list = evs.filter((e) => (!f.brand || e.brand === f.brand)
        && (!f.type || e.type === f.type || (f.type === 'zam' && e.type === 'price' && e.pct > 0) || (f.type === 'ind' && e.type === 'price' && e.pct < 0))
        && (!f.pos || (f.pos === 'cross' ? e.cross : e.v && (f.pos === 'cheap' ? e.v.diffPct < -1 : e.v.diffPct > 1)))
        && (f.days === '1' ? e.date === lastDate : (new Date(lastDate) - new Date(e.date)) / 864e5 < +f.days));
      let html = '', day = '';
      for (const e of list.slice(0, 400)) { if (e.date !== day) { day = e.date; html += `<div class="day">${dstr(day)}</div>`; } html += evRow(e); }
      $('#evList').innerHTML = list.length ? `<div class="small muted">${list.length.toLocaleString('tr-TR')} bildirim${list.length > 400 ? ' · ilk 400 gösteriliyor' : ''}</div><div class="feed">${html}</div>` : `<div class="empty"><b>${evs.length ? 'Bu filtrelere uyan bildirim yok' : 'Henüz bildirim yok'}</b>${evs.length ? 'Filtreleri genişletmeyi deneyin.' : 'Rakip fiyatları her gün taranır; bir fiyat değiştiğinde, yeni ürün eklendiğinde veya ürün kalktığında burada görünür.'}</div>`;
    };
    view.querySelectorAll('select').forEach((s) => (s.onchange = draw)); draw();
  },

  kiyas(view) {
    const f = (S.f_k ??= { q: '', cat: '', model: '', bucket: '', ayar: '', exact: '1', tone: '', sort: 'gap', page: 0 });
    const mine = S.products.filter((p) => p.brand === S.ref && p.ct != null); // karatı bilinmeyen ürünler emsal kıyasına girmez
    view.innerHTML = `<div class="card"><div class="filters">
      <div style="flex:1;min-width:180px"><label for="k_q">Ürün adı veya kodu</label><input id="k_q" type="search" value="${esc(f.q)}" placeholder="ör. tektaş, SP05498"></div>
      <div><label for="k_c">Kategori</label><select id="k_c">${opt(uniq(mine.map((p) => p.cat)).sort(), f.cat, 'Tümü')}</select></div>
      <div><label for="k_m">Model</label><select id="k_m">${opt(uniq(mine.map((p) => p.model)).sort(), f.model, 'Tümü')}</select></div>
      <div><label for="k_k">Karat</label><select id="k_k"><option value="">Tümü</option>${CT_BUCKETS.map((b, i) => `<option value="${i}"${f.bucket === String(i) ? ' selected' : ''}>${b[2]}</option>`).join('')}</select></div>
      <div><label for="k_a">Ayar</label><select id="k_a">${opt(uniq(mine.map((p) => p.ayar).filter(Boolean)).sort(), f.ayar, 'Tümü')}</select></div>
      <div><label for="k_e">Karat eşleşmesi</label><select id="k_e"><option value="1"${f.exact === '1' ? ' selected' : ''}>Birebir aynı karat</option><option value="0"${f.exact === '0' ? ' selected' : ''}>Yakın karat (±%12)</option></select></div>
      <div><label for="k_t">Sonuç</label><select id="k_t"><option value="">Hepsi</option><option value="risk"${f.tone === 'risk' ? ' selected' : ''}>Rakip avantajlı</option><option value="good"${f.tone === 'good' ? ' selected' : ''}>Biz avantajlıyız</option><option value="eq"${f.tone === 'eq' ? ' selected' : ''}>Dengeli</option></select></div>
      <div><label for="k_s">Sıralama</label><select id="k_s"><option value="gap"${f.sort === 'gap' ? ' selected' : ''}>En ucuz rakibe göre fark</option><option value="price"${f.sort === 'price' ? ' selected' : ''}>Bizim fiyat (yüksekten)</option><option value="ct"${f.sort === 'ct' ? ' selected' : ''}>Karat (büyükten)</option></select></div>
    </div><p class="small muted" style="margin:10px 0 0">Her ${esc(refName())} ürünü, rakiplerde <b>aynı karat, aynı model, aynı kategori ve aynı ayardaki</b> emsal ürünlerle eşleştirilir; taş rengi, berraklık, gram ve fiyat yan yana gösterilir. Tabloda farklı olan özellikler işaretlenir: <span class="diffcell b">yeşil</span> rakipte daha düşük, <span class="diffcell w">kırmızı</span> rakipte daha yüksek özellik. Yorum, fiyat farkını bu özelliklerle birlikte okur.</p></div><div id="kOut"></div>`;
    let cache = null, cacheKey = '';
    const draw = (keep) => {
      Object.assign(f, { q: $('#k_q').value, cat: $('#k_c').value, model: $('#k_m').value, bucket: $('#k_k').value, ayar: $('#k_a').value, exact: $('#k_e').value, tone: $('#k_t').value, sort: $('#k_s').value });
      if (!keep) f.page = 0;
      const ck = f.exact + S.ref;
      if (cacheKey !== ck) { cache = mine.map((p) => ({ p, eq: equivalents(p, S.segments, 2, f.exact === '1').map((e) => ({ ...e, n: compareNote(p, e.p) })).sort((a, b) => a.p.price - b.p.price) })).filter((r) => r.eq.length); cacheKey = ck; }
      const q = norm(f.q).split(' ').filter(Boolean);
      let rows = cache.filter(({ p }) => (!f.cat || p.cat === f.cat) && (!f.model || p.model === f.model) && (f.bucket === '' || p.bucket === +f.bucket) && (!f.ayar || String(p.ayar) === f.ayar) && (!q.length || q.every((w) => (p._n ??= norm(p.name + ' ' + p.code)).includes(w))));
      if (f.tone) rows = rows.map((r) => ({ ...r, eq: r.eq.filter((e) => e.n.tone === f.tone) })).filter((r) => r.eq.length);
      rows.sort({ gap: (a, b) => a.eq[0].n.diffPct - b.eq[0].n.diffPct, price: (a, b) => b.p.price - a.p.price, ct: (a, b) => (b.p.ct ?? 0) - (a.p.ct ?? 0) }[f.sort]);
      const all = rows.flatMap((r) => r.eq), cnt = (t) => all.filter((e) => e.n.tone === t).length;
      const N = 20, pages = Math.ceil(rows.length / N);
      const cell = (mineV, otherV, rank, fmtv = (x) => x) => { if (otherV == null || otherV === '') return '<span class="muted">—</span>'; const a = rank(mineV), b = rank(otherV); const cls = a == null || b == null || Math.abs(b - a) < 1e-9 ? '' : b > a ? ' w' : ' b'; return `<span class="${cls ? 'diffcell' + cls : ''}">${esc(fmtv(otherV))}</span>`; };
      const numRank = (x) => (x == null ? null : +x);
      $('#kOut').innerHTML = rows.length ? `<div class="grid g4" style="margin-bottom:16px">
          <div class="card kpi"><div class="l">Muadili bulunan ürünümüz</div><div class="v num">${rows.length.toLocaleString('tr-TR')}</div><div class="s">${all.length.toLocaleString('tr-TR')} rakip eşleşmesi</div></div>
          <div class="card kpi"><div class="l">Rakip avantajlı</div><div class="v num" style="color:var(--up)">${cnt('risk').toLocaleString('tr-TR')}</div><div class="s">Rakip ucuz ve özellikleri benzer ya da daha yüksek</div></div>
          <div class="card kpi"><div class="l">Biz avantajlıyız</div><div class="v num" style="color:var(--down)">${cnt('good').toLocaleString('tr-TR')}</div><div class="s">Biz ucuzuz ya da özelliklerimiz daha yüksek</div></div>
          <div class="card kpi"><div class="l">Dengeli</div><div class="v num">${cnt('eq').toLocaleString('tr-TR')}</div><div class="s">Fiyat farkı özelliklerle açıklanıyor</div></div></div>
        <div style="display:flex;flex-direction:column;gap:14px">${rows.slice(f.page * N, f.page * N + N).map(({ p, eq }) => `<div class="cmp">
          <div class="cmp-head" data-pid="${esc(p.id)}" tabindex="0" role="button">${img(p, 'thumb')}<div><div class="t">${esc(p.name)}</div><div class="small muted">${chip(p.brand)} ${esc(p.code)} · ${p.ct != null ? p.ct.toLocaleString('tr-TR') + ' ct' : '—'} · ${esc(p.color ?? '—')} / ${esc(p.clarity ?? '—')} · ${p.ayar ? p.ayar + ' ayar' : '—'} · ${p.gram ? p.gram.toLocaleString('tr-TR') + ' gr' : 'gram belirtilmemiş'}</div></div><div class="p num">${tl(p.price)}</div></div>
          <div class="krows">${eq.map(({ p: o, n }) => `<div class="krow" data-pid="${esc(o.id)}" tabindex="0" role="button">${img(o, 'thumb')}<div class="kr-main">
            <div class="kr-top">${chip(o.brand)}<b class="num">${tl(o.price)}</b><span class="num pos ${Math.abs(n.diffPct) < 1 ? 'eq' : n.diffPct < 0 ? 'cheap' : 'exp'}">${n.diffPct < -1 ? '▼ ' : n.diffPct > 1 ? '▲ ' : ''}${pct(n.diffPct)}</span></div>
            <div class="kr-name">${esc(o.name)}</div>
            <div class="kr-spec num"><span>${cell(p.ct, o.ct, numRank, (x) => x.toLocaleString('tr-TR') + ' ct')}</span><span>${o.color ? cell(p.color, o.color, colorRank) : '<i>renk —</i>'}</span><span>${o.clarity ? cell(p.clarity, o.clarity, clarityRank) : '<i>berraklık —</i>'}</span><span>${o.gram ? cell(p.gram, o.gram, numRank, (x) => x.toLocaleString('tr-TR') + ' gr') : '<i>gram —</i>'}</span></div>
            <div class="kr-verdict ${n.tone}">${esc(n.verdict)}</div>${n.notes.length ? `<div class="kr-notes">${n.notes.map(esc).join(' · ')}</div>` : ''}</div></div>`).join('')}</div>
          <div class="tbl-wrap"><table><thead><tr><th></th><th>Rakip ürün</th><th class="r">Karat</th><th>Renk</th><th>Berraklık</th><th class="r">Gram</th><th class="r">Fiyat</th><th class="r">Fark</th><th>Yorum</th></tr></thead><tbody>${eq.map(({ p: o, n }) => `<tr class="click" data-pid="${esc(o.id)}" tabindex="0"><td>${img(o, 'thumb')}</td><td>${chip(o.brand)} ${esc(o.name)}</td>
            <td class="r num">${cell(p.ct, o.ct, numRank, (x) => x.toLocaleString('tr-TR'))}</td><td>${cell(p.color, o.color, colorRank)}</td><td>${cell(p.clarity, o.clarity, clarityRank)}</td><td class="r num">${o.gram ? cell(p.gram, o.gram, numRank, (x) => x.toLocaleString('tr-TR') + ' gr') : '<span class="muted">Belirtilmemiş</span>'}</td>
            <td class="r num"><b>${tl(o.price)}</b></td><td class="r num"><span class="pos ${Math.abs(n.diffPct) < 1 ? 'eq' : n.diffPct < 0 ? 'cheap' : 'exp'}">${n.diffPct < -1 ? '▼ ' : n.diffPct > 1 ? '▲ ' : ''}${pct(n.diffPct)}</span></td>
            <td style="min-width:220px"><span class="verdict ${n.tone}">${esc(n.verdict)}</span>${n.notes.length ? `<ul class="notes">${n.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`).join('')}</div>
        ${pages > 1 ? `<div class="pager"><button class="btn small" id="kp"${f.page === 0 ? ' disabled' : ''}>← Önceki</button><span class="small muted">Sayfa ${f.page + 1} / ${pages}</span><button class="btn small" id="kn"${f.page >= pages - 1 ? ' disabled' : ''}>Sonraki →</button></div>` : ''}` : `<div class="card empty"><b>Bu filtrelerde muadili olan ürün yok</b>${f.exact === '1' ? 'Karat eşleşmesini "Yakın karat" yapmayı veya filtreleri genişletmeyi deneyin.' : 'Filtreleri genişletmeyi deneyin.'}</div>`;
      if ($('#kp')) $('#kp').onclick = () => { f.page--; draw(true); scrollTo(0, 0); };
      if ($('#kn')) $('#kn').onclick = () => { f.page++; draw(true); scrollTo(0, 0); };
      S.kRows = rows;
    };
    view.querySelectorAll('.filters select').forEach((x) => (x.onchange = () => draw()));
    let t; $('#k_q').oninput = () => { clearTimeout(t); t = setTimeout(draw, 200); };
    draw(true);
  },

  karsilastirma(view) {
    const f = (S.f_seg ??= { cat: '', model: '', gem: '', ayar: '', common: '2', sort: 'n', dir: -1 });
    const all = segRows();
    const others = Object.keys(S.data.brands).filter((b) => b !== S.ref && brand(b).count > 0);
    view.innerHTML = `<div class="card"><div class="filters">
      <div><label for="s_c">Kategori</label><select id="s_c">${opt(uniq(all.map((r) => r.s.cat)).sort(), f.cat, 'Tüm kategoriler')}</select></div>
      <div><label for="s_m">Model</label><select id="s_m">${opt(uniq(all.map((r) => r.s.model)).sort(), f.model, 'Tüm modeller')}</select></div>
      <div><label for="s_g">Taş</label><select id="s_g">${opt(uniq(all.map((r) => r.s.gem)).sort(), f.gem, 'Tüm taşlar')}</select></div>
      <div><label for="s_a">Ayar</label><select id="s_a">${opt(uniq(all.map((r) => r.s.ayar).filter(Boolean)).sort(), f.ayar, 'Tüm ayarlar')}</select></div>
      <div><label for="s_n">Kapsam</label><select id="s_n"><option value="2"${f.common === '2' ? ' selected' : ''}>En az 2 markada olan</option><option value="ref"${f.common === 'ref' ? ' selected' : ''}>${esc(refName())} ürünü olan</option><option value="1"${f.common === '1' ? ' selected' : ''}>Tüm segmentler</option></select></div>
    </div><p class="small muted" style="margin:10px 0 0">Segment = kategori + model + taş + karat aralığı + ayar. Fark sütunu, rakibin medyan fiyatının ${esc(refName())} medyanına göre konumudur: <span class="pos cheap">▼ kırmızı</span> rakip bizden ucuz, <span class="pos exp">▲ yeşil</span> rakip bizden pahalı. Satıra tıklayınca ürünler açılır.</p></div><div id="segTbl"></div>`;
    const draw = () => {
      Object.assign(f, { cat: $('#s_c').value, model: $('#s_m').value, gem: $('#s_g').value, ayar: $('#s_a').value, common: $('#s_n').value });
      let rows = all.filter((r) => (!f.cat || r.s.cat === f.cat) && (!f.model || r.s.model === f.model) && (!f.gem || r.s.gem === f.gem) && (!f.ayar || String(r.s.ayar) === f.ayar) && (f.common === '1' || (f.common === '2' ? r.brands >= 2 : r.s.stats[S.ref])));
      const val = (r) => (f.sort === 'n' ? r.s.n : f.sort === 'label' ? r.s.label : f.sort === 'ref' ? r.s.stats[S.ref]?.med ?? -1 : f.sort.startsWith('d:') ? r.diff[f.sort.slice(2)] ?? (f.dir > 0 ? 1e9 : -1e9) : r.s.stats[f.sort.slice(2)]?.med ?? -1);
      rows.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y, 'tr') : x - y) * f.dir; });
      const th = (k, t, r = true) => `<th class="sort${r ? ' r' : ''}" data-sort="${k}" tabindex="0">${t}${f.sort === k ? (f.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
      $('#segTbl').innerHTML = rows.length ? `<div class="small muted" style="margin-bottom:8px">${rows.length.toLocaleString('tr-TR')} segment${rows.length > 300 ? ' · ilk 300 gösteriliyor' : ''}</div><div class="tbl-wrap"><table><thead><tr>${th('label', 'Segment', false)}${th('n', 'Ürün')}${th('ref', esc(refName()) + ' medyan')}${others.map((b) => th('m:' + b, esc(brand(b).short) + ' medyan') + th('d:' + b, 'Fark')).join('')}</tr></thead><tbody>${rows.slice(0, 300).map((r) => `<tr class="click" data-seg="${esc(r.s.key)}" tabindex="0"><td>${esc(r.s.label)}</td><td class="r num">${r.s.n}</td><td class="r num">${r.s.stats[S.ref] ? tl(r.s.stats[S.ref].med) + ` <span class="muted small">(${r.s.stats[S.ref].n})</span>` : '<span class="muted">—</span>'}</td>${others.map((b) => `<td class="r num">${r.s.stats[b] ? tl(r.s.stats[b].med) + ` <span class="muted small">(${r.s.stats[b].n})</span>` : '<span class="muted">—</span>'}</td><td class="r num">${r.diff[b] == null ? '<span class="muted">—</span>' : `<span class="pos ${Math.abs(r.diff[b]) < 1 ? 'eq' : r.diff[b] < 0 ? 'cheap' : 'exp'}">${r.diff[b] < -1 ? '▼ ' : r.diff[b] > 1 ? '▲ ' : ''}${pct(r.diff[b])}</span>`}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="card empty"><b>Bu filtrelere uyan segment yok</b>Kapsamı "Tüm segmentler" yapmayı veya filtreleri temizlemeyi deneyin.</div>';
      $('#segTbl').querySelectorAll('th.sort').forEach((h) => (h.onclick = () => { const k = h.dataset.sort; if (f.sort === k) f.dir *= -1; else { f.sort = k; f.dir = k === 'label' ? 1 : -1; } draw(); }));
    };
    view.querySelectorAll('.filters select').forEach((s) => (s.onchange = draw)); draw();
  },

  urunler(view) {
    const f = (S.f_p ??= { q: '', brand: '', cat: '', model: '', bucket: '', ayar: '', color: '', clarity: '', sort: 'price_desc', page: 0 });
    const P = S.products;
    const colors = uniq(P.map((p) => p.color).filter(Boolean)).sort(), clar = uniq(P.map((p) => p.clarity).filter(Boolean)).sort();
    view.innerHTML = `<div class="card"><div class="filters">
      <div style="flex:1;min-width:200px"><label for="p_q">Ürün adı veya kodu</label><input id="p_q" type="search" value="${esc(f.q)}" placeholder="ör. tektaş yüzük, 3000310679"></div>
      <div><label for="p_b">Marka</label><select id="p_b">${`<option value="">Tüm markalar</option>` + brandsWithData().map((b) => `<option value="${b}"${f.brand === b ? ' selected' : ''}>${esc(brand(b).name)}</option>`).join('')}</select></div>
      <div><label for="p_c">Kategori</label><select id="p_c">${opt(uniq(P.map((p) => p.cat)).sort(), f.cat, 'Tümü')}</select></div>
      <div><label for="p_m">Model</label><select id="p_m">${opt(uniq(P.map((p) => p.model)).sort(), f.model, 'Tümü')}</select></div>
      <div><label for="p_k">Karat</label><select id="p_k"><option value="">Tümü</option>${CT_BUCKETS.map((b, i) => `<option value="${i}"${f.bucket === String(i) ? ' selected' : ''}>${b[2]}</option>`).join('')}</select></div>
      <div><label for="p_a">Ayar</label><select id="p_a">${opt(uniq(P.map((p) => p.ayar).filter(Boolean)).sort(), f.ayar, 'Tümü')}</select></div>
      <div><label for="p_r">Renk</label><select id="p_r">${opt(colors, f.color, 'Tümü')}</select></div>
      <div><label for="p_l">Berraklık</label><select id="p_l">${opt(clar, f.clarity, 'Tümü')}</select></div>
      <div><label for="p_s">Sıralama</label><select id="p_s">${[['price_desc', 'Fiyat: yüksekten düşüğe'], ['price_asc', 'Fiyat: düşükten yükseğe'], ['ct_desc', 'Karat: büyükten küçüğe'], ['new', 'En yeni eklenen']].map(([k, v]) => `<option value="${k}"${f.sort === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
    </div></div><div id="pList"></div>`;
    const draw = (keepPage) => {
      Object.assign(f, { q: $('#p_q').value, brand: $('#p_b').value, cat: $('#p_c').value, model: $('#p_m').value, bucket: $('#p_k').value, ayar: $('#p_a').value, color: $('#p_r').value, clarity: $('#p_l').value, sort: $('#p_s').value });
      if (!keepPage) f.page = 0;
      const q = norm(f.q).split(' ').filter(Boolean);
      const list = P.filter((p) => (!f.brand || p.brand === f.brand) && (!f.cat || p.cat === f.cat) && (!f.model || p.model === f.model) && (f.bucket === '' || p.bucket === +f.bucket) && (!f.ayar || String(p.ayar) === f.ayar) && (!f.color || p.color === f.color) && (!f.clarity || p.clarity === f.clarity) && (!q.length || q.every((w) => (p._n ??= norm(p.name + ' ' + p.code)).includes(w))));
      list.sort({ price_desc: (a, b) => b.price - a.price, price_asc: (a, b) => a.price - b.price, ct_desc: (a, b) => (b.ct ?? -1) - (a.ct ?? -1), new: (a, b) => (a.first < b.first ? 1 : a.first > b.first ? -1 : 0) }[f.sort]);
      const N = 60, pages = Math.ceil(list.length / N);
      $('#pList').innerHTML = list.length ? `<div class="small muted" style="margin-bottom:8px">${list.length.toLocaleString('tr-TR')} ürün</div><div class="pgrid">${list.slice(f.page * N, f.page * N + N).map((p) => pcard(p)).join('')}</div>${pages > 1 ? `<div class="pager"><button class="btn small" id="pp"${f.page === 0 ? ' disabled' : ''}>← Önceki</button><span class="small muted">Sayfa ${f.page + 1} / ${pages}</span><button class="btn small" id="pn"${f.page >= pages - 1 ? ' disabled' : ''}>Sonraki →</button></div>` : ''}` : '<div class="card empty"><b>Bu filtrelere uyan ürün yok</b>Arama metnini kısaltmayı veya filtreleri temizlemeyi deneyin.</div>';
      if ($('#pp')) $('#pp').onclick = () => { f.page--; draw(true); scrollTo(0, 0); };
      if ($('#pn')) $('#pn').onclick = () => { f.page++; draw(true); scrollTo(0, 0); };
    };
    view.querySelectorAll('.filters select').forEach((s) => (s.onchange = () => draw()));
    let t; $('#p_q').oninput = () => { clearTimeout(t); t = setTimeout(draw, 200); };
    draw(true);
  },

  raporlar(view) {
    const cats = uniq(S.products.map((p) => p.cat)).sort();
    view.innerHTML = `<div class="grid g3">
      <div class="card rep"><h2>Fiyat Değişim Raporu</h2><p class="muted">Seçilen dönemde rakiplerin zam ve indirimleri, yeni ve kalkan ürünleri; her satırda ${esc(refName())} fiyatına göre konum.</p>
        <div><label for="r1d">Dönem</label><br><select id="r1d"><option value="1">Son güncelleme</option><option value="7" selected>Son 7 gün</option><option value="30">Son 30 gün</option></select></div>
        <button class="btn primary" data-rep="degisim">PDF indir</button></div>
      <div class="card rep"><h2>Segment Karşılaştırma Raporu</h2><p class="muted">Ürün grubu bazında markaların medyan fiyatları ve ${esc(refName())} referansına göre yüzde farkları.</p>
        <div><label for="r2c">Kategori</label><br><select id="r2c">${opt(cats, '', 'Tüm kategoriler')}</select></div>
        <button class="btn primary" data-rep="segment">PDF indir</button></div>
      <div class="card rep"><h2>Model Kıyaslama Raporu</h2><p class="muted">${esc(refName())} ürünleri ile rakiplerdeki aynı model ve karattaki ürünler yan yana: karat, renk, berraklık, gram, karat başı fiyat, fark ve yorum.</p>
        <div class="filters"><div><label for="r3c">Kategori</label><select id="r3c">${opt(cats, cats.includes('Yüzük') ? 'Yüzük' : cats[0])}</select></div>
        <div><label for="r3m">Model</label><select id="r3m">${opt(uniq(S.products.filter((p) => p.brand === S.ref).map((p) => p.model)).sort(), '', 'Tümü')}</select></div>
        <div><label for="r3e">Karat eşleşmesi</label><select id="r3e"><option value="1">Birebir aynı karat</option><option value="0">Yakın karat (±%12)</option></select></div></div>
        <button class="btn primary" data-rep="muadil">Görselli PDF indir</button>
        <button class="btn" id="printKiyas">Görsellerle yazdır / PDF kaydet</button>
        <p class="small muted">PDF'te rakip görselleri yer alır. Kendi ürün görsellerimiz PDF'e gömülemezse "Görsellerle yazdır" tüm görsellerle açılır; yazdırma penceresinde "PDF olarak kaydet" seçilir.</p></div>
    </div><div class="card small muted">Raporlar, panelde o an yüklü olan veriden ve seçili referans markadan (${esc(S.ref ? brand(S.ref).name : '—')}) tarayıcınızda üretilir; dosya doğrudan bilgisayarınıza iner.</div>`;
    $('#printKiyas').onclick = () => printKiyas($('#r3c').value, $('#r3m').value, $('#r3e').value === '1');
    view.querySelectorAll('[data-rep]').forEach((b) => (b.onclick = async () => {
      const old = b.textContent; b.disabled = true; b.textContent = 'Hazırlanıyor…';
      try { await report(b.dataset.rep, b); } catch (e) { console.error(e); toast('Rapor oluşturulamadı. Sayfayı yenileyip tekrar deneyin.', 'err'); }
      b.disabled = false; b.textContent = old;
    }));
  },

  durum(view) {
    const ST = { ok: 'Güncel', blocked: 'Engellendi', error: 'Hata', none: 'Veri yok' };
    const blocked = Object.values(S.data.brands).filter((i) => i.status === 'blocked');
    const fb = S.natural, fi = fb && brand(fb);
    view.innerHTML = `${fb ? `<div class="card"><div class="card-head"><div><h2>${esc(fi.name)} ürün XML'i</h2><p class="muted small">Sitemizi taramak yerine ürünlerimiz bu dosyadan okunur (Google Merchant biçimi). ${fi.feedAt ? `Son yükleme: <b>${new Date(fi.feedAt).toLocaleString('tr-TR')}</b>${fi.feedBy ? ' · ' + esc(fi.feedBy) : ''} · ${fi.count.toLocaleString('tr-TR')} ürün.` : 'Henüz dosya yüklenmedi.'}</p></div></div>
      <div class="filters"><div><label for="feedFile">XML dosyası</label><input id="feedFile" type="file" accept=".xml,text/xml,application/xml"></div></div>
      <div id="feedOut" style="margin-top:12px"></div></div>` : ''}
    <div class="card"><div class="card-head"><div><h2>Fiyatları şimdi güncelle</h2><p class="muted small">DDiamond, Lizay ve Sina her gün; Zen ve Atasay iki günde bir otomatik güncellenir. Beklemeden taratmak için düğmeyi kullanın; sonuç yaklaşık 7 dakikada panele yansır.</p></div>
      <button class="btn primary" id="refreshNow"${S.data.publish ? '' : ' disabled'}>Şimdi güncelle</button></div><div id="refreshOut" class="small muted">${S.data.publish ? 'Bu düğme DDiamond, Lizay ve Sina verisini yeniler. Zen ve Atasay yalnızca kendi zamanlanmış taramalarıyla güncellenir.' : 'Bu düğme henüz kurulmadı: depoya UPLOAD_TOKEN erişim anahtarı eklenince etkinleşir.'}</div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Marka</th><th>Durum</th><th class="r">Aktif ürün</th><th>Son başarılı güncelleme</th><th>Not</th></tr></thead><tbody>${Object.entries(S.data.brands).map(([b, i]) => `<tr><td>${chip(b)} ${esc(i.name)}</td><td><b>${i.status === 'ok' ? '✓' : '⚠'} ${ST[i.status] ?? i.status}</b></td><td class="r num">${i.count.toLocaleString('tr-TR')}</td><td>${i.lastOk ? dstr(i.lastOk) : '—'}</td><td class="small muted">${i.source === 'xml' ? 'Kaynak: yüklenen XML' : i.source === 'manual' || b === MANUAL ? 'Kaynak: yüklenen ürün sayfaları' : 'Kaynak: site taraması'}${i.error ? ' · ' + esc(i.error) : ''}</td></tr>`).join('')}</tbody></table></div>
    ${blocked.length ? `<div class="card"><h2>Engellenen siteler için ne yapılmalı?</h2><p>Bu siteler Cloudflare bot korumasıyla otomatik istekleri reddediyor. Koruma bilerek konulduğu için panel bunu aşmaya çalışmaz.</p><p>Günlük güncellemenin çalıştığı sunucunun IP'si engelliyse o markadan veri alınamaz; farklı bir çalıştırma ortamı veya izinli bir veri kaynağı gerekir. Eski veriler korunur.</p></div>` : ''}
    <div class="card"><div class="card-head"><div><h2>Güncelleme geçmişi</h2><p class="muted small">Veriler her gün otomatik taranır. Son veri paketi: ${new Date(S.data.generatedAt).toLocaleString('tr-TR')}</p></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Tarih</th>${Object.keys(S.data.brands).map((b) => `<th>${esc(brand(b).short)}</th>`).join('')}</tr></thead><tbody>${[...S.data.runs].reverse().slice(0, 30).map((r) => `<tr><td class="num">${dstr(r.date)}</td>${Object.keys(S.data.brands).map((b) => { const x = r.brands[b]; return `<td class="small">${!x ? '—' : x.status !== 'ok' ? '⚠ ' + (ST[x.status] ?? x.status) : `✓ ${x.fetched.toLocaleString('tr-TR')} ürün · ${x.priceChanges} fiyat değişimi · ${x.added} yeni · ${x.removed} kalkan`}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="card-head"><div><h2>${esc(brand(MANUAL).name)} ürün sayfaları</h2><p class="muted small">${esc(brand(MANUAL).name)} otomatik taramaya izin vermediği için ürünleri kayıtlı sayfalardan okunur. Ürün sayfasını tarayıcıda açın, <b>Ctrl+S</b> ile "Web Sayfası, Yalnızca HTML" olarak kaydedin ve dosyaları buraya yükleyin (birden çok dosya seçebilirsiniz). Fiyatı güncellemek için aynı sayfayı yeniden kaydedip yükleyin. Şu an ${brand(MANUAL).count.toLocaleString('tr-TR')} ürün kayıtlı.</p></div></div>
      <div class="filters"><div><label for="manFile">Kaydedilmiş ürün sayfaları (.html)</label><input id="manFile" type="file" accept=".html,.htm,text/html" multiple></div></div>
      <div id="manOut" style="margin-top:12px"></div></div>`;    const rb = $('#refreshNow');
    if (rb) rb.onclick = async () => {
      rb.disabled = true; rb.textContent = 'Başlatılıyor…';
      try {
        const { repo, token, branch } = S.data.publish;
        const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/gunluk-guncelleme.yml/dispatches`, { method: 'POST', headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json' }, body: JSON.stringify({ ref: branch }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        $('#refreshOut').innerHTML = '<b>✓ Güncelleme başlatıldı.</b> Yaklaşık 7 dakika sonra sayfayı yenileyin.'; rb.textContent = 'Başlatıldı';
      } catch (e) { $('#refreshOut').innerHTML = `<span class="form-err">Güncelleme başlatılamadı (${esc(e.message)}). Erişim anahtarının "Actions: Read and write" yetkisi olduğunu kontrol edin.</span>`; rb.disabled = false; rb.textContent = 'Şimdi güncelle'; }
    };
    const mf = $('#manFile');
    if (mf) mf.onchange = async () => {
      const out = $('#manOut'), files = [...mf.files]; if (!files.length) return;
      out.innerHTML = '<span class="muted">Dosyalar okunuyor…</span>';
      const ok = [], bad = [], now = new Date().toISOString();
      for (const f of files) {
        try { const p = parseSavedPage(await f.text()); if (p && p.price && /bluediamond\.com\.tr/i.test(p.url)) ok.push({ ...p, capturedAt: new Date(f.lastModified || Date.now()).toISOString() > now ? now : new Date(f.lastModified || Date.now()).toISOString() }); else bad.push(f.name + (p && !/bluediamond\.com\.tr/i.test(p.url ?? '') ? ' (Blue Diamond sayfası değil)' : '')); } catch { bad.push(f.name); }
      }
      const uniq = [...new Map(ok.map((p) => [p.code, p])).values()];
      const noSpec = uniq.filter((p) => !p.stones.length).length;
      out.innerHTML = `${uniq.length ? `<div class="tbl-wrap" style="margin-bottom:10px"><table><thead><tr><th>Ürün</th><th class="r">Karat</th><th>Renk / Berraklık</th><th>Ayar</th><th class="r">Fiyat</th></tr></thead><tbody>${uniq.slice(0, 50).map((p) => { const c = classify(p); return `<tr><td>${esc(p.name)} <span class="muted small">${esc(p.code)}</span></td><td class="r num">${c.ct != null ? c.ct.toLocaleString('tr-TR') : '—'}</td><td>${esc(c.color ?? '—')} / ${esc(c.clarity ?? '—')}</td><td>${p.ayar ?? '—'}</td><td class="r num"><b>${tl(p.price)}</b></td></tr>`; }).join('')}</tbody></table></div>` : ''}
        <p style="margin:0 0 10px"><b>${uniq.length} ürün okundu.</b>${bad.length ? ` <span class="form-err" style="display:inline-block">${bad.length} dosya okunamadı: ${esc(bad.slice(0, 5).join(', '))}${bad.length > 5 ? '…' : ''}. Sayfayı "Yalnızca HTML" olarak kaydettiğinizden emin olun.</span>` : ''}${noSpec ? ` <span class="muted">${noSpec} üründe taş tablosu bulunamadı.</span>` : ''}</p>
        ${uniq.length ? `<button class="btn primary" id="manApply">${S.data.publish?.canWrite ? 'Ürünleri ekle ve herkese yayınla' : 'Ürünleri bu tarayıcıda ekle'}</button>${S.data.publish?.canWrite ? '' : '<p class="small muted" style="margin:8px 0 0">Herkese yayınlama kurulu değil; ürünler yalnızca bu tarayıcıda görünür.</p>'}` : ''}`;
      if (uniq.length) $('#manApply').onclick = async () => {
        const btn = $('#manApply'); btn.disabled = true; btn.textContent = 'Ekleniyor…';
        let pubErr = null, published = false;
        if (S.data.publish?.canWrite) { try { await publishManual(uniq, S.user); published = true; } catch (e) { pubErr = e.message; } }
        applyManual(uniq); reindex();
        if (!published) { try { const lm = JSON.parse(localStorage.getItem('sp_manual') ?? '{"items":{}}'); for (const it of uniq) lm.items[it.code] = it; localStorage.setItem('sp_manual', JSON.stringify(lm)); S.localManual = Object.keys(lm.items).length; } catch {} }
        const sel = $('#refSel'), cur = sel.value; sel.innerHTML = Object.keys(S.data.brands).filter((x) => brand(x).count > 0).map((x) => `<option value="${x}">${esc(brand(x).name)}</option>`).join(''); sel.value = cur;
        route();
        $('#manOut').innerHTML = pubErr ? `<div class="form-err">Ürünler bu tarayıcıda eklendi ancak herkese yayınlanamadı (${esc(pubErr)}).</div>` : `<p style="margin:0"><b>✓ ${uniq.length} ürün eklendi.</b> ${published ? 'Diğer kullanıcılara birkaç dakika içinde yansır.' : ''}</p>`;
      };
    };
    const ff = $('#feedFile');
    if (ff) ff.onchange = async () => {
      const file = ff.files[0], out = $('#feedOut'); if (!file) return;
      out.innerHTML = '<span class="muted">Dosya okunuyor…</span>';
      let text, parsed;
      try { text = await file.text(); parsed = parseMerchantFeed(text); } catch (e) { out.innerHTML = `<div class="form-err">${esc(e.message?.startsWith('Bu dosya') || e.message?.startsWith('Dosyada') ? e.message : 'Dosya okunamadı. Geçerli bir XML dosyası seçip tekrar deneyin.')}</div>`; return; }
      const d = feedDiff(fb, parsed.products), noCt = parsed.products.filter((p) => !p.stones.length).length;
      out.innerHTML = `<p style="margin:0 0 10px"><b>${parsed.products.length.toLocaleString('tr-TR')} ürün okundu.</b> ${d.had ? `Mevcut veriye göre: ${d.changed} fiyat değişimi · ${d.added} yeni ürün · ${d.removed} kalkan ürün.` : ''} ${parsed.skipped ? `<span class="muted">${parsed.skipped} satır atlandı (yinelenen kod veya eksik fiyat).</span>` : ''} ${noCt ? `<span class="muted">${noCt} üründe karat bilgisi yok.</span>` : ''}</p>
        <button class="btn primary" id="feedApply">${S.data.publish?.canWrite ? "XML'i uygula ve herkese yayınla" : "XML'i bu tarayıcıda uygula"}</button>
        ${S.data.publish?.canWrite ? '' : '<p class="small muted" style="margin:8px 0 0">Herkese yayınlama kurulu değil; dosya yalnızca bu tarayıcıdaki karşılaştırmalarda kullanılır.</p>'}`;
      $('#feedApply').onclick = async () => {
        const btn = $('#feedApply'); btn.disabled = true; btn.textContent = 'Uygulanıyor…';
        const feed = { uploadedAt: new Date().toISOString(), by: S.user, products: parsed.products, published: false };
        let pubErr = null;
        if (S.data.publish?.canWrite) { try { await publishFeed(text, S.user); feed.published = true; } catch (e) { pubErr = e.message; } }
        applyFeed(fb, feed); reindex();
        try { localStorage.setItem('sp_feed', JSON.stringify(feed)); } catch {}
        if (!localStorage.getItem('sp_ref') || !(brand(localStorage.getItem('sp_ref'))?.count > 0)) S.ref = fb;
        const sel = $('#refSel'); sel.innerHTML = Object.keys(S.data.brands).filter((x) => brand(x).count > 0).map((x) => `<option value="${x}">${esc(brand(x).name)}</option>`).join(''); sel.value = S.ref;
        route();
        $('#feedOut').innerHTML = pubErr ? `<div class="form-err">XML bu tarayıcıda uygulandı ancak herkese yayınlanamadı (${esc(pubErr)}). Erişim anahtarının süresi dolmuş olabilir; yöneticinize bildirin.</div>` : `<p style="margin:0"><b>✓ ${parsed.products.length.toLocaleString('tr-TR')} ürün uygulandı.</b> Karşılaştırmalar yeni fiyatlarla güncellendi.</p>`;
      };
    };
  },
};

/* ---------- Çekmece: ürün ve segment detayı ---------- */
let lastFocus = null;
function openDrawer(title, html) {
  lastFocus = document.activeElement;
  document.querySelector('#yFoot')?.remove();
  $('#drawerTitle').textContent = title; $('#drawerBody').innerHTML = html; $('#drawerBody').scrollTop = 0;
  openLayer($('#drawer'), { focus: $('#drawer .icon-btn'), onClose: () => { S.dchart?.destroy(); S.dchart = null; } });
}
function closeDrawer() { closeLayer($('#drawer')); }
document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.ev,tr.click,th.sort,.cmp-head,.al')) { e.preventDefault(); e.target.click(); } });

function openProduct(id) {
  const p = S.byId.get(id); if (!p) return;
  let eq = p.active ? equivalents(p, S.segments, 4, true) : [];
  if (p.active && !eq.length) eq = equivalents(p, S.segments, 4);
  eq.sort((a, b) => b.score - a.score);
  const v = versusRef(p, S.ref, S.segments);
  const hist = p.hist ?? [[p.first, p.price]];
  openDrawer(p.name, `<div class="card pd"><div>${img(p)}</div><div>
      <div>${chip(p.brand)} <span class="muted small">Kod: ${esc(p.code)}</span>${p.active ? '' : ' <span class="chip">Satıştan kalktı</span>'}</div>
      <div class="kpi"><div class="v num">${tl(p.price)} ${p.list ? `<s class="muted small" style="font-weight:400">${tl(p.list)}</s>` : ''}</div></div>
      <div class="small">${p.brand === S.ref ? '' : posHtml(v) + (v ? ` <span class="muted">(${v.basis === 'muadil' ? v.n + ' muadil ürün' : 'segment'} medyanı ${tl(v.refMed)})</span>` : '')}</div>
      <dl class="specs"><dt>Ürün grubu</dt><dd>${esc(p.cat)} · ${esc(p.model)}</dd><dt>${p.gem === 'Renkli Taş' ? 'Toplam karat' : 'Toplam pırlanta'}</dt><dd>${p.ct != null ? p.ct.toLocaleString('tr-TR') + ' ct' : '—'}</dd><dt>Renk / Berraklık</dt><dd>${esc(p.color ?? '—')} / ${esc(p.clarity ?? '—')}</dd><dt>Altın</dt><dd>${p.ayar ? p.ayar + ' ayar' : '—'}${p.metalColor ? ' · ' + esc(p.metalColor) : ''}${p.gram ? ' · ' + p.gram.toLocaleString('tr-TR') + ' gr' : ' · gram belirtilmemiş'}</dd><dt>Stok</dt><dd>${p.stock == null ? '—' : p.stock ? 'Stokta' : 'Tükendi'}</dd><dt>İlk görülme</dt><dd>${dstr(p.first)}</dd></dl>
      <p><a class="btn small" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Ürünü sitede aç ↗</a></p></div></div>
    ${(p.stones ?? []).length > 1 ? `<div class="card"><h3>Taş bilgileri</h3><div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>Taş</th><th class="r">Karat</th><th>Renk</th><th>Berraklık</th></tr></thead><tbody>${p.stones.map((s) => `<tr><td>${esc(s.type)}</td><td class="r num">${s.ct?.toLocaleString('tr-TR') ?? '—'}</td><td>${esc(s.color ?? '—')}</td><td>${esc(s.clarity ?? '—')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="card"><h3>Fiyat geçmişi</h3>${hist.length > 1 ? '<div class="chart-box" style="height:200px;margin-top:8px"><canvas id="dc" role="img" aria-label="Fiyat geçmişi grafiği"></canvas></div>' : `<p class="muted small" style="margin:6px 0 0">${dstr(hist[0][0])} tarihinden beri fiyat değişmedi (${tl(p.price)}).</p>`}</div>
    <div class="card"><h3>Diğer markalardaki muadiller</h3><p class="muted small" style="margin:2px 0 10px">Aynı karat, model, kategori ve ayardaki emsal ürünler. Birebir aynı karatta ürün yoksa en yakın karattakiler (±%12) gösterilir.</p>
    ${eq.length ? `<div class="tbl-wrap"><table><thead><tr><th></th><th>Ürün</th><th class="r">Karat</th><th>Renk / Berraklık</th><th class="r">Gram</th><th class="r">Fiyat</th><th class="r">Fark</th></tr></thead><tbody>${eq.map(({ p: o }) => { const n = compareNote(p, o); return `<tr class="click" data-pid="${esc(o.id)}" tabindex="0"><td>${img(o, 'thumb')}</td><td>${chip(o.brand)} ${esc(o.name)}${p.brand === S.ref ? `<div style="margin-top:4px"><span class="verdict ${n.tone}">${esc(n.verdict)}</span></div>` : ''}</td><td class="r num">${o.ct != null ? o.ct.toLocaleString('tr-TR') : '—'}</td><td>${esc(o.color ?? '—')} / ${esc(o.clarity ?? '—')}</td><td class="r num">${o.gram ? o.gram.toLocaleString('tr-TR') + ' gr' : '<span class="muted">Belirtilmemiş</span>'}</td><td class="r num"><b>${tl(o.price)}</b></td><td class="r num"><span class="pos ${Math.abs(n.diffPct) < 1 ? 'eq' : n.diffPct < 0 ? 'cheap' : 'exp'}">${pct(n.diffPct)}</span></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Diğer markalarda bu özelliklerde muadil ürün bulunamadı.</div>'}</div>`);
  if (hist.length > 1) {
    const pts = [...hist]; const lastRun = S.data.runs.at(-1)?.date; if (lastRun && pts.at(-1)[0] !== lastRun && p.active) pts.push([lastRun, p.price]);
    S.dchart = new Chart($('#dc'), { type: 'line', data: { labels: pts.map((h) => dstr(h[0])), datasets: [{ ...dsFor(p.brand, pts.map((h) => h[1]), 'line'), stepped: true }] }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { tooltip: { callbacks: { label: (c) => ' ' + tl(c.parsed.y) } } }, scales: { y: { ...moneyAxis, title: { display: false } }, x: { grid: { display: false } } } } });
  }
}
function openSegment(key) {
  const s = S.segments.get(key); if (!s) return;
  const bs = Object.keys(S.data.brands).filter((b) => s.byBrand[b]);
  openDrawer(s.label, `<div class="tbl-wrap"><table><thead><tr><th>Marka</th><th class="r">Ürün</th><th class="r">En düşük</th><th class="r">Medyan</th><th class="r">En yüksek</th><th class="r">Bize göre</th></tr></thead><tbody>${bs.map((b) => { const x = s.stats[b], d = s.stats[S.ref] && b !== S.ref ? (x.med / s.stats[S.ref].med - 1) * 100 : null; return `<tr><td>${chip(b)}</td><td class="r num">${x.n}</td><td class="r num">${tl(x.min)}</td><td class="r num"><b>${tl(x.med)}</b></td><td class="r num">${tl(x.max)}</td><td class="r num">${d == null ? '<span class="muted">—</span>' : `<span class="pos ${Math.abs(d) < 1 ? 'eq' : d < 0 ? 'cheap' : 'exp'}">${pct(d)}</span>`}</td></tr>`; }).join('')}</tbody></table></div>
    ${bs.map((b) => `<div><h3 style="margin-bottom:8px">${esc(brand(b).name)} · ${s.byBrand[b].length} ürün</h3><div class="pgrid">${[...s.byBrand[b]].sort((x, y) => x.price - y.price).slice(0, 24).map((p) => pcard(p)).join('')}</div></div>`).join('')}`);
}
document.addEventListener('click', (e) => {
  const pid = e.target.closest('[data-pid]'); if (pid) { if (pid.closest('#alerts')) closeLayer($('#alerts')); openProduct(pid.dataset.pid); return; }
  const seg = e.target.closest('[data-seg]'); if (seg) openSegment(seg.dataset.seg);
});

/* ---------- PDF raporları ---------- */
// Ürün görselini PDF'e gömülebilir küçük JPEG'e çevirir. Rakip görselleri aynı adres üzerinden (/_img/...) gelir.
const thumbCache = new Map();
const proxied = (p) => { const u = p.img ?? ''; return u.startsWith('https://www.zenpirlanta.com/resim/') ? u.replace('https://www.zenpirlanta.com/resim/', '_img/zen/') : u.startsWith('https://www.ddiamond.com.tr/resim/') ? u.replace('https://www.ddiamond.com.tr/resim/', '_img/ddiamond/') : u.startsWith('https://www.lizaypirlanta.com/') ? u.replace('https://www.lizaypirlanta.com/', '_img/lizay/') : u.startsWith('https://92d339.cdn.akinoncloud.com/') ? u.replace('https://92d339.cdn.akinoncloud.com/', '_img/atasay/') : null; };
function loadThumb(p, size = 132) {
  if (thumbCache.has(p.id)) return thumbCache.get(p.id);
  const tryUrl = (url, cross) => new Promise((res) => {
    if (!url) return res(null);
    const im = new Image(); if (cross) im.crossOrigin = 'anonymous';
    const t = setTimeout(() => { im.src = ''; res(null); }, 20000);
    im.onload = () => { clearTimeout(t); try { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); const k = Math.max(size / im.naturalWidth, size / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k; g.drawImage(im, (size - w) / 2, (size - h) / 2, w, h); res(c.toDataURL('image/jpeg', 0.82)); } catch { res(null); } };
    im.onerror = () => { clearTimeout(t); res(null); };
    im.src = url;
  });
  const pr = (async () => (await tryUrl(proxied(p), false)) ?? (await tryUrl(p.img, true)))();
  thumbCache.set(p.id, pr); return pr;
}
async function loadThumbs(products, onProgress) {
  const list = [...new Map(products.map((p) => [p.id, p])).values()], out = new Map(); let i = 0, done = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { while (i < list.length) { const p = list[i++]; out.set(p.id, await loadThumb(p)); onProgress?.(++done, list.length); } }));
  return out;
}
// Emsal eşleşmeleri (rapor ve yazdırma görünümü ortak kullanır)
function kiyasRows(cat, model, exact, limit = 400) {
  const mine = S.products.filter((p) => p.brand === S.ref && p.ct != null && p.cat === cat && (!model || p.model === model)).sort((a, b) => a.model.localeCompare(b.model, 'tr') || (a.ct ?? 0) - (b.ct ?? 0) || a.price - b.price);
  const rows = []; let n = 0, truncated = false;
  for (const p of mine) { const eq = equivalents(p, S.segments, 1, exact).map((e) => ({ p: e.p, n: compareNote(p, e.p) })); if (!eq.length) continue; if (n + eq.length > limit) { truncated = true; break; } n += eq.length; rows.push({ p, eq }); }
  return { mine, rows, truncated };
}
// Tüm görsellerle yazdırma görünümü: tarayıcının "PDF olarak kaydet" seçeneğiyle PDF alınır.
function printKiyas(cat, model, exact) {
  const { mine, rows, truncated } = kiyasRows(cat, model, exact, 600);
  const w = window.open('', '_blank'); if (!w) { toast('Açılır pencere engellendi. Bu site için açılır pencerelere izin verip tekrar deneyin.', 'err'); return; }
  const today = S.data.runs.at(-1)?.date ?? '';
  const sp = (p) => `${p.ct.toLocaleString('tr-TR')} ct · ${esc(p.color ?? '—')} / ${esc(p.clarity ?? '—')}<br>${p.gram ? p.gram.toLocaleString('tr-TR') + ' gr' : 'Gram belirtilmemiş'}`;
  const im = (p) => `<img src="${esc(p.img ?? '')}" referrerpolicy="no-referrer" alt="">`;
  const TONE = { risk: '#b3261e', good: '#1b7a43', eq: '#444' };
  w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Model Kıyaslama Raporu ${esc(today)}</title><style>
    @page{size:A4 landscape;margin:10mm} body{font:11px/1.35 Arial,Helvetica,sans-serif;color:#1d1a1b;margin:0}
    header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px} header img{height:40px} h1{font-size:18px;margin:0;text-align:right} .sub{color:#555;text-align:right}
    table{border-collapse:collapse;width:100%} th{background:#ebbecb;text-align:left;padding:5px 6px;font-size:10px} td{padding:5px 6px;border-bottom:1px solid #e6dde0;vertical-align:top}
    td img{width:74px;height:74px;object-fit:cover;border-radius:4px;background:#f6f1f3;display:block} tr{break-inside:avoid} .r{text-align:right;white-space:nowrap} .b{font-weight:bold} .m{color:#666;font-size:10px}
    .bar{position:sticky;top:0;background:#fff4d6;padding:8px 10px;margin-bottom:8px;border:1px solid #f0d58a;border-radius:6px} @media print{.bar{display:none}}
  </style></head><body><div class="bar">Yazdırma penceresinde <b>Hedef: PDF olarak kaydet</b> seçin. Görseller yüklenmediyse birkaç saniye bekleyip <button onclick="print()">Yazdır / PDF kaydet</button> düğmesine basın.</div>
  <header><img src="${new URL('img/logo.png', location.href).href}" alt="Sina Pırlanta"><div><h1>Model Kıyaslama Raporu</h1><div class="sub">${esc(cat)}${model ? ' · ' + esc(model) : ''} · ${exact ? 'birebir aynı karat' : 'yakın karat'} · ${esc(dstr(today))}</div></div></header>
  <p class="m">${mine.length} ürünümüzden ${rows.length} tanesinin emsali listelenmiştir (aynı kategori, model, taş ve ayar).${truncated ? ' Liste uzun olduğu için ilk 600 eşleşme gösteriliyor; model seçerek daraltın.' : ''} Fark, rakip fiyatının bizim fiyata oranıdır.</p>
  <table><thead><tr><th></th><th>${esc(refName())} ürünü</th><th>Özellik</th><th class="r">Fiyat</th><th></th><th>Rakip ürün</th><th>Özellik</th><th class="r">Fiyat</th><th class="r">Fark</th><th>Yorum</th></tr></thead><tbody>
  ${rows.map(({ p, eq }) => eq.map((e, i) => `<tr>${i === 0 ? `<td rowspan="${eq.length}">${im(p)}</td><td rowspan="${eq.length}"><span class="b">${esc(p.code)}</span><br>${esc(p.name)}</td><td rowspan="${eq.length}">${sp(p)}</td><td rowspan="${eq.length}" class="r b">${tl(p.price)}</td>` : ''}
    <td>${im(e.p)}</td><td><span class="b">${esc(brand(e.p.brand).short)}</span><br>${esc(e.p.name)}</td><td>${sp(e.p)}</td><td class="r b">${tl(e.p.price)}</td><td class="r b" style="color:${Math.abs(e.n.diffPct) < 1 ? '#555' : e.n.diffPct < 0 ? '#b3261e' : '#1b7a43'}">${pct(e.n.diffPct)}</td><td><span class="b" style="color:${TONE[e.n.tone]}">${esc(e.n.verdict)}</span>${e.n.notes.length ? '<br><span class="m">' + e.n.notes.map(esc).join('; ') + '</span>' : ''}</td></tr>`).join('')).join('')}
  </tbody></table><script>addEventListener('load',()=>setTimeout(()=>print(),1200))<\/script></body></html>`);
  w.document.close();
}

let pdfReady;
const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
async function logoData() { const b = await (await fetch('img/logo.png')).blob(); return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); }
async function report(kind, btn) {
  pdfReady ??= loadScript('vendor/pdfmake.min.js').then(() => loadScript('vendor/vfs_fonts.js'));
  await pdfReady;
  const ref = S.ref, RN = brand(ref).name, today = S.data.runs.at(-1)?.date ?? new Date().toISOString().slice(0, 10);
  const H = (t) => ({ text: t, bold: true, color: '#3d1a26', fillColor: '#ebbecb', fontSize: 8 });
  const R = (t) => ({ text: t, alignment: 'right' });
  const posTxt = (d) => (d == null ? { text: '—', color: '#888' } : { text: (Math.abs(d) < 1 ? '≈ ' : d < 0 ? 'Ucuz ' : 'Pahalı ') + pct(d), color: Math.abs(d) < 1 ? '#555' : d < 0 ? '#b3261e' : '#1b7a43', alignment: 'right' });
  let title, sub, content = [], landscape = true;
  const table = (widths, head, body) => ({ table: { headerRows: 1, widths, body: [head.map(H), ...body] }, layout: { hLineColor: () => '#e6dde0', vLineColor: () => '#e6dde0', hLineWidth: () => 0.5, vLineWidth: () => 0, paddingTop: () => 4, paddingBottom: () => 4 }, fontSize: 8 });
  const none = (t) => ({ text: t, italics: true, color: '#666', margin: [0, 10, 0, 0] });

  if (kind === 'degisim') {
    const days = +$('#r1d').value;
    const evs = events().filter((e) => (days === 1 ? e.date === today : (new Date(today) - new Date(e.date)) / 864e5 < days));
    title = 'Fiyat Değişim Raporu'; sub = days === 1 ? `Son güncelleme (${dstr(today)})` : `Son ${days} gün · ${dstr(today)} itibarıyla`;
    const pr = evs.filter((e) => e.type === 'price');
    const summary = Object.keys(S.data.brands).filter((b) => brand(b).count > 0).map((b) => { const l = pr.filter((e) => e.brand === b), u = l.filter((e) => e.pct > 0), d = l.filter((e) => e.pct < 0); return [brand(b).name, R(String(u.length)), R(u.length ? pct(u.reduce((a, e) => a + e.pct, 0) / u.length) : '—'), R(String(d.length)), R(d.length ? pct(d.reduce((a, e) => a + e.pct, 0) / d.length) : '—'), R(String(evs.filter((e) => e.brand === b && e.type === 'new').length)), R(String(evs.filter((e) => e.brand === b && e.type === 'removed').length))]; });
    content.push({ text: 'Özet', style: 'h2' }, table(['*', 50, 60, 50, 60, 50, 50], ['Marka', 'Zam adedi', 'Ort. zam', 'İndirim adedi', 'Ort. indirim', 'Yeni ürün', 'Kalkan ürün'], summary));
    content.push({ text: `Fiyat değişimleri (${pr.length})`, style: 'h2' });
    content.push(pr.length ? table([42, 50, '*', 80, 55, 55, 42, 75], ['Tarih', 'Marka', 'Ürün', 'Özellik', 'Eski fiyat', 'Yeni fiyat', 'Değişim', 'Bize göre'], pr.slice(0, 1500).map((e) => [dstr(e.date), brand(e.brand).short, e.name, e.p ? specLine(e.p) : '', R(tl(e.old)), R(tl(e.price)), { text: pct(e.pct), alignment: 'right', color: e.pct > 0 ? '#b3261e' : '#1b7a43' }, e.brand === ref ? { text: 'Kendi ürünümüz', color: '#888', alignment: 'right' } : posTxt(e.v?.diffPct)])) : none('Bu dönemde fiyat değişimi kaydedilmedi.'));
    const oth = evs.filter((e) => e.type !== 'price');
    if (oth.length) content.push({ text: `Yeni, kalkan ve stok hareketleri (${oth.length})`, style: 'h2' }, table([42, 50, 70, '*', 60, 80], ['Tarih', 'Marka', 'Olay', 'Ürün', 'Fiyat', 'Bize göre'], oth.slice(0, 1000).map((e) => [dstr(e.date), brand(e.brand).short, EV_LABEL[e.type] ?? e.type, e.name, R(tl(e.price)), e.brand === ref ? '' : posTxt(e.v?.diffPct)])));
  } else if (kind === 'segment') {
    const cat = $('#r2c').value;
    const others = Object.keys(S.data.brands).filter((b) => b !== ref && brand(b).count > 0);
    const rows = segRows().filter((r) => (!cat || r.s.cat === cat) && r.brands >= 2).sort((a, b) => a.s.cat.localeCompare(b.s.cat, 'tr') || a.s.model.localeCompare(b.s.model, 'tr') || a.s.bucket - b.s.bucket);
    title = 'Segment Karşılaştırma Raporu'; sub = `${cat || 'Tüm kategoriler'} · referans: ${RN} · ${dstr(today)}`;
    content.push({ text: 'Segment = kategori + model + taş + karat aralığı + ayar. Fiyatlar, segmentteki aktif ürünlerin medyan satış fiyatıdır; parantez içi ürün adedidir. Fark, rakip medyanının referans medyanına oranıdır.', fontSize: 8, color: '#555', margin: [0, 0, 0, 8] });
    content.push(rows.length ? table(['*', 75, ...others.flatMap(() => [75, 55])], ['Segment', `${brand(ref).short} medyan`, ...others.flatMap((b) => [`${brand(b).short} medyan`, 'Fark'])], rows.map((r) => [r.s.label, R(r.s.stats[ref] ? `${tl(r.s.stats[ref].med)} (${r.s.stats[ref].n})` : '—'), ...others.flatMap((b) => [R(r.s.stats[b] ? `${tl(r.s.stats[b].med)} (${r.s.stats[b].n})` : '—'), posTxt(r.diff[b])])])) : none('Bu kategoride en az iki markada bulunan segment yok.'));
  } else {
    const cat = $('#r3c').value, model = $('#r3m').value, exact = $('#r3e').value === '1';
    const { mine, rows: krows, truncated } = kiyasRows(cat, model, exact);
    title = 'Model Kıyaslama Raporu'; sub = `${cat}${model ? ' · ' + model : ''} · ${exact ? 'aynı karat' : 'yakın karat'} · referans: ${RN} · ${dstr(today)}`;
    const body = [], tones = { risk: 0, good: 0, eq: 0 }, byBrand = {};
    const TONE = { risk: '#b3261e', good: '#1b7a43', eq: '#444' };
    const sp = (p) => [p.ct != null ? p.ct.toLocaleString('tr-TR') + ' ct' : '—', `${p.color ?? '—'} / ${p.clarity ?? '—'}`, p.gram ? p.gram.toLocaleString('tr-TR') + ' gr' : 'Gram belirtilmemiş'];
    const thumbs = await loadThumbs(krows.flatMap((r) => [r.p, ...r.eq.map((e) => e.p)]), (d, t) => { if (btn) btn.textContent = `Görseller yükleniyor ${d}/${t}…`; });
    const pic = (p) => (thumbs.get(p.id) ? { image: thumbs.get(p.id), width: 46 } : { text: 'Görsel\nalınamadı', fontSize: 6, color: '#999', alignment: 'center', margin: [0, 14, 0, 0] });
    const matched = krows.length; let missing = 0;
    for (const { p, eq } of krows) {
      if (!thumbs.get(p.id)) missing++;
      eq.forEach(({ p: o, n }, i) => {
        tones[n.tone]++; (byBrand[o.brand] ??= []).push(n.diffPct);
        const first = i === 0, span = first ? { rowSpan: eq.length } : {};
        body.push([first ? { ...pic(p), ...span } : '', first ? { text: [{ text: p.code + '\n', bold: true }, p.name], ...span } : '', first ? { text: sp(p).join('\n'), ...span } : '', first ? { text: tl(p.price), alignment: 'right', bold: true, ...span } : '',
          pic(o), { text: [{ text: brand(o.brand).short + '\n', bold: true }, o.name] }, sp(o).join('\n'), { text: tl(o.price), alignment: 'right' }, posTxt(n.diffPct),
          { text: [{ text: n.verdict, bold: true, color: TONE[n.tone] }, n.notes.length ? '\n' + n.notes.join('; ') : ''], fontSize: 7 }]);
      });
    }
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    content.push({ text: 'Özet', style: 'h2' }, { fontSize: 9, margin: [0, 0, 0, 4], ul: [
      `${mine.length} ${brand(ref).short} ürününden ${matched} tanesinin rakiplerde muadili bulundu (aynı kategori, model, taş ve ayar; karat ${exact ? 'birebir aynı' : '±%12'}).`,
      { text: [{ text: `${tones.risk} eşleşmede rakip avantajlı`, color: TONE.risk, bold: true }, ' (rakip ucuz ve özellikleri benzer ya da daha yüksek), ', { text: `${tones.good} eşleşmede biz avantajlıyız`, color: TONE.good, bold: true }, `, ${tones.eq} eşleşme dengeli (fark özelliklerle açıklanıyor).`] },
      ...Object.entries(byBrand).map(([b, a]) => `${brand(b).name}: ${a.length} eşleşme, fiyatı bize göre ortalama ${pct(avg(a))} (medyan ${pct(median(a))}).`),
      ...(truncated ? ['Liste uzun olduğu için ilk 400 eşleşme gösteriliyor; model seçerek raporu daraltın.'] : []),
      ...(missing ? [`${missing} ürünümüzün görseli PDF'e gömülemedi (sitemiz görselin başka adresten okunmasına izin vermiyor). Tüm görseller için Raporlar sayfasındaki "Görsellerle yazdır" düğmesini kullanın.`] : []),
      'Okuma notu: "Fark" rakip fiyatının bizim fiyata oranıdır (Ucuz = rakip bizden ucuz). Yorum sütunu fiyat farkını taş rengi, berraklık ve gram farklarıyla birlikte değerlendirir. Rakip sitede gram yazmıyorsa "Gram belirtilmemiş" görünür ve gram yoruma katılmaz.'] });
    content.push({ text: 'Ürün bazında kıyas', style: 'h2' });
    content.push(body.length ? table([48, '*', 50, 56, 48, '*', 50, 56, 44, 130], ['', `${brand(ref).short} ürünü`, 'Karat · Renk/Berr. · Gram', 'Fiyat', '', 'Rakip ürün', 'Karat · Renk/Berr. · Gram', 'Fiyat', 'Fark', 'Yorum'], body) : none('Bu seçimde muadili bulunan ürün yok. Karat eşleşmesini "Yakın karat" yaparak tekrar deneyin.'));
  }
  const logo = await logoData();
  const doc = {
    pageSize: 'A4', pageOrientation: landscape ? 'landscape' : 'portrait', pageMargins: [28, 70, 28, 36],
    header: { margin: [28, 18, 28, 0], columns: [{ image: logo, width: 86 }, { stack: [{ text: title, fontSize: 15, bold: true }, { text: sub, fontSize: 9, color: '#555' }], alignment: 'right' }] },
    footer: (p, n) => ({ margin: [28, 8, 28, 0], fontSize: 7, color: '#777', columns: [{ text: `Sina Pırlanta E-Ticaret · Fiyat Takip Paneli · Oluşturan: ${S.user} · ${new Date().toLocaleString('tr-TR')}` }, { text: `${p} / ${n}`, alignment: 'right' }] }),
    content, styles: { h2: { fontSize: 11, bold: true, margin: [0, 12, 0, 6] } }, defaultStyle: { font: 'Roboto', fontSize: 9 },
  };
  await new Promise((res) => pdfMake.createPdf(doc).download(`sina-${kind}-raporu-${today}.pdf`, res));
}
window.__report = report; // test kancası

/* ---------- Yönlendirme ---------- */
const TITLES = { kiyas: ['Model Kıyaslama', 'Aynı model ve karattaki rakip ürünlerle yan yana'], genel: ['Genel Bakış', 'Pazarın bugünkü görünümü'], bildirimler: ['Bildirimler', 'Rakip fiyat hareketleri'], karsilastirma: ['Segmentler', 'Ürün grubu bazında marka fiyatları'], urunler: ['Ürünler', 'Tüm markaların ürün kataloğu'], raporlar: ['Raporlar', 'PDF olarak indirilebilir analizler'], durum: ['Veri Durumu', 'Günlük güncellemelerin sağlığı'] };
const ICONS = { genel: 'i-home', kiyas: 'i-compare', karsilastirma: 'i-layers', bildirimler: 'i-bell', urunler: 'i-gem', raporlar: 'i-doc', durum: 'i-pulse' };
function badge() {
  const seen = localStorage.getItem('sp_seen') ?? '';
  setBadge(S.data.events.filter((e) => e.date > seen && e.brand !== S.ref).length);
}
// Mobil başlıktaki logo: dokununca ya da basılı tutunca ekran değiştirici açılır; seçim animasyonla geçer
function bindLogoHold() {
  const el = $('#logoHold'), ov = $('#appShift'), sw = $('#appSw'); if (!el || el.dataset.bound) return; el.dataset.bound = 1;
  const isY = () => document.documentElement.dataset.app === 'y';
  const mark = () => { el.setAttribute('aria-label', `Sina Pırlanta, ${isY() ? 'Yönetim Paneli' : 'Fiyat Takip'}. Ekran değiştir`); sw.querySelectorAll('[data-sw]').forEach((b) => { const on = (b.dataset.sw === 'y') === isY(); b.classList.toggle('on', on); b.setAttribute('aria-current', on); }); };
  let timer = null, held = false, busy = false; mark(); addEventListener('hashchange', mark);
  const open = () => { mark(); openLayer(sw); };
  const go = (toY) => {
    if (busy) return; busy = true; const r = el.getBoundingClientRect();
    ov.style.setProperty('--cx', r.left + r.width / 2 + 'px'); ov.style.setProperty('--cy', r.top + r.height / 2 + 'px');
    $('#appShiftLbl').textContent = toY ? 'Yönetim Paneli' : 'Fiyat Takip'; ov.className = 'app-shift ' + (toY ? 'to-y' : 'to-f'); ov.hidden = false; void ov.offsetWidth; ov.classList.add('run');
    const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
    setTimeout(() => { location.hash = toY ? '#/y/genel' : '#/genel'; }, reduce ? 250 : 560);
    setTimeout(() => { ov.hidden = true; ov.classList.remove('run'); busy = false; }, reduce ? 620 : 1280);
  };
  // Basılı tutarak açıldığında parmak kalkınca oluşan tıklama arka plana (karartmaya) düşüp pencereyi kapatmasın
  const swallow = () => { const eat = (e) => { e.stopPropagation(); e.preventDefault(); }, off = () => removeEventListener('click', eat, true); addEventListener('click', eat, true); const up = () => { setTimeout(off, 350); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); }; addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true); setTimeout(() => { off(); held = false; }, 6000); };
  const stop = () => { clearTimeout(timer); timer = null; el.classList.remove('holding'); };
  el.addEventListener('pointerdown', (e) => { if (busy || (e.pointerType === 'mouse' && e.button)) return; held = false; el.classList.add('holding'); try { el.setPointerCapture(e.pointerId); } catch {} clearTimeout(timer); timer = setTimeout(() => { held = true; stop(); try { navigator.vibrate?.(10); } catch {} open(); swallow(); }, 200); });
  for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, stop);   // parmak hafif kaysa da basılı tutma iptal olmaz (touch-action:none)
  el.addEventListener('click', () => { if (held) { held = false; return; } open(); });   // kısa dokunuş da aynı seçenekleri açar
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  sw.addEventListener('click', (e) => { const b = e.target.closest('[data-sw]'); if (!b) return; closeLayer(sw); const toY = b.dataset.sw === 'y'; if (toY !== isY()) setTimeout(() => go(toY), 180); });
}
let lastRoute = null;
function route(keepScroll) {
  if (!S.data) return;
  const r = (location.hash.replace(/^#\//, '') || 'genel').split('?')[0];
  const isY = r === 'y' || r.startsWith('y/');
  document.documentElement.dataset.app = isY ? 'y' : 'f';
  
  if (isY) { lastRoute = null; YON.route(r.slice(2) || 'genel'); return; }
  document.querySelector('#yFoot')?.remove();
  const name = pages[r] ? r : 'genel';
  const changed = name !== lastRoute; lastRoute = name;
  updateNav(name);
  $('#pageTitle').textContent = TITLES[name][0];
  $('#pageSub').textContent = `${TITLES[name][1]} · son güncelleme ${S.data.runs.at(-1) ? dstr(S.data.runs.at(-1).date) : '—'}`;
  document.title = `${TITLES[name][0]} · Fiyat Takip`;
  badge(); banners(); themeCharts();
  const render = () => { S.charts.forEach((c) => c.destroy()); S.charts = []; pages[name]($('#view')); };
  if (changed) { swapView(render); if (keepScroll !== true) scrollTo(0, 0); } else render();
}
addEventListener('hashchange', () => { closeDrawer(); closeLayer($('#more')); closeLayer($('#moreY')); closeLayer($('#alerts')); closeLayer($('#appSw')); route(); });

(async () => {
  const s = JSON.parse(sessionStorage.getItem('sp_s') ?? 'null');
  if (s) { try { await start(s); return; } catch { sessionStorage.removeItem('sp_s'); } }
  showLogin();
})();

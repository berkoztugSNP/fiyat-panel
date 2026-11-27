// Uygulama kabuğu etkileşimleri: tema, kenar çubuğu, katmanlar (panel / menü / palet), bildirim baloncukları,
// mobil sekme çubuğu, tablo etiketleri ve PWA kaydı. İş mantığı içermez.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isPhone = () => matchMedia('(max-width: 760px)').matches;
export const cssv = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ---------- Bildirim baloncuğu ---------- */
export function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : ''); el.textContent = msg; el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, type === 'err' ? 5200 : 3200);
}

/* ---------- Katmanlar: açma, kapama, odak hapsi, sürükleyerek kapatma ---------- */
const stack = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function openLayer(root, { focus, onClose } = {}) {
  if (!root.hidden && root.classList.contains('open')) return;
  root._prev = document.activeElement; root._onClose = onClose;
  clearTimeout(root._t); root.hidden = false;
  root.style.removeProperty('--drag'); $('.sheet', root)?.style.removeProperty('--drag');
  // çift rAF: başlangıç konumu boyandıktan sonra geçiş başlasın
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
  if (!stack.includes(root)) stack.push(root);
  document.documentElement.style.overflow = 'hidden';
  (focus ?? $(FOCUSABLE, root))?.focus({ preventScroll: true });
}
export function closeLayer(root) {
  if (root.hidden) return;
  root.classList.remove('open');
  const i = stack.indexOf(root); if (i >= 0) stack.splice(i, 1);
  if (!stack.length) document.documentElement.style.overflow = '';
  root._t = setTimeout(() => { root.hidden = true; }, reduced() ? 0 : 420);
  root._onClose?.(); root._onClose = null;
  root._prev?.focus?.({ preventScroll: true });
}
export const topLayer = () => stack.at(-1) ?? null;
document.addEventListener('keydown', (e) => {
  const root = topLayer(); if (!root) return;
  if (e.key === 'Escape') { e.preventDefault(); closeLayer(root); return; }
  if (e.key !== 'Tab') return;
  const f = $$(FOCUSABLE, root).filter((x) => x.offsetParent !== null); if (!f.length) return;
  const first = f[0], last = f.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
document.addEventListener('click', (e) => { const c = e.target.closest('[data-close]'); if (c) { const root = c.closest('.sheet-root,.palette-root'); if (root) closeLayer(root); } });

// Telefonda sayfayı tutamaçtan / başlıktan aşağı sürükleyerek kapatma (erişilebilir alternatif: Kapat düğmesi ve Esc)
function dragToDismiss(root) {
  const sheet = $('.sheet', root); if (!sheet) return;
  let y0 = null, t0 = 0, dy = 0;
  const start = (e) => { if (!isPhone() || e.target.closest('button,a,input,select')) return; y0 = e.clientY; t0 = e.timeStamp; dy = 0; sheet.classList.add('dragging'); sheet.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.setProperty('--drag', dy + 'px'); };
  const end = (e) => { if (y0 == null) return; sheet.classList.remove('dragging'); const v = dy / Math.max(1, e.timeStamp - t0); y0 = null;
    if (dy > 120 || v > 0.6) closeLayer(root); else sheet.style.setProperty('--drag', '0px'); };
  for (const h of [$('.grab', sheet), $('.sheet-head', sheet)].filter(Boolean)) { h.addEventListener('pointerdown', start); h.style.touchAction = 'none'; }
  sheet.addEventListener('pointermove', move); sheet.addEventListener('pointerup', end); sheet.addEventListener('pointercancel', end);
}

/* ---------- Tema ---------- */
const THEMES = ['system', 'light', 'dark'], TNAME = { system: 'Sistem', light: 'Açık', dark: 'Koyu' };
let onTheme = () => {};
function applyTheme(t) {
  document.documentElement.dataset.theme = t; try { localStorage.setItem('sp_theme', t); } catch {}
  const l = $('#themeLbl'), m = $('#themeLblM'); if (l) l.textContent = 'Tema: ' + TNAME[t]; if (m) m.textContent = TNAME[t];
  onTheme();
}
const cycleTheme = () => applyTheme(THEMES[(THEMES.indexOf(document.documentElement.dataset.theme) + 1) % 3]);
export const isDark = () => { const t = document.documentElement.dataset.theme; return t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches); };

/* ---------- Gezinme göstergeleri ---------- */
const TAB_ORDER = ['genel', 'kiyas', 'bildirimler', 'urunler', 'more'];
export function updateNav(name) {
  $$('#nav a').forEach((a) => { const on = a.dataset.r === name; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const tab = TAB_ORDER.includes(name) ? name : 'more';
  $$('#tabbar [data-r]').forEach((a) => a.classList.toggle('on', a.dataset.r === tab));
  $('#tabbar').style.setProperty('--i', TAB_ORDER.indexOf(tab));
}
export function setBadge(n) { for (const id of ['#navBadge', '#tabBadge']) { const el = $(id); if (el) { el.hidden = !n; el.textContent = n > 99 ? '99+' : n; } } }

/* ---------- Tablolar: telefonda okunabilir listeye dönüşmesi için hücre etiketleri ---------- */
function labelTables(root) {
  for (const t of $$('table:not([data-l])', root)) {
    t.dataset.l = '1'; t.classList.add('stack');
    const heads = $$('thead th', t).map((th) => th.textContent.replace(/[↑↓]/g, '').trim());
    for (const tr of $$('tbody tr', t)) $$('td', tr).forEach((td, i) => { const l = heads[i] ?? ''; td.dataset.label = l; if (l === 'Yorum' || l === 'Not') td.classList.add('wide'); });
  }
}

/* ---------- Komut paleti ---------- */
function initPalette({ pages, searchProducts, openProduct }) {
  const root = $('#palette'), input = $('#palIn'), list = $('#palList');
  let items = [], sel = 0;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const render = () => {
    const q = input.value.trim().toLocaleLowerCase('tr-TR');
    const pg = pages.filter((p) => !q || p.title.toLocaleLowerCase('tr-TR').includes(q));
    const pr = q.length >= 2 ? searchProducts(q) : [];
    items = [...pg.map((p) => ({ kind: 'page', ...p })), ...pr.map((p) => ({ kind: 'prod', ...p }))];
    sel = Math.min(sel, Math.max(0, items.length - 1));
    let html = '', i = 0;
    if (pg.length) html += '<div class="pal-g">Sayfalar</div>' + pg.map((p) => `<div class="pal-i" role="option" data-i="${i}" aria-selected="${i++ === sel}"><svg class="ic"><use href="#${p.icon}"/></svg><b>${esc(p.title)}</b></div>`).join('');
    if (pr.length) html += '<div class="pal-g">Ürünler</div>' + pr.map((p) => `<div class="pal-i" role="option" data-i="${i}" aria-selected="${i++ === sel}">${p.thumb}<b>${esc(p.title)}</b><i>${esc(p.meta)}</i></div>`).join('');
    list.innerHTML = html || `<div class="empty"><b>Sonuç yok</b>Başka bir ürün adı ya da kodu deneyin.</div>`;
    $('[aria-selected="true"]', list)?.scrollIntoView({ block: 'nearest' });
  };
  const run = (it) => { if (!it) return; closeLayer(root); if (it.kind === 'page') location.hash = '#/' + it.id; else setTimeout(() => openProduct(it.id), 60); };
  const open = () => { input.value = ''; sel = 0; render(); openLayer(root, { focus: input }); };
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(items[sel]); }
  });
  list.addEventListener('click', (e) => { const el = e.target.closest('.pal-i'); if (el) run(items[+el.dataset.i]); });
  list.addEventListener('pointermove', (e) => { const el = e.target.closest('.pal-i'); if (el && +el.dataset.i !== sel) { sel = +el.dataset.i; $$('.pal-i', list).forEach((x) => x.setAttribute('aria-selected', x === el)); } });
  for (const id of ['#paletteBtn', '#paletteBtnM']) $(id)?.addEventListener('click', open);
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); root.hidden || !root.classList.contains('open') ? open() : closeLayer(root); } });
}

/* ---------- Kurulum ---------- */
let inited = false;
export function initShell(opts) {
  onTheme = opts.onTheme ?? onTheme;
  if (inited) return; inited = true;
  applyTheme(document.documentElement.dataset.theme || 'system');
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => onTheme());
  $('#themeBtn').addEventListener('click', cycleTheme); $('#themeBtnM').addEventListener('click', cycleTheme);
  const toggleSide = () => { const mini = document.documentElement.dataset.side === 'mini'; if (mini) delete document.documentElement.dataset.side; else document.documentElement.dataset.side = 'mini'; try { localStorage.setItem('sp_side', mini ? '0' : '1'); } catch {} setTimeout(() => dispatchEvent(new Event('resize')), 340); };
  $('#sideToggle').addEventListener('click', toggleSide);
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSide(); } });
  $('#moreBtn').addEventListener('click', () => openLayer($('#more')));
  $('#logoutM').addEventListener('click', opts.logout);
  dragToDismiss($('#drawer')); dragToDismiss($('#more')); dragToDismiss($('#alerts')); dragToDismiss($('#moreY')); dragToDismiss($('#appSw'));
  initPalette(opts);
  // Üst çubuk: kaydırınca ince alt çizgi belirir
  const top = $('.top'); const onScroll = () => top.classList.toggle('stuck', scrollY > 6); addEventListener('scroll', onScroll, { passive: true }); onScroll();
  // Görseller: yüklenince iskelet durur, görsel yumuşakça belirir
  document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') { e.target.classList.add('ok'); } }, true);
  // Tablolara etiket
  const mo = new MutationObserver(() => { labelTables($('#view')); labelTables($('#drawerBody')); });
  mo.observe($('#view'), { childList: true, subtree: true }); mo.observe($('#drawerBody'), { childList: true, subtree: true });
  // İpucu (yalnızca fare ile)
  const tip = $('#tip');
  document.addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse') return; const t = e.target.closest('[data-tip]'); if (!t) { tip.hidden = true; return; } tip.textContent = t.dataset.tip; tip.hidden = false; const r = t.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2)) + 'px'; tip.style.top = r.bottom + 8 + 'px'; });
  // PWA: uygulama kabuğu önbelleği (veri paketi asla önbelleğe alınmaz)
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Sayfa içeriğini yenilerken yumuşak geçiş
export function swapView(render) {
  const view = $('#view');
  const go = () => { render(); view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); labelTables(view); };
  if (document.startViewTransition && !reduced() && !isPhone()) document.startViewTransition(go); else go();
}

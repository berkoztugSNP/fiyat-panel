// Sina Pırlanta Yönetim Paneli — sayfalar. Hesaplar calc.js'ten, veri store.js'ten gelir.
import * as DB from './store.js';
import { D } from './store.js';
import * as C from './calc.js';
import { money, moneyShort, pct, num, dTR, parseNum, parseDate } from './calc.js';
import { openImport } from './import.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opt = (list, cur, all) => (all != null ? `<option value="">${all}</option>` : '') + list.map((x) => `<option${String(x) === String(cur ?? '') ? ' selected' : ''}>${esc(x)}</option>`).join('');
const ic = (id) => `<svg class="ic"><use href="#${id}"/></svg>`;
let H = null; // ana uygulamadan gelen yardımcılar: openDrawer, closeDrawer, toast, chart, cssv
const Y = { preset: 'month', custom: null, compare: true, page: 'genel' };
try { Object.assign(Y, JSON.parse(sessionStorage.getItem('sp_y') ?? '{}')); } catch {}
const save = () => { try { sessionStorage.setItem('sp_y', JSON.stringify({ preset: Y.preset, custom: Y.custom, compare: Y.compare })); } catch {} };
const range = () => C.rangeOf(Y.preset, Y.custom);

export const TITLES = { genel: ['Genel Bakış', 'Seçilen dönemin e-ticaret özeti'], siparisler: ['Siparişler', 'Sipariş, maliyet ve tahsilat'], karlilik: ['Kârlılık Analizi', 'Yönetimsel operasyonel kârlılık'], reklam: ['Reklam Harcamaları', 'Google Ads ve Meta Ads'], giderler: ['Gelir ve Giderler', 'Operasyonel giderler'], ayarlar: ['Ayarlar', 'Hesaplama, yedek ve kayıt geçmişi'] };
const TABS = ['genel', 'siparisler', 'reklam', 'giderler', 'more'];

/* ---------- Ortak parçalar ---------- */
function rangeBar(extra = '') {
  const r = range();
  return `<div class="bar"><div class="seg scroll" role="tablist" aria-label="Dönem">${C.PRESETS.map(([k, l]) => `<button role="tab" data-preset="${k}" class="${Y.preset === k ? 'on' : ''}" aria-selected="${Y.preset === k}">${l}</button>`).join('')}</div>
    ${Y.preset === 'custom' ? `<input type="date" id="rFrom" value="${r.from}" aria-label="Başlangıç tarihi"><input type="date" id="rTo" value="${r.to}" aria-label="Bitiş tarihi">` : `<span class="small muted num">${dTR(r.from)} – ${dTR(r.to)}</span>`}
    <span class="grow"></span>${extra}</div>`;
}
function bindRange(view, rerender) {
  $$('[data-preset]', view).forEach((b) => (b.onclick = () => { Y.preset = b.dataset.preset; if (Y.preset === 'custom' && !Y.custom) Y.custom = C.rangeOf('30d'); save(); rerender(); }));
  for (const [id, k] of [['#rFrom', 'from'], ['#rTo', 'to']]) { const el = $(id, view); if (el) el.onchange = () => { if (el.value) { Y.custom = { ...range(), [k]: el.value }; if (Y.custom.from > Y.custom.to) Y.custom[k === 'from' ? 'to' : 'from'] = el.value; save(); rerender(); } }; }
}
const delta = (cur, prev, invert) => { if (!Y.compare || prev == null || !prev) return ''; const d = (cur / prev - 1) * 100; if (!Number.isFinite(d)) return ''; const good = invert ? d < 0 : d > 0; return `<span class="delta ${Math.abs(d) < 0.05 ? 'flat' : good ? 'up' : 'down'}" title="Önceki döneme göre">${d > 0 ? '▲' : d < 0 ? '▼' : ''} ${pct(Math.abs(d))}</span>`; };
const mrow = (label, value, cls = '', sub = '') => `<div class="mrow ${cls}"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><b>${value}</b></div>`;
const download = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
async function xlsx() { if (!window.XLSX) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); return window.XLSX; }
const chartBase = (extra = {}) => ({ maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { grid: { color: () => H.cssv('--hairline') }, border: { display: false }, ticks: { callback: (v) => (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('tr-TR') + ' B' : v), maxTicksLimit: 5 } } }, ...extra });

/* ---------- Sayfalar ---------- */
const pages = {
  genel(view) {
    const r = range(), S = C.summarize(r), P = Y.compare ? C.summarize(C.prevRange(r)) : {};
    if (!D.orders.length && !D.ads.length && !D.expenses.length) {
      view.innerHTML = `<div class="steps">
        <div class="step">${ic('i-bag')}<h2>Siparişleri aktarın</h2><p>Sipariş takip Excel'inizi yükleyin; sütunları bir kez eşleştirin. Aynı dosyayı güncelleyip yeniden yüklediğinizde siparişler çoğalmaz.</p><button class="btn primary" data-go="import-orders">Excel yükle</button></div>
        <div class="step">${ic('i-mega')}<h2>Reklam harcamalarını girin</h2><p>Google Ads ve Meta Ads harcamalarını elle ekleyin ya da Excel'den toplu yükleyin. Dijital İz ve IYZADS ayrı kırılım olarak izlenir.</p><a class="btn" href="#/y/reklam">Reklam harcamaları</a></div>
        <div class="step">${ic('i-wallet')}<h2>Giderleri tanımlayın</h2><p>Ajans, yazılım, personel gibi giderleri bir kez girin; aylık tekrarlayanlar her ay kendiliğinden hesaba katılır.</p><a class="btn" href="#/y/giderler">Giderler</a></div></div>
        <div class="note">Burada henüz veri yok; bu yüzden hiçbir rakam gösterilmiyor. Veriler girildikçe ciro, kârlılık ve reklam performansı bu ekranda oluşur.</div>`;
      $('[data-go="import-orders"]', view).onclick = () => importOrders();
      return;
    }
    const srcRows = [['Reklam kaynaklı', S.adRevenue, 'acc'], ['Organik', S.organic, 'pos'], ['Doğrudan', S.direct, 'c2'], ['Bilinmiyor', S.unknownRev, 'c4']];
    const budget = +D.meta.adBudget || 0, monthSpend = C.summarize(C.rangeOf('month')).adTotal;
    const warns = [];
    if (S.costMissing) warns.push(`<a href="#/y/siparisler" data-missing>${S.costMissing} siparişin ürün maliyeti girilmemiş</a>; kâr rakamları kesinleşmedi.`);
    if (S.ciro && S.unknownRev / S.ciro > 0.2) warns.push(`Cironun ${pct((S.unknownRev / S.ciro) * 100, 0)} kadarında satış kaynağı bilinmiyor; ROAS eksik veriyle hesaplanıyor.`);
    if (budget && monthSpend > budget) warns.push(`Bu ayın reklam bütçesi aşıldı: ${money(monthSpend, 0)} / ${money(budget, 0)}.`);
    if (S.skippedAuto) warns.push(`Giderlerde otomatik gelen kategorilerde ${money(S.skippedAuto, 0)} kayıt var; çift sayılmaması için kârlılığa eklenmedi.`);
    view.innerHTML = `${rangeBar(`<label class="switch"><input type="checkbox" id="cmp"${Y.compare ? ' checked' : ''}>Önceki dönemle karşılaştır</label>`)}
      ${warns.length ? `<div class="note warn">${warns.join('<br>')}</div>` : ''}
      <div class="hero">
        <div class="lead"><div class="h-l">Toplam ciro ${delta(S.ciro, P.ciro)}</div><div class="h-v">${money(S.ciro, 0)}</div><div class="h-s">${num(S.orderCount)} sipariş · ortalama sepet ${money(S.aov, 0)}${S.voidCount ? ` · ${S.voidCount} iptal/iade` : ''}</div></div>
        <div><div class="h-l">Operasyonel kâr ${S.final ? delta(S.opProfit, P.opProfit) : '<span class="tag warn">Kesinleşmedi</span>'}</div><div class="h-v" style="color:${S.opProfit < 0 ? 'var(--neg)' : 'inherit'}">${money(S.opProfit, 0)}</div><div class="h-s">Kâr marjı ${pct(S.margin)} · maliyet verisi ${pct(S.costComplete, 0)} tamam</div></div>
        <div><div class="h-l">Hesaba yatan ${delta(S.collected, P.collected)}</div><div class="h-v">${money(S.collected, 0)}</div><div class="h-s">Bekleyen tahsilat ${money(S.pending, 0)}</div><div class="meter" style="margin-top:6px" role="img" aria-label="Tahsilat oranı"><i class="pos" style="width:${S.collected + S.pending ? (S.collected / (S.collected + S.pending)) * 100 : 0}%"></i></div></div>
      </div>
      <div class="grid g3">
        <div class="mgroup"><h3>Satış</h3>
          ${mrow('Net satış geliri', money(S.net, 0), '', C.kdvRate() ? `KDV hariç (%${C.kdvRate()})` : 'KDV ayarı yapılmadı; tutarlar girildiği gibi')}
          ${mrow('Sipariş adedi', num(S.orderCount))}${mrow('Ortalama sepet', money(S.aov, 0))}${mrow('Reklam kaynaklı satış', money(S.adRevenue, 0))}${mrow('Organik satış', money(S.organic, 0))}</div>
        <div class="mgroup"><h3>Reklam</h3>
          ${mrow('Google Ads', money(S.adGoogle, 0))}${mrow('Meta Ads', money(S.adMeta, 0))}${mrow('Toplam reklam harcaması', money(S.adTotal, 0), 'total')}
          ${mrow('ROAS', S.roas == null ? '—' : S.roas.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + 'x', '', 'Reklam kaynaklı gerçek satış / harcama')}${mrow('MER', S.mer == null ? '—' : S.mer.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + 'x', '', 'Toplam ciro / harcama')}</div>
        <div class="mgroup"><h3>Maliyet ve giderler</h3>
          ${mrow('Ürün maliyeti', money(S.cost, 0))}${mrow('Brüt kâr', money(S.grossProfit, 0), 'total')}
          ${mrow('Ajans maliyeti', money(S.agency, 0))}${mrow('Sanal POS komisyonu', money(S.pos, 0))}${mrow('Diğer operasyonel gider', money(S.otherOpex + S.shipping, 0), '', 'Kargo ve paketleme dahil')}</div>
      </div>
      <div class="grid g2">
        <div class="card"><div class="card-head"><div><h2>Günlük ciro</h2><p class="muted small">İptal ve iadeler hariç</p></div></div><div class="chart-box" style="height:240px"><canvas id="yc1" role="img" aria-label="Günlük ciro grafiği"></canvas></div>
          <div class="card-head" style="margin-top:var(--s5)"><div><h2>Günlük sipariş adedi</h2></div></div><div class="chart-box" style="height:140px"><canvas id="yc2" role="img" aria-label="Günlük sipariş adedi grafiği"></canvas></div></div>
        <div class="card"><div class="card-head"><div><h2>Reklam harcaması</h2><p class="muted small">Platform bazında günlük</p></div><div class="legend"><span><i class="dot" style="background:var(--blue)"></i>Google Ads</span><span><i class="dot" style="background:var(--brand-deep)"></i>Meta Ads</span></div></div><div class="chart-box" style="height:240px"><canvas id="yc3" role="img" aria-label="Günlük reklam harcaması grafiği"></canvas></div>
          <div class="card-head" style="margin-top:var(--s5)"><div><h2>Satış kaynakları</h2><p class="muted small">Gerçek siparişlerden; kaynak bilgisi ${pct(S.sourceKnown, 0)} tamam</p></div></div>
          <div class="dist">${srcRows.map(([l, v, c]) => `<div class="dist-row"><span>${l}</span><b>${money(v, 0)}</b><div class="meter"><i class="${c}" style="width:${S.ciro ? (v / S.ciro) * 100 : 0}%"></i></div></div>`).join('')}</div></div>
      </div>`;
    bindRange(view, () => route('genel')); $('#cmp', view).onchange = (e) => { Y.compare = e.target.checked; save(); route('genel'); };
    $('[data-missing]', view)?.addEventListener('click', () => { F.missing = true; });
    const ds = C.dailySeries(r), lab = ds.days.map((d) => d.slice(8) + '.' + d.slice(5, 7)), tl0 = (c) => ' ' + c.dataset.label + ': ' + money(c.parsed.y, 0);
    H.chart($('#yc1'), { type: 'bar', data: { labels: lab, datasets: [{ label: 'Ciro', data: ds.ciro, backgroundColor: H.cssv('--brand'), borderRadius: 5, maxBarThickness: 22 }] }, options: chartBase({ plugins: { tooltip: { callbacks: { label: tl0 } } } }) });
    H.chart($('#yc2'), { type: 'line', data: { labels: lab, datasets: [{ label: 'Sipariş', data: ds.orders, borderColor: H.cssv('--text-2'), backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0.3 }] }, options: chartBase() });
    H.chart($('#yc3'), { type: 'bar', data: { labels: lab, datasets: [{ label: 'Google Ads', data: ds.google, backgroundColor: H.cssv('--blue'), borderRadius: 4, maxBarThickness: 22 }, { label: 'Meta Ads', data: ds.meta, backgroundColor: H.cssv('--brand-deep'), borderRadius: 4, maxBarThickness: 22 }] }, options: chartBase({ scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 8 } }, y: { stacked: true, grid: { color: () => H.cssv('--hairline') }, border: { display: false }, ticks: { callback: (v) => (v >= 1000 ? (v / 1000).toLocaleString('tr-TR') + ' B' : v), maxTicksLimit: 5 } } }, plugins: { tooltip: { callbacks: { label: tl0 } } } }) });
  },

  siparisler(view) {
    const r = range();
    let list = D.orders.filter((o) => o.date >= r.from && o.date <= r.to);
    const q = (F.q || '').toLocaleLowerCase('tr-TR').trim();
    if (q) list = list.filter((o) => [o.no, o.customer, o.product, o.code, ...(o.items ?? []).map((i) => i.name + ' ' + i.code)].join(' ').toLocaleLowerCase('tr-TR').includes(q));
    if (F.status) list = list.filter((o) => o.status === F.status);
    if (F.source) list = list.filter((o) => (o.source || 'Bilinmiyor') === F.source);
    if (F.missing) list = list.filter((o) => !C.orderCalc(o).costKnown);
    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.no).localeCompare(String(a.no), 'tr', { numeric: true })));
    const N = 50, pages_ = Math.ceil(list.length / N); F.page = Math.min(F.page, Math.max(0, pages_ - 1));
    const lastCost = new Map(); for (const o of [...D.orders].sort((a, b) => (a.date < b.date ? -1 : 1))) for (const i of o.items?.length ? o.items : [o]) if (i.code && i.cost != null) lastCost.set(i.code, i.cost);
    const missingAll = D.orders.filter((o) => !C.orderCalc(o).costKnown).length;
    view.innerHTML = `${rangeBar(`<button class="btn" id="oExp">Excel'e aktar</button><button class="btn" id="oImp">Excel yükle</button><button class="btn primary" id="oNew">${ic('i-plus')}Yeni sipariş</button>`)}
      <div class="card"><div class="filters">
        <div style="flex:1;min-width:200px"><label for="oq">Sipariş no, müşteri veya ürün</label><input id="oq" type="search" value="${esc(F.q)}" placeholder="Ara"></div>
        <div><label for="os">Durum</label><select id="os">${opt(C.ORDER_STATUS, F.status, 'Tümü')}</select></div>
        <div><label for="ok">Satış kaynağı</label><select id="ok">${opt(C.SOURCES, F.source, 'Tümü')}</select></div>
        <div><label>&nbsp;</label><label class="switch" style="min-height:36px"><input type="checkbox" id="om"${F.missing ? ' checked' : ''}>Maliyeti girilmemiş${missingAll ? ` (${missingAll})` : ''}</label></div>
      </div></div>
      ${list.length ? `<div class="small muted">${num(list.length)} sipariş · ciro ${money(list.reduce((t, o) => t + C.orderCalc(o).gross, 0), 0)}</div>
      <div class="tbl-wrap"><table><thead><tr><th><input type="checkbox" class="ck" id="ckAll" aria-label="Tümünü seç"></th><th>Tarih</th><th>Sipariş</th><th>Müşteri</th><th>Ürün</th><th class="r">Satış</th><th class="r">Ürün maliyeti</th><th class="r">Kâr</th><th class="r">Marj</th><th>Durum</th><th>Kaynak</th></tr></thead><tbody>
      ${list.slice(F.page * N, F.page * N + N).map((o) => { const c = C.orderCalc(o), multi = o.items?.length > 1, sug = !multi && o.cost == null && o.items?.[0]?.cost == null ? lastCost.get(o.code ?? o.items?.[0]?.code) : null; return `<tr class="click" data-oid="${esc(o.id)}" tabindex="0">
        <td data-stop><input type="checkbox" class="ck" data-ck="${esc(o.id)}"${SEL.has(o.id) ? ' checked' : ''} aria-label="Seç"></td>
        <td class="num">${dTR(o.date)}</td><td class="num"><b>${esc(o.no)}</b></td><td>${esc(o.customer ?? '—')}</td><td>${esc(multi ? `${o.items.length} ürün` : o.product ?? o.items?.[0]?.name ?? '—')}${!multi && (o.category ?? o.items?.[0]?.category) ? `<div class="small muted">${esc(o.category ?? o.items[0].category)}</div>` : ''}</td>
        <td class="r num">${money(c.sale, 0)}</td>
        <td class="r" data-stop>${c.voided ? '<span class="muted">—</span>' : multi ? `<button class="btn small" data-open="${esc(o.id)}">${c.costKnown ? money(c.cost, 0) : 'Maliyet gir'}</button>` : `<input class="cell-in${o.cost != null || o.items?.[0]?.cost != null ? ' has' : ''}" inputmode="decimal" data-cost="${esc(o.id)}" value="${(o.cost ?? o.items?.[0]?.cost) != null ? (o.cost ?? o.items[0].cost).toLocaleString('tr-TR') : ''}" placeholder="Gir" aria-label="${esc(o.no)} ürün maliyeti">${sug != null ? `<span class="hint" data-sug="${esc(o.id)}" data-v="${sug}">Öneri: ${money(sug, 0)}</span>` : ''}`}</td>
        <td class="r num">${c.voided ? '<span class="muted">—</span>' : c.profit == null ? '<span class="tag warn">Maliyet yok</span>' : `<span style="color:${c.profit < 0 ? 'var(--neg)' : 'inherit'}">${money(c.profit, 0)}</span>`}</td><td class="r num">${pct(c.margin)}</td>
        <td><span class="tag${c.voided ? ' neg' : ''}">${esc(o.status ?? '—')}</span></td><td>${esc(o.source || 'Bilinmiyor')}</td></tr>`; }).join('')}
      </tbody></table></div>
      ${pages_ > 1 ? `<div class="pager"><button class="btn small" id="pp"${F.page === 0 ? ' disabled' : ''}>← Önceki</button><span class="small muted">Sayfa ${F.page + 1} / ${pages_}</span><button class="btn small" id="pn"${F.page >= pages_ - 1 ? ' disabled' : ''}>Sonraki →</button></div>` : ''}
      ${SEL.size ? `<div class="bulk"><span>${SEL.size} sipariş seçildi</span><select id="bStatus" aria-label="Durum ata"><option value="">Durum ata</option>${C.ORDER_STATUS.map((s) => `<option>${s}</option>`).join('')}</select><select id="bSource" aria-label="Kaynak ata"><option value="">Kaynak ata</option>${C.SOURCES.map((s) => `<option>${s}</option>`).join('')}</select><button class="btn small ghost" id="bClear" style="color:inherit">Seçimi kaldır</button></div>` : ''}`
        : `<div class="card empty"><b>${D.orders.length ? 'Bu filtrelere uyan sipariş yok' : 'Henüz sipariş yok'}</b>${D.orders.length ? 'Dönemi genişletmeyi ya da filtreleri temizlemeyi deneyin.' : 'Sipariş Excel\'inizi yükleyin ya da ilk siparişi elle ekleyin.'}</div>`}`;
    const re = () => route('siparisler');
    bindRange(view, re);
    $('#oImp').onclick = importOrders; $('#oNew').onclick = () => orderForm(); $('#oExp').onclick = () => exportOrders(list);
    let t; $('#oq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { F.q = e.target.value; F.page = 0; re(); setTimeout(() => { const i = $('#oq'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 0); }, 250); };
    $('#os').onchange = (e) => { F.status = e.target.value; F.page = 0; re(); }; $('#ok').onchange = (e) => { F.source = e.target.value; F.page = 0; re(); }; $('#om').onchange = (e) => { F.missing = e.target.checked; F.page = 0; re(); };
    if ($('#pp')) $('#pp').onclick = () => { F.page--; re(); scrollTo(0, 0); }; if ($('#pn')) $('#pn').onclick = () => { F.page++; re(); scrollTo(0, 0); };
    const saveCost = async (id, v, el) => { const o = D.orders.find((x) => x.id === id); if (!o) return; const cost = parseNum(v); const next = o.items?.length === 1 ? { ...o, items: [{ ...o.items[0], cost }], cost: undefined } : { ...o, cost }; await DB.put('orders', next, 'ürün maliyeti'); H.toast(cost == null ? 'Maliyet silindi' : `Maliyet kaydedildi: ${money(cost, 0)}`); };
    view.addEventListener('change', (e) => { const el = e.target; if (el.dataset?.cost) saveCost(el.dataset.cost, el.value, el); if (el.dataset?.ck) { el.checked ? SEL.add(el.dataset.ck) : SEL.delete(el.dataset.ck); re(); } if (el.id === 'ckAll') { $$('[data-ck]', view).forEach((c) => (el.checked ? SEL.add(c.dataset.ck) : SEL.delete(c.dataset.ck))); re(); } }, { signal: abort() });
    view.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset?.cost) e.target.blur(); }, { signal: abort(true) });
    view.addEventListener('click', (e) => { const sg = e.target.closest('[data-sug]'); if (sg) return saveCost(sg.dataset.sug, sg.dataset.v); const op = e.target.closest('[data-open]'); if (op) return orderForm(op.dataset.open); if (e.target.closest('[data-stop]')) return; const tr = e.target.closest('[data-oid]'); if (tr) orderForm(tr.dataset.oid); }, { signal: abort(true) });
    const bulk = async (field, v) => { if (!v) return; await DB.bulkPut('orders', D.orders.filter((o) => SEL.has(o.id)).map((o) => ({ ...o, [field]: v })), `toplu ${field}`); H.toast(`${SEL.size} sipariş güncellendi`); SEL.clear(); };
    if ($('#bStatus')) { $('#bStatus').onchange = (e) => bulk('status', e.target.value); $('#bSource').onchange = (e) => bulk('source', e.target.value); $('#bClear').onclick = () => { SEL.clear(); re(); }; }
  },

  reklam(view) {
    const r = range(), S = C.summarize(r), list = D.ads.filter((a) => a.date >= r.from && a.date <= r.to).sort((a, b) => (a.date < b.date ? 1 : -1));
    const budget = +D.meta.adBudget || 0, M = C.summarize(C.rangeOf('month')), used = budget ? (M.adTotal / budget) * 100 : null;
    view.innerHTML = `${rangeBar(`<button class="btn" id="aImp">Excel yükle</button><button class="btn primary" id="aNew">${ic('i-plus')}Harcama ekle</button>`)}
      <div class="hero">
        <div class="lead"><div class="h-l">Toplam reklam harcaması</div><div class="h-v">${money(S.adTotal, 0)}</div><div class="h-s">Google Ads ${money(S.adGoogle, 0)} · Meta Ads ${money(S.adMeta, 0)}</div></div>
        <div><div class="h-l">Bu ayın bütçesi ${used != null && used > 100 ? '<span class="tag neg">Aşıldı</span>' : ''}</div><div class="h-v">${budget ? pct(used, 0) : '—'}</div><div class="h-s">${budget ? `${money(M.adTotal, 0)} harcandı · ${money(Math.max(0, budget - M.adTotal), 0)} kaldı` : 'Aylık bütçe tanımlanmadı'}</div>${budget ? `<div class="meter" style="margin-top:6px"><i class="${used > 100 ? 'neg' : 'acc'}" style="width:${Math.min(100, used)}%"></i></div>` : `<a class="btn small" href="#/y/ayarlar" style="align-self:flex-start;margin-top:4px">Bütçe tanımla</a>`}</div>
        <div><div class="h-l">ROAS <span class="tag">Gerçek siparişlerden</span></div><div class="h-v">${S.roas == null ? '—' : S.roas.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + 'x'}</div><div class="h-s">Reklam kaynaklı satış ${money(S.adRevenue, 0)} · platformların raporladığı ${money(S.adConvValue, 0)}</div></div>
      </div>
      <div class="grid g2">
        <div class="mgroup"><h3>Kırılım</h3>${S.adBreak.map(([k, v]) => `<div class="mrow" style="display:block"><div class="dist-row"><span>${esc(k)}</span><b>${money(v, 0)}</b><div class="meter"><i class="${k.startsWith('Google') ? 'c2' : k.includes('IYZADS') ? 'c3' : 'acc'}" style="width:${S.adTotal ? (v / S.adTotal) * 100 : 0}%"></i></div></div></div>`).join('')}
          ${mrow('Toplam', money(S.adTotal, 0), 'total', 'IYZADS, Meta Ads toplamının içindedir; ayrıca eklenmez')}</div>
        <div class="mgroup"><h3>Performans</h3>${mrow('Google Ads ROAS', S.roasGoogle == null ? '—' : S.roasGoogle.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + 'x')}${mrow('Meta Ads ROAS', S.roasMeta == null ? '—' : S.roasMeta.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + 'x')}${mrow('MER', S.mer == null ? '—' : S.mer.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + 'x', '', 'Toplam ciro / reklam harcaması')}${mrow('Harcamanın ciroya oranı', pct(S.adShare))}${mrow('Tıklama / gösterim', `${num(S.adClicks)} / ${num(S.adImpr)}`)}
          ${S.sourceKnown != null && S.sourceKnown < 80 ? `<div class="note warn" style="margin:8px 0 10px">Siparişlerin satış kaynağı bilgisi ${pct(S.sourceKnown, 0)} tamam. ROAS değerleri eksik veriyle hesaplanıyor; kesin sonuç değildir.</div>` : ''}</div>
      </div>
      ${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Tarih</th><th>Platform</th><th>Ajans</th><th>Kampanya</th><th class="r">Harcama</th><th class="r">Dönüşüm</th><th class="r">Dönüşüm tutarı</th><th class="r">Tıklama</th></tr></thead><tbody>${list.slice(0, 300).map((a) => `<tr class="click" data-aid="${esc(a.id)}" tabindex="0"><td class="num">${dTR(a.date)}</td><td>${esc(a.platform)}</td><td>${esc(a.agency ?? '—')}</td><td>${esc(a.campaign ?? '—')}</td><td class="r num"><b>${money(a.spend)}</b></td><td class="r num">${num(a.conv)}</td><td class="r num">${a.convValue != null ? money(a.convValue, 0) : '—'}</td><td class="r num">${num(a.clicks)}</td></tr>`).join('')}</tbody></table></div>${list.length > 300 ? '<div class="small muted">İlk 300 kayıt gösteriliyor; dönemi daraltın.</div>' : ''}`
        : `<div class="card empty"><b>Bu dönemde reklam harcaması yok</b>Harcamayı elle ekleyin ya da platform raporunu Excel olarak yükleyin.</div>`}`;
    bindRange(view, () => route('reklam')); $('#aNew').onclick = () => adForm(); $('#aImp').onclick = importAds;
    view.addEventListener('click', (e) => { const tr = e.target.closest('[data-aid]'); if (tr) adForm(tr.dataset.aid); }, { signal: abort() });
  },

  giderler(view) {
    const r = range(), list = C.expensesIn(r), today = C.todayTR();
    const st = (e) => (e.paid ? 'Ödendi' : e.due && e.due < today ? 'Gecikti' : 'Bekliyor');
    const tot = (f) => list.filter(f).reduce((t, e) => t + e.amount, 0);
    const byCat = Object.entries(list.reduce((m, e) => ((m[e.category] = (m[e.category] ?? 0) + e.amount), m), {})).sort((a, b) => b[1] - a[1]);
    const total = tot(() => true);
    view.innerHTML = `${rangeBar(`<button class="btn primary" id="eNew">${ic('i-plus')}Gider ekle</button>`)}
      <div class="hero">
        <div class="lead"><div class="h-l">Toplam gider <span class="tag">KDV hariç</span></div><div class="h-v">${money(total, 0)}</div><div class="h-s">${num(list.length)} kayıt · tekrarlayanlar dahil</div></div>
        <div><div class="h-l">Bekleyen</div><div class="h-v">${money(tot((e) => st(e) === 'Bekliyor'), 0)}</div><div class="h-s">Ödenmiş ${money(tot((e) => e.paid), 0)}</div></div>
        <div><div class="h-l">Gecikmiş</div><div class="h-v" style="color:${tot((e) => st(e) === 'Gecikti') ? 'var(--neg)' : 'inherit'}">${money(tot((e) => st(e) === 'Gecikti'), 0)}</div><div class="h-s">Son ödeme tarihi geçenler</div></div>
      </div>
      ${list.length ? `<div class="grid g2" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr)">
        <div class="mgroup"><h3>Kategoriye göre</h3><div class="dist" style="padding-bottom:12px">${byCat.map(([k, v]) => `<div class="dist-row"><span>${esc(k)}${C.AUTO_CATS[k] ? ' <span class="tag warn">Kâra eklenmez</span>' : ''}</span><b>${money(v, 0)}</b><div class="meter"><i class="acc" style="width:${total ? (v / total) * 100 : 0}%"></i></div></div>`).join('')}</div></div>
        <div class="tbl-wrap"><table><thead><tr><th>Tarih</th><th>Gider</th><th>Kategori</th><th>Firma</th><th class="r">KDV hariç</th><th class="r">KDV dahil</th><th>Durum</th></tr></thead><tbody>${list.map((e) => `<tr class="click" data-eid="${esc(e.id)}" tabindex="0"><td class="num">${dTR(e.occ)}</td><td><b>${esc(e.name)}</b>${e.recurring || (e.repeat && e.repeat !== 'none') ? ' <span class="tag acc">Tekrarlayan</span>' : ''}</td><td>${esc(e.category)}</td><td>${esc(e.vendor ?? '—')}</td><td class="r num">${money(e.net ?? e.gross)}</td><td class="r num">${money(e.gross ?? e.net)}</td><td><span class="tag ${st(e) === 'Ödendi' ? 'pos' : st(e) === 'Gecikti' ? 'neg' : 'warn'}">${st(e)}</span></td></tr>`).join('')}</tbody></table></div></div>`
        : `<div class="card empty"><b>Bu dönemde gider yok</b>Ajans, yazılım, personel gibi giderleri ekleyin. Aylık tekrarlayan bir gideri bir kez girmeniz yeterli.</div>`}`;
    bindRange(view, () => route('giderler')); $('#eNew').onclick = () => expenseForm();
    view.addEventListener('click', (e) => { const tr = e.target.closest('[data-eid]'); if (tr) expenseForm(tr.dataset.eid); }, { signal: abort() });
  },

  karlilik(view) {
    const r = range(), S = C.summarize(r);
    const dims = { Kategori: (o) => o.category ?? o.items?.[0]?.category, Ürün: (o) => (o.items?.length > 1 ? 'Çok ürünlü sipariş' : o.product ?? o.items?.[0]?.name), 'Satış kanalı': (o) => o.source || 'Bilinmiyor', 'Ödeme yöntemi': (o) => o.payment };
    F.dim = dims[F.dim] ? F.dim : 'Kategori';
    const rows = C.breakdown(r, dims[F.dim]);
    const loss = D.orders.filter((o) => o.date >= r.from && o.date <= r.to && !C.isVoid(o)).map((o) => ({ o, c: C.orderCalc(o) })).filter((x) => x.c.profit != null && x.c.profit < 0).sort((a, b) => a.c.profit - b.c.profit);
    const neg = (v) => (v ? '− ' + money(v, 0) : money(0, 0));
    view.innerHTML = `${rangeBar()}
      ${!S.hasData ? `<div class="card empty"><b>Bu dönemde veri yok</b>Kârlılık, sipariş ve gider verileri girildikçe hesaplanır.</div>` : `
      ${S.costMissing ? `<div class="note warn"><b>Kâr rakamları kesinleşmedi.</b> ${S.costMissing} siparişin ürün maliyeti girilmemiş (maliyet verisi ${pct(S.costComplete, 0)} tamam). Eksik maliyetler sıfır sayıldığı için kâr olduğundan yüksek görünür. <a href="#/y/siparisler" data-missing>Eksikleri tamamla</a></div>` : ''}
      <div class="grid g2">
        <div class="mgroup"><h3>Dönem kâr tablosu <span class="tag">Yönetimsel</span></h3>
          ${mrow('Toplam ciro', money(S.ciro, 0), '', C.kdvRate() ? 'KDV dahil' : 'Girildiği haliyle')}
          ${mrow('İndirimler' + (C.kdvRate() ? ' ve satış KDV\'si' : ''), neg(S.ciro - S.net), 'sub')}
          ${mrow('Net satış geliri', money(S.net, 0), 'total')}
          ${mrow('Satılan ürünlerin maliyeti', neg(S.cost), 'sub')}
          ${mrow('Brüt kâr', money(S.grossProfit, 0), 'total')}
          ${mrow('Reklam giderleri', neg(S.adTotal), 'sub')}${mrow('Ajans hizmet bedelleri', neg(S.agency), 'sub')}${mrow('Sanal POS komisyonları', neg(S.pos), 'sub')}${mrow('Kargo ve paketleme', neg(S.shipping), 'sub')}${mrow('Diğer operasyonel giderler', neg(S.otherOpex), 'sub')}
          <div class="mrow total"><span>Operasyonel kâr ${S.final ? '' : '<span class="tag warn">Kesinleşmedi</span>'}</span><b class="${S.opProfit < 0 ? 'neg' : 'pos'}">${money(S.opProfit, 0)}</b></div>
          ${mrow('Kâr marjı', pct(S.margin), '', 'Operasyonel kâr / net satış')}
          <div class="note" style="margin:8px 0 12px">Bu tablo yönetim amaçlıdır; resmi muhasebe kârı değildir. ${C.kdvRate() ? `Net satış %${C.kdvRate()} KDV düşülerek hesaplandı.` : 'KDV oranı Ayarlar\'da tanımlanmadığı için satış tutarlarından KDV düşülmedi.'}</div></div>
        <div style="display:flex;flex-direction:column;gap:var(--s4);min-width:0">
          <div class="card"><div class="card-head"><div><h2>Kırılım</h2><p class="muted small">Kâr, yalnızca maliyeti girilmiş siparişlerden hesaplanır</p></div><div class="seg">${Object.keys(dims).map((k) => `<button data-dim="${k}" class="${F.dim === k ? 'on' : ''}">${k}</button>`).join('')}</div></div>
            ${rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>${F.dim}</th><th class="r">Sipariş</th><th class="r">Net satış</th><th class="r">Kâr</th><th class="r">Marj</th></tr></thead><tbody>${rows.slice(0, 40).map((x) => `<tr><td>${esc(x.key)}</td><td class="r num">${x.n}${x.known < x.n ? ` <span class="tag warn">${x.n - x.known} eksik</span>` : ''}</td><td class="r num">${money(x.net, 0)}</td><td class="r num" style="color:${x.profit < 0 ? 'var(--neg)' : 'inherit'}">${x.known ? money(x.profit, 0) : '—'}</td><td class="r num">${pct(x.margin)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Bu dönemde sipariş yok.</div>'}</div>
          <div class="card"><div class="card-head"><div><h2>Zarar edilen siparişler</h2><p class="muted small">Ürün maliyeti, kargo, paket ve POS sonrası</p></div></div>
            ${loss.length ? `<div class="tbl-wrap"><table><thead><tr><th>Sipariş</th><th>Ürün</th><th class="r">Net satış</th><th class="r">Zarar</th></tr></thead><tbody>${loss.slice(0, 20).map(({ o, c }) => `<tr class="click" data-oid="${esc(o.id)}" tabindex="0"><td><b>${esc(o.no)}</b><div class="small muted num">${dTR(o.date)}</div></td><td>${esc(o.product ?? o.items?.[0]?.name ?? '—')}</td><td class="r num">${money(c.net, 0)}</td><td class="r num" style="color:var(--neg)">${money(c.profit, 0)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Maliyeti girilmiş siparişler arasında zarar edilen yok.</div>'}</div>
        </div></div>`}`;
    bindRange(view, () => route('karlilik'));
    $$('[data-dim]', view).forEach((b) => (b.onclick = () => { F.dim = b.dataset.dim; route('karlilik'); }));
    $('[data-missing]', view)?.addEventListener('click', () => { F.missing = true; });
    view.addEventListener('click', (e) => { const tr = e.target.closest('[data-oid]'); if (tr) orderForm(tr.dataset.oid); }, { signal: abort() });
  },

  async ayarlar(view) {
    const log = await DB.auditLog(60);
    view.innerHTML = `<div class="note warn"><b>Veriler şu an yalnızca bu tarayıcıda saklanıyor.</b> Başka bir bilgisayarda ya da başka bir kullanıcıda görünmez; tarayıcı verisi temizlenirse silinir. Düzenli olarak yedek alın. Ortak ve yetkili erişim için sunucu taraflı veritabanına geçiş gerekir.</div>
      <div class="grid g2">
        <div class="card"><h2>Hesaplama</h2><div class="form" style="margin-top:var(--s4)">
          <div class="field"><label for="sKdv">Satış KDV oranı (%)</label><input id="sKdv" inputmode="decimal" value="${esc(D.meta.kdvRate ?? '')}" placeholder="Tanımlı değil"></div>
          <div class="field"><label for="sBud">Aylık reklam bütçesi (₺)</label><input id="sBud" inputmode="decimal" value="${D.meta.adBudget ? (+D.meta.adBudget).toLocaleString('tr-TR') : ''}" placeholder="Tanımlı değil"></div>
          <p class="small muted full">KDV oranı boş bırakılırsa satış tutarlarından KDV düşülmez. Pırlanta ve altın ürünlerde KDV matrahı farklı hesaplanabildiği için oranı mali müşavirinizle teyit edin.</p>
          <div class="full"><button class="btn primary" id="sSave">Ayarları kaydet</button></div></div></div>
        <div class="card"><h2>Yedek</h2><p class="muted small" style="margin-top:4px">${num(D.orders.length)} sipariş · ${num(D.ads.length)} reklam kaydı · ${num(D.expenses.length)} gider</p>
          <div class="bar" style="margin-top:var(--s4)"><button class="btn primary" id="bkOut">Yedek indir</button><label class="btn" for="bkIn">Yedekten geri yükle</label><input id="bkIn" type="file" accept="application/json,.json" hidden></div>
          <p class="small muted" style="margin-top:var(--s3)">Geri yükleme, bu tarayıcıdaki mevcut yönetim verisinin yerine geçer. Yedek dosyası müşteri ve finans verisi içerir; güvenli bir yerde saklayın.</p></div>
      </div>
      <div class="card"><div class="card-head"><div><h2>Kayıt geçmişi</h2><p class="muted small">Kim, ne zaman, hangi kaydı değiştirdi (son 60 işlem)</p></div></div>
        ${log.length ? `<div class="tbl-wrap"><table><thead><tr><th>Zaman</th><th>Kullanıcı</th><th>Alan</th><th>Değişiklik</th></tr></thead><tbody>${log.map((l) => `<tr><td class="num">${new Date(l.at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</td><td>${esc(l.by)}</td><td>${esc({ orders: 'Sipariş', ads: 'Reklam', expenses: 'Gider', meta: 'Ayar', '*': 'Tümü' }[l.store] ?? l.store)}</td><td>${esc((l.changed ?? []).join(', '))}${l.note ? ` <span class="muted">· ${esc(l.note)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Henüz kayıt yok.</div>'}</div>`;
    $('#sSave').onclick = async () => { const k = parseNum($('#sKdv').value), b = parseNum($('#sBud').value); if (k != null && (k < 0 || k > 100)) return H.toast('KDV oranı 0 ile 100 arasında olmalı.', 'err'); await DB.setMeta('kdvRate', k); await DB.setMeta('adBudget', b); H.toast('Ayarlar kaydedildi'); };
    $('#bkOut').onclick = async () => download(`sina-yonetim-yedek-${C.todayTR()}.json`, new Blob([JSON.stringify(await DB.exportAll())], { type: 'application/json' }));
    $('#bkIn').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (!confirm(`Yedekteki ${j.orders?.length ?? 0} sipariş, ${j.ads?.length ?? 0} reklam kaydı ve ${j.expenses?.length ?? 0} gider geri yüklenecek. Bu tarayıcıdaki mevcut yönetim verisi silinecek. Devam edilsin mi?`)) return; await DB.importAll(j); H.toast('Yedek geri yüklendi'); } catch (err) { H.toast(err.message?.startsWith('Bu dosya') ? err.message : 'Dosya okunamadı. Geçerli bir yedek dosyası seçin.', 'err'); } };
  },
};

/* ---------- Durum: filtreler, seçim, olay temizliği ---------- */
const F = { q: '', status: '', source: '', missing: false, page: 0, dim: 'Kategori' };
const SEL = new Set();
let ac = null;
function abort(keep) { if (!keep || !ac) { ac?.abort(); ac = new AbortController(); } return ac.signal; }

/* ---------- Formlar (detay panelinde açılır) ---------- */
const fld = (id, label, value, attr = '', cls = '') => `<div class="field ${cls}"><label for="${id}">${label}</label><input id="${id}" value="${esc(value ?? '')}" ${attr}></div>`;
const sel = (id, label, list, value, all) => `<div class="field"><label for="${id}">${label}</label><select id="${id}">${opt(list, value, all)}</select></div>`;
const nv = (v) => (v != null ? Number(v).toLocaleString('tr-TR') : '');
function sheet(title, body, { onSave, onDelete }) {
  H.openDrawer(title, `<form id="yForm" novalidate style="display:contents">${body}</form>`);
  const bodyEl = $('#drawerBody'), foot = document.createElement('div'); foot.className = 'sheet-foot'; foot.id = 'yFoot';
  foot.innerHTML = `${onDelete ? '<button class="btn ghost left" type="button" id="yDel" style="color:var(--neg)">Sil</button>' : ''}<button class="btn" type="button" data-close>Vazgeç</button><button class="btn primary" type="button" id="ySave">Kaydet</button>`;
  $('#yFoot')?.remove(); bodyEl.after(foot);
  $('#ySave').onclick = async () => { try { if ((await onSave()) !== false) { H.closeDrawer(); Y.dirty = false; route(Y.page); } } catch (e) { H.toast(e.message || 'Kaydedilemedi', 'err'); } };
  if (onDelete) $('#yDel').onclick = async () => { if (confirm('Bu kayıt silinecek. Geri alınamaz. Silinsin mi?')) { await onDelete(); H.closeDrawer(); Y.dirty = false; route(Y.page); H.toast('Kayıt silindi'); } };
  $('#yForm').onsubmit = (e) => { e.preventDefault(); $('#ySave').click(); };
}
const need = (cond, msg, id) => { if (!cond) { $(id)?.focus(); throw new Error(msg); } };

function orderForm(id) {
  const o = id ? D.orders.find((x) => x.id === id) : null;
  let items = o?.items?.length ? o.items.map((i) => ({ ...i })) : [{ name: o?.product ?? '', code: o?.code ?? '', category: o?.category ?? '', qty: o?.qty ?? 1, cost: o?.cost ?? null }];
  const c = o ? C.orderCalc(o) : null;
  const itemsHtml = () => items.map((i, k) => `<div class="item" data-k="${k}"><input placeholder="Ürün adı" data-f="name" value="${esc(i.name ?? '')}" aria-label="Ürün adı"><input placeholder="Ürün kodu" data-f="code" value="${esc(i.code ?? '')}" aria-label="Ürün kodu"><select data-f="category" aria-label="Kategori">${opt(C.cats(), i.category, 'Kategori')}</select><input placeholder="Adet" inputmode="numeric" data-f="qty" value="${i.qty ?? 1}" aria-label="Adet"><input placeholder="Birim maliyet" inputmode="decimal" data-f="cost" value="${nv(i.cost)}" aria-label="Birim maliyet"><button type="button" class="icon-btn" data-rm="${k}" aria-label="Ürünü kaldır"${items.length < 2 ? ' disabled' : ''}>${ic('i-x')}</button></div>`).join('');
  sheet(o ? `Sipariş ${o.no}` : 'Yeni sipariş', `
    ${c ? `<div class="hero static"><div><div class="h-l">Net satış</div><div class="h-v">${money(c.net, 0)}</div></div><div><div class="h-l">Sipariş kârı</div><div class="h-v" style="color:${c.profit < 0 ? 'var(--neg)' : 'inherit'}">${c.profit == null ? '—' : money(c.profit, 0)}</div><div class="h-s">${c.profit == null ? 'Maliyet girilmedi' : 'Marj ' + pct(c.margin)}</div></div><div><div class="h-l">Bekleyen tahsilat</div><div class="h-v">${money(c.pending, 0)}</div><div class="h-s">Yatması gereken ${money(c.expected, 0)}</div></div></div>` : ''}
    <div class="card"><div class="form">
      ${fld('fNo', 'Sipariş numarası', o?.no, 'required')}${fld('fDate', 'Sipariş tarihi', o?.date ?? C.todayTR(), 'type="date" required')}
      ${fld('fCust', 'Müşteri adı soyadı', o?.customer, 'autocomplete="off"')}${sel('fStatus', 'Sipariş durumu', C.ORDER_STATUS, o?.status ?? 'Onaylandı')}
      ${sel('fSource', 'Satış kaynağı', C.SOURCES, o?.source ?? 'Bilinmiyor')}${fld('fPay', 'Ödeme yöntemi', o?.payment, 'placeholder="Kredi kartı, havale…"')}
      <h3>Ürünler ve maliyet</h3><div class="items" id="fItems">${itemsHtml()}</div><div class="full"><button type="button" class="btn small" id="fAdd">${ic('i-plus')}Ürün ekle</button></div>
      <h3>Tutarlar (₺)</h3>
      ${fld('fSale', 'Satış tutarı', nv(o?.sale), 'inputmode="decimal" required')}${fld('fInv', 'Fatura tutarı', nv(o?.invoice), 'inputmode="decimal"')}
      ${fld('fDisc', 'İndirim tutarı', nv(o?.discount), 'inputmode="decimal"')}${fld('fPos', 'POS komisyonu', nv(o?.pos), 'inputmode="decimal"')}
      ${fld('fShip', 'Kargo maliyeti', nv(o?.shipping), 'inputmode="decimal"')}${fld('fPack', 'Paketleme maliyeti', nv(o?.packaging), 'inputmode="decimal"')}
      <h3>Tahsilat</h3>
      ${fld('fColl', 'Hesaba yatan tutar', nv(o?.collected), 'inputmode="decimal"')}${fld('fCollD', 'Hesaba yatış tarihi', o?.collectedDate, 'type="date"')}
      ${fld('fPosF', 'Sanal POS firması', o?.posFirm)}${fld('fInst', 'Taksit sayısı', o?.installments, 'inputmode="numeric"')}
      <div class="field full"><label for="fNote">Notlar</label><textarea id="fNote">${esc(o?.notes ?? '')}</textarea></div>
    </div></div>`, {
    onSave: async () => {
      const g = (i) => $(i).value.trim();
      need(g('#fNo'), 'Sipariş numarası girin.', '#fNo'); need(parseDate(g('#fDate')), 'Geçerli bir sipariş tarihi girin.', '#fDate'); need(parseNum(g('#fSale')) != null, 'Satış tutarını girin.', '#fSale');
      const dup = D.orders.find((x) => x.no === g('#fNo') && x.id !== o?.id); need(!dup, 'Bu sipariş numarası zaten kayıtlı.', '#fNo');
      const its = items.filter((i) => i.name || i.code).map((i) => ({ name: i.name || '', code: i.code || '', category: i.category || '', qty: +i.qty || 1, cost: i.cost }));
      const rec = { ...(o ?? {}), id: o?.id ?? DB.uid('o_'), no: g('#fNo'), date: parseDate(g('#fDate')), customer: g('#fCust') || null, status: g('#fStatus'), source: g('#fSource'), payment: g('#fPay') || null,
        items: its, product: its[0]?.name ?? null, code: its[0]?.code ?? null, category: its[0]?.category ?? null, cost: undefined,
        sale: parseNum(g('#fSale')), invoice: parseNum(g('#fInv')), discount: parseNum(g('#fDisc')), pos: parseNum(g('#fPos')), shipping: parseNum(g('#fShip')), packaging: parseNum(g('#fPack')),
        collected: parseNum(g('#fColl')), collectedDate: parseDate(g('#fCollD')), posFirm: g('#fPosF') || null, installments: parseNum(g('#fInst')), notes: g('#fNote') || null, manual: o ? o.manual : true };
      await DB.put('orders', rec, o ? 'sipariş düzenlendi' : 'elle eklendi'); H.toast(o ? 'Sipariş güncellendi' : 'Sipariş eklendi');
    },
    onDelete: o ? () => DB.del('orders', o.id) : null,
  });
  const box = $('#fItems');
  box.addEventListener('input', (e) => { const row = e.target.closest('[data-k]'); if (!row) return; const f = e.target.dataset.f; items[+row.dataset.k][f] = f === 'cost' ? parseNum(e.target.value) : e.target.value; });
  box.addEventListener('change', (e) => { const row = e.target.closest('[data-k]'); if (row && e.target.dataset.f === 'category') items[+row.dataset.k].category = e.target.value; });
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { items.splice(+b.dataset.rm, 1); box.innerHTML = itemsHtml(); } });
  $('#fAdd').onclick = () => { items.push({ name: '', code: '', category: '', qty: 1, cost: null }); box.innerHTML = itemsHtml(); };
}

function adForm(id) {
  const a = id ? D.ads.find((x) => x.id === id) : null;
  sheet(a ? 'Reklam harcaması' : 'Harcama ekle', `<div class="card"><div class="form">
    ${fld('aDate', 'Tarih', a?.date ?? C.todayTR(), 'type="date" required')}${fld('aSpend', 'Harcama (₺)', nv(a?.spend), 'inputmode="decimal" required')}
    ${sel('aPlat', 'Reklam platformu', [...new Set([...C.PLATFORMS, ...D.ads.map((x) => x.platform)])], a?.platform ?? 'Google Ads')}${sel('aAg', 'Reklamı yöneten ajans', [...new Set([...C.AGENCIES, ...D.ads.map((x) => x.agency).filter(Boolean)])], a?.agency ?? 'Dijital İz', 'Belirtilmemiş')}
    ${fld('aCamp', 'Kampanya adı', a?.campaign, '', 'full')}
    ${fld('aConv', 'Dönüşüm adedi', nv(a?.conv), 'inputmode="decimal"')}${fld('aConvV', 'Dönüşüm tutarı (₺)', nv(a?.convValue), 'inputmode="decimal"')}
    ${fld('aImpr', 'Gösterim', nv(a?.impr), 'inputmode="numeric"')}${fld('aClk', 'Tıklama', nv(a?.clicks), 'inputmode="numeric"')}
    <div class="field full"><label for="aNote">Açıklama</label><textarea id="aNote">${esc(a?.note ?? '')}</textarea></div>
    <p class="small muted full">Dönüşüm tutarı platformun raporladığı değerdir; ROAS hesabında gerçek siparişlerdeki satış kaynağı kullanılır.</p></div></div>`, {
    onSave: async () => { const g = (i) => $(i).value.trim(); need(parseDate(g('#aDate')), 'Geçerli bir tarih girin.', '#aDate'); need(parseNum(g('#aSpend')) != null, 'Harcama tutarını girin.', '#aSpend');
      await DB.put('ads', { ...(a ?? {}), id: a?.id ?? DB.uid('a_'), date: parseDate(g('#aDate')), spend: parseNum(g('#aSpend')), platform: g('#aPlat'), agency: g('#aAg') || null, campaign: g('#aCamp') || null, conv: parseNum(g('#aConv')), convValue: parseNum(g('#aConvV')), impr: parseNum(g('#aImpr')), clicks: parseNum(g('#aClk')), note: g('#aNote') || null }); H.toast('Harcama kaydedildi'); },
    onDelete: a ? () => DB.del('ads', a.id) : null,
  });
}

function expenseForm(id) {
  const e = id ? D.expenses.find((x) => x.id === id) : null;
  sheet(e ? 'Gider' : 'Gider ekle', `<div class="card"><div class="form">
    ${fld('eName', 'Gider adı', e?.name, 'required', 'full')}
    ${sel('eCat', 'Kategori', C.expenseCats(), e?.category ?? 'Diğer operasyonel giderler')}${fld('eVendor', 'İlgili firma', e?.vendor)}
    <div class="note warn full" id="eAuto" hidden></div>
    ${fld('eDate', 'Gider tarihi', e?.date ?? C.todayTR(), 'type="date" required')}${sel('eRep', 'Tekrarlama', ['Tek seferlik', 'Her ay', '3 ayda bir', 'Her yıl'], { monthly: 'Her ay', quarterly: '3 ayda bir', yearly: 'Her yıl' }[e?.repeat] ?? 'Tek seferlik')}
    ${fld('eNet', 'KDV hariç tutar (₺)', nv(e?.net), 'inputmode="decimal" required')}${fld('eRate', 'KDV oranı (%)', e?.kdvRate ?? 20, 'inputmode="decimal"')}
    ${fld('eKdv', 'KDV tutarı (₺)', nv(e?.kdv), 'inputmode="decimal"')}${fld('eGross', 'KDV dahil tutar (₺)', nv(e?.gross), 'inputmode="decimal"')}
    ${fld('eDue', 'Son ödeme tarihi', e?.due, 'type="date"')}${fld('ePaidD', 'Ödeme tarihi', e?.paidDate, 'type="date"')}
    <div class="field"><label>&nbsp;</label><label class="switch" style="min-height:36px"><input type="checkbox" id="ePaid"${e?.paid ? ' checked' : ''}>Ödendi</label></div>${fld('eInv', 'Fatura numarası', e?.invoiceNo)}
    <div class="field full"><label for="eNote">Açıklama</label><textarea id="eNote">${esc(e?.note ?? '')}</textarea></div></div></div>`, {
    onSave: async () => { const g = (i) => $(i).value.trim(); need(g('#eName'), 'Gider adını girin.', '#eName'); need(parseDate(g('#eDate')), 'Geçerli bir gider tarihi girin.', '#eDate'); need(parseNum(g('#eNet')) != null, 'KDV hariç tutarı girin.', '#eNet');
      await DB.put('expenses', { ...(e ?? {}), id: e?.id ?? DB.uid('e_'), name: g('#eName'), category: g('#eCat'), vendor: g('#eVendor') || null, date: parseDate(g('#eDate')), repeat: { 'Her ay': 'monthly', '3 ayda bir': 'quarterly', 'Her yıl': 'yearly' }[g('#eRep')] ?? 'none',
        net: parseNum(g('#eNet')), kdvRate: parseNum(g('#eRate')), kdv: parseNum(g('#eKdv')), gross: parseNum(g('#eGross')), due: parseDate(g('#eDue')), paidDate: parseDate(g('#ePaidD')), paid: $('#ePaid').checked, invoiceNo: g('#eInv') || null, note: g('#eNote') || null }); H.toast('Gider kaydedildi'); },
    onDelete: e ? () => DB.del('expenses', e.id) : null,
  });
  const calc = () => { const n = parseNum($('#eNet').value), rt = parseNum($('#eRate').value) ?? 0; if (n != null) { $('#eKdv').value = nv(Math.round(n * rt) / 100); $('#eGross').value = nv(Math.round(n * (100 + rt)) / 100); } };
  $('#eNet').oninput = calc; $('#eRate').oninput = calc;
  const auto = () => { const src = C.AUTO_CATS[$('#eCat').value], el = $('#eAuto'); el.hidden = !src; if (src) el.textContent = `Bu kategorinin tutarı ${src} ekranından otomatik gelir. Burada girilen kayıt gider listesinde görünür ama kârlılığa ikinci kez eklenmez.`; };
  $('#eCat').onchange = auto; auto();
}

/* ---------- Excel aktarımı ---------- */
const ORDER_FIELDS = [['no', 'Sipariş numarası', true, ['sipariş no', 'siparis no', 'sipariş numarası', 'order', 'no']], ['date', 'Sipariş tarihi', true, ['tarih', 'sipariş tarihi', 'date']], ['customer', 'Müşteri adı soyadı', false, ['müşteri', 'musteri', 'ad soyad', 'alıcı', 'customer']],
  ['product', 'Ürün adı', false, ['ürün adı', 'urun adi', 'ürün', 'product']], ['code', 'Ürün kodu', false, ['ürün kodu', 'stok kodu', 'kod', 'sku']], ['category', 'Ürün kategorisi', false, ['kategori', 'category']], ['qty', 'Ürün adedi', false, ['adet', 'miktar', 'qty']],
  ['sale', 'Satış tutarı', true, ['satış tutarı', 'satis tutari', 'tutar', 'toplam', 'ciro', 'fiyat']], ['invoice', 'Fatura tutarı', false, ['fatura tutarı', 'fatura']], ['discount', 'İndirim tutarı', false, ['indirim']],
  ['collected', 'Hesaba yatan para', false, ['hesaba yatan', 'yatan', 'tahsil edilen', 'tahsilat']], ['collectedDate', 'Hesaba yatış tarihi', false, ['yatış tarihi', 'ödeme tarihi', 'tahsilat tarihi']],
  ['cost', 'Ürün maliyeti', false, ['maliyet', 'ürün maliyeti', 'alış']], ['shipping', 'Kargo maliyeti', false, ['kargo']], ['packaging', 'Paketleme maliyeti', false, ['paket']], ['pos', 'POS komisyonu', false, ['pos komisyon', 'komisyon']],
  ['payment', 'Ödeme yöntemi', false, ['ödeme yöntemi', 'ödeme tipi', 'ödeme şekli']], ['posFirm', 'Sanal POS firması', false, ['pos firması', 'banka', 'sanal pos']], ['installments', 'Taksit sayısı', false, ['taksit']],
  ['source', 'Satış kaynağı', false, ['kaynak', 'kanal', 'source']], ['status', 'Sipariş durumu', false, ['durum', 'status']], ['notes', 'Notlar', false, ['not', 'açıklama']]];
const NUMF = ['sale', 'invoice', 'discount', 'collected', 'cost', 'shipping', 'packaging', 'pos', 'qty', 'installments'];
// Elle girilen alanlar: Excel yeniden yüklendiğinde üzerine yazılmaz (yalnızca boşsa doldurulur)
const KEEP = ['cost', 'shipping', 'packaging', 'notes', 'source', 'status', 'collected', 'collectedDate', 'pos'];
const normSource = (v) => { const t = String(v ?? '').toLocaleLowerCase('tr-TR'); return /google/.test(t) ? 'Google Ads' : /meta|facebook|instagram/.test(t) ? 'Meta Ads' : /organik|organic|seo/.test(t) ? 'Organik' : /doğrudan|direct/.test(t) ? 'Doğrudan' : v ? 'Bilinmiyor' : null; };
const normStatus = (v) => { const t = String(v ?? '').toLocaleLowerCase('tr-TR'); return /iptal/.test(t) ? 'İptal' : /iade/.test(t) ? 'İade' : /teslim/.test(t) ? 'Teslim edildi' : /kargo/.test(t) ? 'Kargoda' : /hazır/.test(t) ? 'Hazırlanıyor' : v ? 'Onaylandı' : null; };
function importOrders() {
  openImport({ H, xlsx, title: 'Sipariş Excel\'i yükle', fields: ORDER_FIELDS, mapKey: 'mapOrders', savedMap: D.meta.mapOrders, saveMap: (m) => DB.setMeta('mapOrders', m),
    build(rows) {
      const byNo = new Map(), errors = [];
      rows.forEach((r, i) => { const no = String(r.no ?? '').trim(), date = parseDate(r.date); if (!no) return errors.push(`Satır ${i + 2}: sipariş numarası boş`); if (!date) return errors.push(`Satır ${i + 2}: tarih okunamadı (${r.date ?? 'boş'})`);
        const v = Object.fromEntries(Object.entries(r).map(([k, x]) => [k, NUMF.includes(k) ? parseNum(x) : k.endsWith('Date') ? parseDate(x) : x == null || x === '' ? null : String(x).trim()]));
        const item = { name: v.product ?? '', code: v.code ?? '', category: v.category ?? '', qty: v.qty || 1, cost: v.cost };
        if (!byNo.has(no)) byNo.set(no, { ...v, no, date, items: [item] }); else byNo.get(no).items.push(item); }); // aynı sipariş numaralı satırlar tek siparişin ürünleri sayılır; tutar ilk satırdan alınır
      const existing = new Map(D.orders.map((o) => [o.no, o])), out = []; let fresh = 0, upd = 0, same = 0;
      for (const n of byNo.values()) {
        const old = existing.get(n.no);
        const base = { no: n.no, date: n.date, customer: n.customer, sale: n.sale, invoice: n.invoice, discount: n.discount, payment: n.payment, posFirm: n.posFirm, installments: n.installments, product: n.items[0].name || null, code: n.items[0].code || null, category: n.items[0].category || null };
        const soft = { shipping: n.shipping, packaging: n.packaging, notes: n.notes, source: normSource(n.source), status: normStatus(n.status), collected: n.collected, collectedDate: n.collectedDate, pos: n.pos };
        if (!old) { out.push({ id: DB.uid('o_'), ...base, ...Object.fromEntries(Object.entries(soft).filter(([, v]) => v != null)), status: soft.status ?? 'Onaylandı', source: soft.source ?? 'Bilinmiyor', items: n.items, manual: false }); fresh++; continue; }
        const next = { ...old }; for (const [k, v] of Object.entries(base)) if (v != null) next[k] = v;
        for (const [k, v] of Object.entries(soft)) if (v != null && (old[k] == null || old[k] === '' || (k === 'source' && old[k] === 'Bilinmiyor'))) next[k] = v;
        // Ürün maliyetleri: daha önce girilmiş maliyet korunur; yalnızca boşsa Excel'deki değer alınır
        const oldItems = old.items?.length ? old.items : [{ code: old.code, cost: old.cost }];
        next.items = n.items.map((it, k) => { const prev = oldItems.find((x) => x.code && x.code === it.code) ?? oldItems[k]; return { ...it, cost: prev?.cost ?? it.cost }; }); next.cost = undefined;
        if (JSON.stringify({ ...next, updatedAt: 0, updatedBy: 0 }) === JSON.stringify({ ...old, updatedAt: 0, updatedBy: 0 })) same++; else { out.push(next); upd++; }
      }
      return { records: out, errors, summary: `${fresh} yeni sipariş eklenecek · ${upd} sipariş güncellenecek · ${same} sipariş değişmedi`, note: 'Daha önce girdiğiniz maliyet, kargo, paket, not, kaynak, durum ve tahsilat bilgileri korunur; Excel yalnızca boş olanları doldurur.' };
    },
    commit: (recs) => DB.bulkPut('orders', recs, 'Excel aktarımı'),
  });
}
const AD_FIELDS = [['date', 'Tarih', true, ['tarih', 'gün', 'date', 'day']], ['spend', 'Reklam harcaması', true, ['harcama', 'maliyet', 'tutar', 'cost', 'spend', 'amount spent']], ['platform', 'Reklam platformu', false, ['platform']], ['agency', 'Ajans', false, ['ajans', 'agency']], ['campaign', 'Kampanya adı', false, ['kampanya', 'campaign']],
  ['conv', 'Dönüşüm adedi', false, ['dönüşüm', 'donusum', 'conversions', 'purchases', 'satın alma']], ['convValue', 'Dönüşüm tutarı', false, ['dönüşüm değeri', 'dönüşüm tutarı', 'conv. value', 'purchase conversion value']], ['impr', 'Gösterim', false, ['gösterim', 'impr']], ['clicks', 'Tıklama', false, ['tıklama', 'click']], ['note', 'Açıklama', false, ['açıklama', 'not']]];
function importAds() {
  openImport({ H, xlsx, title: 'Reklam harcaması yükle', fields: AD_FIELDS, mapKey: 'mapAds', savedMap: D.meta.mapAds, saveMap: (m) => DB.setMeta('mapAds', m),
    extra: `<div class="form"><div class="field"><label for="iPlat">Platform sütunu yoksa</label><select id="iPlat">${opt(C.PLATFORMS, 'Google Ads')}</select></div><div class="field"><label for="iAg">Ajans sütunu yoksa</label><select id="iAg">${opt(C.AGENCIES, 'Dijital İz')}</select></div></div>`,
    build(rows) {
      const defP = $('#iPlat')?.value ?? 'Google Ads', defA = $('#iAg')?.value ?? 'Dijital İz', errors = [], out = []; let fresh = 0, upd = 0;
      const key = (a) => [a.date, a.platform, a.agency ?? '', a.campaign ?? ''].join('|'), existing = new Map(D.ads.map((a) => [key(a), a]));
      rows.forEach((r, i) => { const date = parseDate(r.date), spend = parseNum(r.spend); if (!date) return errors.push(`Satır ${i + 2}: tarih okunamadı (${r.date ?? 'boş'})`); if (spend == null) return errors.push(`Satır ${i + 2}: harcama okunamadı`);
        const p = String(r.platform ?? '').toLocaleLowerCase('tr-TR'), ag = String(r.agency ?? '').toLocaleLowerCase('tr-TR');
        const rec = { date, spend, platform: /google/.test(p) ? 'Google Ads' : /meta|facebook|instagram/.test(p) ? 'Meta Ads' : r.platform ? String(r.platform).trim() : defP, agency: /iyz/.test(ag) ? 'IYZADS' : /dijital/.test(ag) ? 'Dijital İz' : r.agency ? String(r.agency).trim() : defA, campaign: r.campaign ? String(r.campaign).trim() : null, conv: parseNum(r.conv), convValue: parseNum(r.convValue), impr: parseNum(r.impr), clicks: parseNum(r.clicks), note: r.note ? String(r.note) : null };
        const old = existing.get(key(rec)); out.push({ ...(old ?? {}), ...rec, id: old?.id ?? DB.uid('a_') }); old ? upd++ : fresh++; });
      return { records: out, errors, summary: `${fresh} yeni kayıt eklenecek · ${upd} kayıt güncellenecek`, note: 'Aynı tarih, platform, ajans ve kampanyaya ait kayıt yeniden yüklendiğinde çoğalmaz; güncellenir.' };
    },
    commit: (recs) => DB.bulkPut('ads', recs, 'Excel aktarımı'),
  });
}
async function exportOrders(list) {
  if (!list.length) return H.toast('Dışa aktarılacak sipariş yok.', 'err');
  const X = await xlsx();
  const rows = list.flatMap((o) => { const c = C.orderCalc(o); return (o.items?.length ? o.items : [{ name: o.product, code: o.code, category: o.category, qty: 1, cost: o.cost }]).map((i, k) => ({ 'Sipariş No': o.no, 'Sipariş Tarihi': dTR(o.date), 'Müşteri': o.customer ?? '', 'Ürün Adı': i.name ?? '', 'Ürün Kodu': i.code ?? '', 'Kategori': i.category ?? '', 'Adet': i.qty ?? 1, 'Birim Maliyet': i.cost ?? '',
    'Satış Tutarı': k ? '' : c.sale, 'İndirim': k ? '' : o.discount ?? '', 'Net Satış': k ? '' : +c.net.toFixed(2), 'POS Komisyonu': k ? '' : o.pos ?? '', 'Kargo': k ? '' : o.shipping ?? '', 'Paketleme': k ? '' : o.packaging ?? '', 'Sipariş Kârı': k || c.profit == null ? '' : +c.profit.toFixed(2), 'Kâr Marjı %': k || c.margin == null ? '' : +c.margin.toFixed(1),
    'Hesaba Yatan': k ? '' : o.collected ?? '', 'Yatış Tarihi': k ? '' : dTR(o.collectedDate).replace('—', ''), 'Bekleyen Tahsilat': k ? '' : +c.pending.toFixed(2), 'Ödeme Yöntemi': o.payment ?? '', 'Satış Kaynağı': o.source ?? '', 'Durum': o.status ?? '', 'Notlar': k ? '' : o.notes ?? '' })); });
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rows), 'Siparişler'); X.writeFile(wb, `sina-siparisler-${C.todayTR()}.xlsx`);
}

/* ---------- Yönlendirme ---------- */
let last = null;
export function route(name) {
  Y.page = pages[name] ? name : 'genel';
  const tab = TABS.includes(Y.page) ? Y.page : 'more';
  $$('#navY a').forEach((a) => { const on = a.dataset.y === Y.page; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  $$('#tabbarY [data-y]').forEach((a) => a.classList.toggle('on', a.dataset.y === tab)); $('#tabbarY').style.setProperty('--i', TABS.indexOf(tab));
  const miss = D.orders.filter((o) => !C.orderCalc(o).costKnown).length, b = $('#costBadge'); b.hidden = !miss; b.textContent = miss > 99 ? '99+' : miss; b.title = 'Maliyeti girilmemiş sipariş';
  $('#pageTitle').textContent = TITLES[Y.page][0]; $('#pageSub').textContent = TITLES[Y.page][1]; document.title = `${TITLES[Y.page][0]} · Yönetim Paneli`;
  abort(); H.resetCharts();
  const view = $('#view'), changed = last !== Y.page; last = Y.page;
  const y = scrollY; const out = pages[Y.page](view);
  Promise.resolve(out).then(() => { if (changed) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); scrollTo(0, 0); } else scrollTo(0, y); });
}
export async function init(host) {
  H = host;
  if (!D.ready) await DB.init(host.user);
  DB.subscribe(() => { if (document.documentElement.dataset.app === 'y' && !document.querySelector('#drawer.open')) route(Y.page); else Y.dirty = true; });
  $('#moreBtnY').onclick = () => H.openLayer($('#moreY'));
}
export const refreshIfDirty = () => { if (Y.dirty && document.documentElement.dataset.app === 'y') { Y.dirty = false; route(Y.page); } };

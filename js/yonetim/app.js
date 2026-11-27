// Sina Pırlanta Yönetim Paneli — sayfalar. Hesaplar calc.js'ten, veri store.js'ten gelir.
import * as DB from './store.js';
import { D } from './store.js';
import * as C from './calc.js';
import { money, pct, num, dTR, parseNum, X } from './calc.js';


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

export const TITLES = { genel: ['Genel Bakış', 'Hesaba gelen, reklam harcaması ve giderler'], siparisler: ['Siparişler', 'Sipariş tablosundan otomatik gelir'], reklam: ['Reklam Harcamaları', 'Google Ads ve Meta Ads; otomatik çekilir'], giderler: ['Giderler', 'Aylık giderler'], ayarlar: ['Ayarlar', 'Bağlantılar, bütçe ve yedek'] };
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
const chartBase = (extra = {}) => ({ maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { grid: { color: () => H.cssv('--hairline') }, border: { display: false }, ticks: { callback: (v) => (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('tr-TR') + ' B' : v), maxTicksLimit: 5 } } }, ...extra });
const when = (at) => (at ? new Date(at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const SER = ['--blue', '--brand-deep', '--dd', '--text-3'], MCL = ['c2', 'acc', 'c3', 'c4'];
const xf = (v) => (v == null ? '—' : v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + 'x');
// Bağlantı durumu: [ad, durum etiketi, açıklama]
function sources() {
  const o = X.orders, g = X.ads?.google, m = X.ads?.meta, tag = (ok, err) => (err ? '<span class="tag neg">Hata</span>' : ok ? '<span class="tag pos">Bağlı</span>' : '<span class="tag warn">Bağlı değil</span>');
  return [
    ['Sipariş tablosu', tag(o?.rows, o?.error), o?.rows ? `${num(o.rows.length)} satır · son çekim ${when(o.at)}${o.error ? ` · son deneme başarısız: ${esc(o.error)}` : ''}` : esc(o?.error ?? 'Sipariş Excel bağlantısı henüz tanımlanmadı.')],
    ['Meta Ads', tag(m?.accounts, m?.error), m?.accounts ? `${Object.values(m.accounts).map((a) => esc(a.label)).join(', ')} · son çekim ${when(m.at)}${m.error ? ` · ${esc(m.error)}` : ''}` : 'Meta erişim anahtarı henüz tanımlanmadı.'],
    ['Google Ads', tag(g?.days && Object.keys(g.days).length, g?.error), g?.days && Object.keys(g.days).length ? `${num(Object.keys(g.days).length)} gün · son çekim ${when(g.at)}${g.error ? ` · ${esc(g.error)}` : ''}` : esc(g?.error ?? 'Google Ads tablosu henüz tanımlanmadı.')],
  ];
}
const refreshBtn = () => `<button class="btn" data-refresh${H.publish ? '' : ' disabled'} title="Sipariş tablosunu ve reklam harcamalarını yeniden çeker">Şimdi çek</button>`;
function bindRefresh(view) {
  $$('[data-refresh]', view).forEach((b) => (b.onclick = async () => {
    b.disabled = true; b.textContent = 'Başlatılıyor…';
    try { const { repo, token, branch } = H.publish; const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/gunluk-guncelleme.yml/dispatches`, { method: 'POST', headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json' }, body: JSON.stringify({ ref: branch }) }); if (!r.ok) throw new Error('HTTP ' + r.status); b.textContent = 'Başlatıldı'; H.toast('Veri çekme başlatıldı. Yaklaşık 7 dakika sonra sayfayı yenileyin.'); }
    catch (e) { b.disabled = false; b.textContent = 'Şimdi çek'; H.toast(`Başlatılamadı (${e.message}).`, 'err'); }
  }));
}
const stackOpts = () => chartBase({ scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 8 } }, y: { stacked: true, grid: { color: () => H.cssv('--hairline') }, border: { display: false }, ticks: { callback: (v) => (v >= 1000 ? (v / 1000).toLocaleString('tr-TR') + ' B' : v), maxTicksLimit: 5 } } }, plugins: { tooltip: { callbacks: { label: (c) => ' ' + c.dataset.label + ': ' + money(c.parsed.y, 0) } } } });
const adChart = (el, ds) => H.chart(el, { type: 'bar', data: { labels: ds.days.map((d) => d.slice(8) + '.' + d.slice(5, 7)), datasets: ds.ads.map((s, i) => ({ label: s.label, data: s.data, backgroundColor: H.cssv(SER[i % SER.length]), borderRadius: 4, maxBarThickness: 22 })) }, options: stackOpts() });
const legend = (series) => `<div class="legend">${series.map((s, i) => `<span><i class="dot" style="background:var(${SER[i % SER.length]})"></i>${esc(s.label)}</span>`).join('')}</div>`;
const curWarn = (series) => { const bad = series.filter((s) => s.currency && s.currency !== 'TRY'); return bad.length ? `<div class="note warn">${bad.map((s) => `${esc(s.label)} hesabının para birimi ${esc(s.currency)}`).join('; ')}. Tutarlar çevrilmeden gösteriliyor; toplamlar ₺ ile karışık olabilir.</div>` : ''; };

/* ---------- Sayfalar ---------- */
const pages = {
  genel(view) {
    const r = range(), pr = C.compareRange(Y.preset, r), S = C.summarize(r), P = Y.compare ? C.summarize(pr) : null, series = S.ads.series;
    if (!X.orders?.rows && !series.length && !D.expenses.length) {
      view.innerHTML = `<div class="steps">
        <div class="step">${ic('i-bag')}<h2>Sipariş tablosu</h2><p>Sipariş Excel'inizin paylaşım bağlantısı tanımlandığında müşteri adı, hesaba gelen tutar ve iade bilgisi her gün kendiliğinden çekilir.</p><a class="btn primary" href="#/y/ayarlar">Bağlantılar</a></div>
        <div class="step">${ic('i-mega')}<h2>Reklam harcamaları</h2><p>Google Ads ve Meta Ads harcamaları hesaplar bağlandığında günlük olarak otomatik gelir; tarih aralığı seçerek görüntülenir.</p><a class="btn" href="#/y/ayarlar">Bağlantılar</a></div>
        <div class="step">${ic('i-wallet')}<h2>Giderler</h2><p>Ay seçip tutarı yazmanız yeterli.</p><a class="btn" href="#/y/giderler">Gider ekle</a></div></div>
        <div class="note">Henüz bağlı bir veri kaynağı yok; bu yüzden hiçbir rakam gösterilmiyor.</div>`;
      return;
    }
    const pv = (f) => (P && (S.dated || f === 'ads') ? f === 'ads' ? P.ads.total : P[f] : null);
    const was = (f, show) => (pv(f) != null && show ? `<div class="h-s was">Önceki dönem: <b>${money(pv(f), 0)}</b></div>` : '');
    view.innerHTML = `${rangeBar(`<label class="switch" title="Bu ay, geçen ayın aynı günleriyle; diğer dönemler hemen önceki aynı uzunluktaki dönemle karşılaştırılır"><input type="checkbox" id="cmp"${Y.compare ? ' checked' : ''}>Önceki dönemle karşılaştır${Y.compare ? ` <span class="num">(${dTR(pr.from)} – ${dTR(pr.to)})</span>` : ''}</label>`)}
      ${X.orders?.rows && !S.dated ? `<div class="note warn">Sipariş tablosunda tarih sütunu bulunamadı; sipariş rakamları seçilen dönemi değil <b>tablonun tamamını</b> gösteriyor. Reklam ve giderler seçilen döneme aittir.</div>` : ''}${curWarn(series)}
      <div class="hero">
        <div class="lead"><div class="h-l">Hesaba gelen ${delta(S.income, pv('income'))}</div><div class="h-v">${X.orders?.rows ? money(S.income, 0) : '—'}</div><div class="h-s">${X.orders?.rows ? `${num(S.orderCount)} sipariş · ortalama ${money(S.avg, 0)}${S.returnCount ? ` · ${S.returnCount} iade` : ''}` : 'Sipariş tablosu bağlı değil'}</div>${was('income', X.orders?.rows)}</div>
        <div><div class="h-l">Reklam harcaması ${delta(S.ads.total, pv('ads'), true)}</div><div class="h-v">${series.length ? money(S.ads.total, 0) : '—'}</div><div class="h-s">${series.length ? `Google Ads ${money(S.ads.google, 0)} · Meta Ads ${money(S.ads.meta, 0)}` : 'Reklam hesapları bağlı değil'}</div>${was('ads', series.length)}</div>
        <div><div class="h-l">Kalan ${delta(S.left, pv('left'))}</div><div class="h-v" style="color:${S.left < 0 ? 'var(--neg)' : 'inherit'}">${X.orders?.rows ? money(S.left, 0) : '—'}</div><div class="h-s">Hesaba gelen − reklam − giderler · ürün maliyeti dahil değil</div>${was('left', X.orders?.rows)}</div>
      </div>
      <div class="grid g3">
        <div class="mgroup"><h3>Siparişler</h3>${mrow('Sipariş adedi', num(S.orderCount))}${mrow('Hesaba gelen', money(S.income, 0), 'total')}${mrow('Ortalama sipariş', money(S.avg, 0))}${mrow('İade adedi', num(S.returnCount))}${mrow('İade tutarı', money(S.returnSum, 0), '', 'Hesaba gelen toplamına dahil değil')}</div>
        <div class="mgroup"><h3>Reklam</h3>${series.map((s) => mrow(esc(s.label), money(s.total, 0))).join('') || mrow('Bağlı hesap yok', '—')}${mrow('Toplam', money(S.ads.total, 0), 'total')}${mrow('Reklamın hesaba gelene oranı', pct(S.adShare))}${mrow('Hesaba gelen / reklam', xf(S.mer))}</div>
        <div class="mgroup"><h3>Giderler</h3>${S.exp.byCat.slice(0, 5).map(([k, v]) => mrow(esc(k), money(v, 0))).join('') || mrow('Bu dönemde gider yok', '—')}${mrow('Toplam', money(S.exp.total, 0), 'total', 'Aylık giderin seçilen döneme düşen payı')}</div>
      </div>
      ${P && S.dated ? `<div class="card"><div class="card-head"><div><h2>Önceki dönemle karşılaştırma</h2><p class="muted small num">${dTR(r.from)} – ${dTR(r.to)} · önceki: ${dTR(pr.from)} – ${dTR(pr.to)}</p></div><div class="legend"><span><i class="dot" style="background:var(--brand-deep)"></i>Bu dönem</span><span><i class="dot" style="background:var(--text-3)"></i>Önceki dönem</span></div></div>
        <div class="grid g2" style="margin-top:var(--s3);align-items:start">
          <div><div class="small muted" style="margin-bottom:6px">Birikimli hesaba gelen (dönemin gün gün toplamı)</div><div class="chart-box" style="height:260px"><canvas id="yc0" role="img" aria-label="Bu dönem ve önceki dönemin birikimli hesaba gelen tutarı"></canvas></div></div>
          <div class="tbl-wrap flat"><table><thead><tr><th>Gösterge</th><th class="r">Bu dönem</th><th class="r">Önceki</th><th class="r">Değişim</th></tr></thead><tbody>${[['Hesaba gelen', S.income, P.income, money], ['Sipariş adedi', S.orderCount, P.orderCount, num], ['Ortalama sipariş', S.avg, P.avg, money], ['İade adedi', S.returnCount, P.returnCount, num, true], ['Reklam harcaması', S.ads.total, P.ads.total, money, true], ['Giderler', S.exp.total, P.exp.total, money, true], ['Kalan', S.left, P.left, money]].map(([l, a, b, f, inv]) => `<tr><td style="white-space:nowrap">${l}</td><td class="r num"><b>${f === money ? money(a, 0) : f(a)}</b></td><td class="r num">${f === money ? money(b, 0) : f(b)}</td><td class="r">${delta(a, b, inv) || '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>
        </div></div>` : ''}
      <div class="grid g2">
        ${S.dated ? `<div class="card"><div class="card-head"><div><h2>Günlük hesaba gelen</h2><p class="muted small">İadeler hariç${P ? ' · gri: önceki dönemin aynı sıradaki günü' : ''}</p></div></div><div class="chart-box" style="height:260px"><canvas id="yc1" role="img" aria-label="Günlük hesaba gelen tutar grafiği"></canvas></div></div>` : ''}
        ${series.length ? `<div class="card"><div class="card-head"><div><h2>Günlük reklam harcaması</h2></div>${legend(series)}</div><div class="chart-box" style="height:260px"><canvas id="yc3" role="img" aria-label="Günlük reklam harcaması grafiği"></canvas></div></div>` : ''}
      </div>`;
    bindRange(view, () => route('genel')); $('#cmp', view).onchange = (e) => { Y.compare = e.target.checked; save(); route('genel'); };
    const ds = C.dailySeries(r);
    const pd = P && S.dated ? C.dailySeries(pr) : null, short = (d) => d.slice(8) + '.' + d.slice(5, 7);
    if ($('#yc0')) {
      const n = Math.max(ds.days.length, pd.days.length), cum = (a) => { let t = 0; return a.map((v) => (t += v)); }, today = C.todayTR();
      const cur = cum(ds.income).map((v, i) => (ds.days[i] > today ? null : v)), prev = cum(pd.income);
      H.chart($('#yc0'), { type: 'line', data: { labels: Array.from({ length: n }, (_, i) => `${i + 1}. gün`), datasets: [
        { label: 'Bu dönem', data: cur, borderColor: H.cssv('--brand-deep'), backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, tension: 0.25 },
        { label: 'Önceki dönem', data: prev, borderColor: H.cssv('--text-3'), backgroundColor: 'transparent', borderWidth: 2, borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 4, tension: 0.25 }] },
        options: chartBase({ plugins: { tooltip: { callbacks: { title: (c) => { const i = c[0].dataIndex; return `${i + 1}. gün · ${ds.days[i] ? short(ds.days[i]) : '—'} / ${pd.days[i] ? short(pd.days[i]) : '—'}`; }, label: (c) => ' ' + c.dataset.label + ': ' + money(c.parsed.y, 0) } } } }) });
    }
    if ($('#yc1')) H.chart($('#yc1'), { type: 'bar', data: { labels: ds.days.map(short), datasets: [{ label: 'Bu dönem', data: ds.income, backgroundColor: H.cssv('--brand'), borderRadius: 5, maxBarThickness: 18 }, ...(pd ? [{ label: 'Önceki dönem', data: ds.days.map((_, i) => pd.income[i] ?? 0), backgroundColor: H.cssv('--surface-3'), borderRadius: 5, maxBarThickness: 18 }] : [])] }, options: chartBase({ plugins: { tooltip: { callbacks: { label: (c) => ' ' + c.dataset.label + ': ' + money(c.parsed.y, 0) } } } }) });
    if ($('#yc3')) adChart($('#yc3'), ds);
  },

  siparisler(view) {
    const r = range(), o = C.ordersIn(r), conn = !!X.orders?.rows;
    if (!conn) { view.innerHTML = `<div class="card empty"><b>Sipariş tablosu bağlı değil</b>${esc(X.orders?.error ?? 'Sipariş Excel\'inizin paylaşım bağlantısı tanımlandığında siparişler burada kendiliğinden görünür.')}<div style="margin-top:12px"><a class="btn primary" href="#/y/ayarlar">Bağlantılar</a></div></div>`; return; }
    const q = (F.q || '').toLocaleLowerCase('tr-TR').trim();
    let list = o.rows.map((x, i) => ({ ...x, i }));
    if (q) list = list.filter((x) => x.n.toLocaleLowerCase('tr-TR').includes(q));
    if (F.kind === 'iade') list = list.filter((x) => x.r); else if (F.kind === 'normal') list = list.filter((x) => !x.r);
    if (o.dated) list.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : b.i - a.i)); else list.reverse();
    const live = list.filter((x) => !x.r), ret = list.filter((x) => x.r), N = 100, pg = Math.ceil(list.length / N); F.page = Math.min(F.page, Math.max(0, pg - 1));
    const tot = (a) => a.reduce((t, x) => t + x.a, 0);
    view.innerHTML = `${o.dated ? rangeBar(refreshBtn()) : `<div class="bar"><span class="small muted">Tabloda tarih sütunu bulunamadı; tüm siparişler gösteriliyor.</span><span class="grow"></span>${refreshBtn()}</div>`}
      <div class="hero">
        <div class="lead"><div class="h-l">Hesaba gelen</div><div class="h-v">${money(tot(live), 0)}</div><div class="h-s">${num(live.length)} sipariş · iadeler hariç</div></div>
        <div><div class="h-l">İade</div><div class="h-v">${num(ret.length)}</div><div class="h-s">${ret.length ? money(ret.reduce((t, x) => t + Math.abs(x.a), 0), 0) : 'Bu görünümde iade yok'}</div></div>
        <div><div class="h-l">Kaynak</div><div class="h-v" style="font-size:20px">Sipariş tablosu</div><div class="h-s">Son çekim ${when(X.orders.at)}${X.orders.error ? ' · <span style="color:var(--neg)">son deneme başarısız</span>' : ''}</div></div>
      </div>
      <div class="card"><div class="filters"><div style="flex:1;min-width:200px"><label for="oq">Müşteri adı soyadı</label><input id="oq" type="search" value="${esc(F.q)}" placeholder="Ara"></div>
        <div style="flex:1;min-width:240px"><label>Göster</label><div class="seg" role="tablist">${[['', 'Tümü'], ['normal', 'Siparişler'], ['iade', 'İadeler']].map(([k, l]) => `<button data-kind="${k}" class="${(F.kind || '') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></div></div>
      ${list.length ? `<div class="tbl-wrap"><table><thead><tr>${o.dated ? '<th>Tarih</th>' : ''}<th>Müşteri</th><th class="r">Hesaba gelen</th><th>Durum</th></tr></thead><tbody>${list.slice(F.page * N, F.page * N + N).map((x) => `<tr>${o.dated ? `<td class="num">${dTR(x.d)}</td>` : ''}<td><b>${esc(x.n)}</b></td><td class="r num"${x.r ? ' style="color:var(--text-3);text-decoration:line-through"' : ''}>${money(x.a)}</td><td>${x.r ? '<span class="tag neg">İade</span>' : '<span class="tag pos">Tamamlandı</span>'}</td></tr>`).join('')}</tbody></table></div>
      ${pg > 1 ? `<div class="pager"><button class="btn small" id="pp"${F.page === 0 ? ' disabled' : ''}>← Önceki</button><span class="small muted">Sayfa ${F.page + 1} / ${pg}</span><button class="btn small" id="pn"${F.page >= pg - 1 ? ' disabled' : ''}>Sonraki →</button></div>` : ''}`
        : `<div class="card empty"><b>Bu görünümde sipariş yok</b>Dönemi genişletmeyi ya da aramayı temizlemeyi deneyin.</div>`}
      ${o.undated ? `<div class="small muted">Tarihi okunamayan ${o.undated} satır dönem süzgecine girmiyor.</div>` : ''}`;
    const re = () => route('siparisler');
    bindRange(view, re); bindRefresh(view);
    let t; $('#oq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { F.q = e.target.value; F.page = 0; re(); setTimeout(() => { const i = $('#oq'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 0); }, 250); };
    $$('[data-kind]', view).forEach((b) => (b.onclick = () => { F.kind = b.dataset.kind; F.page = 0; re(); }));
    if ($('#pp')) $('#pp').onclick = () => { F.page--; re(); scrollTo(0, 0); }; if ($('#pn')) $('#pn').onclick = () => { F.page++; re(); scrollTo(0, 0); };
  },

  reklam(view) {
    const r = range(), A = C.adsIn(r), series = A.series;
    if (!series.length) { view.innerHTML = `<div class="card empty"><b>Reklam hesapları bağlı değil</b>Google Ads ve Meta Ads bağlandığında harcamalar her gün kendiliğinden çekilir ve tarih aralığına göre burada görünür.<div style="margin-top:12px"><a class="btn primary" href="#/y/ayarlar">Bağlantılar</a></div></div>`; return; }
    const budget = +D.meta.adBudget || 0, M = C.adsIn(C.rangeOf('month')).total, used = budget ? (M / budget) * 100 : null;
    const ds = C.dailySeries(r), rows = ds.days.map((d, i) => ({ d, v: ds.ads.map((s) => s.data[i]) })).filter((x) => x.v.some(Boolean)).reverse();
    const errs = [X.ads?.meta?.error, X.ads?.google?.error].filter(Boolean);
    view.innerHTML = `${rangeBar(refreshBtn())}${curWarn(series)}
      ${errs.length ? `<div class="note warn">Son çekimde sorun oldu: ${errs.map(esc).join(' · ')}. Görünen rakamlar bir önceki başarılı çekime aittir.</div>` : ''}
      <div class="hero">
        <div class="lead"><div class="h-l">Toplam reklam harcaması</div><div class="h-v">${money(A.total, 0)}</div><div class="h-s">${dTR(r.from)} – ${dTR(r.to)} · günlük ortalama ${money(A.total / C.dayCount(r), 0)}</div></div>
        <div><div class="h-l">Google Ads</div><div class="h-v">${money(A.google, 0)}</div><div class="h-s">${A.total ? pct((A.google / A.total) * 100, 0) + ' pay' : '—'} · son çekim ${when(X.ads?.google?.at)}</div></div>
        <div><div class="h-l">Meta Ads</div><div class="h-v">${money(A.meta, 0)}</div><div class="h-s">${A.total ? pct((A.meta / A.total) * 100, 0) + ' pay' : '—'} · son çekim ${when(X.ads?.meta?.at)}</div></div>
      </div>
      <div class="grid g2 g12">
        <div class="mgroup"><h3>Hesaba göre</h3><div class="dist" style="padding-bottom:12px">${series.map((s, i) => `<div class="dist-row"><span>${esc(s.label)}</span><b>${money(s.total, 0)}</b><div class="meter"><i class="${MCL[i % MCL.length]}" style="width:${A.total ? (s.total / A.total) * 100 : 0}%"></i></div></div>`).join('')}</div>
          ${mrow('Bu ayın bütçesi', budget ? `${pct(used, 0)}` : '—', '', budget ? `${money(M, 0)} / ${money(budget, 0)}${used > 100 ? ' · aşıldı' : ''}` : 'Ayarlar\'dan tanımlanabilir')}</div>
        <div class="card"><div class="card-head"><div><h2>Günlük harcama</h2></div>${legend(series)}</div><div class="chart-box" style="height:280px"><canvas id="yc3" role="img" aria-label="Günlük reklam harcaması grafiği"></canvas></div></div>
      </div>
      ${rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Tarih</th>${series.map((s) => `<th class="r">${esc(s.label)}</th>`).join('')}<th class="r">Toplam</th></tr></thead><tbody>${rows.slice(0, 400).map((x) => `<tr><td class="num">${dTR(x.d)}</td>${x.v.map((v) => `<td class="r num">${v ? money(v) : '—'}</td>`).join('')}<td class="r num"><b>${money(x.v.reduce((t, v) => t + v, 0))}</b></td></tr>`).join('')}</tbody></table></div>` : `<div class="card empty"><b>Bu dönemde harcama yok</b>Dönemi genişletmeyi deneyin.</div>`}`;
    bindRange(view, () => route('reklam')); bindRefresh(view); adChart($('#yc3'), ds);
  },

  giderler(view) {
    const ym = (F.month ??= C.todayTR().slice(0, 7)), list = D.expenses.filter((e) => C.expMonth(e) === ym).sort((a, b) => C.expAmount(b) - C.expAmount(a)), total = list.reduce((t, e) => t + C.expAmount(e), 0);
    const [y, m] = ym.split('-').map(Number), pm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`, prev = D.expenses.filter((e) => C.expMonth(e) === pm), prevTotal = prev.reduce((t, e) => t + C.expAmount(e), 0);
    const months = [...new Set(D.expenses.map(C.expMonth).filter(Boolean))].sort().reverse().slice(0, 12), mt = (k) => D.expenses.filter((e) => C.expMonth(e) === k).reduce((t, e) => t + C.expAmount(e), 0), mx = Math.max(1, ...months.map(mt));
    view.innerHTML = `<div class="bar"><input type="month" id="gMonth" value="${ym}" aria-label="Ay"><span class="grow"></span>${prev.length && !list.length ? `<button class="btn" id="gCopy">${esc(C.monthTR(pm))} giderlerini kopyala</button>` : ''}</div>
      <div class="card"><form id="gForm" class="filters" novalidate>
        <div style="flex:2;min-width:180px"><label for="gCat">Gider</label><select id="gCat">${opt(C.expenseCats(), F.cat ?? 'Dijital pazarlama ajansı')}<option value="__new">Yeni gider türü…</option></select></div>
        <div><label for="gM">Ay</label><input type="month" id="gM" value="${ym}" required></div>
        <div style="flex:1;min-width:140px"><label for="gAmt">Tutar (₺)</label><input id="gAmt" inputmode="decimal" placeholder="0,00" autocomplete="off" required></div>
        <div><label>&nbsp;</label><button class="btn primary" type="submit">${ic('i-plus')}Gider ekle</button></div></form></div>
      <div class="hero">
        <div class="lead"><div class="h-l">${esc(C.monthTR(ym))} giderleri</div><div class="h-v">${money(total, 0)}</div><div class="h-s">${num(list.length)} kalem</div></div>
        <div><div class="h-l">Önceki ay</div><div class="h-v">${prev.length ? money(prevTotal, 0) : '—'}</div><div class="h-s">${esc(C.monthTR(pm))}</div></div>
        <div><div class="h-l">Fark</div><div class="h-v">${prev.length && list.length ? (total - prevTotal > 0 ? '+' : '') + money(total - prevTotal, 0) : '—'}</div><div class="h-s">Önceki aya göre</div></div>
      </div>
      <div class="grid g2 g21">
        ${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Gider</th><th class="r">Tutar</th><th></th></tr></thead><tbody>${list.map((e) => `<tr><td><b>${esc(e.category)}</b></td><td class="r"><input class="cell-in has" inputmode="decimal" data-amt="${esc(e.id)}" value="${C.expAmount(e).toLocaleString('tr-TR')}" aria-label="${esc(e.category)} tutarı"></td><td class="r"><button class="icon-btn" data-del="${esc(e.id)}" aria-label="${esc(e.category)} giderini sil">${ic('i-x')}</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="card empty"><b>${esc(C.monthTR(ym))} için gider yok</b>Yukarıdan gideri seçin, tutarı yazın ve ekleyin.</div>`}
        <div class="mgroup"><h3>Aylara göre</h3><div class="dist" style="padding-bottom:12px">${months.map((k) => `<div class="dist-row"><a href="#" data-m="${k}">${esc(C.monthTR(k))}</a><b>${money(mt(k), 0)}</b><div class="meter"><i class="acc" style="width:${(mt(k) / mx) * 100}%"></i></div></div>`).join('') || '<span class="small muted">Henüz gider yok.</span>'}</div></div>
      </div>
      <div class="note">Giderler şu an yalnızca bu tarayıcıda saklanır; başka cihazda görünmez. Ayarlar'dan yedek alabilirsiniz.</div>`;
    const re = () => route('giderler');
    $('#gMonth').onchange = (e) => { if (e.target.value) { F.month = e.target.value; re(); } };
    $$('[data-m]', view).forEach((a) => (a.onclick = (e) => { e.preventDefault(); F.month = a.dataset.m; re(); }));
    $('#gCat').onchange = (e) => { if (e.target.value === '__new') { const n = prompt('Yeni gider türünün adı')?.trim(); if (n) { e.target.insertAdjacentHTML('afterbegin', `<option selected>${esc(n)}</option>`); e.target.value = n; } else e.target.selectedIndex = 0; } };
    $('#gForm').onsubmit = async (e) => { e.preventDefault(); const cat = $('#gCat').value, mo = $('#gM').value, amt = parseNum($('#gAmt').value);
      if (!/^\d{4}-\d{2}$/.test(mo)) { $('#gM').focus(); return H.toast('Ay seçin.', 'err'); } if (amt == null || amt <= 0) { $('#gAmt').focus(); return H.toast('Tutarı yazın.', 'err'); }
      F.cat = cat; F.month = mo; await DB.put('expenses', { id: DB.uid('e_'), category: cat, month: mo, amount: amt }); H.toast(`${cat}: ${money(amt, 0)} eklendi`); };
    if ($('#gCopy')) $('#gCopy').onclick = async () => { await DB.bulkPut('expenses', prev.map((e) => ({ id: DB.uid('e_'), category: e.category, month: ym, amount: C.expAmount(e) })), 'önceki aydan kopyalandı'); H.toast(`${prev.length} gider kopyalandı`); };
    view.addEventListener('change', async (e) => { const id = e.target.dataset?.amt; if (!id) return; const x = D.expenses.find((v) => v.id === id), amt = parseNum(e.target.value); if (!x) return; if (amt == null || amt <= 0) { H.toast('Geçerli bir tutar yazın.', 'err'); return re(); } await DB.put('expenses', { id: x.id, category: x.category, month: C.expMonth(x), amount: amt, createdAt: x.createdAt }); H.toast('Tutar güncellendi'); }, { signal: abort() });
    view.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset?.amt) e.target.blur(); }, { signal: abort(true) });
    view.addEventListener('click', async (e) => { const b = e.target.closest('[data-del]'); if (!b) return; const x = D.expenses.find((v) => v.id === b.dataset.del); if (x && confirm(`${x.category} (${money(C.expAmount(x), 0)}) silinsin mi?`)) { await DB.del('expenses', x.id); H.toast('Gider silindi'); } }, { signal: abort(true) });
  },

  async ayarlar(view) {
    const log = await DB.auditLog(40), o = X.orders;
    view.innerHTML = `<div class="card"><div class="card-head"><div><h2>Bağlantılar</h2><p class="muted small">Veriler her sabah 06:17'de kendiliğinden çekilir.</p></div>${refreshBtn()}</div>
        <div class="tbl-wrap"><table><thead><tr><th>Kaynak</th><th>Durum</th><th>Ayrıntı</th></tr></thead><tbody>${sources().map(([n, t, d]) => `<tr><td><b>${n}</b></td><td>${t}</td><td class="small">${d}</td></tr>`).join('')}</tbody></table></div>
        ${o?.rows ? `<p class="small muted" style="margin-top:var(--s3)">Sipariş tablosu: okunan ${o.used?.length > 1 ? o.used.length + ' sayfa: ' : 'sayfa '}${esc((o.used ?? []).join(', '))}${o.sheets?.length > (o.used?.length ?? 0) ? ` (dosyadaki diğer sayfalar: ${esc(o.sheets.filter((s) => !o.used.includes(s)).join(', '))})` : ''} · A sütunu müşteri, I sütunu hesaba gelen, J sütunu iade · tarih sütunu: ${o.dateCol ?? 'bulunamadı'}</p>` : ''}</div>
      <div class="grid g2">
        <div class="card"><h2>Reklam bütçesi</h2><div class="form" style="margin-top:var(--s4)"><div class="field"><label for="sBud">Aylık reklam bütçesi (₺)</label><input id="sBud" inputmode="decimal" value="${D.meta.adBudget ? (+D.meta.adBudget).toLocaleString('tr-TR') : ''}" placeholder="Tanımlı değil"></div><div class="full"><button class="btn primary" id="sSave">Bütçeyi kaydet</button></div></div></div>
        <div class="card"><h2>Gider yedeği</h2><p class="muted small" style="margin-top:4px">${num(D.expenses.length)} gider kaydı bu tarayıcıda</p>
          <div class="bar" style="margin-top:var(--s4)"><button class="btn primary" id="bkOut">Yedek indir</button><label class="btn" for="bkIn">Yedekten geri yükle</label><input id="bkIn" type="file" accept="application/json,.json" hidden></div></div>
      </div>
      <div class="card"><div class="card-head"><div><h2>Kayıt geçmişi</h2><p class="muted small">Bu tarayıcıda yapılan son 40 değişiklik</p></div></div>
        ${log.length ? `<div class="tbl-wrap"><table><thead><tr><th>Zaman</th><th>Kullanıcı</th><th>Alan</th><th>Değişiklik</th></tr></thead><tbody>${log.map((l) => `<tr><td class="num">${when(l.at)}</td><td>${esc(l.by)}</td><td>${esc({ expenses: 'Gider', meta: 'Ayar', '*': 'Tümü' }[l.store] ?? l.store)}</td><td>${esc((l.changed ?? []).join(', '))}${l.note ? ` <span class="muted">· ${esc(l.note)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Henüz kayıt yok.</div>'}</div>`;
    bindRefresh(view);
    $('#sSave').onclick = async () => { await DB.setMeta('adBudget', parseNum($('#sBud').value)); H.toast('Bütçe kaydedildi'); };
    $('#bkOut').onclick = async () => download(`sina-yonetim-yedek-${C.todayTR()}.json`, new Blob([JSON.stringify(await DB.exportAll())], { type: 'application/json' }));
    $('#bkIn').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (!confirm(`Yedekteki ${j.expenses?.length ?? 0} gider geri yüklenecek. Bu tarayıcıdaki mevcut giderler silinecek. Devam edilsin mi?`)) return; await DB.importAll(j); H.toast('Yedek geri yüklendi'); } catch (err) { H.toast(err.message?.startsWith('Bu dosya') ? err.message : 'Dosya okunamadı. Geçerli bir yedek dosyası seçin.', 'err'); } };
  },
};

/* ---------- Durum ---------- */
const F = { q: '', kind: '', page: 0, month: null, cat: null };
let ac = null;
function abort(keep) { if (!keep || !ac) { ac?.abort(); ac = new AbortController(); } return ac.signal; }

/* ---------- Yönlendirme ---------- */
let last = null;
export function route(name) {
  Y.page = pages[name] ? name : 'genel';
  const tab = TABS.includes(Y.page) ? Y.page : 'more';
  $$('#navY a[data-y]').forEach((a) => { const on = a.dataset.y === Y.page; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  $$('#tabbarY [data-y]').forEach((a) => a.classList.toggle('on', a.dataset.y === tab)); $('#tabbarY').style.setProperty('--i', TABS.indexOf(tab));
  $('#pageTitle').textContent = TITLES[Y.page][0]; $('#pageSub').textContent = TITLES[Y.page][1]; document.title = `${TITLES[Y.page][0]} · Yönetim Paneli`;
  abort(); H.resetCharts();
  const view = $('#view'), changed = last !== Y.page; last = Y.page;
  const y = scrollY; const out = pages[Y.page](view);
  Promise.resolve(out).then(() => { if (changed) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); scrollTo(0, 0); } else scrollTo(0, y); });
}
export async function init(host) {
  H = host; C.setShared(host.data);
  if (!D.ready) await DB.init(host.user);
  DB.subscribe(() => { if (document.documentElement.dataset.app === 'y' && !document.querySelector('#drawer.open')) route(Y.page); else Y.dirty = true; });
  $('#moreBtnY').onclick = () => H.openLayer($('#moreY'));
}
export const refreshIfDirty = () => { if (Y.dirty && document.documentElement.dataset.app === 'y') { Y.dirty = false; route(Y.page); } };

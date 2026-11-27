// Yönetim Paneli hesaplamaları: tüm ekranlar aynı sayıları buradan alır (tek doğruluk kaynağı).
import { D } from './store.js';

/* ---------- Biçimler ---------- */
export const money = (n, dec = 2) => (n == null || Number.isNaN(n) ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' ₺');
export const moneyShort = (n) => (n == null ? '—' : Math.abs(n) >= 1e6 ? (n / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' Mn ₺' : Math.abs(n) >= 1e4 ? (n / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' B ₺' : money(n, 0));
export const pct = (n, d = 1) => (n == null || !Number.isFinite(n) ? '—' : '%' + n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const num = (n, d = 0) => (n == null ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: d }));
export const dTR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—');
const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayTR = () => iso(new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' })));

// "1.250.000,50", "1250000.5", "₺ 1.250,00", 1250 -> sayı
export function parseNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v).replace(/[^\d.,-]/g, '');
  if (!t || t === '-') return null;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = /,\d{3}$/.test(t) && !/^\d{1,3},\d{3}$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t); return Number.isFinite(n) ? n : null;
}
// "27.11.2026", "27/11/2026 14:30", "2026-11-27", Excel seri numarası, Date -> "2026-11-27"
export function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(+v) ? null : iso(v);
  if (typeof v === 'number') { if (v < 20000 || v > 80000) return null; const d = new Date(Math.round((v - 25569) * 864e5)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/))) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

/* ---------- Tarih aralıkları ---------- */
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
export const PRESETS = [['today', 'Bugün'], ['yesterday', 'Dün'], ['7d', 'Son 7 gün'], ['30d', 'Son 30 gün'], ['month', 'Bu ay'], ['lastmonth', 'Geçen ay'], ['year', 'Bu yıl'], ['custom', 'Özel']];
export function rangeOf(preset, custom) {
  const t = todayTR(), [y, m] = t.split('-').map(Number);
  switch (preset) {
    case 'today': return { from: t, to: t };
    case 'yesterday': return { from: addDays(t, -1), to: addDays(t, -1) };
    case '7d': return { from: addDays(t, -6), to: t };
    case '30d': return { from: addDays(t, -29), to: t };
    case 'month': return { from: `${y}-${pad(m)}-01`, to: t };
    case 'lastmonth': { const d = new Date(y, m - 1, 0); return { from: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, to: iso(d) }; }
    case 'year': return { from: `${y}-01-01`, to: t };
    default: return { from: custom?.from || addDays(t, -29), to: custom?.to || t };
  }
}
export const dayCount = (r) => Math.round((new Date(r.to) - new Date(r.from)) / 864e5) + 1;
export const prevRange = (r) => { const n = dayCount(r); return { from: addDays(r.from, -n), to: addDays(r.from, -1) }; };
export const daysIn = (r) => { const out = []; for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push(d); return out; };
const inR = (d, r) => d && d >= r.from && d <= r.to;

/* ---------- Sabit listeler ---------- */
export const ORDER_STATUS = ['Onaylandı', 'Hazırlanıyor', 'Kargoda', 'Teslim edildi', 'İptal', 'İade'];
export const SOURCES = ['Google Ads', 'Meta Ads', 'Organik', 'Doğrudan', 'Bilinmiyor'];
export const AD_SOURCES = ['Google Ads', 'Meta Ads'];
export const CATEGORIES = ['Tektaş', 'Oval', 'Beştaş', 'Tamtur', 'Baget', 'Suyolu bileklik', 'Kolye', 'Küpe', 'Alyans', 'Elmas', 'Altın', 'Koleksiyon ürünleri'];
export const PLATFORMS = ['Google Ads', 'Meta Ads'];
export const AGENCIES = ['Dijital İz', 'IYZADS'];
export const EXPENSE_CATS = ['Google Ads', 'Meta Ads', 'IYZADS', 'Dijital pazarlama ajansı', 'SEO ajansı', 'Yazılım firmaları', 'E-ticaret altyapısı', 'Ürün maliyetleri', 'Sanal POS komisyonları', 'Banka komisyonları', 'Kargo giderleri', 'Paketleme giderleri', 'Fotoğraf ve video prodüksiyon', 'Influencer çalışmaları', 'Yazılım abonelikleri', 'Personel giderleri', 'Diğer operasyonel giderler'];
// Bu kategorilerin tutarı başka ekrandan (reklam harcamaları, siparişler) otomatik gelir; gider olarak girilirse kârlılığa ikinci kez eklenmez.
export const AUTO_CATS = { 'Google Ads': 'Reklam Harcamaları', 'Meta Ads': 'Reklam Harcamaları', 'IYZADS': 'Reklam Harcamaları', 'Ürün maliyetleri': 'Siparişler', 'Sanal POS komisyonları': 'Siparişler', 'Kargo giderleri': 'Siparişler', 'Paketleme giderleri': 'Siparişler' };
export const AGENCY_CATS = ['Dijital pazarlama ajansı', 'SEO ajansı'];
export const cats = () => [...new Set([...CATEGORIES, ...(D.meta.categories ?? [])])];
export const expenseCats = () => [...new Set([...EXPENSE_CATS, ...(D.meta.expenseCats ?? [])])];

/* ---------- Sipariş hesabı ---------- */
const sum = (a, f) => a.reduce((t, x) => t + (f(x) ?? 0), 0);
export const isVoid = (o) => o.status === 'İptal' || o.status === 'İade' || o.returned === true;
// Satış tutarları KDV dahil girildiyse ve oran ayarlandıysa net satış KDV hariç hesaplanır; oran ayarlanmadıysa tutar olduğu gibi alınır.
export const kdvRate = () => (D.meta.kdvRate != null && D.meta.kdvRate !== '' ? +D.meta.kdvRate : null);
export function orderCalc(o) {
  const sale = o.sale ?? o.invoice ?? 0, discount = o.discount ?? 0, voided = isVoid(o);
  const gross = voided ? 0 : sale;                       // ciro (girildiği haliyle)
  const rate = kdvRate();
  const net = voided ? 0 : (sale - discount) / (rate ? 1 + rate / 100 : 1);
  const items = o.items?.length ? o.items : null;
  const costKnown = items ? items.every((i) => i.cost != null) : o.cost != null;
  const cost = voided ? 0 : items ? sum(items, (i) => (i.cost ?? 0) * (i.qty ?? 1)) : o.cost ?? 0;
  const shipping = o.shipping ?? 0, packaging = o.packaging ?? 0, pos = o.pos ?? 0;
  const profit = costKnown || voided ? net - cost - shipping - packaging - pos : null;   // maliyet yoksa kâr kesinleşmez
  const collected = o.collected ?? 0;
  const expected = voided ? 0 : sale - discount - pos;   // hesaba yatması gereken
  return { sale, gross, net, discount, cost, costKnown: costKnown || voided, shipping, packaging, pos, profit, margin: profit != null && net ? (profit / net) * 100 : null, collected, expected, pending: Math.max(0, expected - collected), voided };
}

/* ---------- Dönem özeti: gösterge paneli, kârlılık ve raporlar bunu kullanır ---------- */
export function summarize(r) {
  const orders = D.orders.filter((o) => inR(o.date, r));
  const live = orders.filter((o) => !isVoid(o));
  const oc = live.map((o) => ({ o, c: orderCalc(o) }));
  const ads = D.ads.filter((a) => inR(a.date, r));
  const exps = expensesIn(r);
  const S = { range: r, orderCount: live.length, voidCount: orders.length - live.length };
  S.ciro = sum(oc, (x) => x.c.gross); S.net = sum(oc, (x) => x.c.net); S.discount = sum(oc, (x) => x.c.discount);
  S.collected = sum(oc, (x) => x.c.collected); S.pending = sum(oc, (x) => x.c.pending);
  S.cost = sum(oc, (x) => x.c.cost); S.costMissing = oc.filter((x) => !x.c.costKnown).length; S.costComplete = live.length ? (1 - S.costMissing / live.length) * 100 : null;
  S.pos = sum(oc, (x) => x.c.pos); S.shipping = sum(oc, (x) => x.c.shipping + x.c.packaging);
  S.aov = live.length ? S.ciro / live.length : null;
  // Reklam
  const spendOf = (f) => sum(ads.filter(f), (a) => a.spend);
  S.adGoogle = spendOf((a) => a.platform === 'Google Ads'); S.adMeta = spendOf((a) => a.platform === 'Meta Ads'); S.adTotal = sum(ads, (a) => a.spend);
  S.adByAgency = Object.fromEntries(AGENCIES.map((g) => [g, spendOf((a) => a.agency === g)]));
  S.adBreak = [['Google Ads — Dijital İz', (a) => a.platform === 'Google Ads' && a.agency === 'Dijital İz'], ['Meta Ads — Dijital İz', (a) => a.platform === 'Meta Ads' && a.agency === 'Dijital İz'], ['Meta Ads — IYZADS', (a) => a.platform === 'Meta Ads' && a.agency === 'IYZADS']].map(([k, f]) => [k, spendOf(f)]);
  const known = S.adBreak.reduce((t, x) => t + x[1], 0); if (S.adTotal - known > 0.005) S.adBreak.push(['Diğer', S.adTotal - known]);
  S.adConvValue = sum(ads, (a) => a.convValue); S.adConv = sum(ads, (a) => a.conv); S.adClicks = sum(ads, (a) => a.clicks); S.adImpr = sum(ads, (a) => a.impr);
  // Satış kaynağı (gerçek siparişlerden; aynı sipariş tek kaynağa yazıldığı için çift sayım olmaz)
  S.bySource = Object.fromEntries(SOURCES.map((s) => [s, 0]));
  for (const { o, c } of oc) { const s = SOURCES.includes(o.source) ? o.source : 'Bilinmiyor'; S.bySource[s] += c.gross; }
  S.adRevenue = S.bySource['Google Ads'] + S.bySource['Meta Ads']; S.organic = S.bySource['Organik']; S.direct = S.bySource['Doğrudan']; S.unknownRev = S.bySource['Bilinmiyor'];
  S.sourceKnown = S.ciro ? (1 - S.unknownRev / S.ciro) * 100 : null;
  S.roas = S.adTotal ? S.adRevenue / S.adTotal : null;            // organik gelir dahil değil
  S.roasGoogle = S.adGoogle ? S.bySource['Google Ads'] / S.adGoogle : null; S.roasMeta = S.adMeta ? S.bySource['Meta Ads'] / S.adMeta : null;
  S.mer = S.adTotal ? S.ciro / S.adTotal : null; S.adShare = S.ciro ? (S.adTotal / S.ciro) * 100 : null;
  // Giderler: otomatik kategoriler (reklam, ürün maliyeti, POS, kargo) ikinci kez sayılmaz
  const manual = exps.filter((e) => !AUTO_CATS[e.category]);
  S.agency = sum(manual.filter((e) => AGENCY_CATS.includes(e.category)), (e) => e.amount);
  S.otherOpex = sum(manual.filter((e) => !AGENCY_CATS.includes(e.category)), (e) => e.amount);
  S.skippedAuto = sum(exps.filter((e) => AUTO_CATS[e.category]), (e) => e.amount);
  S.opex = S.adTotal + S.agency + S.pos + S.shipping + S.otherOpex;
  S.grossProfit = S.net - S.cost; S.opProfit = S.grossProfit - S.opex;
  S.margin = S.net ? (S.opProfit / S.net) * 100 : null;
  S.final = S.costMissing === 0;                                  // maliyeti eksik sipariş varsa kâr kesinleşmiş sayılmaz
  S.hasData = orders.length + ads.length + exps.length > 0;
  return S;
}
// Tekrarlayan giderler her dönem için kendiliğinden oluşur (kayıt tek kez girilir)
export function expensesIn(r) {
  const out = [];
  for (const e of D.expenses) {
    const amount = e.net ?? e.gross ?? 0;                          // kârlılıkta KDV hariç tutar kullanılır
    if (!e.repeat || e.repeat === 'none') { if (inR(e.date, r)) out.push({ ...e, amount, occ: e.date }); continue; }
    const step = { monthly: 1, quarterly: 3, yearly: 12 }[e.repeat] ?? 1;
    let [y, m, d] = e.date.split('-').map(Number);
    for (let i = 0; i < 240; i++) { const last = new Date(y, m, 0).getDate(), occ = `${y}-${pad(m)}-${pad(Math.min(d, last))}`; if (occ > r.to || (e.repeatUntil && occ > e.repeatUntil)) break; if (occ >= r.from) out.push({ ...e, amount, occ, recurring: true }); m += step; while (m > 12) { m -= 12; y++; } }
  }
  return out.sort((a, b) => (a.occ < b.occ ? 1 : -1));
}
export function dailySeries(r) {
  const days = daysIn(r), idx = Object.fromEntries(days.map((d, i) => [d, i])), z = () => days.map(() => 0);
  const out = { days, ciro: z(), orders: z(), google: z(), meta: z() };
  for (const o of D.orders) { const i = idx[o.date]; if (i == null || isVoid(o)) continue; out.ciro[i] += o.sale ?? o.invoice ?? 0; out.orders[i]++; }
  for (const a of D.ads) { const i = idx[a.date]; if (i == null) continue; out[a.platform === 'Google Ads' ? 'google' : 'meta'][i] += a.spend ?? 0; }
  return out;
}
// Kırılım: anahtar işlevine göre net satış, maliyet, kâr (maliyeti bilinen siparişler üzerinden)
export function breakdown(r, keyFn) {
  const m = new Map();
  for (const o of D.orders) { if (!inR(o.date, r) || isVoid(o)) continue; const c = orderCalc(o), k = keyFn(o) || 'Belirtilmemiş'; const x = m.get(k) ?? { key: k, n: 0, net: 0, profit: 0, known: 0 }; x.n++; x.net += c.net; if (c.costKnown) { x.known++; x.profit += c.profit; } m.set(k, x); }
  return [...m.values()].map((x) => ({ ...x, margin: x.known && x.net ? (x.profit / x.net) * 100 : null })).sort((a, b) => b.net - a.net);
}

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

/* ---------- Ortak veri (şifreli paketten): sipariş tablosu ve reklam harcamaları ---------- */
export const X = { orders: null, ads: null };
export const setShared = (y) => { X.orders = y?.orders ?? null; X.ads = y?.ads ?? null; };
export const EXPENSE_CATS = ['Dijital pazarlama ajansı', 'SEO ajansı', 'Yazılım firmaları', 'E-ticaret altyapısı', 'Sanal POS komisyonları', 'Banka komisyonları', 'Kargo giderleri', 'Paketleme giderleri', 'Fotoğraf ve video prodüksiyon', 'Influencer çalışmaları', 'Yazılım abonelikleri', 'Personel giderleri', 'Diğer giderler'];
export const expenseCats = () => [...new Set([...EXPENSE_CATS, ...D.expenses.map((e) => e.category).filter(Boolean)])];
export const monthTR = (ym) => { const [y, m] = ym.split('-'); return ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][+m - 1] + ' ' + y; };
const sum = (a, f) => a.reduce((t, x) => t + (f(x) ?? 0), 0);

// Siparişler: tabloda tarih sütunu varsa döneme göre süzülür; yoksa tüm satırlar gelir (dated=false)
export function ordersIn(r) {
  const all = X.orders?.rows ?? [], dated = !!X.orders?.hasDate;
  return { dated, rows: dated ? all.filter((o) => inR(o.d, r)) : all, undated: dated ? all.filter((o) => !o.d).length : 0 };
}
// Reklam serileri: Google Ads + her Meta reklam hesabı ayrı
export function adSeries() {
  const out = [];
  if (X.ads?.google?.days) out.push({ key: 'google', label: 'Google Ads', platform: 'Google Ads', days: X.ads.google.days });
  for (const [id, a] of Object.entries(X.ads?.meta?.accounts ?? {})) out.push({ key: id, label: 'Meta Ads — ' + (a.label ?? id), platform: 'Meta Ads', days: a.days ?? {}, currency: a.currency });
  return out;
}
export function adsIn(r) {
  const series = adSeries().map((s) => ({ ...s, total: sum(Object.entries(s.days).filter(([d]) => inR(d, r)), (x) => x[1]) }));
  return { series, google: sum(series.filter((s) => s.platform === 'Google Ads'), (s) => s.total), meta: sum(series.filter((s) => s.platform === 'Meta Ads'), (s) => s.total), total: sum(series, (s) => s.total) };
}
// Giderler aylık girilir; seçilen döneme düşen pay gün sayısına göre hesaplanır (tam ay seçiliyse tutarın tamamı)
export const expMonth = (e) => e.month ?? e.date?.slice(0, 7) ?? null;
export const expAmount = (e) => e.amount ?? e.net ?? e.gross ?? 0;
export function expensesIn(r) {
  const by = {}; let total = 0;
  for (const e of D.expenses) {
    const ym = expMonth(e); if (!ym) continue;
    const [y, m] = ym.split('-').map(Number), last = new Date(y, m, 0).getDate(), a = `${ym}-01`, b = `${ym}-${pad(last)}`;
    if (b < r.from || a > r.to) continue;
    const from = a > r.from ? a : r.from, to = b < r.to ? b : r.to, share = (dayCount({ from, to }) / last) * expAmount(e);
    by[e.category] = (by[e.category] ?? 0) + share; total += share;
  }
  return { total, byCat: Object.entries(by).sort((a, b) => b[1] - a[1]) };
}
export function summarize(r) {
  const o = ordersIn(r), live = o.rows.filter((x) => !x.r), ret = o.rows.filter((x) => x.r), ads = adsIn(r), exp = expensesIn(r);
  const S = { dated: o.dated, undated: o.undated, orderCount: live.length, income: sum(live, (x) => x.a), returnCount: ret.length, returnSum: sum(ret, (x) => Math.abs(x.a)), ads, exp };
  S.avg = live.length ? S.income / live.length : null;
  S.left = S.income - ads.total - exp.total;                      // hesaba gelen − reklam − gider (ürün maliyeti dahil değildir)
  S.adShare = S.income ? (ads.total / S.income) * 100 : null;
  S.mer = ads.total ? S.income / ads.total : null;
  return S;
}
export function dailySeries(r) {
  const days = daysIn(r), idx = Object.fromEntries(days.map((d, i) => [d, i])), z = () => days.map(() => 0);
  const out = { days, income: z(), ads: adSeries().map((s) => ({ ...s, data: days.map((d) => s.days[d] ?? 0) })) };
  for (const o of X.orders?.rows ?? []) { const i = idx[o.d]; if (i != null && !o.r) out.income[i] += o.a; }
  return out;
}

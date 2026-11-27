// Ortak mantık: sınıflandırma, segmentleme, muadil eşleştirme. Hem tarayıcıda hem build adımında kullanılır.
export const norm = (s) => String(s ?? '').toLocaleLowerCase('tr-TR').replace(/â/g, 'a').replace(/î/g, 'i').replace(/\s+/g, ' ').trim();

const CATS = [
  ['Alyans', /alyans/], ['Set', /\bset(i|ler|leri)?\b|takım/], ['Yüzük', /yüzük/], ['Kolye', /kolye|gerdanl|madalyon/],
  ['Küpe', /küpe/], ['Bileklik', /bileklik|bilezik|kelepçe/], ['Piercing', /piercing|hızma/], ['Halhal', /halhal/],
  ['Broş', /broş/], ['Kol Düğmesi', /kol düğme/], ['Charm', /charm|uç\b/],
];
const MODELS = [
  ['Tektaş', /tek ?taş|solitaire|solo/], ['Beştaş', /beş ?taş|5 ?taş/], ['Üçtaş / Tria', /üç ?taş|tria|3 ?taş/],
  ['Tamtur', /tam ?tur/], ['Yarımtur', /yarım ?tur/], ['Su Yolu', /su ?yolu|tenis/], ['Baget', /baget/],
  ['Harf', /harf/], ['Halka', /halka/], ['Kalp', /kalp/], ['Yonca', /yonca/], ['Sonsuzluk', /sonsuz/],
  ['Kelebek', /kelebek/], ['Yıldız', /yıldız/], ['Çiçek', /çiçek|papatya/], ['Nazar / Göz', /nazar|göz\b/],
  ['Anahtar', /anahtar/], ['Haç / İnanç', /haç|allah|ayet|elif|vav\b/], ['Entourage / Anturaj', /anturaj|entourage|montür/],
];
const GEMS = [['Elmas', /elmas/], ['Safir', /safir/], ['Yakut', /yakut/], ['Zümrüt', /zümrüt/], ['İnci', /inci/], ['Siyah Pırlanta', /siyah pırlanta/], ['Renkli Taş', /renkli taş|ametist|topaz|akuamarin|kuvars|tanzanit|turmalin|opal|granat|sitrin|morganit/]];

export const CT_BUCKETS = [[0, 0.05, '0,05 ct altı'], [0.05, 0.1, '0,05–0,09 ct'], [0.1, 0.15, '0,10–0,14 ct'], [0.15, 0.2, '0,15–0,19 ct'], [0.2, 0.25, '0,20–0,24 ct'], [0.25, 0.3, '0,25–0,29 ct'], [0.3, 0.4, '0,30–0,39 ct'], [0.4, 0.5, '0,40–0,49 ct'], [0.5, 0.7, '0,50–0,69 ct'], [0.7, 1, '0,70–0,99 ct'], [1, 1.5, '1,00–1,49 ct'], [1.5, 99, '1,50 ct ve üzeri']];
export const bucketOf = (ct) => { if (ct == null) return -1; const i = CT_BUCKETS.findIndex(([a, b]) => ct >= a - 1e-9 && ct < b - 1e-9); return i; };
export const bucketLabel = (i) => (i < 0 ? 'Karat belirtilmemiş' : CT_BUCKETS[i][2]);

// "F/G" -> ['F','G'] ; "VS/SI" -> ['VS','SI']
const split = (s) => (s ? String(s).toUpperCase().replace(/\./g, '').split(/[\/\-\s,]+/).filter(Boolean) : []);

export function classify(p) {
  const n = norm(p.name), c = norm((p.cats ?? []).join(' | ')), all = n + ' | ' + c;
  const cat = (CATS.find(([, r]) => r.test(n)) ?? CATS.find(([, r]) => r.test(c)) ?? ['Diğer'])[0];
  const gem = (GEMS.find(([, r]) => r.test(all)) ?? [null])[0];
  let model = (MODELS.find(([, r]) => r.test(n)) ?? MODELS.find(([, r]) => r.test(c)) ?? [null])[0];
  if (!model) model = gem ? 'Renkli Taşlı' : 'Tasarım';
  if (model === 'Tektaş' && /ikili|twins|çift taş/.test(n)) model = 'İkili Tektaş';
  const dia = (p.stones ?? []).filter((s) => /pırlanta|elmas|diamond/.test(norm(s.type)) && !/siyah/.test(norm(s.type)));
  let ct = dia.reduce((a, s) => a + (s.ct ?? 0), 0) || null;
  if (ct == null) { const m = n.match(/(\d+[.,]\d+)\s*(karat|ct)/); if (m) ct = parseFloat(m[1].replace(',', '.')); }
  // Renkli taşlı ürünlerde karşılaştırma toplam karat (pırlanta + renkli taş) üzerinden yapılır; markaların ortak verdiği değer budur.
  if (gem && gem !== 'Elmas' && gem !== 'Siyah Pırlanta' && gem !== 'İnci') { const tot = (p.stones ?? []).reduce((x, st) => x + (st.ct ?? 0), 0); if (tot > 0) ct = tot; }
  if (ct != null) ct = Math.round(ct * 1000) / 1000;
  const main = dia.slice().sort((a, b) => (b.ct ?? 0) - (a.ct ?? 0))[0];
  const erkek = /erkek/.test(all);
  // Emsal eşleşmesini etkileyen ayrıntılar: sertifika, taş kesimi (adından), tektaşta merkez taşın payı
  const cert = /forevermark/.test(n) ? 'Forevermark' : /\b(hrd|gia|igi)\b/.test(n) ? 'Sertifikalı' : null;
  const cut = (['oval', 'prenses', 'damla', 'markiz', 'kalp', 'zümrüt kesim', 'baget'].find((k) => n.includes(k)) ?? (/^kare|\bkare\b/.test(n) ? 'prenses' : null)) || ((p.stones ?? []).length && main?.shape && !/yuvarlak/i.test(main.shape) ? norm(main.shape) : 'yuvarlak');
  let centerCt = null, centerShare = null;
  if (dia.some((x) => x.count)) { centerCt = Math.max(...dia.map((x) => (x.ct ?? 0) / (x.count || 1))); const tot = dia.reduce((a, x) => a + (x.ct ?? 0), 0); centerShare = tot ? centerCt / tot : null; }
  const designed = /tasarım|vintage|halo|çevre|yan taş|montür|anturaj/.test(n);
  // Segmentlemede safir/yakut/zümrüt vb. tek 'Renkli Taş' grubunda toplanır (markalar taşı farklı ayrıntıda adlandırıyor); ayrıntı gemDetail'de kalır.
  const COLORED = ['Safir', 'Yakut', 'Zümrüt', 'Renkli Taş'];
  const gemDetail = gem;
  // Pırlantasız altın ürünler (taşsız ya da zirkon) pırlantalı ürünlerle aynı gruba girmez; laboratuvar pırlantası da ayrıdır.
  const lab = dia.some((x) => /lab|sentetik/.test(norm(x.type))) || /lab(oratuvar)?\.? ?pırlanta|lab grown/.test(n);
  const noDia = !dia.length && !/pırlanta|elmas|diamond/.test(all);
  const gemG = COLORED.includes(gem) ? 'Renkli Taş' : gem ?? (lab ? 'Lab Pırlanta' : noDia ? 'Altın' : null);
  return { cat, model, gem: gemG ?? 'Pırlanta', gemDetail, ct, bucket: bucketOf(ct), color: main?.color ?? null, clarity: main?.clarity ?? null, shape: main?.shape ?? null, erkek, cert, cut, centerCt, centerShare, designed };
}

export const segKey = (p) => [p.cat, p.model, p.gem, p.bucket, p.ayar ?? 0, p.cert ?? ''].join('|');
export const segLabel = (p) => `${p.ct != null ? bucketLabel(p.bucket) + ' ' : ''}${p.model} ${p.gem === 'Pırlanta' ? 'Pırlanta ' : p.model === 'Renkli Taşlı' ? '' : p.gem + ' '}${p.cat}${p.ayar ? ' · ' + p.ayar + ' ayar' : ''}${p.cert ? ' · ' + p.cert : ''}`;

export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// İki ürünün "muadil" olma puanı (0–100). null => karşılaştırılamaz.
export function matchScore(a, b, exact = false) {
  if (a.cat !== b.cat || a.model !== b.model || a.gem !== b.gem) return null;
  if (a.ayar && b.ayar && a.ayar !== b.ayar) return null;
  if ((a.ct == null) !== (b.ct == null)) return null;
  if ((a.cert ?? '') !== (b.cert ?? '')) return null; // sertifikalı taş ayrı emsal grubudur
  const solitaire = /Tektaş/.test(a.model);
  if (solitaire || a.model === 'Beştaş') { if (a.cut !== b.cut) return null; }
  // Tektaşta toplam karatın çoğu yan taşlardan geliyorsa klasik tektaşla emsal sayılmaz
  if (solitaire && exact) for (const [x, y] of [[a, b], [b, a]]) if (y.centerShare != null && y.centerShare < 0.75 && !x.designed && !(x.centerShare != null && x.centerShare < 0.75)) return null;
  let s = 55;
  if (a.ct != null) {
    const d = Math.abs(a.ct - b.ct), tol = exact ? 0.0051 : Math.max(0.02, a.ct * 0.12); // exact: iki ondalığa kadar aynı karat
    if (d > tol) return null;
    s += 20 * (1 - d / tol);
  } else s += 5;
  const ov = (x, y) => { const X = split(x), Y = split(y); if (!X.length || !Y.length) return 0.4; return X.some((v) => Y.includes(v)) ? 1 : 0; };
  s += 9 * ov(a.color, b.color) + 9 * ov(a.clarity, b.clarity);
  if (a.metalColor && b.metalColor) s += norm(a.metalColor) === norm(b.metalColor) ? 4 : 0; else s += 2;
  if (a.shape && b.shape) s += norm(a.shape) === norm(b.shape) ? 3 : -6; else s += 1;
  if (a.gemDetail && b.gemDetail && a.gemDetail !== b.gemDetail && a.gemDetail !== 'Renkli Taş' && b.gemDetail !== 'Renkli Taş') s -= 12;
  return Math.round(Math.max(0, Math.min(100, s)));
}

// products: sınıflandırılmış aktif ürünler. Döner: Map(segKey -> {key,label,cat,model,gem,bucket,ayar, byBrand:{brand:[p...]}})
export function buildSegments(products) {
  const m = new Map();
  for (const p of products) {
    if (p.active === false || !p.price) continue;
    const k = segKey(p);
    let s = m.get(k);
    if (!s) m.set(k, (s = { key: k, label: segLabel(p), cat: p.cat, model: p.model, gem: p.gem, bucket: p.bucket, ayar: p.ayar ?? null, byBrand: {}, n: 0 }));
    (s.byBrand[p.brand] ??= []).push(p); s.n++;
  }
  for (const s of m.values()) {
    s.stats = {};
    for (const [b, list] of Object.entries(s.byBrand)) {
      const pr = list.map((p) => p.price);
      s.stats[b] = { n: list.length, min: Math.min(...pr), max: Math.max(...pr), med: median(pr) };
    }
  }
  return m;
}

// Bir ürünün diğer markalardaki en iyi muadilleri
export function equivalents(p, segments, perBrand = 3, exact = false) {
  const seg = segments.get(segKey(p));
  const out = [];
  // komşu karat aralıkları da aday (aralık sınırındaki ürünler için)
  const cands = [];
  for (const d of [0, -1, 1]) {
    const s = d === 0 ? seg : segments.get([p.cat, p.model, p.gem, p.bucket + d, p.ayar ?? 0, p.cert ?? ''].join('|'));
    if (s) for (const [b, l] of Object.entries(s.byBrand)) if (b !== p.brand) cands.push(...l);
  }
  const by = {};
  for (const c of cands) { const sc = matchScore(p, c, exact); if (sc != null) (by[c.brand] ??= []).push({ p: c, score: sc }); }
  for (const [b, l] of Object.entries(by)) { l.sort((x, y) => y.score - x.score || Math.abs(x.p.price - p.price) - Math.abs(y.p.price - p.price)); out.push(...l.slice(0, perBrand)); }
  return out;
}

// p'nin fiyatını ref markadaki muadillerle kıyasla: {refMed, diffPct, n} | null
export function versusRef(p, refBrand, segments) {
  if (!refBrand || p.brand === refBrand) return null;
  const eq = equivalents(p, segments, 5).filter((e) => e.p.brand === refBrand);
  let prices = eq.map((e) => e.p.price), basis = 'muadil';
  if (!prices.length) { const st = segments.get(segKey(p))?.stats?.[refBrand]; if (!st) return null; prices = [st.med]; basis = 'segment'; }
  const refMed = median(prices);
  return { refMed, diffPct: (p.price / refMed - 1) * 100, n: prices.length, basis };
}

/* ---------- Kıyas yorumu: fiyat farkını taş ve gram özellikleriyle birlikte okur ---------- */
const CLARITY = ['I3', 'I2', 'I1', 'I', 'SI3', 'SI2', 'SI', 'SI1', 'VS2', 'VS', 'VS1', 'VVS2', 'VVS', 'VVS1', 'IF', 'FL'];
const COLORS = 'MLKJIHGFED';
// Aralık verilmişse ("F/G", "VS/SI") ortalama derece alınır
const grade = (v, scale) => { const xs = split(v).map((x) => (typeof scale === 'string' ? scale.indexOf(x) : scale.indexOf(x))).filter((i) => i >= 0); return xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : null; };
export const clarityRank = (v) => grade(v, CLARITY);
export const colorRank = (v) => grade(v, COLORS);
const fmt = (n, d = 2) => n.toLocaleString('tr-TR', { maximumFractionDigits: d });

// mine: bizim ürün, other: rakip ürün. Döner: { diffPct, perCt:{mine,other,diffPct}, quality (-/0/+ rakip lehine), notes[], verdict, tone }
export function compareNote(mine, other) {
  const diffPct = (other.price / mine.price - 1) * 100;
  const notes = []; let q = 0;
  const perCt = mine.ct && other.ct ? { mine: mine.price / mine.ct, other: other.price / other.ct } : null;
  if (perCt) perCt.diffPct = (perCt.other / perCt.mine - 1) * 100;
  if (mine.ct != null && other.ct != null) {
    const d = other.ct - mine.ct;
    if (Math.abs(d) >= 0.005) { notes.push(`Rakibin karatı ${fmt(Math.abs(d))} ct ${d > 0 ? 'fazla' : 'az'} (${fmt(other.ct)} / ${fmt(mine.ct)} ct)`); q += d > 0 ? 1 : -1; }
  }
  if (/Tektaş/.test(other.model) && other.centerShare != null && other.centerShare < 0.75 && other.ct) notes.push(`Rakipte merkez taş ${fmt(other.centerCt)} ct; toplam karatın kalanı yan taşlar`);
  const c1 = clarityRank(mine.clarity), c2 = clarityRank(other.clarity);
  if (c1 != null && c2 != null && Math.abs(c2 - c1) >= 1) { notes.push(`Rakibin berraklığı ${c2 > c1 ? 'daha yüksek' : 'daha düşük'} (${other.clarity} / ${mine.clarity})`); q += c2 > c1 ? 2 : -2; }
  const k1 = colorRank(mine.color), k2 = colorRank(other.color);
  if (k1 != null && k2 != null && Math.abs(k2 - k1) >= 1) { notes.push(`Rakibin taş rengi ${k2 > k1 ? 'daha iyi' : 'daha düşük'} (${other.color} / ${mine.color})`); q += k2 > k1 ? 1 : -1; }
  if (mine.gram && other.gram) {
    const g = other.gram - mine.gram, gp = (g / mine.gram) * 100;
    if (Math.abs(gp) >= 10) { notes.push(`Rakip ürün ${fmt(Math.abs(g))} gr ${g > 0 ? 'daha ağır' : 'daha hafif'} (${fmt(other.gram)} / ${fmt(mine.gram)} gr)`); q += g > 0 ? 1 : -1; }
  }
  if (mine.metalColor && other.metalColor && norm(mine.metalColor) !== norm(other.metalColor)) notes.push(`Altın rengi farklı (${other.metalColor} / ${mine.metalColor})`);

  let verdict, tone;
  const cheap = diffPct < -3, exp = diffPct > 3;
  if (!cheap && !exp) { verdict = q > 0 ? 'Fiyatlar aynı seviyede ama rakibin özellikleri daha yüksek' : q < 0 ? 'Fiyatlar aynı seviyede, bizim ürünün özellikleri daha yüksek' : 'Fiyat ve özellikler aynı seviyede'; tone = q > 0 ? 'risk' : q < 0 ? 'good' : 'eq'; }
  else if (cheap) { verdict = q > 0 ? 'Rakip hem ucuz hem özellikleri daha yüksek: fiyatımız gözden geçirilmeli' : q < 0 ? 'Rakip ucuz, ancak özellikleri daha düşük: fark kısmen kaliteyle açıklanıyor' : 'Rakip benzer özelliklerle daha ucuz: fiyat baskısı var'; tone = q < 0 ? 'eq' : 'risk'; }
  else { verdict = q > 0 ? 'Rakip pahalı, ancak özellikleri daha yüksek: fark kısmen kaliteyle açıklanıyor' : q < 0 ? 'Biz hem ucuz hem özelliklerimiz daha yüksek: fiyat artışına alan olabilir' : 'Benzer özelliklerle biz daha ucuzuz'; tone = q > 0 ? 'eq' : 'good'; }
  return { diffPct, perCt, quality: q, notes, verdict, tone };
}

// Google Merchant (RSS, g: alanları) ürün beslemesini katalog biçimine çevirir. Tarayıcıda ve Node'da çalışır.
const ENT = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
const dec = (s) => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m).trim();
const money = (s) => { const n = parseFloat(String(s ?? '').replace(/[^\d.,]/g, '').replace(/,(\d{3})/g, '$1').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };

export function parseMerchantFeed(xml) {
  if (!/<item[\s>]/i.test(xml) || !/<g:price>/i.test(xml)) throw new Error('Bu dosya Google Merchant ürün beslemesi (XML) gibi görünmüyor: <item> ve <g:price> alanları bulunamadı.');
  const out = [], seen = new Set();
  let skipped = 0;
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const it = m[1];
    const g = (k) => { const r = it.match(new RegExp(`<g:${k}>([\\s\\S]*?)</g:${k}>`, 'i')) ?? it.match(new RegExp(`<${k}>([\\s\\S]*?)</${k}>`, 'i')); return r ? dec(r[1]) : null; };
    const attrs = {};
    for (const a of it.matchAll(/<g:attribute_name>([\s\S]*?)<\/g:attribute_name>\s*<g:attribute_value>([\s\S]*?)<\/g:attribute_value>/gi)) attrs[dec(a[1]).toLocaleLowerCase('tr-TR')] = dec(a[2]);
    const code = g('id'), name = g('title'), base = money(g('price')), sale = money(g('sale_price'));
    const price = sale && base && sale < base ? sale : base ?? sale;
    if (!code || !name || !price || seen.has(code)) { skipped++; continue; }
    seen.add(code);
    const material = g('material') ?? '';
    const am = material.match(/(\d+)\s*Ayar/i);
    // Beslemedeki "Ayar" özelliği pırlanta karatını taşıyor (ör. 0.5); altın ayarı g:material içinde ("14 Ayar Altın").
    let ct = parseFloat(String(attrs['ayar'] ?? attrs['karat'] ?? '').replace(',', '.'));
    if (!(ct > 0 && ct < 30)) ct = null;
    // g:color "F-G-SI" => renk F/G, berraklık SI
    const parts = (g('color') ?? '').toUpperCase().split(/[-\/\s]+/).filter(Boolean);
    const colors = parts.filter((x) => /^[D-M]$/.test(x));
    const clarity = (attrs['berraklık'] ?? parts.find((x) => /^(IF|VVS\d?|VS\d?|SI\d?|I\d)$/.test(x)) ?? '').toUpperCase() || null;
    const gram = parseFloat(String(attrs['ağırlık'] ?? '').replace(',', '.'));
    out.push({
      code, sku: g('mpn'), url: g('link'), name, price, listPrice: sale && base && sale < base ? base : null,
      inStock: g('availability') ? /in_?stock/i.test(g('availability')) : null, image: g('image_link'),
      cats: (g('product_type') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      ayar: am ? +am[1] : null, metal: material || null, metalColor: null, gram: gram > 0 ? gram : null,
      stones: ct ? [{ type: 'Pırlanta', ct, count: null, color: colors.join('/') || null, clarity, shape: null }] : [],
    });
  }
  if (!out.length) throw new Error('Dosyada fiyatı olan ürün bulunamadı.');
  return { products: out, skipped };
}

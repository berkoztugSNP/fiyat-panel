// Ürün sayfası HTML'inden yapısal veri çıkarır (schema.org JSON-LD + sertifika tablosu).
const ENT = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', uuml: 'ü', Uuml: 'Ü', ouml: 'ö', Ouml: 'Ö', ccedil: 'ç', Ccedil: 'Ç', iuml: 'ï', acirc: 'â', icirc: 'î', ucirc: 'û', rsquo: '’', lsquo: '‘' };
export const decode = (s) => String(s ?? '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-zA-Z]+);/g, (m, n) => ENT[n] ?? m);
const text = (h) => decode(String(h).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<div[^>]*class="popup"[\s\S]*?<\/div>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "1.234,50" / "0,40" / "40490" / "40490.00" -> sayı
export function num(s) {
  if (s == null) return null;
  let t = String(s).replace(/[^\d.,]/g, '');
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function ldBlocks(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1].trim();
    let j = null;
    try { j = JSON.parse(raw); } catch {
      try { j = JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' ').replace(/,\s*([}\]])/g, '$1')); } catch { j = { __raw: raw }; }
    }
    const push = (x) => { if (Array.isArray(x)) x.forEach(push); else if (x && x['@graph']) push(x['@graph']); else if (x) out.push(x); };
    push(j);
  }
  return out;
}
const isType = (o, t) => [].concat(o?.['@type'] ?? []).includes(t);
const rawField = (raw, k) => { const m = raw.match(new RegExp(`"${k}"\\s*:\\s*"([^"]*)"`)); return m ? m[1] : null; };

export function parseProduct(html, url) {
  const lds = ldBlocks(html);
  let prod = lds.find((o) => isType(o, 'Product'));
  if (!prod) {
    const r = lds.find((o) => o.__raw && /"@type"\s*:\s*"Product"/.test(o.__raw));
    if (r) prod = { name: rawField(r.__raw, 'name'), image: rawField(r.__raw, 'image'), sku: rawField(r.__raw, 'sku'), mpn: rawField(r.__raw, 'mpn'), offers: { price: rawField(r.__raw, 'price'), availability: rawField(r.__raw, 'availability') } };
  }
  if (!prod) return null;
  const offer = [].concat(prod.offers ?? [])[0] ?? {};
  const price = num(offer.price ?? offer.lowPrice);
  const name = decode(prod.name ?? '').trim();
  if (!name) return null;

  const slug = url.split('/').pop().split('?')[0];
  const code = (slug.match(/\d{7,}/) ?? [])[0] ?? String(prod.mpn ?? prod.sku ?? slug);
  const image = [].concat(prod.image ?? [])[0];

  const bc = lds.find((o) => isType(o, 'BreadcrumbList'));
  const cats = (bc?.itemListElement ?? []).map((i) => decode(i.name ?? i.item?.name ?? '').trim())
    .filter((n, i, a) => n && !/^ana\s?sayfa$/i.test(n) && !(i === a.length - 1 && n === name));

  // Liste (indirimsiz) fiyat
  let listPrice = null;
  const lp = html.match(/class="[^"]*\b(?:old_price2?|pdxu-top-old|old-price|eski-fiyat)\b[^"]*"[^>]*>\s*([\d.,]+)\s*(?:TL|₺)/i);
  if (lp) listPrice = num(lp[1]);
  if (listPrice != null && price != null && listPrice <= price) listPrice = null;

  // Sertifika bloğu: "<h2> 0.90 gr 14 Ayar Kırmızı Altın </h2>" + taş tablosu
  const ci = html.search(/Sertifika Bilgileri/i);
  const sect = ci >= 0 ? html.slice(ci, ci + 30000) : html;
  let ayar = null, metalColor = null, gram = null;
  const h = sect.match(/<h2[^>]*>([^<]*\bAyar\b[^<]*)<\/h2>/i) ?? html.match(/>([^<>]{0,60}\b\d{1,2}\s*Ayar\b[^<>]{0,40})</i);
  if (h) {
    const t = text(h[1]);
    ayar = +(t.match(/(\d{1,2})\s*Ayar/i) ?? [])[1] || null;
    gram = num((t.match(/([\d.,]+)\s*gr\b/i) ?? [])[1]);
    metalColor = ((t.match(/Ayar\s+(.*?)\s*Alt[ıi]n/i) ?? [])[1] ?? '').trim() || null;
  }
  const stones = [];
  const tb = sect.match(/<table[\s\S]*?<\/table>/i);
  if (tb && /Karat/i.test(tb[0])) {
    for (const tr of tb[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => text(m[1]));
      if (tds.length < 5 || /^Taş$/i.test(tds[0]) || !tds[0]) continue;
      stones.push({ type: tds[0], ct: num(tds[1]), count: num(tds[2]), color: tds[3] || null, clarity: tds[4] || null, shape: tds[5] || null });
    }
  }
  return {
    code, sku: String(prod.sku ?? prod.mpn ?? '') || null, url, name, price, listPrice,
    inStock: offer.availability ? /InStock/i.test(offer.availability) : null,
    image: image ? decode(image) : null, cats, ayar, metalColor, gram, stones,
  };
}

export function parseSitemap(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1]));
}

// T-Soft altyapılı mağazalar (ör. Lizay): özellikler JSON-LD açıklamasında düz metin olarak durur:
// "... Beyaz Altın, 14 Ayar, 1.72 gr Taş : Pırlanta Ağırlık : 0.06 Karat Renk : F Berraklık : VS/SI Kesim : Baget Taş : ..."
export function parseTsoft(html, url) {
  const prod = ldBlocks(html).find((o) => isType(o, 'Product'));
  if (!prod) return null;
  const offer = [].concat(prod.offers ?? [])[0] ?? {};
  const price = num(offer.price);
  const name = decode(prod.name ?? '').trim();
  if (!name) return null;
  const strike = num([].concat(offer.priceSpecification ?? []).find((x) => /Strikethrough/i.test(x.priceType ?? ''))?.price);
  const desc = decode(String(prod.description ?? '')).replace(/\s+/g, ' ');
  const head = desc.split(/Taş\s*:/)[0];
  const ayar = +(head.match(/(\d{1,3})\s*Ayar/i) ?? [])[1] || null;
  const gram = num((head.match(/([\d.,]+)\s*gr\b/i) ?? [])[1]);
  const metalColor = ((head.match(/(Beyaz|Sarı|Rose|Roze|Kırmızı|Yeşil)\s+Alt[ıi]n/i) ?? [])[1] ?? null);
  const stones = [];
  for (const part of desc.split(/Taş\s*:/).slice(1)) {
    const f = (k) => ((part.match(new RegExp(k + '\\s*:\\s*([^:]*?)(?=\\s+(?:Ağırlık|Renk|Berraklık|Kesim|Zincir|Ürünümüz|Bileklik|Yüzük|Küpe|Not)\\b|$)', 'i')) ?? [])[1] ?? '').trim().replace(/\.+$/, '') || null;
    const type = part.split(/\s+Ağırlık\s*:/)[0].trim();
    const ct = num((part.match(/Ağırlık\s*:\s*([\d.,]+)\s*Karat/i) ?? [])[1]);
    if (!type || type.length > 40) continue;
    stones.push({ type, ct, count: null, color: f('Renk'), clarity: f('Berraklık'), shape: f('Kesim') });
  }
  const image = [].concat(prod.image ?? [])[0];
  return {
    code: String(prod.sku ?? prod.productID ?? url.split('/').pop()), sku: String(prod.productID ?? '') || null, url, name, price,
    listPrice: strike && price && strike > price ? strike : null,
    inStock: offer.availability ? /InStock/i.test(offer.availability) : null, image: image ? decode(image) : null,
    cats: decode(String(prod.category ?? '')).split('>').map((x) => x.trim()).filter(Boolean),
    ayar, metalColor, gram, stones,
  };
}

// Akinon altyapılı mağazalar (ör. Atasay): JSON-LD + "table-diamond" taş tablosu + ürün detay tablosu.
export function parseAkinon(html, url) {
  const lds = ldBlocks(html);
  const prod = lds.find((o) => isType(o, 'Product'));
  if (!prod) return null;
  const offer = [].concat(prod.offers ?? [])[0] ?? {};
  const price = num(offer.price);
  const name = decode(prod.name ?? '').trim();
  if (!name) return null;
  const retail = num((html.match(/class="price -retail"[\s\S]{0,200}?data-initial-value="([\d.,]+)"/) ?? [])[1]);
  const detail = (k) => { const m = html.match(new RegExp('<td>\\s*' + k + '\\s*</td>\\s*<td>([\\s\\S]*?)</td>', 'i')); return m ? text(m[1]) : null; };
  const head = text((html.match(/class="product-description">([\s\S]*?)<\/div>/) ?? [])[1] ?? '') + ' | ' + decode(String(prod.description ?? ''));
  const ayar = +(detail('Ayar') ?? (head.match(/(\d{1,2})\s*Ayar/i) ?? [])[1]) || null;
  const gram = num(detail('Ürün Ağırlığı')) ?? num((head.match(/([\d.,]+)\s*Gr\b/i) ?? [])[1]);
  const metalColor = (head.match(/(Beyaz|Sarı|Rose|Roze|Kırmızı|Yeşil)\s+Alt[ıi]n/i) ?? name.match(/(Beyaz|Sarı|Rose|Roze|Kırmızı|Yeşil)\s+Alt[ıi]n/i) ?? [])[1] ?? null;
  const SHAPES = { RND: 'Yuvarlak', BGT: 'Baget', PRN: 'Prenses', OVL: 'Oval', MRQ: 'Markiz', PER: 'Damla', HRT: 'Kalp', EMR: 'Zümrüt' };
  const stones = [];
  const tb = html.match(/<table class="table-diamond">([\s\S]*?)<\/table>/i);
  if (tb) for (const tr of tb[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const td = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => text(m[1]));
    if (td.length < 2 || !td[0]) continue;
    stones.push({ type: td[0], ct: /car|ct/i.test(td[1]) ? num(td[1]) : null, count: null, color: (td[2] || '').replace(/-/g, '/') || null, clarity: (td[3] || '').replace(/-/g, '/') || null, shape: SHAPES[(td[4] || '').toUpperCase()] ?? (td[4] || null) });
  }
  const bc = lds.find((o) => isType(o, 'BreadcrumbList'));
  const cats = (bc?.itemListElement ?? []).map((i) => decode(i.name ?? i.item?.name ?? '').trim()).filter((n) => n && !/^ana\s?sayfa$/i.test(n));
  const image = [].concat(prod.image ?? [])[0];
  return {
    code: String(prod.sku ?? detail('Ürün Kodu') ?? url.split('/').filter(Boolean).pop()), sku: detail('Model Kodu'), url, name, price,
    listPrice: retail && price && retail > price ? retail : null,
    inStock: offer.availability ? /InStock/i.test(offer.availability) : null, image: image ? decode(image) : null, cats, ayar, metalColor, gram, stones,
  };
}

// Tarayıcıdan "Farklı kaydet" ile kaydedilmiş bir ürün sayfasını okur. Adres sayfanın içinden alınır.
export function parseSavedPage(html) {
  const url = (html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i) ?? html.match(/<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i) ?? html.match(/"url"\s*:\s*"(https?:[^"]+)"/) ?? [])[1];
  if (!url) return null;
  const u = decode(url).replace(/\\\//g, '/');
  const p = parseProduct(html, u.replace(/\.html?$/i, ''));
  if (p) p.url = u;
  return p;
}

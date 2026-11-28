// Pazarlama İstihbaratı: rakip markalar, reklam kütüphanesi, ana sayfa ve fiyat/kampanya izleme.
// İlke: her veri kaynağıyla birlikte gösterilir; olmayan veri sıfır ya da tahminle doldurulmaz.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (id) => `<svg class="ic"><use href="#${id}"/></svg>`;
const opt = (list, cur, all) => (all != null ? `<option value="">${all}</option>` : '') + list.map((x) => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
const low = (s) => String(s ?? '').toLocaleLowerCase('tr-TR');
const dTR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : '—');
const when = (at) => (at ? new Date(at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const num = (n) => (n == null ? '—' : n.toLocaleString('tr-TR'));
const pct = (n, d = 0) => (n == null || !Number.isFinite(n) ? '—' : '%' + n.toLocaleString('tr-TR', { maximumFractionDigits: d }));
const tl = (n) => (n == null ? '—' : Math.round(n).toLocaleString('tr-TR') + ' ₺');
const fixUrl = (v) => { const t = String(v ?? '').trim(); if (!t) return ''; try { const u = new URL(/^https?:\/\//i.test(t) ? t : 'https://' + t); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : ''; } catch { return ''; } };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const todayISO = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);

export const TITLES = { genel: ['Dijital Akış', 'Rakiplerin son dijital pazarlama adımları'], markalar: ['Rakip Markalar', 'Takip edilen markalar ve bağlı kaynaklar'], reklamlar: ['Reklam Kütüphanesi', 'Google reklamları (otomatik) ve kaydedilen reklamlar'], sosyal: ['Sosyal Medya', 'Instagram ve YouTube içerikleri'], web: ['Web ve SEO', 'Ana sayfa değişiklikleri'], karsilastir: ['Rakip Karşılaştırma', 'Dijital faaliyet, yan yana'], firsatlar: ['Trend ve Fırsatlar', 'Veriden türetilen çıkarımlar'], kaynaklar: ['Veri Kaynakları', 'Hangi veri nereden geliyor'], menu: ['Diğer', 'Pazarlama İstihbaratı'] };
const TABS = ['genel', 'reklamlar', 'sosyal', 'markalar', 'menu'];
const PLATFORMS = ['Meta (Instagram / Facebook)', 'Google / YouTube', 'TikTok', 'Diğer'], FORMATS = ['Görsel', 'Video', 'Carousel', 'Hikâye / Reels', 'Arama', 'Diğer'], AD_STATUS = ['Aktif', 'Yayından kalktı', 'Bilinmiyor'];
// Veri sınıfı etiketleri (her verinin kaynağı görünür)
const SRC = { site: ['Web sitesi', 'pos'], goog: ['Google şeffaflık verisi', 'pos'], yt: ['YouTube', 'pos'], ig: ['Instagram · organik', 'pos'], cat: ['Fiyat takibi', 'pos'], man: ['Elle eklendi', 'acc'], rule: ['Kural tabanlı çıkarım', 'warn'], none: ['Erişilemiyor', ''] };
const src = (k, extra = '') => `<span class="tag ${SRC[k][1]}" title="Veri sınıfı">${SRC[k][0]}${extra ? ' · ' + extra : ''}</span>`;
let H = null, D = { brands: [], ads: [], web: {}, google: null, youtube: null, instagram: null }, GEN = null;
const F = { ad: { q: '', brand: '', format: '', src: '', fav: false, fresh: false }, soc: { brand: '', net: '' }, web: '', cmp: null, feed: '' };

/* ---------- Bekleyen kayıtlar: panelden yapılan değişiklik 1–2 dakikada herkese yayılır; o zamana kadar bu tarayıcıda görünür ---------- */
const PEND = 'sp_pazar_pend';
const pend = () => { try { return JSON.parse(localStorage.getItem(PEND) ?? '[]').filter((o) => !GEN || o.at > GEN); } catch { return []; } };
function merged(kind) {
  const list = (kind === 'brand' ? D.brands : D.ads).map((x) => ({ ...x }));
  for (const o of pend()) { if (!o.t.startsWith(kind + '.')) continue; const i = list.findIndex((x) => x.id === o.id);
    if (o.t.endsWith('.delete')) { if (i >= 0) list.splice(i, 1); } else if (o.t === 'brand.archive') { if (i >= 0) { list[i].archived = !!o.data.archived; list[i]._pending = true; } }
    else if (i >= 0) list[i] = { ...list[i], ...o.data, _pending: true }; else list.push({ id: o.id, ...o.data, kind: 'manual', since: todayISO(), _pending: true }); }
  return list;
}
const brands = (all) => merged('brand').filter((b) => all || !b.archived);
const rivals = () => brands().filter((b) => !b.self);
const bname = (id) => merged('brand').find((b) => b.id === id)?.name ?? id;
const ads = () => merged('ad');
async function submit(op) {
  if (!H.publish) throw new Error('Kayıt altyapısı kurulu değil (UPLOAD_TOKEN).');
  const data = op.data ? { ...op.data } : undefined; for (const k of ['web', 'metaLibrary', 'googleAds', 'url', 'media', 'source']) if (data && k in data) data[k] = fixUrl(data[k]); // adresler kaydedilmeden önce düzeltilir; geçersizse boş bırakılır
  const full = { ...op, ...(data ? { data } : {}), by: H.user };
  const { repo, token, branch } = H.publish;
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/pazar-kayit.yml/dispatches`, { method: 'POST', headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json' }, body: JSON.stringify({ ref: branch, inputs: { islem: JSON.stringify(full) } }) });
  if (!r.ok) throw new Error('Kaydedilemedi (HTTP ' + r.status + ').');
  try { localStorage.setItem(PEND, JSON.stringify([...pend(), { ...full, at: new Date().toISOString() }])); } catch {}
}
const pendNote = () => (pend().length ? `<div class="note">${pend().length} değişiklik kaydedildi ve yayınlanıyor; ekip arkadaşlarınız bir iki dakika içinde görür.</div>` : '');

/* ---------- Türetilmiş veri ---------- */
const since = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const gAds = (b) => D.google?.brands?.[b.id]?.ads ?? null;          // null = bu marka için Google verisi yok
const gActive = (b) => (gAds(b) ?? []).filter((a) => a.last && a.last >= since(7));
const yt = (b) => D.youtube?.brands?.[b.id] ?? null;
const ig = (b) => D.instagram?.brands?.[b.id] ?? null;
const FMT = { VIDEO: 'Video', IMAGE: 'Görsel', TEXT: 'Metin' };
const durTR = (d) => { const m = String(d ?? '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (m[1] ? m[1] + ':' + String(m[2] ?? 0).padStart(2, '0') : m[2] ?? '0') + ':' + String(m[3] ?? 0).padStart(2, '0') : ''; };
// Tüm kaynaklardan tek akış: her kayıt hangi markanın, hangi kanalda, ne zaman, ne yaptığı
function feed(days = 60) {
  const lim = since(days), out = [];
  for (const b of rivals()) {
    for (const a of gAds(b) ?? []) if ((a.first ?? '') >= lim) out.push({ at: a.first, b, k: 'goog', kind: 'Google reklamı', t: `${FMT[a.format] ?? a.format ?? 'Reklam'} reklam yayına girdi`, sub: a.topic, href: a.url, fmt: a.format });
    for (const v of yt(b)?.videos ?? []) if ((v.at ?? '') >= lim) out.push({ at: v.at, b, k: 'yt', kind: 'YouTube', t: v.title, img: v.thumb, yt: v.id, sub: v.views != null ? num(v.views) + ' izlenme' : '' });
    for (const p of ig(b)?.posts ?? []) if ((p.at ?? '') >= lim) out.push({ at: p.at, b, k: 'ig', kind: 'Instagram ' + p.type, t: (p.text || p.type).slice(0, 110), img: p.img, vid: p.video, href: p.url, sub: p.likes != null ? num(p.likes) + ' beğeni' : '' });
    for (const c of webOf(b)?.changes ?? []) if (c.at.slice(0, 10) >= lim) out.push({ at: c.at, b, k: 'site', kind: 'Web sitesi', t: `Ana sayfada ${low(c.label)} değişti`, img: c.field === 'banners' ? c.after?.[0]?.src : null, go: '#/p/web' });
  }
  for (const a of ads()) { const at = a.firstSeen ?? a.createdAt; if (at && at.slice(0, 10) >= lim) { const b = rivals().find((x) => x.id === a.brand); if (b) out.push({ at, b, k: 'man', kind: (a.platform ?? 'Reklam').split(' ')[0] + ' reklamı', t: a.title || (a.text ?? '').slice(0, 110) || 'Kaydedilen reklam', img: a.media, aid: a.id }); } }
  return out.sort((x, y) => (String(x.at) < String(y.at) ? 1 : -1));
}
const feedCard = (f) => `<div class="pz-fc"${f.aid ? ` data-aid="${esc(f.aid)}" tabindex="0" role="button"` : ''}>${f.yt ? `<button class="pz-fm play" data-yt="${esc(f.yt)}" aria-label="Videoyu oynat"><img loading="lazy" src="${esc(f.img ?? '')}" alt=""></button>` : f.vid ? `<div class="pz-fm"><video controls preload="none" playsinline poster="${esc(f.img ?? '')}" src="${esc(f.vid)}"></video></div>` : f.img ? `<div class="pz-fm"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(f.img)}" alt="" onerror="this.parentElement.remove()"></div>` : `<div class="pz-fm none">${ic(f.k === 'goog' ? 'i-mega' : 'i-doc')}<span>${esc(f.fmt ? FMT[f.fmt] ?? f.fmt : f.kind)}</span></div>`}
  <div class="pz-fb"><div class="pz-ft"><b>${esc(f.b.name)}</b><span class="num muted">${dTR(f.at)}</span></div><div class="pz-fh">${esc(f.t)}</div><div class="pz-chips">${src(f.k)}${f.sub ? `<span class="small muted">${esc(f.sub)}</span>` : ''}</div>${f.href ? `<a class="btn small" href="${esc(f.href)}" target="_blank" rel="noopener noreferrer">${f.k === 'goog' ? 'Reklamı Google\'da izle ↗' : 'Kaynakta aç ↗'}</a>` : f.go ? `<a class="btn small" href="${f.go}" data-web="${esc(f.b.id)}">Önce / sonra</a>` : ''}</div></div>`;
const webOf = (b) => D.web[b.id] ?? null;
const WEB_ST = { ok: ['İzleniyor', 'pos'], blocked: ['Site izin vermiyor', 'neg'], robots: ['robots.txt izin vermiyor', 'neg'], error: ['Ulaşılamadı', 'warn'] };
const webTag = (b) => { const w = webOf(b); return !b.web ? '<span class="tag">Web adresi girilmedi</span>' : !w ? '<span class="tag warn">İlk okuma bekleniyor</span>' : `<span class="tag ${WEB_ST[w.status]?.[1] ?? ''}">${WEB_ST[w.status]?.[0] ?? w.status}</span>`; };
const changes = (sinceDays = 3650) => { const lim = new Date(Date.now() - sinceDays * 864e5).toISOString(); return brands().flatMap((b) => (webOf(b)?.changes ?? []).filter((c) => c.at >= lim).map((c) => ({ ...c, brand: b }))).sort((a, b) => (a.at < b.at ? 1 : -1)); };
const advId = (b) => String(b.googleAds ?? '').match(/AR\d{10,}/)?.[0] ?? null;
const handle = (v) => String(v ?? '').replace(/^https?:\/\/(www\.)?(instagram|facebook|tiktok|youtube)\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '');
// Resmî kamu kütüphanelerinde markayı açan bağlantılar (veri çekilmez, kullanıcı kaynağı kendisi inceler)
const libLinks = (b) => [
  ['Meta Reklam Kütüphanesi', b.metaLibrary || `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=TR&q=${encodeURIComponent(b.name)}&search_type=keyword_unordered`],
  ['Google Reklam Şeffaflık Merkezi', advId(b) ? `https://adstransparency.google.com/advertiser/${advId(b)}?region=TR` : b.web ? `https://adstransparency.google.com/?region=TR&domain=${encodeURIComponent(hostOf(b.web))}` : null],
  ['TikTok Creative Center', 'https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/tr'],
  b.instagram ? ['Instagram', 'https://www.instagram.com/' + handle(b.instagram)] : null, b.web ? ['Web sitesi', b.web] : null,
].filter((x) => x && x[1]);
const fieldVal = (f, v) => (f === 'banners' ? `<div class="pz-thumbs">${(v ?? []).slice(0, 6).map((x) => `<a href="${esc(x.src)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(x.src)}" alt="${esc(x.alt)}"></a>`).join('') || '<span class="muted small">Görsel yok</span>'}</div>` : Array.isArray(v) ? (v.length ? `<div class="pz-chips">${v.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>` : '<span class="muted small">Yok</span>') : esc(v || '—'));
// Kural tabanlı çıkarımlar: yalnızca eldeki gerçek veriden, dayanağıyla birlikte
function insights() {
  const out = [], R = rivals(), d30 = since(30), d7 = since(7);
  for (const b of R) {
    const g = gAds(b), y = yt(b), i = ig(b), w = webOf(b);
    if (g) { const fresh = g.filter((a) => (a.first ?? '') >= d7), act = gActive(b), vid = act.filter((a) => a.format === 'VIDEO').length;
      if (fresh.length >= 3) out.push({ pri: 1, title: `${b.name} son 7 günde ${fresh.length} yeni Google reklamı yayına aldı`, why: `Biçim dağılımı: ${Object.entries(fresh.reduce((m, a) => ((m[FMT[a.format] ?? a.format] = (m[FMT[a.format] ?? a.format] ?? 0) + 1), m), {})).map(([k, n]) => `${n} ${low(k)}`).join(', ')}.`, act: 'Reklam Kütüphanesi\'nde "Yeni" süzgeciyle açıp kreatifleri inceleyin.', dept: 'Pazarlama', src: 'goog' });
      if (act.length >= 5 && vid / act.length >= 0.5) out.push({ pri: 2, title: `${b.name} aktif Google reklamlarının ${pct((vid / act.length) * 100)} kadarı video`, why: `Son 7 günde gösterilen ${act.length} reklamın ${vid} tanesi video.`, act: 'Video kreatif üretim sıklığınızı karşılaştırın.', dept: 'Kreatif', src: 'goog' });
      if (g.length && !act.length) out.push({ pri: 3, title: `${b.name} için son 7 günde gösterilen Google reklamı görünmüyor`, why: `Kayıtlı ${g.length} reklamın son gösterim tarihi ${dTR(g[0]?.last)}. Veri gecikmeli olabilir.`, act: 'Arama ve alışveriş kampanyalarında rekabet boşluğu olabilir; doğrulayın.', dept: 'Pazarlama', src: 'goog' }); }
    if (y?.videos?.length) { const n = y.videos.filter((v) => v.at.slice(0, 10) >= d30); if (n.length >= 3) out.push({ pri: 2, title: `${b.name} son 30 günde YouTube'a ${n.length} video yükledi`, why: `En çok izlenen: "${n.slice().sort((a, c) => (c.views ?? 0) - (a.views ?? 0))[0].title}".`, act: 'Sosyal Medya sayfasında videoları izleyin.', dept: 'Kreatif', src: 'yt' }); }
    if (i?.posts?.length) { const n = i.posts.filter((p) => p.at.slice(0, 10) >= d30), reels = n.filter((p) => p.type === 'Reels' || p.type === 'Video').length; if (n.length >= 8) out.push({ pri: 3, title: `${b.name} son 30 günde Instagram'da ${n.length} gönderi paylaştı`, why: `${reels} tanesi video/Reels. Organik paylaşımdır; reklam verisi değildir.`, act: 'İçerik takviminizi karşılaştırın.', dept: 'Sosyal medya', src: 'ig' }); }
    const rc = (w?.changes ?? []).filter((c) => c.at.slice(0, 10) >= d7 && (c.field === 'banners' || c.field === 'msgs'));
    if (rc.length) out.push({ pri: 2, title: `${b.name} son 7 günde ana sayfa kampanya alanını değiştirdi`, why: `${rc.length} değişiklik (${[...new Set(rc.map((c) => c.label))].join(', ')}).`, act: 'Web ve SEO sayfasında önce/sonra karşılaştırmasına bakın.', dept: 'Pazarlama', src: 'site' });
  }
  return out.sort((a, b) => a.pri - b.pri);
}

/* ---------- Sayfalar ---------- */
const pages = {
  genel(view) {
    const R = rivals(), all = feed(60), kinds = [['', 'Tümü'], ['goog', 'Google reklamları'], ['ig', 'Instagram'], ['yt', 'YouTube'], ['site', 'Web'], ['man', 'Kaydedilenler']].filter(([k]) => !k || all.some((f) => f.k === k));
    const list = all.filter((f) => !F.feed || f.k === F.feed), gConn = !!D.google?.brands && Object.keys(D.google.brands).length, d7 = since(7);
    const ins = insights().slice(0, 3);
    view.innerHTML = `${pendNote()}
      <div class="grid g4"><div class="card kpi"><div class="l">Takip edilen rakip</div><div class="v num">${R.length}</div><div class="s">${R.map((b) => b.name).join(', ')}</div></div>
        <div class="card kpi"><div class="l">Aktif Google reklamı</div><div class="v num">${gConn ? num(R.reduce((t, b) => t + gActive(b).length, 0)) : '—'}</div><div class="s">${gConn ? `Son 7 günde gösterilen · ${R.reduce((t, b) => t + (gAds(b) ?? []).filter((a) => (a.first ?? '') >= d7).length, 0)} yeni` : 'Google reklam verisi bağlı değil'}</div></div>
        <div class="card kpi"><div class="l">Son 7 günde sosyal içerik</div><div class="v num">${D.instagram || D.youtube ? num(all.filter((f) => (f.k === 'ig' || f.k === 'yt') && String(f.at).slice(0, 10) >= d7).length) : '—'}</div><div class="s">${D.instagram || D.youtube ? 'Instagram gönderisi ve YouTube videosu' : 'Instagram ve YouTube bağlı değil'}</div></div>
        <div class="card kpi"><div class="l">Son 7 günde web değişikliği</div><div class="v num">${num(changes(7).length)}</div><div class="s">${R.filter((b) => webOf(b)?.status === 'ok').length} sitenin ana sayfası izleniyor</div></div></div>
      ${!gConn || !D.instagram || !D.youtube ? `<div class="note warn"><b>Bağlı olmayan kaynaklar var:</b> ${[!gConn && 'Google reklamları', !D.instagram && 'Instagram', !D.youtube && 'YouTube'].filter(Boolean).join(', ')}. Bağlanana kadar akışta yalnızca web değişiklikleri ve elle kaydedilen reklamlar görünür. <a href="#/p/kaynaklar">Nasıl bağlanır?</a></div>` : ''}
      ${ins.length ? `<div class="card"><div class="card-head"><div><h2>Öne çıkanlar</h2><p class="muted small">Kurallarla üretilir; yapay zekâ değildir</p></div><a class="btn small" href="#/p/firsatlar">Tümü</a></div>${ins.map(insRow).join('')}</div>` : ''}
      <div class="bar"><div class="seg scroll" role="tablist" aria-label="Kanal">${kinds.map(([k, l]) => `<button data-fk="${k}" class="${F.feed === k ? 'on' : ''}">${l}</button>`).join('')}</div><span class="grow"></span><span class="small muted">Son 60 gün · ${list.length} adım</span></div>
      ${list.length ? `<div class="pz-feedg">${list.slice(0, 90).map(feedCard).join('')}</div>` : `<div class="card empty"><b>Henüz kayıtlı adım yok</b>Kaynaklar bağlandıkça ve siteler değiştikçe rakiplerin attığı her adım burada tarih sırasıyla görünür.</div>`}`;
    $$('[data-fk]', view).forEach((b) => (b.onclick = () => { F.feed = b.dataset.fk; route('genel'); }));
    view.querySelectorAll('[data-web]').forEach((a) => (a.onclick = () => { F.web = a.dataset.web; }));
  },

  markalar(view) {
    const list = brands(true).filter((b) => !b.self).sort((a, b) => (!!a.archived - !!b.archived) || a.name.localeCompare(b.name, 'tr'));
    const st = (ok, n, miss) => (ok ? `<b class="num">${n}</b>` : `<span class="tag">${miss}</span>`);
    view.innerHTML = `${pendNote()}<div class="bar"><span class="small muted">${list.filter((b) => !b.archived).length} marka takipte${list.some((b) => b.archived) ? ` · ${list.filter((b) => b.archived).length} arşivde` : ''}</span><span class="grow"></span><button class="btn primary" id="bNew">${ic('i-plus')}Marka ekle</button></div>
      <div class="pz-brands">${list.map((b) => { const g = gAds(b), y = yt(b), i = ig(b); return `<div class="card pz-brand${b.archived ? ' arch' : ''}" data-bid="${esc(b.id)}" tabindex="0" role="button"><div class="pz-bh"><span class="pz-av">${esc(b.name.slice(0, 1))}</span><div><b>${esc(b.name)}</b><div class="small muted">${esc(hostOf(b.web) || 'Web adresi yok')}</div></div>${b._pending ? '<span class="tag acc">Yayınlanıyor</span>' : b.archived ? '<span class="tag">Arşiv</span>' : ''}</div>
        <div class="pz-bm"><div><span>Google reklamı</span>${st(g, g ? `${gActive(b).length} aktif` : '', advId(b) ? 'Veri bekleniyor' : 'Kimlik girilmedi')}</div><div><span>Instagram</span>${st(i?.posts, i?.followers != null ? num(i.followers) + ' takipçi' : 'Bağlı', b.instagram ? 'Veri bekleniyor' : 'Hesap girilmedi')}</div><div><span>YouTube</span>${st(y?.videos, y?.channel?.subs != null ? num(y.channel.subs) + ' abone' : 'Bağlı', b.youtube ? 'Veri bekleniyor' : 'Kanal girilmedi')}</div><div><span>Web izleme</span>${webTag(b)}</div></div></div>`; }).join('')}</div>`;
    $('#bNew').onclick = () => brandForm();
  },

  reklamlar(view) {
    const f = F.ad, q = low(f.q), R = rivals(), d7 = since(7);
    const auto = R.flatMap((b) => (gAds(b) ?? []).map((a) => ({ ...a, b, kind: 'goog' }))), man = ads().map((a) => ({ ...a, b: R.find((x) => x.id === a.brand), kind: 'man' })).filter((a) => a.b);
    const list = [...auto, ...man].filter((a) => (!f.brand || a.b.id === f.brand) && (!f.src || a.kind === f.src) && (!f.format || (a.kind === 'goog' ? a.format === f.format : low(a.format ?? '').includes(low(FMT[f.format])))) && (!f.fav || a.fav) && (!f.fresh || (a.kind === 'goog' ? (a.first ?? '') >= d7 : (a.firstSeen ?? a.createdAt ?? '') >= d7)) && (!q || low([a.title, a.text, a.topic, a.tags, a.campaign, a.b.name].join(' ')).includes(q)))
      .sort((x, y) => (String(y.kind === 'goog' ? y.last : y.firstSeen ?? y.createdAt) > String(x.kind === 'goog' ? x.last : x.firstSeen ?? x.createdAt) ? 1 : -1));
    const gErr = D.google?.error, gNo = R.filter((b) => !advId(b));
    view.innerHTML = `${pendNote()}
      ${!D.google ? `<div class="note warn"><b>Google reklamları henüz bağlı değil.</b> Google, Türkiye'de gösterilen reklamları resmî bir açık veri kümesinde yayımlıyor; bağlanınca rakiplerin Google, YouTube ve Görüntülü Reklam Ağı reklamları buraya kendiliğinden gelir. <a href="#/p/kaynaklar">Nasıl bağlanır?</a></div>` : gErr ? `<div class="note warn"><b>Google reklam verisi son denemede alınamadı.</b> ${esc(gErr)}</div>` : gNo.length ? `<div class="note">Google reklamveren kimliği girilmemiş markalar: ${gNo.map((b) => esc(b.name)).join(', ')}. Marka kartından ekleyin.</div>` : ''}
      <div class="card"><div class="card-head"><div><h2>Meta (Instagram / Facebook) reklamları</h2><p class="muted small">Meta, Türkiye'deki reklamları dışarıya veri olarak vermiyor; yalnızca kendi sayfasında gösteriyor. Aşağıdaki düğme markanın şu an yayındaki tüm reklamlarını Meta'nın sayfasında açar: videolar orada izlenir. Saklamak istediğinizi "Reklam ekle" ile kaydedin.</p></div><button class="btn primary" id="aNew">${ic('i-plus')}Reklam ekle</button></div>
        <div class="pz-chips">${R.map((b) => `<a class="btn small" href="${esc(libLinks(b)[0][1])}" target="_blank" rel="noopener noreferrer">${esc(b.name)} · yayındaki Meta reklamları ↗</a>`).join('')}</div></div>
      <div class="bar"><div class="mh-search"><input id="aq" type="search" value="${esc(f.q)}" placeholder="Marka, konu, reklam metni ya da etiket" aria-label="Reklamlarda ara"></div></div>
      <div class="card"><div class="filters"><div><label for="ab">Marka</label><select id="ab">${opt(R.map((b) => [b.id, b.name]), f.brand, 'Tüm markalar')}</select></div><div><label for="ak">Kaynak</label><select id="ak">${opt([['goog', 'Google (otomatik)'], ['man', 'Kaydedilenler']], f.src, 'Tüm kaynaklar')}</select></div><div><label for="am">Biçim</label><select id="am">${opt(Object.entries(FMT), f.format, 'Tüm biçimler')}</select></div><div><label>&nbsp;</label><label class="switch" style="min-height:36px"><input type="checkbox" id="an"${f.fresh ? ' checked' : ''}>Son 7 günde yeni</label></div><div><label>&nbsp;</label><label class="switch" style="min-height:36px"><input type="checkbox" id="af"${f.fav ? ' checked' : ''}>Favoriler</label></div></div></div>
      ${list.length ? `<div class="small muted">${num(list.length)} reklam${auto.length ? ` · Google verisi ${dTR(D.google?.at)}` : ''}</div><div class="pz-ads">${list.slice(0, 240).map((a) => (a.kind === 'man' ? adCard(a) : `<div class="card pz-ad g"><div class="pz-ad-m none">${ic('i-mega')}<span>${esc(FMT[a.format] ?? a.format ?? 'Reklam')}</span></div><div class="pz-ad-b"><div class="pz-ad-t"><b>${esc(a.b.name)}</b>${(a.first ?? '') >= d7 ? '<span class="tag acc">Yeni</span>' : ''}${(a.last ?? '') >= d7 ? '<span class="tag pos">Aktif</span>' : '<span class="tag">Bitti</span>'}</div><div class="small muted num">${dTR(a.first)} – ${dTR(a.last)}</div>${a.topic ? `<div class="small">${esc(a.topic)}</div>` : ''}<a class="btn small primary" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${a.format === 'VIDEO' ? 'Videoyu Google\'da izle ↗' : 'Reklamı Google\'da gör ↗'}</a></div></div>`)).join('')}</div>${list.length > 240 ? '<div class="small muted">İlk 240 reklam gösteriliyor; süzgeçle daraltın.</div>' : ''}`
        : `<div class="card empty"><b>${auto.length + man.length ? 'Bu süzgeçlere uyan reklam yok' : 'Henüz reklam yok'}</b>${auto.length + man.length ? 'Süzgeçleri değiştirin.' : 'Google reklamları bağlanınca kendiliğinden dolar; Meta reklamlarını yukarıdaki düğmelerle açıp beğendiğinizi kaydedebilirsiniz.'}</div>`}
      ${auto.length ? '<div class="note">Google, veri kümesinde reklamın görsel ya da video dosyasını vermiyor; yalnızca biçimini, gösterim tarihlerini ve kendi sayfasındaki bağlantısını veriyor. Kreatifi görmek için düğme Google\'ın sayfasını açar. "Aktif" = son 7 günde gösterilmiş; veri birkaç gün gecikebilir.</div>' : ''}`;
    const re = () => route('reklamlar');
    $('#aNew').onclick = () => adForm(); let t; $('#aq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; re(); setTimeout(() => { const i = $('#aq'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 0); }, 250); };
    $('#ab').onchange = (e) => { f.brand = e.target.value; re(); }; $('#ak').onchange = (e) => { f.src = e.target.value; re(); }; $('#am').onchange = (e) => { f.format = e.target.value; re(); }; $('#af').onchange = (e) => { f.fav = e.target.checked; re(); }; $('#an').onchange = (e) => { f.fresh = e.target.checked; re(); };
  },

  sosyal(view) {
    const f = F.soc, R = rivals(), conn = D.instagram || D.youtube;
    const items = feed(120).filter((x) => (x.k === 'ig' || x.k === 'yt') && (!f.brand || x.b.id === f.brand) && (!f.net || x.k === f.net));
    view.innerHTML = `${!conn ? `<div class="note warn"><b>Instagram ve YouTube henüz bağlı değil.</b> Bağlanınca rakiplerin herkese açık gönderileri ve videoları burada izlenebilir. <a href="#/p/kaynaklar">Nasıl bağlanır?</a></div>` : ''}
      <div class="tbl-wrap"><table><thead><tr><th>Marka</th><th class="r">Instagram takipçi</th><th class="r">Son 30 günde gönderi</th><th class="r">Ortalama beğeni</th><th class="r">YouTube abone</th><th class="r">Son 30 günde video</th></tr></thead><tbody>${R.map((b) => { const i = ig(b), y = yt(b), p30 = (i?.posts ?? []).filter((p) => p.at.slice(0, 10) >= since(30)), lk = p30.filter((p) => p.likes != null), v30 = (y?.videos ?? []).filter((v) => v.at.slice(0, 10) >= since(30)), na = '<span class="muted">veri yok</span>'; return `<tr><td><b>${esc(b.name)}</b>${i?.error || y?.error ? ` <span class="tag warn" title="${esc(i?.error ?? y?.error)}">Hata</span>` : ''}</td><td class="r num">${i?.followers != null ? num(i.followers) : na}</td><td class="r num">${i?.posts ? p30.length : na}</td><td class="r num">${lk.length ? num(Math.round(lk.reduce((t, p) => t + p.likes, 0) / lk.length)) : na}</td><td class="r num">${y?.channel?.subs != null ? num(y.channel.subs) : na}</td><td class="r num">${y?.videos ? v30.length : na}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="card"><div class="filters"><div><label for="sb">Marka</label><select id="sb">${opt(R.map((b) => [b.id, b.name]), f.brand, 'Tüm markalar')}</select></div><div><label for="sn">Kanal</label><select id="sn">${opt([['ig', 'Instagram'], ['yt', 'YouTube']], f.net, 'Hepsi')}</select></div></div></div>
      ${items.length ? `<div class="pz-feedg">${items.slice(0, 120).map(feedCard).join('')}</div>` : conn ? '<div class="card empty"><b>Bu süzgeçlerde içerik yok</b></div>' : ''}
      <div class="note">Buradaki içerikler markaların kendi hesaplarında paylaştığı <b>organik</b> gönderilerdir; reklam olup olmadıkları bu kaynaktan bilinemez. Beğeni ve izlenme sayıları herkese açık rakamlardır.</div>`;
    $('#sb').onchange = (e) => { f.brand = e.target.value; route('sosyal'); }; $('#sn').onchange = (e) => { f.net = e.target.value; route('sosyal'); };
  },

  web(view) {
    const R = brands().filter((b) => b.web); F.web = R.some((b) => b.id === F.web) ? F.web : (R.find((b) => !b.self && webOf(b)?.status === 'ok') ?? R[0])?.id;
    const b = R.find((x) => x.id === F.web), w = b && webOf(b), c = w?.current;
    view.innerHTML = `<div class="bar"><div class="seg scroll" role="tablist" aria-label="Marka">${R.map((x) => `<button data-wb="${esc(x.id)}" class="${x.id === F.web ? 'on' : ''}">${esc(x.name)}</button>`).join('')}</div></div>
      ${!b ? '<div class="card empty"><b>Web adresi girilmiş marka yok</b>Rakip Markalar sayfasından web adresi ekleyin.</div>' : `
      <div class="card"><div class="card-head"><div><h2>${esc(b.name)}</h2><p class="muted small"><a href="${esc(b.web)}" target="_blank" rel="noopener noreferrer">${esc(b.web)}</a> · günde bir kez okunur${w?.lastOk ? ` · son başarılı okuma ${when(w.lastOk)}` : ''}</p></div>${webTag(b)}</div>
        ${!w ? '<div class="empty">Bu site henüz okunmadı; ilk okuma bir sonraki günlük güncellemede yapılır.</div>' : w.status !== 'ok' && !c ? `<div class="note warn"><b>Bu sitenin ana sayfası okunamıyor.</b> ${esc(w.error ?? '')}. Engeli aşmaya çalışmıyoruz; bu marka için web izleme verisi yok.</div>` : `
        ${w.status !== 'ok' ? `<div class="note warn">Son deneme başarısız (${esc(w.error ?? '')}). Aşağıdaki bilgi ${when(c.at)} tarihli son başarılı okumaya aittir.</div>` : ''}
        <div class="pz-snap"><div><span>SEO başlığı</span><p>${esc(c.title || '—')}</p></div><div><span>Meta açıklaması</span><p>${esc(c.desc || '—')}</p></div><div><span>Ana başlık (H1)</span>${fieldVal('h1', c.h1)}</div><div><span>Kampanya mesajları</span>${fieldVal('msgs', c.msgs)}</div><div class="full"><span>Ana sayfa görselleri (${c.banners.length})</span>${fieldVal('banners', c.banners)}</div><div class="full"><span>Menü</span>${fieldVal('nav', c.nav)}</div></div>`}</div>
      ${w?.changes?.length ? `<div class="card"><div class="card-head"><div><h2>Değişiklik geçmişi</h2><p class="muted small">${w.changes.length} değişiklik · ${dTR(w.firstOk)} tarihinden beri</p></div>${src('site')}</div>${[...w.changes].reverse().slice(0, 40).map((x) => `<div class="pz-chg"><div class="pz-chg-h"><b class="num">${when(x.at)}</b><span class="tag acc">${esc(x.label)}</span></div><div class="pz-ba"><div><span>Önce</span>${fieldVal(x.field, x.before)}</div><div><span>Sonra</span>${fieldVal(x.field, x.after)}</div></div></div>`).join('')}</div>` : c ? '<div class="card empty"><b>Henüz değişiklik yok</b>Sonraki okumalarda başlık, mesaj, görsel ya da menü değişirse önce/sonra karşılaştırmasıyla burada görünür.</div>' : ''}`}
      <div class="note">Okunanlar: SEO başlığı, meta açıklaması, H1, kampanya ifadeleri, slider/banner görsellerinin adresleri ve menü. Ekran görüntüsü, anahtar kelime sıralaması ve trafik tahmini bu kaynaktan gelmez.</div>`;
    $$('[data-wb]', view).forEach((x) => (x.onclick = () => { F.web = x.dataset.wb; route('web'); }));
  },

  karsilastir(view) {
    const all = rivals(); F.cmp ??= all.filter((b) => !b.self).slice(0, 5).map((b) => b.id);
    const sel = all.filter((b) => F.cmp.includes(b.id)), A = ads(), w7 = (b) => (webOf(b)?.status === 'ok' ? (webOf(b).changes ?? []).filter((c) => c.at >= new Date(Date.now() - 30 * 864e5).toISOString()).length : null);
    const g30 = (b) => (gAds(b) ? gAds(b).filter((a) => (a.first ?? '') >= since(30)).length : null), share = (b, fm) => { const a = gActive(b); return gAds(b) && a.length ? (a.filter((x) => x.format === fm).length / a.length) * 100 : null; };
    const rows = [['Aktif Google reklamı (son 7 gün)', (b) => (gAds(b) ? gActive(b).length : null), num, 'goog'], ['Son 30 günde yeni Google reklamı', g30, num, 'goog'], ['Aktif reklamlarda video payı', (b) => share(b, 'VIDEO'), (v) => pct(v), 'goog'], ['Instagram takipçi', (b) => ig(b)?.followers ?? null, num, 'ig'], ['Son 30 günde Instagram gönderisi', (b) => (ig(b)?.posts ? ig(b).posts.filter((p) => p.at.slice(0, 10) >= since(30)).length : null), num, 'ig'], ['YouTube abone', (b) => yt(b)?.channel?.subs ?? null, num, 'yt'], ['Son 30 günde YouTube videosu', (b) => (yt(b)?.videos ? yt(b).videos.filter((v) => v.at.slice(0, 10) >= since(30)).length : null), num, 'yt'], ['Son 30 günde ana sayfa değişikliği', w7, num, 'site'], ['Kaydedilen reklam', (b) => A.filter((a) => a.brand === b.id).length || null, num, 'man']];
    const radar = rows.filter((r) => sel.filter((b) => r[1](b) != null).length >= 2).slice(0, 7);
    view.innerHTML = `<div class="card"><div class="card-head"><div><h2>Karşılaştırılacak markalar</h2><p class="muted small">En çok 6 marka</p></div></div><div class="pz-chips">${all.map((b) => `<button class="tag${F.cmp.includes(b.id) ? ' acc' : ''}" data-cmp="${esc(b.id)}" aria-pressed="${F.cmp.includes(b.id)}">${esc(b.name)}</button>`).join('')}</div></div>
      ${sel.length >= 2 ? `<div class="tbl-wrap"><table><thead><tr><th>Ölçüt</th>${sel.map((b) => `<th class="r">${esc(b.name)}</th>`).join('')}<th>Kaynak</th></tr></thead><tbody>${rows.map(([l, fn, fmt, s]) => `<tr><td>${l}</td>${sel.map((b) => { const v = fn(b); return `<td class="r num">${v == null ? '<span class="muted" title="Bu marka için veri yok">veri yok</span>' : `<b>${fmt(v)}</b>`}</td>`; }).join('')}<td>${src(s)}</td></tr>`).join('')}</tbody></table></div>
      ${radar.length >= 3 ? `<div class="card"><div class="card-head"><div><h2>Göreli görünüm</h2><p class="muted small">Her ölçüt, seçili markalar içindeki en yüksek değere göre 0–100 ölçeklenir; verisi olmayan marka o ölçütte çizilmez</p></div></div><div class="chart-box" style="height:340px"><canvas id="pz3" role="img" aria-label="Seçili markaların göreli karşılaştırması"></canvas></div></div>` : ''}
      <div class="note">Bir kaynağı bağlı olmayan ya da kimliği girilmemiş markada o ölçüt "veri yok" görünür; sıfır sayılmaz. Google reklam sayıları yalnızca Google'ın yayımladığı verideki reklamlardır; Meta reklam hacmi bu tabloda yoktur. Harcama ve gösterim sayısı karşılaştırılmaz.</div>` : '<div class="card empty"><b>En az iki marka seçin</b></div>'}`;
    $$('[data-cmp]', view).forEach((x) => (x.onclick = () => { const id = x.dataset.cmp; F.cmp = F.cmp.includes(id) ? F.cmp.filter((y) => y !== id) : F.cmp.length < 6 ? [...F.cmp, id] : F.cmp; route('karsilastir'); }));
    if ($('#pz3')) { const cols = ['--brand-deep', '--blue', '--dd', '--pos', '--neg', '--text-3']; H.chart($('#pz3'), { type: 'radar', data: { labels: radar.map((r) => r[0]), datasets: sel.map((b, i) => ({ label: b.name, data: radar.map((r) => { const v = r[1](b), mx = Math.max(...sel.map((x) => r[1](x) ?? 0)); return v == null || !mx ? null : +((v / mx) * 100).toFixed(0); }), borderColor: H.cssv(cols[i % cols.length]), backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, spanGaps: false })) }, options: { maintainAspectRatio: false, scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: H.cssv('--hairline') }, angleLines: { color: H.cssv('--hairline') }, pointLabels: { font: { size: 11 } } } } } }); }
  },

  firsatlar(view) {
    const ins = insights();
    view.innerHTML = `<div class="note"><b>Bu bulgular yapay zekâ değil, sabit kurallarla</b> eldeki gerçek veriden (Google reklam verisi, Instagram, YouTube ve ana sayfa okumaları) üretilir. Her bulgunun dayanağı yanında yazar. Reklam performansı, harcama ya da hedef kitle verisi içermez.</div>
      ${ins.length ? `<div class="card">${ins.map(insRow).join('')}</div>` : '<div class="card empty"><b>Şu an kural eşiğini aşan bulgu yok</b>Kaynaklar bağlandıkça ve veri biriktikçe burada görünür.</div>'}`;
  },

  kaynaklar(view) {
    const R = rivals(), ok = R.filter((b) => webOf(b)?.status === 'ok').length, bad = R.filter((b) => b.web && webOf(b) && webOf(b).status !== 'ok');
    const cnt = (o, k) => (o?.brands ? Object.values(o.brands).filter((x) => x[k]?.length).length : 0), stt = (o, k, label) => (!o ? ['warn', 'Bağlı değil'] : o.error && !cnt(o, k) ? ['neg', 'Hata'] : ['pos', `Çalışıyor · ${cnt(o, k)} marka${o.error ? ' · kısmi hata' : ''}`]);
    const g = stt(D.google, 'ads'), y = stt(D.youtube, 'videos'), i = stt(D.instagram, 'posts');
    const rows = [
      ['Google reklamları', g[0], g[1], `Google'ın resmî açık veri kümesi (Ads Transparency Center, BigQuery): Türkiye'de gösterilen Arama, YouTube ve Görüntülü Reklam Ağı reklamlarının biçimi, gösterim tarihleri ve Google'daki sayfası. Kreatif dosyası verilmez; bağlantıyla izlenir.${D.google?.error ? ' Son hata: ' + D.google.error : ''}${D.google?.bytes ? ` Son sorgu ${(D.google.bytes / 1e9).toFixed(1)} GB taradı (aylık ücretsiz kota 1.000 GB).` : ''} <b>Gerekli:</b> GCP_BQ_KEY secret'ı ve her markanın AR… reklamveren kimliği.`],
      ['Instagram (organik gönderiler)', i[0], i[1], `Meta'nın resmî Business Discovery API'si: rakibin herkese açık gönderileri, Reels videoları, beğeni ve yorum sayıları. Videolar panelde oynatılır.${D.instagram?.error ? ' Son hata: ' + D.instagram.error : ''} <b>Gerekli:</b> META_TOKEN ve IG_USER_ID secret'ları (kendi Instagram işletme hesabınız).`],
      ['YouTube', y[0], y[1], `YouTube Data API: markanın kanalındaki videolar ve izlenme sayıları; panelde oynatılır.${D.youtube?.error ? ' Son hata: ' + D.youtube.error : ''} <b>Gerekli:</b> YOUTUBE_API_KEY secret'ı (ücretsiz).`],
      ['Rakip ana sayfaları', 'pos', `Çalışıyor · ${ok} / ${R.filter((b) => b.web).length} site`, 'Günde bir kez (Zen ve Atasay iki günde bir), kendini tanıtan istemciyle; robots.txt izin vermeyen ya da isteği reddeden site okunmaz.' + (bad.length ? ` Okunamayan: ${bad.map((b) => b.name).join(', ')}.` : '')],
      ['Meta (Instagram / Facebook) reklamları', '', 'Otomatik alınamıyor', 'Meta\'nın resmî API\'si ticari reklamlarda yalnızca AB ve Birleşik Krallık\'ta gösterilenleri verir; Türkiye\'deki reklamlar yalnızca Meta\'nın kendi sayfasında görülebilir. O sayfayı otomatik okumak Meta koşullarına aykırıdır. Her marka için "yayındaki reklamlar" bağlantısı verilir; beğendiğiniz reklam elle kaydedilir.'],
      ['TikTok reklamları', '', 'Otomatik alınamıyor', 'Resmî API yalnızca Avrupa\'da gösterilen reklamları kapsar.'],
      ['Reklam harcaması, gösterim, hedef kitle', '', 'Erişilemez', 'Rakiplerin reklam hesabı verisidir; hiçbir kaynakta yoktur ve gösterilmez.'],
      ['Yapay zekâ analizi', 'warn', 'Kurulu değil', 'Ücretli API anahtarı gerekir. Şu an hiçbir ekranda yapay zekâ çıktısı yoktur.'],
    ];
    view.innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Kaynak</th><th>Durum</th><th>Açıklama</th></tr></thead><tbody>${rows.map(([n, c, s, d]) => `<tr><td><b>${n}</b></td><td><span class="tag ${c}">${s}</span></td><td class="small">${d}</td></tr>`).join('')}</tbody></table></div>
      <div class="card"><h2>Marka bazında web izleme</h2><div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>Marka</th><th>Durum</th><th>Son başarılı okuma</th><th>Not</th></tr></thead><tbody>${R.map((b) => { const w = webOf(b); return `<tr><td><b>${esc(b.name)}</b></td><td>${webTag(b)}</td><td class="num">${when(w?.lastOk)}</td><td class="small">${esc(w?.error ?? (b.web ? '' : 'Rakip Markalar sayfasından web adresi ekleyin'))}</td></tr>`; }).join('')}</tbody></table></div></div>
      <div class="note">Veri paketi: ${when(GEN)}. Veriler günde bir kez yenilenir; canlı akış değildir.</div>`;
  },

  menu(view) { view.innerHTML = `<div class="menu-list">${['web', 'karsilastir', 'firsatlar', 'kaynaklar'].map((k) => `<a href="#/p/${k}"><span>${TITLES[k][0]}</span><svg class="ic chev"><use href="#i-chev"/></svg></a>`).join('')}</div>`; },
};
const insRow = (i) => `<div class="pz-ins"><div class="pz-ins-h"><span class="tag ${i.pri === 1 ? 'neg' : i.pri === 2 ? 'warn' : ''}">${['', 'Yüksek öncelik', 'Orta öncelik', 'Düşük öncelik'][i.pri]}</span>${src(i.src)}<span class="tag">${esc(i.dept)}</span></div><b>${esc(i.title)}</b><p><span>Dayanak</span>${esc(i.why)}</p><p><span>Önerilen adım</span>${esc(i.act)}</p></div>`;
const adCard = (a) => `<div class="card pz-ad" data-aid="${esc(a.id)}" tabindex="0" role="button">${a.media ? `<div class="pz-ad-m"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(a.media)}" alt="" onerror="this.parentElement.classList.add('err');this.remove()"></div>` : '<div class="pz-ad-m err"></div>'}<div class="pz-ad-b"><div class="pz-ad-t"><b>${esc(bname(a.brand))}</b>${a.fav ? '<span title="Favori">★</span>' : ''}${a._pending ? '<span class="tag acc">Yayınlanıyor</span>' : ''}</div><div class="pz-ad-h">${esc(a.title || (a.text ?? '').slice(0, 80) || 'Başlıksız reklam')}</div><div class="pz-chips"><span class="tag">${esc((a.platform ?? 'Platform yok').split(' ')[0])}</span>${a.format ? `<span class="tag">${esc(a.format)}</span>` : ''}<span class="tag ${a.status === 'Aktif' ? 'pos' : ''}">${esc(a.status ?? 'Bilinmiyor')}</span></div><div class="small muted num">${a.firstSeen ? 'İlk görülme ' + dTR(a.firstSeen) : 'Kayıt ' + dTR(a.createdAt)}</div></div></div>`;

/* ---------- Formlar ve ayrıntı ---------- */
const fld = (id, label, value, attr = '', cls = '') => `<div class="field ${cls}"><label for="${id}">${label}</label><input id="${id}" value="${esc(value ?? '')}" ${attr}></div>`;
const area = (id, label, value, rows = 3) => `<div class="field full"><label for="${id}">${label}</label><textarea id="${id}" rows="${rows}">${esc(value ?? '')}</textarea></div>`;
function sheet(title, body, onSave, extra = '') {
  H.openDrawer(title, `<form id="pForm" novalidate style="display:contents">${body}</form>`);
  const foot = document.createElement('div'); foot.className = 'sheet-foot'; foot.id = 'yFoot'; foot.innerHTML = `${extra}<button class="btn" type="button" data-close>Vazgeç</button><button class="btn primary" type="button" id="pSave">Kaydet</button>`;
  $('#yFoot')?.remove(); $('#drawerBody').after(foot);
  $('#pSave').onclick = async () => { const b = $('#pSave'); b.disabled = true; b.textContent = 'Kaydediliyor…'; try { if ((await onSave()) !== false) { H.closeDrawer(); route(page); H.toast('Kaydedildi; bir iki dakika içinde herkese yansır'); } else { b.disabled = false; b.textContent = 'Kaydet'; } } catch (e) { b.disabled = false; b.textContent = 'Kaydet'; H.toast(e.message || 'Kaydedilemedi', 'err'); } };
  $('#pForm').onsubmit = (e) => { e.preventDefault(); $('#pSave').click(); };
}
const slug = (s) => low(s).replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
const g = (i) => $(i).value.trim();
function brandForm(id) {
  const b = id ? brands(true).find((x) => x.id === id) : null;
  sheet(b ? b.name : 'Marka ekle', `<div class="card"><div class="form">${fld('bN', 'Marka adı', b?.name, 'required')}${fld('bW', 'Web sitesi', b?.web, 'inputmode="url" placeholder="https://"')}
    ${fld('bI', 'Instagram', b?.instagram, 'placeholder="@kullaniciadi"')}${fld('bF', 'Facebook', b?.facebook)}${fld('bT', 'TikTok', b?.tiktok, 'placeholder="@kullaniciadi"')}${fld('bY', 'YouTube kanalı', b?.youtube)}
    ${fld('bM', 'Meta reklam kütüphanesi bağlantısı', b?.metaLibrary, 'inputmode="url" placeholder="Markanın sayfasının reklamlarını gösteren adres; boşsa adla arama açılır"', 'full')}${fld('bG', 'Google reklamveren sayfası ya da kimliği (AR…)', b?.googleAds, 'placeholder="adstransparency.google.com/advertiser/AR…"', 'full')}<p class="small muted full" style="margin-top:-6px">Google Reklam Şeffaflık Merkezi'nde markayı aratıp reklamveren sayfasını açın; adres çubuğundaki adresi buraya yapıştırın. Google reklamları bu kimlikle çekilir.</p>
    ${fld('bC', 'Faaliyet gösterdiği ülkeler', b?.countries)}<div class="field"><label for="bS">Fiyat segmenti</label><select id="bS">${opt(['Giriş', 'Orta', 'Üst', 'Lüks'], b?.segment, 'Belirtilmedi')}</select></div>
    ${fld('bK', 'Ürün kategorileri', b?.categories, '', 'full')}${area('bP', 'Marka konumlandırması (kendi notunuz)', b?.positioning)}${area('bA', 'Hedef kitle notu (kendi çıkarımınız)', b?.audience)}</div></div>`, async () => {
    if (g('#bN').length < 2) { $('#bN').focus(); H.toast('Marka adını yazın.', 'err'); return false; }
    const nid = b?.id ?? (slug(g('#bN')) || 'marka') + (brands(true).some((x) => x.id === slug(g('#bN'))) ? '-' + Date.now().toString(36).slice(-3) : '');
    await submit({ t: 'brand.upsert', id: nid, data: { name: g('#bN'), web: g('#bW'), instagram: g('#bI'), facebook: g('#bF'), tiktok: g('#bT'), youtube: g('#bY'), metaLibrary: g('#bM'), googleAds: g('#bG'), countries: g('#bC'), segment: g('#bS'), categories: g('#bK'), positioning: g('#bP'), audience: g('#bA') } });
  });
}
function brandCard(id) {
  const b = brands(true).find((x) => x.id === id); if (!b) return; const w = webOf(b), A = ads().filter((a) => a.brand === id), rows = (pairs) => pairs.filter(([, v]) => v).map(([l, v]) => `<div class="mrow"><span>${l}</span><b>${v}</b></div>`).join('');
  H.openDrawer(b.name, `<div class="card"><div class="pz-bh"><span class="pz-av">${esc(b.name.slice(0, 1))}</span><div><b>${esc(b.name)}</b><div class="small muted">Takip başlangıcı ${dTR(b.since)}${b.updatedAt ? ` · son düzenleme ${dTR(b.updatedAt)} (${esc(b.updatedBy ?? '')})` : ''}</div></div></div>
      <div class="pz-chips" style="margin-top:12px">${libLinks(b).map(([l, u]) => `<a class="btn small" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${l} ↗</a>`).join('')}</div>
      <div class="bar" style="margin-top:12px"><button class="btn primary" id="bEdit">Düzenle</button><button class="btn" id="bAd">${ic('i-plus')}Reklam ekle</button><span class="grow"></span><button class="btn ghost" id="bArch">${b.archived ? 'Takibe geri al' : 'Arşivle'}</button></div></div>
    <div class="mgroup"><h3>Profil ${src('man')}</h3>${rows([['Fiyat segmenti', esc(b.segment)], ['Ülkeler', esc(b.countries)], ['Ürün kategorileri', esc(b.categories)], ['Konumlandırma', esc(b.positioning)], ['Hedef kitle notu', esc(b.audience)], ['Instagram', b.instagram && '@' + esc(handle(b.instagram))], ['TikTok', b.tiktok && '@' + esc(handle(b.tiktok))], ['YouTube', esc(b.youtube)]]) || '<div class="mrow"><span class="muted">Profil bilgisi girilmedi</span><b></b></div>'}</div>
    <div class="mgroup"><h3>Veri kaynakları</h3><div class="mrow"><span>Ana sayfa izleme<small>${esc(w?.error ?? (w?.lastOk ? 'Son okuma ' + when(w.lastOk) : ''))}</small></span><b>${webTag(b)}</b></div><div class="mrow"><span>Google reklamları<small>${advId(b) ? 'Kimlik ' + advId(b) : 'Reklamveren kimliği (AR…) girilmedi'}</small></span><b>${gAds(b) ? `${gActive(b).length} aktif · ${gAds(b).length} toplam` : '<span class="tag">Veri yok</span>'}</b></div><div class="mrow"><span>Instagram<small>${esc(ig(b)?.error ?? '')}</small></span><b>${ig(b)?.posts ? `${num(ig(b).followers)} takipçi · ${ig(b).posts.length} gönderi` : '<span class="tag">Veri yok</span>'}</b></div><div class="mrow"><span>YouTube<small>${esc(yt(b)?.error ?? '')}</small></span><b>${yt(b)?.videos ? `${num(yt(b).channel?.subs)} abone · ${yt(b).videos.length} video` : '<span class="tag">Veri yok</span>'}</b></div><div class="mrow"><span>Kaydedilen reklam</span><b>${A.length}</b></div></div>
    ${w?.current ? `<div class="card"><h2>Ana sayfa · son okuma</h2><div class="pz-snap" style="margin-top:10px"><div class="full"><span>SEO başlığı</span><p>${esc(w.current.title)}</p></div><div class="full"><span>Kampanya mesajları</span>${fieldVal('msgs', w.current.msgs)}</div><div class="full"><span>Görseller</span>${fieldVal('banners', w.current.banners)}</div></div></div>` : ''}
    ${A.length ? `<div class="card"><h2>Kayıtlı reklamlar</h2><div class="pz-ads" style="margin-top:10px">${A.map(adCard).join('')}</div></div>` : ''}`);
  $('#bEdit').onclick = () => brandForm(id); $('#bAd').onclick = () => adForm(null, { brand: id });
  $('#bArch').onclick = async () => { if (!confirm(b.archived ? `${b.name} yeniden takibe alınsın mı?` : `${b.name} arşivlensin mi? Verileri silinmez, listelerde görünmez.`)) return; try { await submit({ t: 'brand.archive', id, data: { archived: !b.archived } }); H.closeDrawer(); route(page); H.toast('Kaydedildi'); } catch (e) { H.toast(e.message, 'err'); } };
}
function adForm(id, preset = {}) {
  const a = id ? ads().find((x) => x.id === id) : null, v = a ?? { status: 'Aktif', firstSeen: todayISO(), platform: PLATFORMS[0], ...preset };
  sheet(a ? 'Reklamı düzenle' : 'Reklam ekle', `<div class="card"><div class="form"><div class="field"><label for="aB">Marka</label><select id="aB">${opt(rivals().map((b) => [b.id, b.name]), v.brand, 'Seçin')}</select></div><div class="field"><label for="aP">Platform</label><select id="aP">${opt(PLATFORMS, v.platform)}</select></div>
    <div class="field"><label for="aF">Biçim</label><select id="aF">${opt(FORMATS, v.format, 'Belirtilmedi')}</select></div><div class="field"><label for="aS">Durum</label><select id="aS">${opt(AD_STATUS, v.status ?? 'Bilinmiyor')}</select></div>
    ${fld('aSrc', 'Kaynak bağlantısı (resmî kütüphanedeki reklam)', v.source, 'inputmode="url" placeholder="https://www.facebook.com/ads/library/?id=…"', 'full')}${fld('aM', 'Görsel adresi', v.media, 'inputmode="url" placeholder="Görsele sağ tıklayıp “resim adresini kopyala”"', 'full')}
    ${fld('aT', 'Başlık', v.title, '', 'full')}${area('aX', 'Reklam metni', v.text, 4)}${fld('aC', 'CTA metni', v.cta, 'placeholder="Hemen alışveriş yap"')}${fld('aU', 'Hedef bağlantı', v.url, 'inputmode="url"')}
    ${fld('aD1', 'İlk görülme', v.firstSeen, 'type="date"')}${fld('aD2', 'Son görülme', v.lastSeen, 'type="date"')}${fld('aK', 'Kampanya', v.campaign, 'placeholder="ör. Yılbaşı, Black Friday"')}${fld('aG', 'Ürün kategorisi', v.category, 'placeholder="ör. Tektaş"')}
    ${fld('aE', 'Etiketler', v.tags, 'placeholder="virgülle ayırın"', 'full')}${area('aN', 'Notunuz', v.note)}<div class="field full"><label class="switch"><input type="checkbox" id="aFav"${v.fav ? ' checked' : ''}>Favori</label></div></div></div>`, async () => {
    if (!g('#aB')) { $('#aB').focus(); H.toast('Markayı seçin.', 'err'); return false; } if (!g('#aT') && !g('#aX') && !g('#aSrc')) { $('#aSrc').focus(); H.toast('Kaynak bağlantısı, başlık ya da metinden en az birini girin.', 'err'); return false; }
    await submit({ t: 'ad.upsert', id: a?.id ?? 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), data: { brand: g('#aB'), platform: g('#aP'), format: g('#aF'), status: g('#aS'), source: g('#aSrc'), media: g('#aM'), title: g('#aT'), text: g('#aX'), cta: g('#aC'), url: g('#aU'), firstSeen: g('#aD1'), lastSeen: g('#aD2'), campaign: g('#aK'), category: g('#aG'), tags: g('#aE'), note: g('#aN'), fav: $('#aFav').checked ? 1 : 0 } });
  }, a ? '<button class="btn ghost left" type="button" id="aDel" style="color:var(--neg)">Sil</button>' : '');
  if (a) $('#aDel').onclick = async () => { if (!confirm('Bu reklam kaydı silinsin mi?')) return; try { await submit({ t: 'ad.delete', id: a.id }); H.closeDrawer(); route(page); H.toast('Silindi'); } catch (e) { H.toast(e.message, 'err'); } };
}
function adCardOpen(id) {
  const a = ads().find((x) => x.id === id); if (!a) return; const row = (l, v) => (v ? `<div class="mrow"><span>${l}</span><b>${v}</b></div>` : '');
  H.openDrawer(bname(a.brand), `${a.media ? `<div class="pz-full"><img referrerpolicy="no-referrer" src="${esc(a.media)}" alt="${esc(a.title ?? 'Reklam görseli')}"></div>` : ''}
    <div class="card"><div class="pz-chips">${src('man', esc(a.createdBy ?? ''))}<span class="tag ${a.status === 'Aktif' ? 'pos' : ''}">${esc(a.status ?? 'Bilinmiyor')}</span></div>${a.title ? `<h2 style="margin-top:10px">${esc(a.title)}</h2>` : ''}${a.text ? `<p class="pz-text">${esc(a.text)}</p>` : ''}
      <div class="bar" style="margin-top:12px">${a.source ? `<a class="btn primary" href="${esc(a.source)}" target="_blank" rel="noopener noreferrer">Kaynakta aç ↗</a>` : ''}${a.url ? `<a class="btn" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Hedef sayfa ↗</a>` : ''}<span class="grow"></span><button class="btn" id="aEdit">Düzenle</button></div></div>
    <div class="mgroup"><h3>Reklam bilgileri</h3>${row('Platform', esc(a.platform))}${row('Biçim', esc(a.format))}${row('CTA', esc(a.cta))}${row('İlk görülme', a.firstSeen && dTR(a.firstSeen))}${row('Son görülme', a.lastSeen && dTR(a.lastSeen))}${row('Kampanya', esc(a.campaign))}${row('Ürün kategorisi', esc(a.category))}${row('Etiketler', esc(a.tags))}</div>
    ${a.note ? `<div class="card"><h2>Not</h2><p class="pz-text">${esc(a.note)}</p></div>` : ''}
    <div class="note">Bu kayıt bir ekip üyesi tarafından elle girildi. Harcama, gösterim, tıklama ve hedef kitle gibi performans verileri rakip reklamlarında erişilebilir değildir ve gösterilmez.</div>`);
  $('#aEdit').onclick = () => adForm(id);
}

/* ---------- Yönlendirme ---------- */
let last = null, page = 'genel';
export function route(name) {
  page = pages[name] ? name : 'genel'; const tab = TABS.includes(page) ? page : 'menu';
  $$('#navP a[data-p]').forEach((a) => { const on = a.dataset.p === page; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  $$('#tabbarP [data-p]').forEach((a) => a.classList.toggle('on', a.dataset.p === tab)); $('#tabbarP').style.setProperty('--i', TABS.indexOf(tab));
  $('#pageTitle').textContent = TITLES[page][0]; $('#pageSub').textContent = TITLES[page][1]; document.title = `${TITLES[page][0]} · Pazarlama İstihbaratı`;
  H.resetCharts(); const view = $('#view'), changed = last !== page, y = scrollY; last = page;
  pages[page](view);
  if (changed) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); scrollTo(0, 0); } else scrollTo(0, y);
}
export const leave = () => { last = null; };
export function init(host) {
  H = host; D = { brands: [], ads: [], web: {}, google: null, youtube: null, instagram: null, ...(host.data ?? {}) }; GEN = host.generatedAt;
  const live = () => document.documentElement.dataset.app === 'p';
  document.addEventListener('click', (e) => { if (!live()) return; const p = e.target.closest('[data-yt]'); if (p) { const id = p.dataset.yt.replace(/[^\w-]/g, ''); p.outerHTML = `<div class="pz-fm"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="YouTube videosu" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>`; return; } if (e.target.closest('a[target],a.btn,button,select,input,summary,video')) return; const b = e.target.closest('[data-bid]'); if (b) return brandCard(b.dataset.bid); const a = e.target.closest('[data-aid]'); if (a) return adCardOpen(a.dataset.aid); });
  document.addEventListener('keydown', (e) => { if (live() && e.key === 'Enter' && e.target.matches?.('[data-bid],[data-aid]')) e.target.click(); });
}

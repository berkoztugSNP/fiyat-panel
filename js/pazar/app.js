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

export const TITLES = { genel: ['Genel Bakış', 'Rakip pazarlama faaliyetleri'], markalar: ['Rakip Markalar', 'Takip edilen markalar ve veri kaynakları'], reklamlar: ['Reklam Kütüphanesi', 'Kaydedilen rakip reklamları'], kampanya: ['Kampanya ve Fiyat', 'İndirim ve kampanya iletişimi'], web: ['Web ve SEO', 'Ana sayfa değişiklikleri'], karsilastir: ['Rakip Karşılaştırma', 'Aynı ölçütlerle yan yana'], firsatlar: ['Trend ve Fırsatlar', 'Veriden türetilen çıkarımlar'], kaynaklar: ['Veri Kaynakları', 'Hangi veri nereden geliyor'], menu: ['Diğer', 'Pazarlama İstihbaratı'] };
const TABS = ['genel', 'markalar', 'reklamlar', 'web', 'menu'];
const PLATFORMS = ['Meta (Instagram / Facebook)', 'Google / YouTube', 'TikTok', 'Diğer'], FORMATS = ['Görsel', 'Video', 'Carousel', 'Hikâye / Reels', 'Arama', 'Diğer'], AD_STATUS = ['Aktif', 'Yayından kalktı', 'Bilinmiyor'];
// Veri sınıfı etiketleri (her verinin kaynağı görünür)
const SRC = { site: ['Kamuya açık kaynak', 'pos'], cat: ['Fiyat takibi', 'pos'], man: ['Elle eklendi', 'acc'], rule: ['Kural tabanlı çıkarım', 'warn'], none: ['Erişilemiyor', ''] };
const src = (k, extra = '') => `<span class="tag ${SRC[k][1]}" title="Veri sınıfı">${SRC[k][0]}${extra ? ' · ' + extra : ''}</span>`;
let H = null, D = { brands: [], ads: [], metrics: { days: {} }, web: {} }, GEN = null;
const F = { ad: { q: '', brand: '', platform: '', status: '', fav: false, view: 'grid' }, web: '', cmp: null };

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
const days = () => Object.keys(D.metrics.days ?? {}).sort();
const latest = () => D.metrics.days?.[days().at(-1)] ?? {};
const metricOf = (b) => (b.catalog ? latest()[b.catalog] ?? null : null);
const webOf = (b) => D.web[b.id] ?? null;
const WEB_ST = { ok: ['İzleniyor', 'pos'], blocked: ['Site izin vermiyor', 'neg'], robots: ['robots.txt izin vermiyor', 'neg'], error: ['Ulaşılamadı', 'warn'] };
const webTag = (b) => { const w = webOf(b); return !b.web ? '<span class="tag">Web adresi girilmedi</span>' : !w ? '<span class="tag warn">İlk okuma bekleniyor</span>' : `<span class="tag ${WEB_ST[w.status]?.[1] ?? ''}">${WEB_ST[w.status]?.[0] ?? w.status}</span>`; };
const changes = (sinceDays = 3650) => { const lim = new Date(Date.now() - sinceDays * 864e5).toISOString(); return brands().flatMap((b) => (webOf(b)?.changes ?? []).filter((c) => c.at >= lim).map((c) => ({ ...c, brand: b }))).sort((a, b) => (a.at < b.at ? 1 : -1)); };
const handle = (v) => String(v ?? '').replace(/^https?:\/\/(www\.)?(instagram|facebook|tiktok|youtube)\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '');
// Resmî kamu kütüphanelerinde markayı açan bağlantılar (veri çekilmez, kullanıcı kaynağı kendisi inceler)
const libLinks = (b) => [
  ['Meta Reklam Kütüphanesi', b.metaLibrary || `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=TR&q=${encodeURIComponent(b.name)}&search_type=keyword_unordered`],
  ['Google Reklam Şeffaflık Merkezi', b.googleAds || (b.web ? `https://adstransparency.google.com/?region=TR&domain=${encodeURIComponent(hostOf(b.web))}` : null)],
  ['TikTok Creative Center', 'https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/tr'],
  b.instagram ? ['Instagram', 'https://www.instagram.com/' + handle(b.instagram)] : null, b.web ? ['Web sitesi', b.web] : null,
].filter((x) => x && x[1]);
const fieldVal = (f, v) => (f === 'banners' ? `<div class="pz-thumbs">${(v ?? []).slice(0, 6).map((x) => `<a href="${esc(x.src)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(x.src)}" alt="${esc(x.alt)}"></a>`).join('') || '<span class="muted small">Görsel yok</span>'}</div>` : Array.isArray(v) ? (v.length ? `<div class="pz-chips">${v.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>` : '<span class="muted small">Yok</span>') : esc(v || '—'));
// Kural tabanlı çıkarımlar: yalnızca eldeki gerçek veriden, dayanağıyla birlikte
function insights() {
  const out = [], L = latest(), me = brands().find((b) => b.self), mine = me && metricOf(me), dd = days(), prev = D.metrics.days?.[dd.at(-8)] ?? null;
  for (const b of rivals()) {
    const m = metricOf(b), w = webOf(b); if (m && m.n) {
      const share = (m.disc / m.n) * 100;
      if (share >= 50) out.push({ pri: 2, title: `${b.name} kataloğunun ${pct(share)} kadarı indirimli`, why: `${num(m.disc)} / ${num(m.n)} üründe liste fiyatı satış fiyatından yüksek; ortalama indirim ${pct(m.avgDisc, 1)}.`, act: 'Bu markayla karşılaştırmada etiket fiyatı yerine indirimli fiyatı esas alın; kendi indirim iletişiminizi gözden geçirin.', dept: 'E-ticaret', brands: [b.name], src: 'cat' });
      const p = prev?.[b.catalog]; if (p?.n && Math.abs(share - (p.disc / p.n) * 100) >= 10) out.push({ pri: 1, title: `${b.name} indirimli ürün oranı bir haftada ${pct((p.disc / p.n) * 100)} → ${pct(share)}`, why: 'Günlük katalog göstergelerinin karşılaştırması.', act: share > (p.disc / p.n) * 100 ? 'Yeni bir kampanya dönemi başlamış olabilir; ana sayfa mesajlarını kontrol edin.' : 'Kampanya dönemi kapanıyor olabilir.', dept: 'Pazarlama', brands: [b.name], src: 'cat' });
      if (mine?.med && m.med && m.med < mine.med * 0.8) out.push({ pri: 3, title: `${b.name} medyan fiyatı bizden ${pct((1 - m.med / mine.med) * 100)} düşük`, why: `Medyan ürün fiyatı ${tl(m.med)}; Sina ${tl(mine.med)}. Katalog bileşimi farklı olabilir.`, act: 'Giriş segmentinde ürün ve iletişim fırsatını değerlendirin.', dept: 'Ürün', brands: [b.name], src: 'cat' });
    }
    const recent = (w?.changes ?? []).filter((c) => c.at >= new Date(Date.now() - 7 * 864e5).toISOString());
    if (recent.some((c) => c.field === 'banners' || c.field === 'msgs')) out.push({ pri: 1, title: `${b.name} son 7 günde ana sayfa kampanya alanını değiştirdi`, why: `${recent.length} değişiklik kaydedildi (${[...new Set(recent.map((c) => c.label))].join(', ')}).`, act: 'Web ve SEO sayfasından önce/sonra karşılaştırmasını inceleyin.', dept: 'Pazarlama', brands: [b.name], src: 'site' });
  }
  const msgs = rivals().flatMap((b) => (webOf(b)?.current?.msgs ?? []).map((m) => [b.name, low(m)])), themes = [['taksit', 'Taksit'], ['ücretsiz kargo', 'Ücretsiz kargo'], ['sepette', 'Sepette indirim'], ['hediye', 'Hediye'], ['yılbaşı', 'Yılbaşı'], ['black friday', 'Black Friday'], ['efsane', 'Efsane Cuma / Kasım'], ['indirim', 'İndirim'], ['yeni sezon', 'Yeni sezon'], ['yeni koleksiyon', 'Yeni koleksiyon']];
  const watched = rivals().filter((b) => webOf(b)?.status === 'ok').length;
  for (const [k, l] of themes) { const who = [...new Set(msgs.filter(([, m]) => m.includes(k)).map(([n]) => n))]; if (watched >= 3 && who.length >= Math.ceil(watched * 0.6)) out.push({ pri: 3, title: `"${l}" mesajı izlenen ${watched} rakibin ${who.length}'inde ana sayfada`, why: 'Ana sayfa metinlerinde geçen kampanya ifadeleri.', act: 'Bu mesaj sektörde standartlaşmış; farklılaşmak için ek bir değer önerisi düşünün.', dept: 'Pazarlama', brands: who, src: 'site' }); }
  return out.sort((a, b) => a.pri - b.pri);
}

/* ---------- Sayfalar ---------- */
const pages = {
  genel(view) {
    const R = rivals(), A = ads(), ch7 = changes(7), L = latest(), dd = days(), withM = R.filter((b) => metricOf(b)), ok = R.filter((b) => webOf(b)?.status === 'ok');
    const feed = [...changes(30).slice(0, 40).map((c) => ({ at: c.at, html: `<b>${esc(c.brand.name)}</b> ana sayfasında <b>${esc(low(c.label))}</b> değişti`, go: '#/p/web', id: c.brand.id, s: 'site' })), ...A.filter((a) => a.createdAt).map((a) => ({ at: a.createdAt, html: `<b>${esc(bname(a.brand))}</b> için reklam kaydedildi: ${esc(a.title || a.platform || '')}`, go: '#/p/reklamlar', s: 'man' }))].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 25);
    const ins = insights().slice(0, 4);
    view.innerHTML = `${pendNote()}
      <div class="grid g4"><div class="card kpi"><div class="l">Takip edilen rakip</div><div class="v num">${R.length}</div><div class="s">${ok.length} markanın ana sayfası izleniyor</div></div>
        <div class="card kpi"><div class="l">Son 7 günde web değişikliği</div><div class="v num">${ok.length ? ch7.length : '—'}</div><div class="s">${ok.length ? `${new Set(ch7.map((c) => c.brand.id)).size} markada` : 'Henüz izlenen site yok'}</div></div>
        <div class="card kpi"><div class="l">Kayıtlı reklam</div><div class="v num">${A.length}</div><div class="s">${A.filter((a) => a.status === 'Aktif').length} aktif olarak işaretli · elle eklenir</div></div>
        <div class="card kpi"><div class="l">İndirimli ürün oranı en yüksek</div><div class="v" style="font-size:20px">${withM.length ? esc([...withM].sort((a, b) => metricOf(b).disc / metricOf(b).n - metricOf(a).disc / metricOf(a).n)[0].name) : '—'}</div><div class="s">${withM.length ? pct(Math.max(...withM.map((b) => (metricOf(b).disc / metricOf(b).n) * 100))) + ' · fiyat takibinden' : 'Katalog verisi yok'}</div></div></div>
      <div class="grid g2">
        <div class="card"><div class="card-head"><div><h2>İndirimli ürün oranı</h2><p class="muted small">Liste fiyatı satış fiyatından yüksek olan ürünlerin payı · ${dTR(dd.at(-1))}</p></div>${src('cat')}</div>${withM.length ? `<div class="chart-box" style="height:250px"><canvas id="pz1" role="img" aria-label="Markalara göre indirimli ürün oranı"></canvas></div>` : '<div class="empty">Fiyat takibinde kataloğu olan marka yok.</div>'}</div>
        <div class="card"><div class="card-head"><div><h2>Son gelişmeler</h2><p class="muted small">Ana sayfa değişiklikleri ve kaydedilen reklamlar</p></div></div>${feed.length ? `<div class="pz-feed">${feed.map((f) => `<a href="${f.go}"${f.id ? ` data-web="${esc(f.id)}"` : ''}><span class="num muted">${dTR(f.at)}</span><span>${f.html}</span>${src(f.s)}</a>`).join('')}</div>` : `<div class="empty"><b>Henüz kayıtlı gelişme yok</b>Ana sayfalar her gün okunur; ilk değişiklik ikinci okumadan sonra burada görünür.</div>`}</div>
      </div>
      ${dd.length > 1 ? `<div class="card"><div class="card-head"><div><h2>İndirim oranının seyri</h2><p class="muted small">Günlük; ${dTR(dd[0])} tarihinden beri</p></div>${src('cat')}</div><div class="chart-box" style="height:240px"><canvas id="pz2" role="img" aria-label="İndirimli ürün oranının günlük seyri"></canvas></div></div>` : ''}
      <div class="card"><div class="card-head"><div><h2>Öne çıkan çıkarımlar</h2><p class="muted small">Eldeki veriden kurallarla üretilir; yapay zekâ ya da reklam performansı verisi değildir</p></div><a class="btn small" href="#/p/firsatlar">Tümü</a></div>${ins.length ? ins.map(insRow).join('') : '<div class="empty">Şu an kural eşiğini aşan bir bulgu yok.</div>'}</div>`;
    if ($('#pz1')) H.chart($('#pz1'), { type: 'bar', data: { labels: withM.map((b) => b.name), datasets: [{ label: 'İndirimli ürün oranı', data: withM.map((b) => +((metricOf(b).disc / metricOf(b).n) * 100).toFixed(1)), backgroundColor: withM.map((b) => (b.self ? H.cssv('--brand') : H.cssv('--text-3'))), borderRadius: 6, maxBarThickness: 44 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` %${c.parsed.y.toLocaleString('tr-TR')}` } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: (v) => '%' + v }, border: { display: false } } } } });
    if ($('#pz2')) { const cols = ['--brand-deep', '--blue', '--dd', '--pos', '--neg', '--text-3']; H.chart($('#pz2'), { type: 'line', data: { labels: dd.map((d) => d.slice(8) + '.' + d.slice(5, 7)), datasets: withM.map((b, i) => ({ label: b.name, data: dd.map((d) => { const m = D.metrics.days[d]?.[b.catalog]; return m?.n ? +((m.disc / m.n) * 100).toFixed(1) : null; }), borderColor: H.cssv(cols[i % cols.length]), backgroundColor: 'transparent', borderWidth: 2, pointRadius: dd.length < 15 ? 3 : 0, tension: 0.25, spanGaps: true })) }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: (v) => '%' + v }, border: { display: false } } } } }); }
    view.querySelectorAll('[data-web]').forEach((a) => (a.onclick = () => { F.web = a.dataset.web; }));
  },

  markalar(view) {
    const list = brands(true).filter((b) => !b.self).sort((a, b) => (!!a.archived - !!b.archived) || a.name.localeCompare(b.name, 'tr'));
    view.innerHTML = `${pendNote()}<div class="bar"><span class="small muted">${list.filter((b) => !b.archived).length} marka takipte${list.some((b) => b.archived) ? ` · ${list.filter((b) => b.archived).length} arşivde` : ''}</span><span class="grow"></span><button class="btn primary" id="bNew">${ic('i-plus')}Marka ekle</button></div>
      <div class="pz-brands">${list.map((b) => { const m = metricOf(b), n = ads().filter((a) => a.brand === b.id).length; return `<div class="card pz-brand${b.archived ? ' arch' : ''}" data-bid="${esc(b.id)}" tabindex="0" role="button"><div class="pz-bh"><span class="pz-av">${esc(b.name.slice(0, 1))}</span><div><b>${esc(b.name)}</b><div class="small muted">${b.web ? esc(hostOf(b.web)) : 'Web adresi girilmedi'}</div></div>${b._pending ? '<span class="tag acc">Yayınlanıyor</span>' : b.archived ? '<span class="tag">Arşiv</span>' : ''}</div>
        <div class="pz-bm"><div><span>Web izleme</span>${webTag(b)}</div><div><span>Fiyat takibi</span>${m ? `<b class="num">${num(m.n)} ürün</b>` : '<span class="tag">Kapsam dışı</span>'}</div><div><span>Kayıtlı reklam</span><b class="num">${n}</b></div><div><span>Sosyal hesap</span>${b.instagram ? `<b>@${esc(handle(b.instagram))}</b>` : '<span class="tag">Girilmedi</span>'}</div></div></div>`; }).join('')}</div>`;
    $('#bNew').onclick = () => brandForm();
  },

  reklamlar(view) {
    const f = F.ad, q = low(f.q), all = ads();
    const list = all.filter((a) => (!f.brand || a.brand === f.brand) && (!f.platform || a.platform === f.platform) && (!f.status || (a.status ?? 'Bilinmiyor') === f.status) && (!f.fav || a.fav) && (!q || low([a.title, a.text, a.cta, a.tags, a.campaign, a.category, bname(a.brand)].join(' ')).includes(q))).sort((a, b) => ((a.firstSeen ?? a.createdAt ?? '') < (b.firstSeen ?? b.createdAt ?? '') ? 1 : -1));
    view.innerHTML = `${pendNote()}<div class="note"><b>Reklamlar bu kütüphaneye elle eklenir.</b> Meta ve TikTok'un resmî reklam API'leri ticari reklamlarda yalnızca AB'de gösterilenleri verir; Google'ın şeffaflık merkezinin API'si yoktur. Türkiye'de yayınlanan rakip reklamları otomatik çekilemediği için resmî kütüphanede inceleyip beğendiğinizi buraya kaydedin.</div>
      <div class="pz-libs">${rivals().map((b) => `<details><summary>${esc(b.name)}</summary><div>${libLinks(b).slice(0, 3).map(([l, u]) => `<a class="btn small" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${l} ↗</a>`).join('')}</div></details>`).join('')}</div>
      <div class="bar"><div class="mh-search"><input id="aq" type="search" value="${esc(f.q)}" placeholder="Reklam metni, etiket, kampanya ya da marka" aria-label="Reklamlarda ara"></div><div class="seg" role="tablist" aria-label="Görünüm">${[['grid', 'Izgara'], ['list', 'Liste']].map(([k, l]) => `<button data-view="${k}" class="${f.view === k ? 'on' : ''}">${l}</button>`).join('')}</div><button class="btn primary" id="aNew">${ic('i-plus')}Reklam ekle</button></div>
      <div class="card"><div class="filters"><div><label for="ab">Marka</label><select id="ab">${opt(rivals().map((b) => [b.id, b.name]), f.brand, 'Tüm markalar')}</select></div><div><label for="ap">Platform</label><select id="ap">${opt(PLATFORMS, f.platform, 'Tüm platformlar')}</select></div><div><label for="as">Durum</label><select id="as">${opt(AD_STATUS, f.status, 'Hepsi')}</select></div><div><label>&nbsp;</label><label class="switch" style="min-height:36px"><input type="checkbox" id="af"${f.fav ? ' checked' : ''}>Favoriler</label></div></div></div>
      ${list.length ? `<div class="small muted">${list.length} reklam</div>${f.view === 'grid' ? `<div class="pz-ads">${list.map(adCard).join('')}</div>` : `<div class="tbl-wrap"><table><thead><tr><th>Marka</th><th>Başlık</th><th>Platform</th><th>Biçim</th><th>Durum</th><th>İlk görülme</th><th>Kampanya</th></tr></thead><tbody>${list.map((a) => `<tr class="click" data-aid="${esc(a.id)}" tabindex="0"><td><b>${esc(bname(a.brand))}</b></td><td>${a.fav ? '★ ' : ''}${esc(a.title || (a.text ?? '').slice(0, 60) || '—')}</td><td>${esc(a.platform ?? '—')}</td><td>${esc(a.format ?? '—')}</td><td>${esc(a.status ?? 'Bilinmiyor')}</td><td class="num">${dTR(a.firstSeen)}</td><td>${esc(a.campaign ?? '—')}</td></tr>`).join('')}</tbody></table></div>`}`
        : `<div class="card empty"><b>${all.length ? 'Bu süzgeçlere uyan reklam yok' : 'Kütüphane boş'}</b>${all.length ? 'Süzgeçleri değiştirin.' : 'Yukarıdaki bağlantılardan bir rakibin reklamlarını resmî kütüphanede açın; kaydetmek istediğinizi "Reklam ekle" ile bağlantısı ve görseliyle ekleyin.'}</div>`}`;
    const re = () => route('reklamlar');
    $('#aNew').onclick = () => adForm(); let t; $('#aq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; re(); setTimeout(() => { const i = $('#aq'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 0); }, 250); };
    $('#ab').onchange = (e) => { f.brand = e.target.value; re(); }; $('#ap').onchange = (e) => { f.platform = e.target.value; re(); }; $('#as').onchange = (e) => { f.status = e.target.value; re(); }; $('#af').onchange = (e) => { f.fav = e.target.checked; re(); };
    $$('[data-view]', view).forEach((b) => (b.onclick = () => { f.view = b.dataset.view; re(); }));
  },

  kampanya(view) {
    const R = brands().filter((b) => metricOf(b)), dd = days();
    view.innerHTML = `<div class="card"><div class="card-head"><div><h2>İndirim görünümü</h2><p class="muted small">Ürün sayfalarındaki liste ve satış fiyatından · ${dTR(dd.at(-1))}</p></div>${src('cat')}</div>
        ${R.length ? `<div class="tbl-wrap"><table><thead><tr><th>Marka</th><th class="r">Ürün</th><th class="r">İndirimli ürün</th><th class="r">Oran</th><th class="r">Ortalama indirim</th><th class="r">En yüksek indirim</th><th class="r">Medyan fiyat</th><th class="r">Son 7 günde yeni ürün</th></tr></thead><tbody>${R.map((b) => { const m = metricOf(b); return `<tr><td><b>${esc(b.name)}</b>${b.self ? ' <span class="tag acc">Biz</span>' : ''}</td><td class="r num">${num(m.n)}</td><td class="r num">${num(m.disc)}</td><td class="r num"><b>${pct((m.disc / m.n) * 100)}</b></td><td class="r num">${pct(m.avgDisc, 1)}</td><td class="r num">${pct(m.maxDisc)}</td><td class="r num">${tl(m.med)}</td><td class="r num">${m.new7 == null ? '<span class="muted" title="Takip 7 günden yeni">—</span>' : num(m.new7)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Katalog verisi yok.</div>'}
        <p class="small muted" style="margin-top:10px">Yalnızca fiyat takibine alınan markalar. "İndirimli" = sitede üstü çizili liste fiyatı gösterilen ürün; gerçek satış ya da kampanya bütçesi verisi değildir.</p></div>
      ${R.filter((b) => !b.self).map((b) => { const m = metricOf(b), cats = Object.entries(m.cats ?? {}).filter(([, c]) => c.n >= 5); return cats.length ? `<div class="card"><div class="card-head"><div><h2>${esc(b.name)} · kategoriye göre indirim</h2></div></div><div class="dist">${cats.map(([k, c]) => `<div class="dist-row"><span>${esc(k)} <span class="muted">· ${num(c.n)} ürün</span></span><b>${pct((c.d / c.n) * 100)}</b><div class="meter"><i class="acc" style="width:${(c.d / c.n) * 100}%"></i></div></div>`).join('')}</div></div>` : ''; }).join('')}
      <div class="card"><div class="card-head"><div><h2>Ana sayfalardaki kampanya mesajları</h2><p class="muted small">Sitelerin ana sayfa metninden; son okuma</p></div>${src('site')}</div>${rivals().filter((b) => webOf(b)?.current?.msgs?.length).map((b) => `<div class="pz-msg"><b>${esc(b.name)}</b><span class="small muted num">${dTR(webOf(b).current.at)}</span>${fieldVal('msgs', webOf(b).current.msgs)}</div>`).join('') || '<div class="empty">Henüz okunan ana sayfa yok.</div>'}</div>
      <div class="note">Kampanya takvimi ve reklam–kampanya eşleştirmesi, reklam kütüphanesine kayıt girildikçe "Kampanya" alanı üzerinden oluşur. Otomatik kampanya tespiti henüz yok.</div>`;
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
    const all = brands(); F.cmp ??= all.filter((b) => b.self || metricOf(b)).slice(0, 5).map((b) => b.id);
    const sel = all.filter((b) => F.cmp.includes(b.id)), A = ads(), w7 = (b) => (webOf(b)?.status === 'ok' ? (webOf(b).changes ?? []).filter((c) => c.at >= new Date(Date.now() - 30 * 864e5).toISOString()).length : null);
    const rows = [['Katalogdaki ürün', (b) => metricOf(b)?.n, num, 'cat'], ['İndirimli ürün oranı', (b) => { const m = metricOf(b); return m?.n ? (m.disc / m.n) * 100 : null; }, (v) => pct(v), 'cat'], ['Ortalama indirim', (b) => metricOf(b)?.avgDisc, (v) => pct(v, 1), 'cat'], ['Medyan fiyat', (b) => metricOf(b)?.med, tl, 'cat'], ['Son 7 günde yeni ürün', (b) => metricOf(b)?.new7, num, 'cat'], ['Son 30 günde ana sayfa değişikliği', w7, num, 'site'], ['Ana sayfadaki kampanya mesajı', (b) => (webOf(b)?.status === 'ok' ? webOf(b).current.msgs.length : null), num, 'site'], ['Kayıtlı reklam', (b) => A.filter((a) => a.brand === b.id).length || null, num, 'man']];
    const radar = rows.filter((r) => sel.filter((b) => r[1](b) != null).length >= 2).slice(0, 7);
    view.innerHTML = `<div class="card"><div class="card-head"><div><h2>Karşılaştırılacak markalar</h2><p class="muted small">En çok 6 marka</p></div></div><div class="pz-chips">${all.map((b) => `<button class="tag${F.cmp.includes(b.id) ? ' acc' : ''}" data-cmp="${esc(b.id)}" aria-pressed="${F.cmp.includes(b.id)}">${esc(b.name)}</button>`).join('')}</div></div>
      ${sel.length >= 2 ? `<div class="tbl-wrap"><table><thead><tr><th>Ölçüt</th>${sel.map((b) => `<th class="r">${esc(b.name)}</th>`).join('')}<th>Kaynak</th></tr></thead><tbody>${rows.map(([l, fn, fmt, s]) => `<tr><td>${l}</td>${sel.map((b) => { const v = fn(b); return `<td class="r num">${v == null ? '<span class="muted" title="Bu marka için veri yok">veri yok</span>' : `<b>${fmt(v)}</b>`}</td>`; }).join('')}<td>${src(s)}</td></tr>`).join('')}</tbody></table></div>
      ${radar.length >= 3 ? `<div class="card"><div class="card-head"><div><h2>Göreli görünüm</h2><p class="muted small">Her ölçüt, seçili markalar içindeki en yüksek değere göre 0–100 ölçeklenir; verisi olmayan marka o ölçütte çizilmez</p></div></div><div class="chart-box" style="height:340px"><canvas id="pz3" role="img" aria-label="Seçili markaların göreli karşılaştırması"></canvas></div></div>` : ''}
      <div class="note">Kapsam markadan markaya değişir: fiyat takibinde olmayan markalarda katalog ölçütleri, sitesi okunamayan markalarda web ölçütleri "veri yok" görünür; sıfır sayılmaz. Reklam sayısı yalnızca elle kaydedilenlerdir, markanın gerçek reklam hacmini göstermez.</div>` : '<div class="card empty"><b>En az iki marka seçin</b></div>'}`;
    $$('[data-cmp]', view).forEach((x) => (x.onclick = () => { const id = x.dataset.cmp; F.cmp = F.cmp.includes(id) ? F.cmp.filter((y) => y !== id) : F.cmp.length < 6 ? [...F.cmp, id] : F.cmp; route('karsilastir'); }));
    if ($('#pz3')) { const cols = ['--brand-deep', '--blue', '--dd', '--pos', '--neg', '--text-3']; H.chart($('#pz3'), { type: 'radar', data: { labels: radar.map((r) => r[0]), datasets: sel.map((b, i) => ({ label: b.name, data: radar.map((r) => { const v = r[1](b), mx = Math.max(...sel.map((x) => r[1](x) ?? 0)); return v == null || !mx ? null : +((v / mx) * 100).toFixed(0); }), borderColor: H.cssv(cols[i % cols.length]), backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, spanGaps: false })) }, options: { maintainAspectRatio: false, scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: H.cssv('--hairline') }, angleLines: { color: H.cssv('--hairline') }, pointLabels: { font: { size: 11 } } } } } }); }
  },

  firsatlar(view) {
    const ins = insights();
    view.innerHTML = `<div class="note"><b>Bu bulgular yapay zekâ değil, sabit kurallarla</b> eldeki gerçek veriden (fiyat takibi ve ana sayfa okumaları) üretilir. Her bulgunun dayanağı yanında yazar. Reklam performansı, harcama ya da hedef kitle verisi içermez.</div>
      ${ins.length ? `<div class="card">${ins.map(insRow).join('')}</div>` : '<div class="card empty"><b>Şu an kural eşiğini aşan bulgu yok</b>Veri biriktikçe (özellikle haftalık karşılaştırmalar için en az 8 günlük veri gerekir) burada görünür.</div>'}`;
  },

  kaynaklar(view) {
    const R = rivals(), ok = R.filter((b) => webOf(b)?.status === 'ok').length, bad = R.filter((b) => b.web && webOf(b) && webOf(b).status !== 'ok');
    const rows = [
      ['Rakip ana sayfaları', 'pos', `Çalışıyor · ${ok} / ${R.filter((b) => b.web).length} site`, 'Günde bir kez, kendini tanıtan istemciyle; robots.txt izin vermeyen ya da isteği reddeden site okunmaz.' + (bad.length ? ` Okunamayan: ${bad.map((b) => b.name).join(', ')}.` : '')],
      ['Fiyat takibi katalogları', 'pos', `Çalışıyor · ${Object.keys(latest()).length} marka`, 'Fiyat Takip bölümünün topladığı ürün verisinden indirim ve fiyat göstergeleri.'],
      ['Reklam kütüphanesi (elle)', 'acc', 'Çalışıyor · elle giriş', 'Resmî kütüphanede incelediğiniz reklamı bağlantısı ve görsel adresiyle kaydedersiniz.'],
      ['Meta Ads Library API', '', 'Kullanılamıyor', 'Resmî API ticari reklamlarda yalnızca AB (ve Birleşik Krallık) içinde gösterilenleri verir; Türkiye\'de yayınlanan reklamlar API\'den gelmez. Kütüphanenin web sayfasını otomatik okumak Meta koşullarına aykırıdır.'],
      ['Google Ads Transparency Center', '', 'Kullanılamıyor', 'Resmî API\'si yok. Her marka için doğrudan bağlantı verilir.'],
      ['TikTok Commercial Content Library', '', 'Kullanılamıyor', 'API yalnızca Avrupa\'da gösterilen reklamları kapsar ve araştırmacı başvurusu ister.'],
      ['Instagram (rakip gönderileri)', 'warn', 'Bağlanabilir · henüz bağlı değil', 'Meta\'nın resmî "Business Discovery" API\'si kendi Instagram işletme hesabınız ve erişim anahtarınızla rakiplerin herkese açık gönderi ve beğeni sayılarını verir. Anahtar gerekir.'],
      ['YouTube (rakip kanalları)', 'warn', 'Bağlanabilir · henüz bağlı değil', 'Ücretsiz YouTube Data API anahtarıyla kanal videoları ve izlenme sayıları alınabilir.'],
      ['Yapay zekâ analizi (kreatif, içgörü, asistan)', 'warn', 'Kurulu değil', 'Ücretli bir yapay zekâ API anahtarı gerekir; kullanım başına maliyeti vardır. Şu an hiçbir ekranda yapay zekâ çıktısı gösterilmiyor.'],
      ['SEO sıralaması ve trafik tahmini', '', 'Kullanılamıyor', 'Semrush, Similarweb gibi ücretli sağlayıcı aboneliği gerekir.'],
      ['Ana sayfa ekran görüntüsü', 'warn', 'Henüz yok', 'Teknik olarak eklenebilir; şu an yalnızca metin ve görsel adresleri saklanıyor.'],
    ];
    view.innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Kaynak</th><th>Durum</th><th>Açıklama</th></tr></thead><tbody>${rows.map(([n, c, s, d]) => `<tr><td><b>${n}</b></td><td><span class="tag ${c}">${s}</span></td><td class="small">${d}</td></tr>`).join('')}</tbody></table></div>
      <div class="card"><h2>Marka bazında web izleme</h2><div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>Marka</th><th>Durum</th><th>Son başarılı okuma</th><th>Not</th></tr></thead><tbody>${R.map((b) => { const w = webOf(b); return `<tr><td><b>${esc(b.name)}</b></td><td>${webTag(b)}</td><td class="num">${when(w?.lastOk)}</td><td class="small">${esc(w?.error ?? (b.web ? '' : 'Rakip Markalar sayfasından web adresi ekleyin'))}</td></tr>`; }).join('')}</tbody></table></div></div>
      <div class="note">Veri paketi: ${when(GEN)}. Veriler günde bir kez yenilenir; canlı akış değildir.</div>`;
  },

  menu(view) { view.innerHTML = `<div class="menu-list">${['kampanya', 'karsilastir', 'firsatlar', 'kaynaklar'].map((k) => `<a href="#/p/${k}"><span>${TITLES[k][0]}</span><svg class="ic chev"><use href="#i-chev"/></svg></a>`).join('')}</div>`; },
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
    ${fld('bM', 'Meta reklam kütüphanesi bağlantısı', b?.metaLibrary, 'inputmode="url" placeholder="Boşsa marka adıyla arama açılır"', 'full')}${fld('bG', 'Google reklamveren sayfası', b?.googleAds, 'inputmode="url" placeholder="Boşsa alan adıyla arama açılır"', 'full')}
    ${fld('bC', 'Faaliyet gösterdiği ülkeler', b?.countries)}<div class="field"><label for="bS">Fiyat segmenti</label><select id="bS">${opt(['Giriş', 'Orta', 'Üst', 'Lüks'], b?.segment, 'Belirtilmedi')}</select></div>
    ${fld('bK', 'Ürün kategorileri', b?.categories, '', 'full')}${area('bP', 'Marka konumlandırması (kendi notunuz)', b?.positioning)}${area('bA', 'Hedef kitle notu (kendi çıkarımınız)', b?.audience)}</div></div>`, async () => {
    if (g('#bN').length < 2) { $('#bN').focus(); H.toast('Marka adını yazın.', 'err'); return false; }
    const nid = b?.id ?? (slug(g('#bN')) || 'marka') + (brands(true).some((x) => x.id === slug(g('#bN'))) ? '-' + Date.now().toString(36).slice(-3) : '');
    await submit({ t: 'brand.upsert', id: nid, data: { name: g('#bN'), web: g('#bW'), instagram: g('#bI'), facebook: g('#bF'), tiktok: g('#bT'), youtube: g('#bY'), metaLibrary: g('#bM'), googleAds: g('#bG'), countries: g('#bC'), segment: g('#bS'), categories: g('#bK'), positioning: g('#bP'), audience: g('#bA') } });
  });
}
function brandCard(id) {
  const b = brands(true).find((x) => x.id === id); if (!b) return; const m = metricOf(b), w = webOf(b), A = ads().filter((a) => a.brand === id), rows = (pairs) => pairs.filter(([, v]) => v).map(([l, v]) => `<div class="mrow"><span>${l}</span><b>${v}</b></div>`).join('');
  H.openDrawer(b.name, `<div class="card"><div class="pz-bh"><span class="pz-av">${esc(b.name.slice(0, 1))}</span><div><b>${esc(b.name)}</b><div class="small muted">Takip başlangıcı ${dTR(b.since)}${b.updatedAt ? ` · son düzenleme ${dTR(b.updatedAt)} (${esc(b.updatedBy ?? '')})` : ''}</div></div></div>
      <div class="pz-chips" style="margin-top:12px">${libLinks(b).map(([l, u]) => `<a class="btn small" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${l} ↗</a>`).join('')}</div>
      <div class="bar" style="margin-top:12px"><button class="btn primary" id="bEdit">Düzenle</button><button class="btn" id="bAd">${ic('i-plus')}Reklam ekle</button><span class="grow"></span><button class="btn ghost" id="bArch">${b.archived ? 'Takibe geri al' : 'Arşivle'}</button></div></div>
    <div class="mgroup"><h3>Profil ${src('man')}</h3>${rows([['Fiyat segmenti', esc(b.segment)], ['Ülkeler', esc(b.countries)], ['Ürün kategorileri', esc(b.categories)], ['Konumlandırma', esc(b.positioning)], ['Hedef kitle notu', esc(b.audience)], ['Instagram', b.instagram && '@' + esc(handle(b.instagram))], ['TikTok', b.tiktok && '@' + esc(handle(b.tiktok))], ['YouTube', esc(b.youtube)]]) || '<div class="mrow"><span class="muted">Profil bilgisi girilmedi</span><b></b></div>'}</div>
    <div class="mgroup"><h3>Veri kaynakları</h3><div class="mrow"><span>Ana sayfa izleme<small>${esc(w?.error ?? (w?.lastOk ? 'Son okuma ' + when(w.lastOk) : ''))}</small></span><b>${webTag(b)}</b></div><div class="mrow"><span>Fiyat takibi</span><b>${m ? `${num(m.n)} ürün · indirimli ${pct((m.disc / m.n) * 100)}` : '<span class="tag">Kapsam dışı</span>'}</b></div><div class="mrow"><span>Reklam verisi</span><b><span class="tag acc">${A.length} elle kayıt</span></b></div><div class="mrow"><span>Sosyal medya verisi</span><b><span class="tag">Bağlı değil</span></b></div></div>
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
  H = host; D = { brands: [], ads: [], metrics: { days: {} }, web: {}, ...(host.data ?? {}) }; GEN = host.generatedAt;
  const live = () => document.documentElement.dataset.app === 'p';
  document.addEventListener('click', (e) => { if (!live() || e.target.closest('a[target],button,select,input,summary')) return; const b = e.target.closest('[data-bid]'); if (b) return brandCard(b.dataset.bid); const a = e.target.closest('[data-aid]'); if (a) return adCardOpen(a.dataset.aid); });
  document.addEventListener('keydown', (e) => { if (live() && e.key === 'Enter' && e.target.matches?.('[data-bid],[data-aid]')) e.target.click(); });
}

// Müşteri Hizmetleri: müşteri başvuruları (iade, değişim, tamir, taş düşmesi…) ve müşteri geçmişi.
import * as DB from './store.js';
import { M } from './store.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (id) => `<svg class="ic"><use href="#${id}"/></svg>`;
const opt = (list, cur, all) => (all != null ? `<option value="">${all}</option>` : '') + list.map((x) => `<option${x === cur ? ' selected' : ''}>${esc(x)}</option>`).join('');
const low = (s) => String(s ?? '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
const dTR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : '—');
const today = () => { const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' })); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const money = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺');
const parseNum = (v) => { const t = String(v ?? '').replace(/[^\d.,-]/g, ''); if (!t) return null; const n = parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t); return Number.isFinite(n) ? n : null; };

export const TYPES = ['Taş düşmesi', 'Tamir', 'İade', 'Değişim', 'Ürün yükseltme', 'Ölçü ayarı', 'Kargo / teslimat', 'Bilgi talebi', 'Şikâyet', 'Diğer'];
const CHANNELS = ['WhatsApp', 'Telefon', 'Mağaza', 'E-posta', 'Instagram', 'Diğer'];
const STATUS = ['Açık', 'İşlemde', 'Tamamlandı'];
const FEES = ['Ücretsiz', 'Ücretli', 'Belirlenmedi'];
const REPEATABLE = ['Taş düşmesi', 'Tamir', 'Ölçü ayarı', 'Değişim', 'İade', 'Ürün yükseltme']; // tekrarında uyarı verilen konular
export const TITLES = { kayitlar: ['Kayıtlar', 'Müşteri başvuruları ve görüşme notları'], musteriler: ['Müşteriler', 'Müşteri geçmişi'] };
const TABS = ['kayitlar', 'musteriler'];
let H = null;
const F = { q: '', type: '', status: '', page: 0, cq: '' };

/* ---------- Müşteri eşleştirme: önce telefon (son 10 hane), yoksa ad soyad ---------- */
const phoneKey = (p) => { const d = String(p ?? '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : d.length >= 7 ? d : ''; };
export const custKey = (r) => (phoneKey(r.phone) ? 'p:' + phoneKey(r.phone) : 'n:' + low(r.customer));
const phoneFmt = (p) => { const d = phoneKey(p); return d.length === 10 ? `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}` : String(p ?? ''); };
function customers() {
  const m = new Map();
  for (const r of M.rows) { const k = custKey(r); const c = m.get(k) ?? { key: k, name: r.customer, phone: r.phone, rows: [] }; c.rows.push(r); if ((r.date ?? '') >= (c.last ?? '')) { c.last = r.date; c.name = r.customer || c.name; c.phone = r.phone || c.phone; } m.set(k, c); }
  // Aynı ad soyadla telefonsuz girilmiş kayıtlar, o adın tek bir telefonlu müşterisi varsa ona bağlanır
  for (const [k, c] of [...m]) { if (!k.startsWith('n:')) continue; const same = [...m.values()].filter((x) => x.key.startsWith('p:') && low(x.name) === low(c.name)); if (same.length === 1) { same[0].rows.push(...c.rows); m.delete(k); } }
  return [...m.values()].map((c) => ({ ...c, rows: c.rows.sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1)), counts: c.rows.reduce((t, r) => ((t[r.type] = (t[r.type] ?? 0) + 1), t), {}) })).sort((a, b) => ((a.last ?? '') < (b.last ?? '') ? 1 : -1));
}
// Yazılan ad/telefonla eşleşen müşteri (yeni kayıt formunda geçmişi göstermek için)
function findCustomer(name, phone, list = customers()) {
  const pk = phoneKey(phone), nk = low(name);
  return (pk && list.find((c) => c.rows.some((r) => phoneKey(r.phone) === pk))) || (nk.length >= 3 && list.find((c) => low(c.name) === nk)) || null;
}
const typeTag = (t) => `<span class="tag ${t === 'Taş düşmesi' || t === 'Tamir' ? 'warn' : t === 'İade' || t === 'Şikâyet' ? 'neg' : ''}">${esc(t ?? '—')}</span>`;
const stTag = (s) => `<span class="tag ${s === 'Tamamlandı' ? 'pos' : s === 'İşlemde' ? 'acc' : 'warn'}">${esc(s ?? 'Açık')}</span>`;
const countChips = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<span class="tag${n > 1 && REPEATABLE.includes(t) ? ' neg' : ''}">${esc(t)}${n > 1 ? ` × ${n}` : ''}</span>`).join(' ');
const connNote = () => (M.error ? `<div class="note warn"><b>Kayıt tablosuna ulaşılamadı.</b> ${esc(M.error)} <button class="btn small" data-reload style="margin-left:8px">Tekrar dene</button></div>` : !M.shared ? `<div class="note warn"><b>Ortak kayıt tablosu henüz bağlı değil.</b> Kayıtlar şu an yalnızca bu tarayıcıda duruyor; ekip arkadaşlarınız göremez. Deneme için kullanın, gerçek müşteri kaydı girmeyin.</div>` : '');
const timeline = (rows, skipId) => rows.filter((r) => r.id !== skipId).map((r) => `<div class="tl" data-cid="${esc(r.id)}" tabindex="0" role="button"><div class="tl-h"><b class="num">${dTR(r.date)}</b>${typeTag(r.type)}${stTag(r.status)}${r.fee === 'Ücretli' ? `<span class="tag">Ücretli${r.feeAmount ? ' · ' + money(r.feeAmount) : ''}</span>` : r.fee === 'Ücretsiz' ? '<span class="tag pos">Ücretsiz</span>' : ''}</div>${r.product ? `<div class="small"><b>${esc(r.product)}</b></div>` : ''}<div class="tl-n">${esc(r.note ?? '')}</div><div class="small muted">${esc(r.channel ?? '')}${r.createdBy ? ` · kaydeden ${esc(r.createdBy)}` : ''}</div></div>`).join('');

const pages = {
  kayitlar(view) {
    const q = low(F.q), month = today().slice(0, 7), cs = customers();
    let list = M.rows.filter((r) => (!F.type || r.type === F.type) && (!F.status || (r.status ?? 'Açık') === F.status) && (!q || low([r.customer, r.phone, phoneKey(r.phone), r.product, r.note, r.id].join(' ')).includes(q)));
    list.sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : (a.date ?? '') > (b.date ?? '') ? -1 : (a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1));
    const N = 50, pg = Math.ceil(list.length / N); F.page = Math.min(F.page, Math.max(0, pg - 1));
    const repeat = new Map(cs.map((c) => [c.key, c]));
    view.innerHTML = `${connNote()}
      <div class="bar"><div class="mh-search"><input id="mq" type="search" value="${esc(F.q)}" placeholder="Müşteri adı, telefon, ürün ya da not içinde ara" aria-label="Kayıtlarda ara"></div><button class="btn primary" id="mNew">${ic('i-plus')}Yeni kayıt</button></div>
      <div class="grid g4"><div class="card kpi"><div class="l">Açık kayıt</div><div class="v num">${M.rows.filter((r) => (r.status ?? 'Açık') !== 'Tamamlandı').length}</div><div class="s">Tamamlanmamış başvurular</div></div>
        <div class="card kpi"><div class="l">Bu ay</div><div class="v num">${M.rows.filter((r) => (r.date ?? '').startsWith(month)).length}</div><div class="s">Bu ay açılan kayıt</div></div>
        <div class="card kpi"><div class="l">Müşteri</div><div class="v num">${cs.length}</div><div class="s">Kayıtlı farklı müşteri</div></div>
        <div class="card kpi"><div class="l">Tekrar eden</div><div class="v num">${cs.filter((c) => c.rows.length > 1).length}</div><div class="s">Birden çok kez başvuran müşteri</div></div></div>
      <div class="card"><div class="filters"><div><label for="mt">Konu</label><select id="mt">${opt(TYPES, F.type, 'Tüm konular')}</select></div><div><label for="ms">Durum</label><select id="ms">${opt(STATUS, F.status, 'Tüm durumlar')}</select></div></div></div>
      ${list.length ? `<div class="small muted">${list.length.toLocaleString('tr-TR')} kayıt</div>
      <div class="mrows card">${list.slice(F.page * N, F.page * N + N).map((r) => { const n = (repeat.get(custKey(r)) ?? cs.find((x) => x.rows.includes(r)))?.rows.length ?? 1; return `<div class="mrw" data-cid="${esc(r.id)}" tabindex="0" role="button"><div class="mrw-t"><b>${esc(r.customer)}</b>${n > 1 ? `<span class="tag acc">${n} kayıt</span>` : ''}<span class="num muted">${dTR(r.date)}</span></div><div class="mrw-g">${typeTag(r.type)}${stTag(r.status)}${r.fee === 'Ücretli' ? `<span class="tag">Ücretli${r.feeAmount ? ' · ' + money(r.feeAmount) : ''}</span>` : ''}${r.product ? `<span class="small muted">${esc(r.product)}</span>` : ''}</div><div class="mh-note">${esc(r.note ?? '')}</div></div>`; }).join('')}</div>
      <div class="tbl-wrap"><table><thead><tr><th>Tarih</th><th>Müşteri</th><th>Konu</th><th>Ürün</th><th>Görüşme notu</th><th>Durum</th><th>Ücret</th></tr></thead><tbody>${list.slice(F.page * N, F.page * N + N).map((r) => { const c = repeat.get(custKey(r)) ?? cs.find((x) => x.rows.includes(r)), n = c?.rows.length ?? 1; return `<tr class="click" data-cid="${esc(r.id)}" tabindex="0"><td class="num">${dTR(r.date)}</td><td><b>${esc(r.customer)}</b>${n > 1 ? ` <span class="tag acc" title="Bu müşterinin toplam kayıt sayısı">${n} kayıt</span>` : ''}${r.phone ? `<div class="small muted num">${esc(phoneFmt(r.phone))}</div>` : ''}</td><td>${typeTag(r.type)}</td><td>${esc(r.product ?? '—')}</td><td><div class="mh-note">${esc(r.note ?? '')}</div></td><td>${stTag(r.status)}</td><td>${r.fee === 'Ücretli' ? `Ücretli${r.feeAmount ? `<div class="small num">${money(r.feeAmount)}</div>` : ''}` : esc(r.fee ?? '—')}</td></tr>`; }).join('')}</tbody></table></div>
      ${pg > 1 ? `<div class="pager"><button class="btn small" id="pp"${F.page === 0 ? ' disabled' : ''}>← Önceki</button><span class="small muted">Sayfa ${F.page + 1} / ${pg}</span><button class="btn small" id="pn"${F.page >= pg - 1 ? ' disabled' : ''}>Sonraki →</button></div>` : ''}`
        : `<div class="card empty"><b>${M.rows.length ? 'Bu aramaya uyan kayıt yok' : 'Henüz kayıt yok'}</b>${M.rows.length ? 'Aramayı ya da süzgeçleri değiştirin.' : 'Bir müşteri yazdığında "Yeni kayıt" ile konuyu ve görüşme notunu ekleyin; aynı müşteri tekrar yazdığında geçmişi burada görünür.'}</div>`}`;
    const re = () => route('kayitlar');
    $('#mNew').onclick = () => caseForm();
    let t; $('#mq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { F.q = e.target.value; F.page = 0; re(); setTimeout(() => { const i = $('#mq'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 0); }, 250); };
    $('#mt').onchange = (e) => { F.type = e.target.value; F.page = 0; re(); }; $('#ms').onchange = (e) => { F.status = e.target.value; F.page = 0; re(); };
    if ($('#pp')) $('#pp').onclick = () => { F.page--; re(); scrollTo(0, 0); }; if ($('#pn')) $('#pn').onclick = () => { F.page++; re(); scrollTo(0, 0); };
  },

  musteriler(view) {
    const q = low(F.cq), all = customers(), list = all.filter((c) => !q || low(c.name + ' ' + c.phone + ' ' + phoneKey(c.phone)).includes(q));
    view.innerHTML = `${connNote()}
      <div class="bar"><div class="mh-search"><input id="cq" type="search" value="${esc(F.cq)}" placeholder="Müşteri adı ya da telefon" aria-label="Müşterilerde ara"></div><button class="btn primary" id="mNew">${ic('i-plus')}Yeni kayıt</button></div>
      ${list.length ? `<div class="small muted">${list.length.toLocaleString('tr-TR')} müşteri</div>
      <div class="mrows card">${list.slice(0, 300).map((c) => `<div class="mrw" data-ck="${esc(c.key)}" tabindex="0" role="button"><div class="mrw-t"><b>${esc(c.name || '—')}</b><span class="tag acc">${c.rows.length} kayıt</span><span class="num muted">${dTR(c.last)}</span></div>${c.phone ? `<div class="small muted num">${esc(phoneFmt(c.phone))}</div>` : ''}<div class="mrw-g">${countChips(c.counts)}</div></div>`).join('')}</div>
      <div class="tbl-wrap"><table><thead><tr><th>Müşteri</th><th>Telefon</th><th class="r">Kayıt</th><th>Konular</th><th>Son görüşme</th></tr></thead><tbody>${list.slice(0, 300).map((c) => `<tr class="click" data-ck="${esc(c.key)}" tabindex="0"><td><b>${esc(c.name || '—')}</b></td><td class="num">${esc(phoneFmt(c.phone) || '—')}</td><td class="r num"><b>${c.rows.length}</b></td><td>${countChips(c.counts)}</td><td class="num">${dTR(c.last)}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="card empty"><b>${all.length ? 'Bu aramaya uyan müşteri yok' : 'Henüz müşteri yok'}</b>Müşteriler, girilen kayıtlardan kendiliğinden oluşur.</div>`}`;
    $('#mNew').onclick = () => caseForm();
    let t; $('#cq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { F.cq = e.target.value; route('musteriler'); setTimeout(() => { const i = $('#cq'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 0); }, 250); };
  },
};

/* ---------- Müşteri kartı ---------- */
function customerCard(key) {
  const c = customers().find((x) => x.key === key); if (!c) return;
  const paid = c.rows.filter((r) => r.fee === 'Ücretli'), rep = Object.entries(c.counts).filter(([t, n]) => n > 1 && REPEATABLE.includes(t));
  H.openDrawer(c.name || 'Müşteri', `<div class="card"><div class="mh-cust"><div><div class="small muted">Telefon</div><b class="num">${esc(phoneFmt(c.phone) || '—')}</b></div><div><div class="small muted">Toplam kayıt</div><b class="num">${c.rows.length}</b></div><div><div class="small muted">Ücretli işlem</div><b class="num">${paid.length}</b></div><div><div class="small muted">Son görüşme</div><b class="num">${dTR(c.last)}</b></div></div>
      <div style="margin-top:12px">${countChips(c.counts)}</div>
      ${rep.length ? `<div class="note warn" style="margin-top:12px">${rep.map(([t, n]) => `<b>${esc(t)}</b> için ${n} kez başvurdu`).join(' · ')}. Yeni işlemde ücret durumunu kontrol edin.</div>` : ''}
      <div style="margin-top:12px"><button class="btn primary" id="cNew">${ic('i-plus')}Bu müşteriye yeni kayıt</button></div></div>
    <div class="card"><h2>Geçmiş</h2><div class="tls">${timeline(c.rows)}</div></div>`);
  $('#cNew').onclick = () => caseForm(null, { customer: c.name, phone: c.phone });
}

/* ---------- Kayıt formu ---------- */
function caseForm(id, preset = {}) {
  const r = id ? M.rows.find((x) => x.id === id) : null, v = r ?? { date: today(), type: '', channel: 'WhatsApp', status: 'Açık', fee: 'Belirlenmedi', ...preset };
  const fld = (fid, label, value, attr = '', cls = '') => `<div class="field ${cls}"><label for="${fid}">${label}</label><input id="${fid}" value="${esc(value ?? '')}" ${attr}></div>`;
  const sel = (fid, label, list, value, all) => `<div class="field"><label for="${fid}">${label}</label><select id="${fid}">${opt(list, value, all)}</select></div>`;
  H.openDrawer(r ? `Kayıt · ${r.customer}` : 'Yeni kayıt', `<form id="mForm" novalidate style="display:contents"><div class="card"><div class="form">
      ${fld('fC', 'Müşteri adı soyadı', v.customer, 'required autocomplete="off"')}${fld('fP', 'Telefon', v.phone, 'inputmode="tel" autocomplete="off" placeholder="05xx xxx xx xx"')}
      <div class="full" id="fHist"></div>
      ${sel('fT', 'Konu', TYPES, v.type, 'Seçin')}${sel('fCh', 'Kanal', CHANNELS, v.channel)}
      ${fld('fPr', 'Ürün (ad ya da kod)', v.product, 'autocomplete="off"', 'full')}
      <div class="field full"><label for="fN">Görüşme notu / mesajlar</label><textarea id="fN" rows="7" placeholder="Müşteriyle konuşulanları yazın ya da WhatsApp mesajlarını buraya yapıştırın" required>${esc(v.note ?? '')}</textarea></div>
      ${sel('fS', 'Durum', STATUS, v.status ?? 'Açık')}${fld('fD', 'Tarih', v.date ?? today(), 'type="date" required')}
      ${sel('fF', 'Ücret', FEES, v.fee ?? 'Belirlenmedi')}${fld('fA', 'Ücret tutarı (₺)', v.feeAmount != null ? Number(v.feeAmount).toLocaleString('tr-TR') : '', 'inputmode="decimal" placeholder="Ücretliyse"')}
      ${r ? `<p class="small muted full">Kayıt no ${esc(r.id)} · ${esc(r.createdBy ?? '')} tarafından ${dTR(r.createdAt)} tarihinde açıldı${r.updatedBy && r.updatedAt !== r.createdAt ? ` · son düzenleyen ${esc(r.updatedBy)} (${dTR(r.updatedAt)})` : ''}</p>` : ''}
    </div></div></form>`);
  const body = $('#drawerBody'), foot = document.createElement('div'); foot.className = 'sheet-foot'; foot.id = 'yFoot';
  foot.innerHTML = `${r ? '<button class="btn ghost left" type="button" id="mDel" style="color:var(--neg)">Sil</button>' : ''}<button class="btn" type="button" data-close>Vazgeç</button><button class="btn primary" type="button" id="mSave">Kaydet</button>`;
  $('#yFoot')?.remove(); body.after(foot);
  const g = (i) => $(i).value.trim();
  const hist = () => {
    const c = findCustomer(g('#fC'), g('#fP')), box = $('#fHist'); if (!box) return;
    const rows = (c?.rows ?? []).filter((x) => x.id !== r?.id); if (!rows.length) { box.innerHTML = g('#fC').length >= 3 || phoneKey(g('#fP')) ? '<div class="note">Bu müşterinin önceki kaydı yok.</div>' : ''; return; }
    const t = g('#fT'), same = t ? rows.filter((x) => x.type === t) : [];
    box.innerHTML = `${same.length && REPEATABLE.includes(t) ? `<div class="note warn"><b>Dikkat:</b> Bu müşteri daha önce <b>${same.length} kez ${esc(t.toLocaleLowerCase('tr-TR'))}</b> için başvurdu (son: ${dTR(same[0].date)}${same[0].fee ? ', ' + esc(same[0].fee.toLocaleLowerCase('tr-TR')) : ''}). Tekrarlayan işlemde ücret çıkabilir.</div>` : ''}
      <details class="mh-prev"${same.length ? ' open' : ''}><summary><b>${esc(c.name)}</b> · ${rows.length} önceki kayıt · ${countChips(rows.reduce((m, x) => ((m[x.type] = (m[x.type] ?? 0) + 1), m), {}))}</summary><div class="tls">${timeline(rows)}</div></details>`;
    if (!g('#fP') && c.phone && !r) $('#fP').placeholder = phoneFmt(c.phone);
  };
  for (const i of ['#fC', '#fP']) $(i).addEventListener('input', hist); $('#fT').addEventListener('change', hist); hist();
  $('#fHist').addEventListener('click', (e) => { if (e.target.closest('[data-cid]')) e.stopPropagation(); }, true); // form açıkken geçmiş satırı başka kaydı açmasın
  const fail = (msg, i) => { $(i)?.focus(); H.toast(msg, 'err'); return false; };
  $('#mSave').onclick = async () => {
    if (g('#fC').length < 2) return fail('Müşteri adını yazın.', '#fC'); if (!g('#fT')) return fail('Konuyu seçin.', '#fT'); if (!g('#fN')) return fail('Görüşme notunu yazın.', '#fN'); if (!/^\d{4}-\d{2}-\d{2}$/.test(g('#fD'))) return fail('Tarihi seçin.', '#fD');
    const c = findCustomer(g('#fC'), g('#fP')), b = $('#mSave'); b.disabled = true; b.textContent = 'Kaydediliyor…';
    try { await DB.save({ id: r?.id, date: g('#fD'), customer: g('#fC').replace(/\s+/g, ' '), phone: g('#fP') || (!r && c?.phone) || null, type: g('#fT'), channel: g('#fCh'), product: g('#fPr') || null, status: g('#fS'), fee: g('#fF'), feeAmount: g('#fF') === 'Ücretli' ? parseNum(g('#fA')) : null, note: g('#fN') }); H.closeDrawer(); route(page); H.toast(r ? 'Kayıt güncellendi' : 'Kayıt eklendi'); }
    catch (e) { b.disabled = false; b.textContent = 'Kaydet'; H.toast('Kaydedilemedi: ' + (e.message || e), 'err'); }
  };
  if (r) $('#mDel').onclick = async () => { if (!confirm(`${r.customer} · ${r.type} (${dTR(r.date)}) kaydı silinsin mi?`)) return; try { await DB.remove(r.id); H.closeDrawer(); route(page); H.toast('Kayıt silindi'); } catch (e) { H.toast('Silinemedi: ' + (e.message || e), 'err'); } };
  $('#mForm').onsubmit = (e) => { e.preventDefault(); $('#mSave').click(); };
  if (!r && !preset.customer) setTimeout(() => $('#fC')?.focus(), 350);
}

/* ---------- Yönlendirme ---------- */
let last = null, page = 'kayitlar';
export function route(name) {
  page = pages[name] ? name : 'kayitlar';
  $$('#navM a[data-m]').forEach((a) => { const on = a.dataset.m === page; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  $$('#tabbarM [data-m]').forEach((a) => a.classList.toggle('on', a.dataset.m === page));
  $('#pageTitle').textContent = TITLES[page][0]; $('#pageSub').textContent = `${TITLES[page][1]}${M.shared && M.at ? ` · ortak tablo, son okuma ${new Date(M.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : ''}`; document.title = `${TITLES[page][0]} · Müşteri Hizmetleri`;
  const view = $('#view'), changed = last !== page, y = scrollY; last = page;
  if (!M.ready) { view.innerHTML = '<div class="card empty"><b>Kayıtlar yükleniyor…</b></div>'; return; }
  pages[page](view);
  if (changed) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); scrollTo(0, 0); } else scrollTo(0, y);
}
export const leave = () => { last = null; };
export async function init(host) {
  H = host;
  const live = () => document.documentElement.dataset.app === 'm';
  DB.subscribe(() => { if (live() && !document.querySelector('#drawer.open')) route(page); });
  document.addEventListener('click', (e) => {
    if (!live()) return;
    if (e.target.closest('[data-reload]')) return void DB.reload();
    const row = e.target.closest('[data-cid]'); if (row) return caseForm(row.dataset.cid);
    const cu = e.target.closest('[data-ck]'); if (cu) return customerCard(cu.dataset.ck);
  });
  document.addEventListener('keydown', (e) => { if (live() && e.key === 'Enter' && e.target.matches?.('[data-cid],[data-ck]')) e.target.click(); });
  $('#tabNewM').onclick = () => caseForm();
  // Başka biri kayıt eklemiş olabilir: sekmeye dönüldüğünde ve belirli aralıkla tablo yeniden okunur
  document.addEventListener('visibilitychange', () => { if (live() && !document.hidden && M.shared && !document.querySelector('#drawer.open')) DB.reload(); });
  setInterval(() => { if (live() && !document.hidden && M.shared && !document.querySelector('#drawer.open')) DB.reload(); }, 90000);
  DB.init(host.user, host.config); // arka planda yüklenir; bitince ekran yenilenir
}

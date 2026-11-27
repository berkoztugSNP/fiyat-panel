// Excel / CSV aktarım sihirbazı: dosya seç → sütunları eşleştir → önizle ve kontrol et → içe aktar.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const low = (s) => String(s ?? '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

export function openImport({ H, xlsx, title, fields, savedMap, saveMap, extra = '', build, commit }) {
  H.openDrawer(title, `<div class="card"><div class="drop" id="iDrop"><b>Excel ya da CSV dosyasını seçin</b>.xlsx, .xls veya .csv · ilk sayfa okunur<div style="margin-top:14px"><label class="btn primary" for="iFile">Dosya seç</label><input id="iFile" type="file" accept=".xlsx,.xls,.csv" hidden></div></div></div><div id="iStep"></div>`);
  document.querySelector('#yFoot')?.remove();
  const drop = $('#iDrop'), step = $('#iStep');
  const read = async (file) => {
    step.innerHTML = '<div class="card"><span class="muted">Dosya okunuyor…</span></div>';
    let headers, data;
    try {
      const X = await xlsx(), wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const grid = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });
      const hi = grid.findIndex((r) => r.filter((c) => c != null && String(c).trim() !== '').length >= 2);
      if (hi < 0) throw new Error('empty');
      headers = grid[hi].map((h, i) => (h == null || String(h).trim() === '' ? `Sütun ${i + 1}` : String(h).trim()));
      data = grid.slice(hi + 1).filter((r) => r.some((c) => c != null && String(c).trim() !== ''));
      if (!data.length) throw new Error('empty');
    } catch (e) { step.innerHTML = `<div class="form-err">${e.message === 'empty' ? 'Dosyada başlık satırı ya da veri bulunamadı.' : 'Dosya okunamadı. Geçerli bir Excel ya da CSV dosyası seçin.'}</div>`; return; }
    drop.innerHTML = `<b>${esc(file.name)}</b>${data.length.toLocaleString('tr-TR')} satır · ${headers.length} sütun`;
    // Otomatik eşleştirme: önce kayıtlı eşleştirme, sonra sütun adı benzerliği
    const guess = (key, syn) => { const saved = savedMap?.[key]; if (saved && headers.includes(saved)) return saved; const hs = headers.map(low); let i = hs.findIndex((h) => syn.some((s) => h === s)); if (i < 0) i = hs.findIndex((h) => syn.some((s) => s.length > 2 && h.includes(s))); return i >= 0 ? headers[i] : ''; };
    const used = new Set();
    const map = Object.fromEntries(fields.map(([k, , , syn]) => { const g = guess(k, syn); const v = g && !used.has(g) ? g : ''; if (v) used.add(v); return [k, v]; }));
    const mapped = () => data.map((r) => Object.fromEntries(fields.map(([k]) => [k, map[k] ? r[headers.indexOf(map[k])] : null])));
    const show = (v) => (v instanceof Date ? v.toLocaleDateString('tr-TR') : v == null ? '' : String(v));
    const draw = () => {
      const rows = mapped().slice(0, 5), cols = fields.filter(([k]) => map[k]);
      step.innerHTML = `<div class="card"><h3>Sütunları eşleştirin</h3><p class="muted small" style="margin:2px 0 14px">Soldaki alan, dosyanızdaki hangi sütundan okunacak? Eşleştirme kaydedilir; sonraki yüklemede hazır gelir.</p>
          <div class="map">${fields.map(([k, label, req]) => `<label for="m_${k}">${esc(label)}${req ? ' <small>zorunlu</small>' : ''}</label><select id="m_${k}" data-k="${k}"><option value="">${req ? 'Seçin' : 'Yok'}</option>${headers.map((h) => `<option${map[k] === h ? ' selected' : ''}>${esc(h)}</option>`).join('')}</select>`).join('')}</div>
          ${extra ? `<div style="margin-top:var(--s4)">${extra}</div>` : ''}</div>
        <div class="card"><h3>Önizleme</h3><p class="muted small" style="margin:2px 0 10px">İlk ${rows.length} satır, eşleştirdiğiniz haliyle</p>${cols.length ? `<div class="tbl-wrap"><table><thead><tr>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map(([k]) => `<td>${esc(show(r[k]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">Henüz sütun eşleştirilmedi.</div>'}</div>
        <div id="iResult"></div>
        <div class="bar"><span class="grow"></span><button class="btn primary" id="iCheck">Kontrol et</button></div>`;
      step.querySelectorAll('select[data-k]').forEach((s) => (s.onchange = () => { map[s.dataset.k] = s.value; draw(); }));
      $('#iCheck').onclick = () => {
        const missing = fields.filter(([k, , req]) => req && !map[k]);
        if (missing.length) { H.toast(`Zorunlu alanı eşleştirin: ${missing.map((f) => f[1]).join(', ')}`, 'err'); $('#m_' + missing[0][0])?.focus(); return; }
        const res = build(mapped());
        $('#iResult').innerHTML = `<div class="card"><h3>Kontrol sonucu</h3><p style="margin:6px 0"><b>${esc(res.summary)}</b></p><p class="muted small">${esc(res.note ?? '')}</p>
          ${res.errors.length ? `<div class="note warn" style="margin-top:10px"><b>${res.errors.length} satır atlanacak:</b><br>${res.errors.slice(0, 6).map(esc).join('<br>')}${res.errors.length > 6 ? `<br>… ve ${res.errors.length - 6} satır daha` : ''}</div>` : ''}
          <div class="bar" style="margin-top:var(--s4)"><button class="btn primary" id="iGo"${res.records.length ? '' : ' disabled'}>${res.records.length ? `${res.records.length} kaydı içe aktar` : 'Aktarılacak değişiklik yok'}</button></div></div>`;
        $('#iResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const go = $('#iGo'); if (go) go.onclick = async () => { go.disabled = true; go.classList.add('busy'); try { await saveMap({ ...map }); await commit(res.records); H.closeDrawer(); H.toast(`${res.records.length} kayıt içe aktarıldı`); H.afterImport?.(); } catch (e) { console.error(e); go.disabled = false; go.classList.remove('busy'); H.toast('İçe aktarılamadı. Tekrar deneyin.', 'err'); } };
      };
    };
    draw();
  };
  $('#iFile').onchange = (e) => e.target.files[0] && read(e.target.files[0]);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) read(f); };
}

// ══ FEEDBACK API ══
// Відповідальність: зберегти зміни локально + відправити на Formspree.
// Не знає про DOM. Спілкується з іншими модулями через bus.

import { STORAGE_KEYS, Storage }    from '../../core/storage.js';
import { state as appState }        from '../../core/state.js';
import { bus }                      from '../../core/eventBus.js';
import { isDevMode, appendDevLog }  from '../devmode.js';
import {
  saveLocalEdit, getLocalEdits, clearAllLocalEdits,
  invalidateLocalEditsCache, applyLocalEdits, saveExitLabel,
} from '../../data/localEdits.js';
import { fbState, resetFbState }    from './fbState.js';
import { extractFinalValues, buildChangeText } from './fbUtils.js';

const FORMSPREE_URL = 'https://formspree.io/f/xrejbjww';
let _isSubmitting   = false;

/**
 * Зберігає label-зміни з DOM у Storage.
 * Викликається з fbEvents під час submit — єдина точка запису.
 * @returns {string[]} рядки для Formspree
 */
export function flushLabelChanges(slug) {
  const s = appState.stationsData?.[slug];
  const changes = [];
  document.querySelectorAll('.fb-exit-label-input').forEach(inp => {
    if (inp.dataset.changed !== 'true') return;
    const idx = inp.id.replace('fbLabelInput', '');
    const p   = s?.positions?.[idx];
    const loc = [p?.dir, p?.exit].filter(Boolean).join(' · ');
    saveExitLabel(slug, parseInt(idx), inp.value);
    changes.push(`${loc}: НОВИЙ ОПИС [${inp.value}]`);
    inp.dataset.changed = 'false';
  });
  return changes;
}

export async function submitFeedback(background = false) {
  if (_isSubmitting) return;
  _isSubmitting = true;

  const slug = fbState.slug;
  if (!slug) { _isSubmitting = false; return; }

  const s = appState.stationsData[slug];

  // ── Збираємо зміни позицій ──────────────────────────────
  const posChanges = [];
  s.positions?.forEach((p, i) => {
    const orig = fbState.original[i];
    const cur  = fbState.current[i];
    if (!orig || !cur) return;
    if (cur.isClosed && !orig.isClosed) { posChanges.push({ i, p, closed: true }); return; }
    const vals     = extractFinalValues(cur);
    const origVals = extractFinalValues(orig);
    if (!vals || !origVals) return;
    if (vals.finalW !== origVals.finalW || vals.finalD !== origVals.finalD) {
      posChanges.push({ i, p, nw: vals.finalW, nd: vals.finalD });
    }
  });

  const newExits = Object.keys(fbState.current)
    .filter(idx => fbState.current[idx].isNew)
    .map(idx => {
      const st   = fbState.current[idx];
      const vals = extractFinalValues(st);
      return vals ? { idx, st, vals } : null;
    }).filter(Boolean);

  const labelChanges = flushLabelChanges(slug);

  // ── Нічого не змінилось ─────────────────────────────────
  if (!posChanges.length && !newExits.length && !labelChanges.length) {
    _isSubmitting = false;
    bus.emit('feedback:submitted', { slug, hasChanges: false, background });
    return;
  }

  // ── Зберігаємо локально ─────────────────────────────────
  posChanges.forEach(c => saveLocalEdit(slug, c.i,
    c.closed ? { wagon: c.p.wagon, doors: c.p.doors, closed: true }
             : { wagon: c.nw,      doors: c.nd }
  ));
  newExits.forEach(({ idx, st, vals }) =>
    saveLocalEdit(slug, idx, {
      wagon: vals.finalW, doors: vals.finalD,
      dir: st.dir, label: fbState.labels[idx], isNew: true,
    })
  );

  // ── Dev log ─────────────────────────────────────────────
  if (isDevMode()) {
    posChanges.forEach(c => {
      const base = { station: s.name, slug, dir: c.p.dir || '—', exit: c.p.exit || '—', posIdx: c.i };
      if (c.closed) appendDevLog({ ...base, field: 'closed', from: 'відкритий', to: 'закритий' });
      else {
        if (String(c.nw) !== String(c.p.wagon)) appendDevLog({ ...base, field: 'wagon', from: c.p.wagon, to: c.nw });
        if (String(c.nd) !== String(c.p.doors)) appendDevLog({ ...base, field: 'doors', from: c.p.doors, to: c.nd });
      }
    });
    newExits.forEach(({ idx, st, vals }) =>
      appendDevLog({ station: s.name, slug, dir: st.dir || '—', exit: fbState.labels[idx] || '—', posIdx: idx, field: 'new_exit', from: null, to: `вагон ${vals.finalW}, двері ${vals.finalD}` })
    );
  }

  // ── Застосовуємо локально та повідомляємо шини ──────────
  invalidateLocalEditsCache();
  applyLocalEdits(appState.stationsData);
  resetFbState();                               // ← стан чистий ДО emit
  bus.emit('feedback:submitted', { slug, hasChanges: true, background });
  bus.emit('station:refresh');

  // ── Відправка на Formspree ───────────────────────────────
  if (Storage.get(STORAGE_KEYS.LOCAL_ONLY_FEEDBACK) === 'true') {
    _isSubmitting = false;
    bus.emit('feedback:submit-ui', { status: 'local-only', background });
    return;
  }

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 8000);

  // Блокуємо кнопку та очищаємо попередній результат на час відправки
  if (!background) {
    const sendBtn  = document.getElementById('fbSend');
    const resultEl = document.getElementById('fbResult');
    if (sendBtn)  { sendBtn.disabled = true; sendBtn.textContent = 'Відправка…'; }
    if (resultEl)   resultEl.innerHTML = '';
  }

  try {
    const formspreeLines = [
      ...posChanges.map(c => buildChangeText(c.p, c.nw ?? c.p.wagon, c.nd ?? c.p.doors, !!c.closed)),
      ...newExits.map(({ st, vals }) => `${st.dir}: НОВИЙ ВИХІД (вагон ${vals.finalW}, двері ${vals.finalD})`),
      ...labelChanges,
    ];

    const response = await fetch(FORMSPREE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ station: s.name, changes: formspreeLines.join('\n') }),
      signal:  controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    bus.emit('feedback:submit-ui', { status: 'success', background });

  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[KyivMetroGO] Formspree недоступний, зміни збережено локально:', error);
    bus.emit('feedback:submit-ui', { status: 'network-error', background });

  } finally {
    _isSubmitting = false;
  }
}
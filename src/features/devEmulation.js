// ══ ЕМУЛЯЦІЯ СТАНІВ (РЕЖИМ РОЗРОБНИКА) ══
// Примусово вмикає стан застосунку, щоб його побачити: перший запуск, людина
// без даних, подана пошта, донат, офлайн, підставний час, підказка тощо.
//
// Стани користувача підставляють інші дані замість справжніх. Перед першою
// такою зміною зберігаємо знімок усіх даних людини (ключі не metro_dev_*);
// Кнопки-іконки на смужці вгорі: «Перезапустити» — той самий стан наново
// (напр. тур з початку), «Повернути» — відновити знімок і перезапуститись,
// «Інша емуляція» — список емуляцій у меню розробника.
// Поки емуляція активна, режим розробника вимкнено (devFlags.isDevMode).
// Нотатки розробника (metro_dev_*) емуляція не чіпає, тож їх синхронізація
// працює як завжди.
//
// Одноразові події (тости, банер, відповіді форм) нічого не зберігають.
// Відповіді форм підставляються замість запиту до Formspree.

import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { state }                 from '../core/state.js';
import { bus }                   from '../core/eventBus.js';
import { LINE_COLOR }            from '../core/constants.js';
import { getClockOverride, appNow } from '../core/clock.js';
import { showToast }             from '../ui/toast.js';
import { traversePositions, positionId } from '../data/positions.js';
import { saveExitLabel }         from '../data/localEdits.js';
import { getFavs, toggleFav, toggleExitFav } from '../domain/favorites.js';
import { toggleCheckin }         from '../domain/checkin.js';
import { addBetaSignup } from '../domain/support.js';
import { forceHint, hintApplies, setAllHintsDone } from './hints.js';
import { isDevMode }             from './devFlags.js';

const K = STORAGE_KEYS;

// Дані людини — усе, крім ключів режиму розробника
const USER_KEYS = Object.values(K).filter(k => !k.startsWith('metro_dev_'));

// Налаштування (для «Налаштування за замовчуванням»)
const PREF_KEYS = [
  K.THEME, K.EDIT_MODE, K.START_ON_FAV, K.HIDE_INFO_BLOCKS, K.LOCAL_ONLY_FEEDBACK,
  K.HIDE_NO_LIFT, K.SHOW_MAP_ACCESSIBILITY, K.MAP_ACCESSIBILITY, K.SHOW_INTERVALS,
  K.SHOW_STATION_HOURS, K.REDUCE_MOTION, K.SHOW_GROUND_TRANSPORT, K.CHECKIN_MODE,
  K.CHECKIN_BY_STATION, K.CHECKIN_BY_EXIT, K.CHECKIN_HATCH,
];

const DAY = 86400000;

// keep — які ключі лишити як є ('all' — усі); set — що записати; seed — що
// додати після перезапуску, коли дані станцій уже завантажені.
const PROFILES = {
  first:    { label: 'Перший запуск',                keep: [] },
  empty:    { label: 'Без даних',                    keep: [K.THEME], set: { [K.TOUR_DONE]: 'done' } },
  active:   { label: 'Активний користувач',          keep: [K.THEME], set: { [K.TOUR_DONE]: 'done' }, seed: 'demo' },
  expert:   { label: 'Досвідчений',                  keep: [K.THEME], set: { [K.TOUR_DONE]: 'done' }, seed: 'demo', hintsDone: true },
  startFav: { label: 'Запуск з Вибраного',           keep: [K.THEME], set: { [K.TOUR_DONE]: 'done', [K.START_ON_FAV]: 'true' }, seed: 'demo' },
  defaults: { label: 'Налаштування за замовчуванням', keep: USER_KEYS.filter(k => !PREF_KEYS.includes(k)) },
  signup:   { label: 'Gmail уже подано',             keep: 'all', seed: 'signup' },
};

const DEMO_FAVS   = ['R.Teatralna', 'B.Kontraktova_ploshcha', 'G.Zoloti_vorota', 'B.Olimpiiska'];
const DEMO_LABELS = ['до роботи', 'до театру', 'до кави'];
const DEMO_EMAIL  = 'test.kyivmetrogo@gmail.com';

const _session = { offline: false, formOnce: null };

// ══ ВХІД З МЕНЮ РОЗРОБНИКА ══

/** @param {string} action — data-emu кнопки, напр. 'profile:first', 'clock:04:50:3' */
export async function runEmulation(action, { custom } = {}) {
  const [kind, ...rest] = action.split(':');
  const arg = rest.join(':');
  switch (kind) {
    case 'profile':   return _applyProfile(arg);
    case 'favStreak': return _favStreak();
    case 'slowData':  return _reloadWithFlag('slowData', 'Дані завантажувались 8 с');
    case 'badData':   return _reloadWithFlag('badData', null);
    case 'beta':      return _betaForm(arg);
    case 'donate':    return _donate();
    case 'thanks':    location.href = './thanks.html'; return;
    case 'bug':       return _bugForm(arg);
    case 'edit':      return _stationEdit(arg);
    case 'offline':   return _toggleOffline();
    case 'toast':     return _toast(arg);
    case 'writeFail': { const { showWriteFailToast } = await import('../app.js'); showWriteFailToast(); return; }
    case 'clock':     return _setClock(arg, custom);
    case 'hint':      return _hint(arg);
    case 'tour':      return _tour(arg);
  }
}

/** Викликається з main.js після завантаження даних, якщо є активна емуляція. */
export function onStartup() {
  const p = _profile();
  if (p && !p.seeded) {
    _seed(PROFILES[p.id]?.seed);
    Storage.set(K.DEV_EMU_PROFILE, JSON.stringify({ ...p, seeded: true }));
  }
  let note = null;
  try { note = sessionStorage.getItem('metro_emu_note'); sessionStorage.removeItem('metro_emu_note'); } catch { /* немає sessionStorage */ }
  if (note === 'badData') note = state.stationsFallbackUsed ? 'Дані пошкоджено — взято запасну копію' : 'Запасна копія не знадобилась';
  if (note) setTimeout(() => showToast(note), 600);
  _renderBanner();
}

// ══ ЗНІМОК І ПОВЕРНЕННЯ ══

function _ensureSnapshot() {
  if (Storage.get(K.DEV_EMU_SNAPSHOT)) return;
  const snap = {};
  USER_KEYS.forEach(k => { const v = Storage.get(k); if (v != null) snap[k] = v; });
  Storage.set(K.DEV_EMU_SNAPSHOT, JSON.stringify(snap));
}

async function _restore() {
  let snap = null;
  try { snap = JSON.parse(Storage.get(K.DEV_EMU_SNAPSHOT) || 'null'); } catch { /* зіпсований знімок — лишаємо дані як є */ }
  if (snap) USER_KEYS.forEach(k => (snap[k] != null ? Storage.set(k, snap[k]) : Storage.remove(k)));
  [K.DEV_EMU_SNAPSHOT, K.DEV_EMU_PROFILE, K.DEV_EMU_CLOCK].forEach(k => Storage.remove(k));
  await Storage.flush();
  location.reload();
}

/** Той самий стан наново (напр. тур з початку). */
async function _restart() {
  const p = _profile();
  if (p) await _applyProfile(p.id);
  else location.reload();
}

/** Список емуляцій, щоб обрати іншу: меню розробника на розділі «Емуляція». */
async function _openList() {
  const { openDevMenuSheet } = await import('../sheets/devMenuSheet.js');
  openDevMenuSheet({ section: 'emulation' });
}

function _profile() {
  try { return JSON.parse(Storage.get(K.DEV_EMU_PROFILE) || 'null'); } catch { return null; }
}

// ══ СТАНИ КОРИСТУВАЧА ══

async function _applyProfile(id) {
  const p = PROFILES[id];
  if (!p) return;
  _ensureSnapshot();
  // Кожен стан будуємо з ваших даних, а не поверх попередньої емуляції
  let snap = null;
  try { snap = JSON.parse(Storage.get(K.DEV_EMU_SNAPSHOT) || 'null'); } catch { /* без знімка — поверх поточних даних */ }
  if (snap) USER_KEYS.forEach(k => (snap[k] != null ? Storage.set(k, snap[k]) : Storage.remove(k)));
  if (p.keep !== 'all') USER_KEYS.filter(k => !p.keep.includes(k)).forEach(k => Storage.remove(k));
  Object.entries(p.set || {}).forEach(([k, v]) => Storage.set(k, v));
  if (p.hintsDone) setAllHintsDone(true);
  Storage.set(K.DEV_EMU_PROFILE, JSON.stringify({ id, seeded: !p.seed }));
  try { sessionStorage.setItem('metro_emu_note', `Емуляція: ${p.label}`); } catch { /* без повідомлення */ }
  await Storage.flush();
  location.reload();
}

function _seed(kind) {
  const now = Date.now();
  if (kind === 'signup')  addBetaSignup(DEMO_EMAIL, now - 3 * DAY);
  if (kind !== 'demo') return;

  const data = state.stationsData || {};
  const first = slug => {
    let found = null;
    traversePositions(data[slug], ctx => { if (!found && positionId(ctx.position)) found = ctx; });
    return found;
  };

  DEMO_FAVS.filter(slug => data[slug] && !getFavs().includes(slug)).forEach(toggleFav);
  DEMO_FAVS.slice(0, DEMO_LABELS.length).forEach((slug, i) => {
    const ctx = first(slug);
    if (!ctx) return;
    toggleExitFav(slug, positionId(ctx.position));
    saveExitLabel(slug, ctx.posIdx, DEMO_LABELS[i]);
  });

  // Check-in на кожній п'ятій станції — по кілька на кожній лінії
  Object.values(data).filter((_, i) => i % 5 === 0).slice(0, 10).forEach(s => {
    const ctx = first(s.slug);
    if (ctx) toggleCheckin(s.slug, positionId(ctx.position), LINE_COLOR[s.line]);
  });
  bus.emit('fav:updated');
}

async function _favStreak() {
  if (!getFavs().length) { showToast('Спершу оберіть «Активний користувач» або додайте станцію у Вибране'); return; }
  _ensureSnapshot();
  Storage.set(K.FAV_ONLY_STREAK, '4');  // наступне відкриття — п'яте
  Storage.remove(K.START_ON_FAV);
  Storage.remove(K.HIDE_INFO_BLOCKS);
  try { // підказку могли вже змахнути — показуємо знову
    const done = JSON.parse(Storage.get(K.HINTS_DONE) || '[]').filter(id => id !== 'favOnly');
    Storage.set(K.HINTS_DONE, JSON.stringify(done));
  } catch { Storage.remove(K.HINTS_DONE); }
  _renderBanner();
  const { openFavSheet } = await import('./favorites/index.js');
  openFavSheet();
}

async function _reloadWithFlag(flag, note) {
  try {
    sessionStorage.setItem(`metro_emu_${flag}`, '1');
    sessionStorage.setItem('metro_emu_note', note ?? flag);
  } catch { showToast('sessionStorage недоступний'); return; }
  await Storage.flush();
  location.reload();
}

// ══ ФОРМИ Й ДОНАТ ══

// Підставна відповідь Formspree: одна, для наступного запиту
const _realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  if (_session.offline) return Promise.reject(new TypeError('Failed to fetch (емуляція: без інтернету)'));
  const url = typeof input === 'string' ? input : input?.url || '';
  if (_session.formOnce && url.includes('formspree.io')) {
    const mode = _session.formOnce;
    _session.formOnce = null;
    return _fakeResponse(mode, init?.signal);
  }
  return _realFetch(input, init);
};

function _fakeResponse(mode, signal) {
  return new Promise((resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    if (mode === 'timeout') return; // чекаємо, поки форма сама перерве запит
    setTimeout(() => resolve(new Response(mode === 'ok' ? '{"ok":true}' : '{"error":"emulated"}', {
      status: mode === 'ok' ? 200 : 500, headers: { 'Content-Type': 'application/json' },
    })), 700);
  });
}

async function _openAbout() {
  const { openAboutSheet } = await import('../sheets/aboutSheet.js');
  openAboutSheet();
  await new Promise(r => setTimeout(r, 450));
  return document.getElementById('aboutSheet');
}

async function _betaForm(mode) {
  if (mode === 'ok') _ensureSnapshot(); // подана адреса запамʼятається — «Повернути» її прибере
  const sheet = await _openAbout();
  const form  = sheet?.querySelector('#aboutBetaForm');
  const input = sheet?.querySelector('.about-beta-input');
  if (!form || !input) return;
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  input.value = DEMO_EMAIL.replace('@gmail.com', '');
  _session.formOnce = mode;
  _renderBanner();
  form.requestSubmit();
}

async function _donate() {
  const sheet = await _openAbout();
  const mono  = sheet?.querySelector('.about-donate-btn-mono');
  if (!mono) return;
  mono.scrollIntoView({ behavior: 'smooth', block: 'center' });
  mono.addEventListener('click', e => e.preventDefault(), { once: true, capture: true }); // без переходу в банку
  mono.click();
  const { showDonateAsk } = await import('../sheets/aboutSheet.js');
  setTimeout(showDonateAsk, 1500); // наче людина повернулась з банки
}

async function _bugForm(mode) {
  const sheet = await _openAbout();
  const $ = sel => sheet?.querySelector(sel);
  const toggle = $('#bugToggleBtn'), wrap = $('#bugFormWrap'), text = $('#bugTextarea');
  const submit = $('#bugSubmitBtn'), msg = $('#bugResultMsg');
  if (!toggle || !wrap || !text || !submit) return;
  // Після успішного надсилання форма лишається згорнутою — розгортаємо знову
  toggle.hidden = true;
  wrap.hidden = false;
  text.hidden = false;
  submit.parentElement.hidden = false;
  submit.disabled = false;
  submit.textContent = 'Надіслати';
  if (msg) { msg.textContent = ''; msg.removeAttribute('style'); }
  text.value = 'Перевірка емуляції';
  wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  _session.formOnce = mode;
  setTimeout(() => submit.click(), 400);
}

function _stationEdit(status) {
  const slug = state.currentStationSlug || DEMO_FAVS[0];
  bus.emit('sheet:open-feedback');
  setTimeout(() => {
    document.querySelector(`.fb-station-item[data-slug="${slug}"]`)?.click();
    setTimeout(() => {
      bus.emit('feedback:submit-ui', { status: 'sending' });
      setTimeout(() => bus.emit('feedback:submit-ui', { status }), 700);
    }, 500);
  }, 300);
}

// ══ МЕРЕЖА Й ОНОВЛЕННЯ ══

function _toggleOffline() {
  _session.offline = !_session.offline;
  if (_session.offline) Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  else delete navigator.onLine;
  window.dispatchEvent(new Event(_session.offline ? 'offline' : 'online'));
  _renderBanner();
}

async function _toast(kind) {
  if (kind === 'version') {
    const { showUpdateToast } = await import('../infra/swUpdate.js');
    showUpdateToast();
  } else if (kind === 'data') {
    const d = new Date();
    const version = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    bus.emit('stations:updated', { version });
  }
}

// ══ ГОДИННИК ══

const DAYS = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function _setClock(arg, custom) {
  if (arg === 'off') {
    Storage.remove(K.DEV_EMU_CLOCK);
  } else {
    let target;
    if (arg === 'custom') {
      target = custom ? new Date(custom) : null;
      if (!target || isNaN(target)) { showToast('Вкажіть дату й час'); return; }
    } else {
      const [h, m, day] = arg.split(':').map(Number);
      target = new Date();
      target.setHours(h, m, 0, 0);
      while (target.getDay() !== day) target.setDate(target.getDate() + 1);
    }
    Storage.set(K.DEV_EMU_CLOCK, JSON.stringify({ target: target.getTime(), setAt: Date.now() }));
  }
  bus.emit('station:refresh');
  _renderBanner();
  showToast(arg === 'off' ? 'Справжній час' : `Годинник: ${_clockLabel()}`);
}

function _clockLabel() {
  if (!getClockOverride()) return '';
  const d = appNow();
  return `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ══ ПІДКАЗКИ Й ТУР ══

function _hint(id) {
  if (id === 'reset') {
    setAllHintsDone(false);
    bus.emit('station:refresh');
    showToast('Підказки знову не використані');
    return;
  }
  const data = state.stationsData || {};
  const cur  = data[state.currentStationSlug];
  const slug = hintApplies(id, cur) ? cur.slug : Object.values(data).find(s => hintApplies(id, s))?.slug;
  if (!slug) { showToast(id === 'checkin' ? 'Увімкніть Check-in у налаштуваннях' : 'Немає станції для цієї підказки'); return; }
  forceHint(id);
  const open = document.getElementById('stationSheet')?.classList.contains('sheet-open');
  bus.emit(open && slug === state.currentStationSlug ? 'station:refresh' : 'station:open', { slug });
}

async function _tour(from) {
  if (from === 'done') {
    Storage.set(K.TOUR_DONE, 'done');
    showToast('Тур позначено пройденим');
    return;
  }
  const { startTour } = await import('./tour.js');
  startTour(from === 'map' ? undefined : from);
}

// ══ СМУЖКА ВГОРІ ══

let _bannerTimer = 0;

const _bannerBtn = (act, label, paths) =>
  `<button type="button" class="emu-banner-btn" data-act="${act}" aria-label="${label}" title="${label}">` +
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg></button>`;

function _renderBanner() {
  const parts = [];
  const p = _profile();
  if (p) parts.push(PROFILES[p.id]?.label || p.id);
  else if (Storage.get(K.DEV_EMU_SNAPSHOT)) parts.push('дані змінено');
  if (getClockOverride()) parts.push(_clockLabel());
  if (_session.offline) parts.push('без інтернету');

  let el = document.getElementById('emuBanner');
  clearInterval(_bannerTimer);
  // Під час емуляції — без кнопок розробника, лише ця смужка
  document.getElementById('devMenuBtn')?.classList.toggle('is-hidden', !!parts.length || !isDevMode());
  if (!parts.length) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'emuBanner';
    el.className = 'emu-banner';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="emu-banner-text"></span>' +
      _bannerBtn('restart', 'Перезапустити', '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>') +
      _bannerBtn('restore', 'Повернути ваші дані', '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>') +
      _bannerBtn('list', 'Інша емуляція', '<path d="M4 6h16M4 12h16M4 18h16"/>');
    el.querySelector('[data-act="restart"]').addEventListener('click', _restart);
    el.querySelector('[data-act="restore"]').addEventListener('click', _restore);
    el.querySelector('[data-act="list"]').addEventListener('click', _openList);
    document.body.appendChild(el);
  }
  el.querySelector('.emu-banner-text').textContent = parts.join(' · ');
  if (getClockOverride()) _bannerTimer = setInterval(_renderBanner, 30000);
}

// ══ FEATURE: ПОТОЧНЕ МІСЦЕЗНАХОДЖЕННЯ В ПОШУКУ ══
// Кнопка-стрілка в полі пошуку (вмикається в налаштуваннях, типово вимкнена):
// бере геолокацію і підставляє в поле найближчу адресу — далі звичайний пошук
// за адресою показує найближчі станції.
// Адресу шукаємо на телефоні: координати будинків — public/addresses-geo.json
// (scripts/build-addresses-geo.py), місце нікуди не надсилається. Файл
// вантажиться при першому натисканні (або коли відкрили пошук з увімкненою
// кнопкою), далі його тримає service worker.
//
// Публічне API:
//   isLocateEnabled()          → boolean (налаштування або емуляція)
//   prefetchAddressGeo()       → void
//   locateToSearch(input, btn) → Promise<void>
//   setLocateEmulation(kind)   → void   (меню розробника)

import { getPref } from '../core/prefs.js';
import { showToast } from '../ui/toast.js';
import { isDevMode } from './devFlags.js';

// Як xy() у scripts/build-addresses.py
const LAT0 = 50.45;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = 111320 * Math.cos(LAT0 * Math.PI / 180);

const KHRESHCHATYK = { lat: 50.4473, lon: 30.5225 };
const WALK_KMH = 4.5;

const NEAR_M     = 300;      // далі за це — «поруч немає адрес»
const CITY_M     = 1200;     // далі за це від будь-якого будинку — ви поза Києвом (Бровари, Вишневе ~2 км)
const FAR_KM     = 100;      // далі за це від Хрещатика — жарт про Перу

const MSG = {
  denied:      'Геолокацію вимкнено. Знайти вас зараз складніше, ніж Львівську браму',
  unavailable: 'Не вдається визначити місце. Ви, бува, не в тунелі?',
  outside:     'Схоже, ви поза Києвом',
  noAddress:   'Поруч немає адрес',
  noData:      'Не вдалося завантажити адреси. Перевірте інтернет',
};

const TOAST_MS = 4000;

// Підставні місця для меню розробника: діють на одне натискання стрілки
const EMU_KEY = 'metro_emu_location';
const EMU = {
  khreshchatyk: { lat: 50.4477, lon: 30.5222 },
  peru:         { lat: -12.0464, lon: -77.0428 },   // Ліма
  ocean:        { lat: 30, lon: -40 },              // Атлантика
  brovary:      { lat: 50.5113, lon: 30.7905 },
  trukhaniv:    { lat: 50.4630, lon: 30.5440 },     // Труханів острів
  denied:       { error: 1 },
  unavailable:  { error: 2 },
};

let _geo     = null;     // { streets, xs: Int32Array, ys, si: Int32Array, house: string[] }
let _loading = null;

function _url() {
  const { origin, pathname } = window.location;
  const dir = pathname.endsWith('/') ? pathname : pathname.slice(0, pathname.lastIndexOf('/') + 1);
  return new URL('addresses-geo.json', origin + dir);
}

function _loadGeo() {
  if (_geo) return Promise.resolve(_geo);
  if (!_loading) {
    _loading = fetch(_url())
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (json?.schema !== 1 || !json.points) throw new Error('addresses-geo');
        const rows = json.points.split('|');
        const xs = new Int32Array(rows.length);
        const ys = new Int32Array(rows.length);
        const si = new Int32Array(rows.length);
        const house = new Array(rows.length);
        let x = 0;
        rows.forEach((row, i) => {
          const [s, h, dx, y] = row.split(' ');
          x += +dx;
          xs[i] = x; ys[i] = +y; si[i] = +s; house[i] = h;
        });
        _geo = { streets: json.streets, xs, ys, si, house };
        return _geo;
      })
      .catch(err => { _loading = null; throw err; });
  }
  return _loading;
}

/** Кнопка показана: увімкнено в налаштуваннях або йде емуляція місця. */
export function isLocateEnabled() {
  return getPref('locateInSearch') || !!_emulation();
}

/** Завантажити координати заздалегідь (щоб кнопка працювала й офлайн). */
export function prefetchAddressGeo() {
  _loadGeo().catch(() => { /* спробуємо при натисканні */ });
}

/** Меню розробника: підставне місце для кнопки ('' — справжнє). */
export function setLocateEmulation(kind) {
  try {
    if (kind && EMU[kind]) sessionStorage.setItem(EMU_KEY, kind);
    else sessionStorage.removeItem(EMU_KEY);
  } catch { /* без sessionStorage емуляції немає */ }
}

function _emulation() {
  try { return EMU[sessionStorage.getItem(EMU_KEY)] || null; } catch { return null; }
}

function _position() {
  const emu = _emulation();
  if (emu) {
    setLocateEmulation('');
    return new Promise((resolve, reject) => setTimeout(() =>
      (emu.error ? reject({ code: emu.error }) : resolve({ lat: emu.lat, lon: emu.lon })), 400));
  }
  if (!navigator.geolocation) return Promise.reject({ code: 2 });
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

function _haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function _plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «Схоже, ви трохи не в Києві: до Хрещатика 11 230 км, пішки 104 дні» */
export function farMessage(km) {
  const kmText = Math.round(km).toLocaleString('uk-UA').replace(/\s/g, '\u00a0');
  const hours = km / WALK_KMH;
  const walk = hours < 48
    ? `${Math.round(hours)}\u00a0год`
    : (d => `${d}\u00a0${_plural(d, 'день', 'дні', 'днів')}`)(Math.round(hours / 24));
  return `Схоже, ви трохи не в Києві: до Хрещатика ${kmText}\u00a0км, пішки ${walk}`;
}

function _nearest(geo, x, y) {
  const { xs, ys } = geo;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - x;
    if (dx * dx >= bestD) continue;
    const d = dx * dx + (ys[i] - y) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return { i: best, m: Math.sqrt(bestD) };
}

/**
 * Натискання на кнопку: геолокація → найближча адреса в поле пошуку.
 * @param {HTMLInputElement}  input
 * @param {HTMLButtonElement} btn
 */
export async function locateToSearch(input, btn) {
  if (btn.classList.contains('is-busy')) return;
  btn.classList.add('is-busy');
  const geoPromise = _loadGeo().catch(() => null);
  try {
    let pos;
    try {
      pos = await _position();
    } catch (err) {
      const text = err?.code === 1 ? MSG.denied : MSG.unavailable;
      // Розробнику — що саме відповів телефон, щоб відрізнити заборону від збою
      const detail = isDevMode() && err?.message ? ` (код ${err.code}: ${err.message})` : '';
      showToast(text + detail, TOAST_MS);
      return;
    }
    const km = _haversineKm(pos, KHRESHCHATYK);
    if (km > FAR_KM) { showToast(farMessage(km), TOAST_MS); return; }

    const geo = await geoPromise;
    if (!geo) { showToast(MSG.noData, TOAST_MS); return; }
    const { i, m } = _nearest(geo,
      (pos.lon - 30.5) * M_PER_DEG_LON, (pos.lat - LAT0) * M_PER_DEG_LAT);
    if (i < 0 || m > CITY_M) { showToast(MSG.outside, TOAST_MS); return; }
    if (m > NEAR_M) { showToast(MSG.noAddress, TOAST_MS); return; }

    input.value = `${geo.streets[geo.si[i]]} ${geo.house[i]}`;
    input.dispatchEvent(new Event('input'));
  } finally {
    btn.classList.remove('is-busy');
  }
}

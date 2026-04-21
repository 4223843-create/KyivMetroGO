window.MetroApp = window.MetroApp || {};

/* ══ ГЛОБАЛЬНИЙ СЛОВНИК ІКОНОК (SVG) ══ */
MetroApp.Icons = {
  pencil: `<svg aria-hidden="true" focusable="false" viewBox="-80 -80 672 672" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M70.2,337.4l104.4,104.4L441.5,175L337,70.5L70.2,337.4z M0.6,499.8c-2.3,9.3,2.3,13.9,11.6,11.6L151.4,465L47,360.6 L0.6,499.8z M487.9,24.1c-46.3-46.4-92.8-11.6-92.8-11.6c-7.6,5.8-34.8,34.8-34.8,34.8l104.4,104.4c0,0,28.9-27.2,34.8-34.8 C499.5,116.9,534.3,70.6,487.9,24.1z"/></svg>`,
  undo: `<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
  info: `<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 42" fill="currentColor"><path d="m312.043 291.275-2.063 8.438q-9.28 3.656-14.812 5.53-5.531 1.97-12.844 1.97-11.25 0-17.531-5.438-6.188-5.531-6.188-13.969 0-3.28.47-6.656.468-3.469 1.5-7.781l7.687-27.375q1.031-3.938 1.687-7.406.75-3.563.75-6.47 0-5.25-2.156-7.312t-8.25-2.062q-3 0-6.188.937-3.093.938-5.343 1.782l2.062-8.438q7.594-3.094 14.531-5.25 6.938-2.25 13.125-2.25 11.157 0 17.157 5.438 6.093 5.343 6.093 13.968 0 1.782-.468 6.282-.375 4.5-1.5 8.25l-7.688 27.28q-.937 3.282-1.687 7.5-.75 4.22-.75 6.376 0 5.437 2.437 7.406 2.438 1.969 8.438 1.969 2.812 0 6.375-.938 3.562-1.03 5.156-1.78m1.969-114.469q0 7.125-5.438 12.188-5.344 4.969-12.937 4.969-7.594 0-13.032-4.97-5.437-5.062-5.437-12.187t5.437-12.187 13.032-5.063 12.937 5.063q5.438 5.062 5.438 12.187" transform="translate(-65.818 -42.216)scale(.26458)"/></svg>`,
  check: `<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  cross: `<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  sun: `<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><circle cx="30" cy="30" r="30" fill="currentColor"/><path d="M 30,0 A 30,30 0 0,1 30,60 Z" fill="var(--bg-sheet)"/></svg>`,
  moon: `<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><circle cx="30" cy="30" r="30" fill="currentColor"/><path d="M 30,0 A 30,30 0 0,0 30,60 Z" fill="var(--bg-sheet)"/></svg>`,
  search: `<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
  heartPath: `M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z`
};

MetroApp.LINE_COLOR = { red: '#c8523a', blue: '#5b9bd5', green: '#5aaa6a' };

/* Скорочені назви для відображення в «Обраному» */
MetroApp.FAV_DISPLAY_NAMES = {
  'B.Ploshcha_Ukrainskikh_heroiv': 'Пл. Українських героїв',
};

/* Скорочення напрямків коли виходів > 1 (ключ — нижній регістр) */
MetroApp.DIR_SHORT_NAMES = {
  'контрактова площа':    'Контрактова',
  'поштова площа':        'Поштова',
  'майдан незалежності':  'Майдан',
  'політехнічний інститут': 'Політехнічний',
  'золоті ворота':        'Золоті',
};
(function () {

  /* ==========================================================================
     1. ГЛОБАЛЬНІ ЗМІННІ ТА DOM ЕЛЕМЕНТИ
     ========================================================================== */
  const vp = document.getElementById('mapViewport');
  const inner = document.getElementById('mapInner');





// Прибрали img, бо тепер у нас чистий SVG
  const sheet = document.getElementById('stationSheet');
  const sheetBody = document.getElementById('sheetBody');
  const sheetClose = document.getElementById('sheetClose');
  const sheetOverlay = document.getElementById('sheetOverlay');
  
  const favSheet = document.getElementById('favSheet');
  const favBody = document.getElementById('favBody');
  const favClose = document.getElementById('favClose');
  const favBtn = document.getElementById('favListBtn');

  let stationsData = null;
  let currentStationSlug = null;
  let isMapReady = false;
  let isZonesReady = false;
  let emptyFavColorIdx = 0;
  let activeLineFilter = new Set(); // порожній Set = «Всі»
  const _startupSlug = new URLSearchParams(window.location.search).get('station');
  if (_startupSlug) window.history.replaceState({}, document.title, window.location.pathname);

  function removeLoader() {
    requestAnimationFrame(() => {
      document.getElementById('mapViewport')?.classList.remove('is-loading');
    });
  }

  function checkAppReady() {
    if (isMapReady && isZonesReady) {
      removeLoader();
    }
  }

  setTimeout(() => {
    if (vp && vp.classList.contains('is-loading')) removeLoader();
  }, 10000);

/* ==========================================================================
     2. УПРАВЛІННЯ КАРТОЮ (ZOOM ТА PAN)
     ========================================================================== */
  const centerX = 0.485, centerY = 0.5;
  let baseMapWidth = 1195.84; // Збережемо базові розміри глобально
  let baseMapHeight = 840;

  function applyZoomAndCenter() {
    const svgEl = inner.querySelector('svg');
    
    if (svgEl) {
      svgEl.style.width = '100%';
      svgEl.style.height = '100%';
      svgEl.style.display = 'block';
    }
    
    // Жорстко фіксуємо розміри, щоб уникнути багів до повного рендеру SVG
    baseMapWidth = 1195.84;
    baseMapHeight = 840;
    
    const w = Math.min(window.innerWidth, document.documentElement.clientWidth);



    const sf = w <= 500 ? 4.5 : 1.5;
    const minZoom = vp.clientWidth / baseMapWidth; 
    const zoom = Math.max(minZoom, Math.min(4.0, Math.round(vp.clientWidth * sf) / baseMapWidth));
    
    const newW = Math.round(baseMapWidth * zoom);
    const newH = Math.round(baseMapHeight * zoom);
    
    inner.style.width = newW + 'px';
    inner.style.height = newH + 'px';
    
    const padX = Math.max(0, (vp.clientWidth - newW) / 2);
    const padY = Math.max(0, (vp.clientHeight - newH) / 2);
    inner.style.marginLeft = padX + 'px';
    inner.style.marginTop = padY + 'px';
    
    requestAnimationFrame(() => {
      const targetX = padX + newW * centerX;
      const targetY = padY + newH * centerY;
      vp.scrollLeft = Math.max(0, targetX - vp.clientWidth / 2);
      vp.scrollTop = Math.max(0, targetY - vp.clientHeight / 2);
      
      // Завжди знімаємо лоадер, навіть якщо SVG порожній чи видав помилку
      isMapReady = true;
      checkAppReady();
    });
  }

  function adjustViewportHeight() {
    if (!vp) return;
    const top = vp.getBoundingClientRect().top;
    const avail = Math.floor((window.visualViewport?.height ?? window.innerHeight) - top - 8);
    vp.style.height = Math.max(120, avail) + 'px';
  }

  MetroApp.applyZoomAndCenter = applyZoomAndCenter;

  // НОВИЙ МЕТОД ЗАВАНТАЖЕННЯ: Вбудовуємо SVG прямо в HTML
  async function loadInlineSVG() {
    try {
      const response = await fetch('KyivMetroScheme.svg'); 
      if (!response.ok) throw new Error('HTTP Помилка: ' + response.status);
      const svgText = await response.text();
      inner.innerHTML = svgText;
      
      // БЕЗ ЦЬОГО РЯДКА КАРТА ЗАВИСНЕ, ЯКЩО SVG ЗАВАНТАЖИТЬСЯ ПІСЛЯ JSON!
      renderMapZones(); 
    } catch (err) {
      console.error('Помилка завантаження SVG (Переконайтесь, що працює локальний сервер):', err);
      // Якщо файл не завантажився (наприклад, через CORS), показуємо повідомлення замість карти
      inner.innerHTML = '<div style="color:var(--text); padding: 40px; text-align:center;">Помилка завантаження карти.<br>Запустіть проект через локальний сервер (напр. Live Server).</div>';
    } finally {
      // Завжди застосовуємо зум (навіть якщо помилка, щоб зняти нескінченний лоадер)
      adjustViewportHeight();
      applyZoomAndCenter();
    }
  }
  loadInlineSVG();

  let resizeTimer;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { adjustViewportHeight(); applyZoomAndCenter(); }, 120); };  
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 120));

  document.addEventListener('DOMContentLoaded', () => { 
    // Читаємо параметри з URL (для PWA Shortcuts)
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');

    // Пріоритет 1: PWA Shortcuts
    if (action === 'search') {
      setTimeout(() => openSearchSheet(), 50);
    } else if (action === 'fav') {
      setTimeout(() => openFavSheet(), 50);
    } 
    // Пріоритет 2: Налаштування юзера "Стартувати з обраного"
    else if (localStorage.getItem('metro_start_on_fav') === 'true') {
      setTimeout(() => openFavSheet(), 50);
    }

    // Очищаємо URL, щоб при оновленні сторінки дія не повторювалася
    if (action) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  });

  /* ═══════════════════════════════════════════════════
     PAN (1 палець) + PINCH ZOOM (2 пальці) — карта
     ═══════════════════════════════════════════════════ */
  let lastPinchDist = null;
  let panStartX = null, panStartY = null;
  let panStartScrollLeft = 0, panStartScrollTop = 0;
  let isPanActive = false;

  // Ініціалізуємо стан при дотику
  document.addEventListener('touchstart', e => {
    if (sheetOverlay.classList.contains('overlay-visible')) return;
    if (e.touches.length === 2) {
      isPanActive = false;
      const t0 = e.touches[0], t1 = e.touches[1];
      lastPinchDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      pendingPinch  = null;
    } else if (e.touches.length === 1) {
      isPanActive = true;
      panStartX = e.touches[0].clientX;
      panStartY = e.touches[0].clientY;
      panStartScrollLeft = vp.scrollLeft;
      panStartScrollTop  = vp.scrollTop;
    }
  }, { passive: true });

  // Pan: встановлюємо scrollLeft/scrollTop вручну (SVG має touch-action:none)
  vp.addEventListener('touchmove', e => {
    if (!isPanActive || e.touches.length !== 1) return;
    vp.scrollLeft = panStartScrollLeft - (e.touches[0].clientX - panStartX);
    vp.scrollTop  = panStartScrollTop  - (e.touches[0].clientY - panStartY);
  }, { passive: true });

  // Pinch zoom: застосовуємо кожен touchmove напряму для максимальної плавності
  document.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || sheetOverlay.classList.contains('overlay-visible')) return;
    e.preventDefault();
    if (!lastPinchDist) return;

    const t0x = e.touches[0].clientX, t0y = e.touches[0].clientY;
    const t1x = e.touches[1].clientX, t1y = e.touches[1].clientY;
    const midX = (t0x + t1x) / 2;
    const midY = (t0y + t1y) / 2;
    const dist  = Math.hypot(t0x - t1x, t0y - t1y);
    const ratio = dist / lastPinchDist;
    lastPinchDist = dist;

    const oldW = inner.offsetWidth;
    const oldH = inner.offsetHeight;
    const imgRect = inner.getBoundingClientRect();
    const relX = (midX - imgRect.left) / oldW;
    const relY = (midY - imgRect.top)  / oldH;

    const minW = vp.clientWidth;
    const maxW = Math.round(baseMapWidth * 4.0);
    const newW = Math.max(minW, Math.min(maxW, oldW * ratio));
    const newH = newW * oldH / oldW;

    const padX = Math.max(0, (vp.clientWidth  - newW) / 2);
    const padY = Math.max(0, (vp.clientHeight - newH) / 2);

    inner.style.width      = newW + 'px';
    inner.style.height     = newH + 'px';
    inner.style.marginLeft = padX + 'px';
    inner.style.marginTop  = padY + 'px';

    const vpRect = vp.getBoundingClientRect();
    vp.scrollLeft = (relX * newW + padX) - (midX - vpRect.left);
    vp.scrollTop  = (relY * newH + padY) - (midY - vpRect.top);
  }, { passive: false });

  document.addEventListener('touchend', e => {
    if (e.touches.length < 2) {
      lastPinchDist = null;
      pendingPinch  = null;
      pinchRAFScheduled = false;
    }
    // Плавний перехід pinch → pan: якщо залишився 1 палець
    if (e.touches.length === 1 && !sheetOverlay.classList.contains('overlay-visible')) {
      isPanActive = true;
      panStartX = e.touches[0].clientX;
      panStartY = e.touches[0].clientY;
      panStartScrollLeft = vp.scrollLeft;
      panStartScrollTop  = vp.scrollTop;
    }
    if (e.touches.length === 0) isPanActive = false;
  }, { passive: true }); 


  /* ==========================================================================
     3. УТИЛІТИ, КОЛЬОРИ ТА ФОРМАТУВАННЯ
     ========================================================================== */

  MetroApp.NAME_TO_SLUG = {};

  MetroApp.ALWAYS_CAP = new Set(['україна','україни','українських','дніпра','незалежності','небесної','сотні','спорту','центр','площа','площі','героїв','лівий','правий']);

MetroApp.properCase = function(name) {
    let wordIndex = 0;
    // Шукаємо саме українські слова, ігноруючи &nbsp;, дефіси та інші символи (щоб не ламати розмітку)
    return name.replace(/[а-яіїєґА-ЯІЇЄҐ]+/g, (match) => {
      const wl = match.toLowerCase();
      // Робимо велику літеру для першого слова АБО якщо слово є в нашому списку ALWAYS_CAP
      const shouldCap = wordIndex === 0 || MetroApp.ALWAYS_CAP.has(wl);
      wordIndex++;
      return shouldCap ? wl.charAt(0).toUpperCase() + wl.slice(1) : wl;
    });
  };

function heartSvg(isFav, slug, lineColor) {
    const base = 'width="22" height="20" viewBox="0 0 24 22" xmlns="http://www.w3.org/2000/svg"';
    if (!isFav) return `<svg ${base} fill="none" stroke="currentColor" stroke-width="2"><path d="${MetroApp.Icons.heartPath}"/></svg>`;
    return `<svg ${base} fill="${lineColor}"><path d="${MetroApp.Icons.heartPath}"/></svg>`;
  }

function formatLabel(raw) {
    let text = raw.replace(/\u00a0/g, ' ').trim();

    // Перевіряємо, чи це текст пересадки
    const isTransfer = text.toLowerCase().includes('пересадка') || text.toLowerCase().includes('перехід');

    if (isTransfer) {
      // Скрипт автоматично розуміє, на яку станцію перехід, і бере її колір!
      const targetSlug = slugByName(text);
      if (targetSlug && stationsData && stationsData[targetSlug]) {
        const targetLine = stationsData[targetSlug].line;
        const color = MetroApp.LINE_COLOR[targetLine];
        return `<span class="transfer-label"><span class="transfer-line" style="background:${color}"></span><span class="transfer-text">${text}</span><span class="transfer-line" style="background:${color}"></span></span>`;
      }
    }

    return `<span class="exit-label-text">${text}</span>`;
  }

  function pill(label, value, color) {
    return `<div class="pos-pill"><div class="pos-pill-label">${label}</div><div class="pos-pill-num" style="color:${color}">${value}</div></div>`;
  }

const STATION_ALIASES = {
    'театральну': 'театральна',
    'площу українських героїв': 'площа українських героїв',
  };

function slugByName(raw) {
    let normalized = raw.toLowerCase()
      .replace(/[\u00a0\u202f\u2009]/g, ' ')
      .replace(/(?:короткий |довгий )?пере(?:садка|хід) на\s*/g, '')
      .replace(/попередня\s*/g, '')
      .replace(/["'„“«».,]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (MetroApp.NAME_TO_SLUG[normalized]) return MetroApp.NAME_TO_SLUG[normalized];

    for (const [alias, realName] of Object.entries(STATION_ALIASES)) {
      if (normalized.includes(alias)) {
        normalized = normalized.replace(alias, realName);
        break;
      }
    }

    if (MetroApp.NAME_TO_SLUG[normalized]) return MetroApp.NAME_TO_SLUG[normalized];

    for (const name of Object.keys(MetroApp.NAME_TO_SLUG)) {
      const stem = name.length > 6 ? name.slice(0, -2) : name;
      if (normalized.includes(stem)) return MetroApp.NAME_TO_SLUG[name];
    }

    return null;
  }

  /* ==========================================================================
     4. ЗАВАНТАЖЕННЯ ДАНИХ ТА КЛІКИ ПО КАРТІ
     ========================================================================== */
function hydrateStations(data) {
    if (!stationsData) stationsData = {};
    Object.keys(stationsData).forEach(key => delete stationsData[key]);
    
    MetroApp.NAME_TO_SLUG = {};

    data.stations.forEach(s => { 
      s.positions = [];
      s.directions?.forEach(dir => {
        dir.exits?.forEach(exit => {
          exit.positions?.forEach(pos => {
            s.positions.push({ dir: dir.from, exit: exit.label || '', wagon: pos.wagon, doors: pos.doors });
          });
        });
      });

      const cleanName = s.name.toLowerCase().replace(/["'„“«».,]/g, '');
      MetroApp.NAME_TO_SLUG[cleanName] = s.slug;

      const stationWords = cleanName.split(/[\s\u00a0\u202f\-]+/);
      const cleanEnName = s.slug.split('.')[1].replace(/_/g, ' ').toLowerCase();
      const stationEnWords = cleanEnName.split(/\s+/);
      const acronym = stationWords.map(w => w.charAt(0)).join('');

      let aliases = [];
      if (s.slug === 'R.Politekhnychnyi_instytut') aliases.push('кпі');
      if (s.slug === 'B.Ploshcha_Ukrainskikh_heroiv') { aliases.push('плуг'); aliases.push('площа льва толстого'); }
      if (s.slug === 'G.Zvirynetska') { aliases.push('дружби народів'); }

      s._searchIndex = [
        ...stationWords,
        ...stationEnWords,
        acronym,
        ...aliases.flatMap(a => a.toLowerCase().split(/[\s\u00a0\u202f\-]+/))
      ];

      stationsData[s.slug] = s; 
    });

    if (MetroApp.applyLocalEdits) MetroApp.applyLocalEdits(stationsData);
    if (MetroApp.applyExitLabels) MetroApp.applyExitLabels(stationsData);
    MetroApp.currentStationsData = stationsData;
    return stationsData;
  }


function getEmptyFavHtml() {
    const colors = ['var(--line-blue)', 'var(--line-red)', 'var(--line-green)'];
    const currentColor = colors[emptyFavColorIdx % colors.length];
    emptyFavColorIdx++;
    return `
      <div class="fav-empty-state">
        <p class="fav-empty-text-lg">
          Для збереження до вибраного,<br>натисніть 
          <svg viewBox="0 0 24 22" fill="none" stroke="${currentColor}" stroke-width="2.5" class="fav-empty-heart">
            <path d="${MetroApp.Icons.heartPath}"></path>
          </svg> на&nbsp;картці&nbsp;станції
        </p>
        <p class="fav-empty-text-lg">
          Знаєте, який вихід вам знадобиться?<br>Збережіть його подвійним тапом по вагону і&nbsp;дверям
        </p>
      </div>`;
  }




async function reloadStationsData(forceFresh = false) {
    const url = 'stations.json';
    const response = await fetch(url, forceFresh ? { cache: 'no-store' } : undefined);
    const data = await response.json();
    const hydrated = hydrateStations(data);
    if (!forceFresh) { renderMapZones(); handleStartupStation(hydrated); }
    // Якщо вікно Обраного відкрилось до завантаження даних — перемалюємо його
    if (favSheet?.classList.contains('sheet-open') && favBody?.querySelector('.fav-empty-text')) {
      const favs = getFavs();
      if (favs.length === 0) favBody.innerHTML = getEmptyFavHtml();
      else renderFavList(favs);
    }
    return hydrated;
  }
  MetroApp.reloadStationsData = reloadStationsData;

  // Відкрити станцію з URL ?station=slug (один раз при старті)
  function handleStartupStation(data) {
    if (_startupSlug && data[_startupSlug]) {
      requestAnimationFrame(() => openStation(_startupSlug));
    }
  }

function renderMapZones() {
    if (isZonesReady) return; // зони вже налаштовано
    const svgEl = inner.querySelector('svg');
    
    // Якщо немає карти АБО немає даних зі станціями — чекаємо
    if (!svgEl || !stationsData) return; 

    // Якщо все є — активуємо зони
    const allElementsWithId = svgEl.querySelectorAll('[id]');
    
    allElementsWithId.forEach(el => {
      const rawId = el.id.replace(/\d+$/, '').toLowerCase();
      
      // Замість просто true/false, беремо точний ключ (slug), щоб дістати назву
      const slug = Object.keys(stationsData).find(key => key.toLowerCase() === rawId);
      
      if (slug) {
        el.style.fill = 'transparent';
        el.style.stroke = 'transparent';
        el.style.pointerEvents = 'all';
        el.style.cursor = 'pointer';
        el.style.webkitTapHighlightColor = 'transparent';
        
// --- МАГІЯ ДОСТУПНОСТІ (a11y) ---
        el.setAttribute('role', 'button'); 
        el.setAttribute('tabindex', '0');  
        el.setAttribute('aria-label', `Станція ${stationsData[slug].name}`);      }
    });

    // Зони готові!
    isZonesReady = true;
    checkAppReady();
  }

  reloadStationsData()
    .catch(err => console.error('stations.json load failed', err));




function handleMapInteraction(e) {
    if (!stationsData) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;

    const zone = e.target.closest('[id]');
    if (!zone || !zone.id) return;
    
    const rawId = zone.id.replace(/\d+$/, '').toLowerCase(); 
    const slug = Object.keys(stationsData).find(key => key.toLowerCase() === rawId);
    
    if (slug) {
      e.preventDefault();
      openStation(slug);
    }
  }

  inner.addEventListener('click', handleMapInteraction);
  inner.addEventListener('keydown', handleMapInteraction);

const FAV_KEY = 'metro_favs';
  let favCache = null;
const getFavs = () => {
    if (favCache) return [...favCache];
    try { favCache = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
    catch (e) { console.warn('[KyivMetroGO] Помилка парсингу Обраних станцій:', e); favCache = []; }
    return [...favCache];
  };
  const saveFavs = arr => {
    favCache = [...arr];
    localStorage.setItem(FAV_KEY, JSON.stringify(favCache));
  };
  const isFav = slug => getFavs().includes(slug);
  const toggleFav = slug => {
    let favs = getFavs();
    favs = favs.includes(slug) ? favs.filter(s => s !== slug) : [...favs, slug];
    saveFavs(favs); return favs.includes(slug);
  };
window.addEventListener('storage', e => {
    if (e.key === FAV_KEY) {
      try { favCache = JSON.parse(e.newValue || '[]'); }
      catch (err) { console.warn('[KyivMetroGO] Помилка синхронізації Обраних станцій:', err); favCache = []; }
    } else if (e.key === EXIT_FAV_KEY) {
      try { exitFavCache = JSON.parse(e.newValue || '[]'); }
      catch (err) { console.warn('[KyivMetroGO] Помилка синхронізації Обраних виходів:', err); exitFavCache = []; }
    }
  });

const EXIT_FAV_KEY = 'metro_exit_favs';
  let exitFavCache = null;

  function getExitFavs() {
    if (exitFavCache) return [...exitFavCache];
    try { exitFavCache = JSON.parse(localStorage.getItem(EXIT_FAV_KEY) || '[]'); } 
    catch (e) { console.warn('[KyivMetroGO] Помилка парсингу Обраних виходів:', e); exitFavCache = []; }
    return [...exitFavCache];
  }

  function exitFavId(slug, dir, wagon, doors) { return `${slug}|${dir}|${wagon}|${doors}`; }
  
  function isExitFav(slug, dir, wagon, doors) {
    return getExitFavs().some(f => f.id === exitFavId(slug, dir, wagon, doors));
  }

function toggleExitFav(slug, dir, wagon, doors) {
    let favs = getExitFavs(); 
    const id = exitFavId(slug, dir, wagon, doors);
    const idx = favs.findIndex(f => f.id === id);
    
    if (idx >= 0) {
      favs.splice(idx, 1);
      localStorage.setItem(EXIT_FAV_KEY, JSON.stringify(favs));
      exitFavCache = [...favs];
      return { status: 'removed' }; // 👈 Статус видалення
    } else {
      const slugDirFavs = favs.filter(f => f.slug === slug && f.dir === dir);
      if (slugDirFavs.length >= 3) return { status: 'limit' }; // 👈 Статус ліміту

      favs.push({ id, slug, dir, wagon, doors });
      let mainFavs = getFavs();
      if (!mainFavs.includes(slug)) {
        mainFavs.push(slug);
        saveFavs(mainFavs);
      }
      localStorage.setItem(EXIT_FAV_KEY, JSON.stringify(favs));
      exitFavCache = [...favs];
      return { status: 'added' }; // 👈 Статус додавання
    }
  }

  function renderFavList(favs) {
    if (!favs.length) {
      favBody.innerHTML = getEmptyFavHtml();
      return;
    }

    const exitFavs = getExitFavs();
    const itemsToRender = [];

    favs.forEach(slug => {
      const s = stationsData?.[slug];
      if (!s) return;
      
      const stationExits = exitFavs.filter(f => f.slug === slug);
      if (stationExits.length === 0) {
        itemsToRender.push({ slug, name: s.name, dir: '', color: MetroApp.LINE_COLOR[s.line], exits: [] });
      } else {
        const grouped = {};
        stationExits.forEach(e => {
          if (!grouped[e.dir]) grouped[e.dir] = [];
          grouped[e.dir].push(e);
        });
        Object.entries(grouped).forEach(([dir, eList]) => {
          itemsToRender.push({ slug, name: s.name, dir, color: MetroApp.LINE_COLOR[s.line], exits: eList });
        });
      }
    });

    itemsToRender.forEach(item => {
        item.rowId = `${item.slug}::${item.dir}`;
    });

let savedOrder = [];
    try { savedOrder = JSON.parse(localStorage.getItem('metro_fav_rows_order') || '[]'); } 
    catch(e) { console.warn('[KyivMetroGO] Помилка парсингу порядку Обраних:', e); savedOrder = []; }

    const getEffectiveIdx = (item) => {
        let idx = savedOrder.indexOf(item.rowId);
        if (idx !== -1) return idx;
        let siblingIdx = savedOrder.findIndex(id => id.startsWith(item.slug + '::'));
        if (siblingIdx !== -1) return siblingIdx + 0.5;
        return 99999;
    };

    itemsToRender.sort((a, b) => {
        let valA = getEffectiveIdx(a);
        let valB = getEffectiveIdx(b);
        if (valA === valB) return a.dir.localeCompare(b.dir);
        return valA - valB;
    });

    const listHtml = itemsToRender.map(item => {
      let displayName = MetroApp.FAV_DISPLAY_NAMES[item.slug] || item.name;

      let formattedDir = '';
      if (item.dir && item.dir !== 'undefined') {
        let lower = item.dir.toLowerCase().trim();
        if (lower === 'кінцева' || lower === 'вихід праворуч') {
          formattedDir = lower;
        } else if (lower.includes('довгий перехід')) {
          formattedDir = 'довгий перехід на Майдан Незалежності';
        } else {


let stationName = lower.replace(/^попередня\s+/, '');
          let formattedStation = MetroApp.properCase(stationName);

          if (item.exits.length > 1) {
            const fsLower = formattedStation.toLowerCase();
            formattedStation = MetroApp.DIR_SHORT_NAMES[fsLower] || formattedStation;
          }

          formattedDir = lower.startsWith('попередня') ? `попередня ${formattedStation}` : formattedStation;
        }
      }

      let squaresHtml = '';
      if (item.exits.length > 0) {
        const isCompact = item.exits.length > 2;
        const containerClass = isCompact ? 'fav-exits-container fav-exits-compact' : 'fav-exits-container';
        
        const groupsHtml = item.exits.map(f => `
          <div class="fav-exit-group">
            <div class="fav-pos-square" style="color:${item.color}">${f.wagon}</div>
            <div class="fav-pos-square" style="color:${item.color}">${f.doors}</div>
          </div>
        `).join('<div class="fav-exit-sep"></div>');
        
        squaresHtml = `<div class="${containerClass}">${groupsHtml}</div>`;
      }
      
      return `<div class="fav-item" data-slug="${item.slug}" data-row-id="${item.rowId}">
        <button class="fav-open-btn" data-slug="${item.slug}" style="border-left-color:${item.color}">
          <div class="fav-text-wrap">
            <span class="fav-station-name ${item.exits.length > 1 ? 'fav-small' : ''}">${displayName}</span>
            ${(formattedDir && item.exits.length > 0) ? `<span class="fav-dir-name ${item.exits.length > 1 ? 'fav-small-dir' : ''}">${formattedDir}</span>` : ''}
          </div>
          ${squaresHtml}
        </button>
        <div class="fav-drag-handle" aria-label="Перетягнути">⠿</div>
      </div>`;
    }).join('');

    favBody.innerHTML = listHtml;

    



function saveOrder() { 
      const items = [...favBody.querySelectorAll('.fav-item')];
      // Запобіжник від порожніх значень
      const rowIds = items.map(i => i.dataset.rowId).filter(Boolean);
      localStorage.setItem('metro_fav_rows_order', JSON.stringify(rowIds));
      
      const uniqueSlugs = [...new Set(items.map(i => i.dataset.slug).filter(Boolean))];
      saveFavs(uniqueSlugs); 
    }

// Ініціалізуємо SortableJS (бібліотека працює локально)
    if (window.Sortable) {
      if (favBody._sortable) favBody._sortable.destroy();
      
      favBody._sortable = new Sortable(favBody, {
        draggable: '.fav-item',
        handle: '.fav-drag-handle',
        animation: 0, // <--- Вимикаємо стандартну анімацію ковзання елементів!
        ghostClass: 'fav-ghost', // Клас для місця, куди впаде елемент
        dragClass: 'fav-dragging', // Клас для елемента в "польоті"
        fallbackOnBody: true,
        swapThreshold: 0.65,
        
        // --- ПОВЕРТАЄМО ЕФЕКТ "МАГІЇ" ДЯКУЮЧИ ПЛАГІНУ ---
        // Якщо бібліотека підтримує плагіни (у sortable.min.js він вшитий), вмикаємо swap
        swap: true, // Вмикає режим обміну контентом
        swapClass: "fav-swap-highlight", // Клас для картки-цілі, на яку ми наводимо
        // ----------------------------------------------

        // Потрібно також примусити бібліотеку використовувати чистий JS drag
        // на iOS, щоб нативний ghost не перекривав текст під пальцем.
        forceFallback: true, 
        
        onEnd: saveOrder
      });
    }
  }

  favBody.addEventListener('click', e => {

    const btn = e.target.closest('.fav-open-btn');
    if (!btn?.dataset.slug) return;
    openStation(btn.dataset.slug);
  });

function openFavSheet() {
    document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
    const favs = getFavs();    
    if (!stationsData) favBody.innerHTML = `<p class="fav-empty-text">Дані ще завантажуються…</p>`;
    else if (favs.length === 0) favBody.innerHTML = getEmptyFavHtml();
    else renderFavList(favs);
    favSheet.classList.add('sheet-open');
    sheetOverlay.classList.add('overlay-visible');
  }

  function closeFavSheet() {
    MetroApp.animateSheetClose(favSheet, () => {
      favSheet.classList.remove('sheet-open');
      if (!sheet.classList.contains('sheet-open')) sheetOverlay.classList.remove('overlay-visible');
    });
  }

  favBtn.addEventListener('click', openFavSheet);
  favClose.addEventListener('click', closeFavSheet);

  let isHandleSwipeFav = false;
  let swipeStartYFav = 0;
  favSheet.addEventListener('touchstart', e => { swipeStartYFav = e.touches[0].clientY; isHandleSwipeFav = !!e.target.closest('.sheet-handle-bar'); }, { passive: true });
  favSheet.addEventListener('touchend', e => { if (isHandleSwipeFav && (e.changedTouches[0].clientY - swipeStartYFav > 60)) closeFavSheet(); });

  document.getElementById('checkinBtn')?.addEventListener('click', openCheckinSheet);

  function openCheckinSheet() {
    let checkinSheet = document.getElementById('checkinSheet');
    const closeHandler = () => {
      const s = document.getElementById('checkinSheet');
      MetroApp.animateSheetClose(s, () => {
        s?.classList.remove('sheet-open', 'sheet-fullscreen', 'sheet-scrollable');
        if (!document.querySelectorAll('.station-sheet.sheet-open').length)
          document.getElementById('sheetOverlay').classList.remove('overlay-visible');
      });
    };

    function renderCheckinContent() {
      const s = document.getElementById('checkinSheet');
      const all = getCheckins();
      const entries = Object.values(all);
      let bodyHtml = '';

      if (!entries.length) {
        bodyHtml = `<p class="fav-empty-text">Поки що немає відміток.<br>Увімкніть режим check‑in і натисніть<br>на шпильку поруч із виходом.</p>`;
      } else {
        // ── Загальна статистика ──
        const totalCheckins = entries.length;
        const totalExitsAll = stationsData
          ? Object.values(stationsData).reduce((sum, st) => sum + (st.positions?.filter(p => !p.closed).length ?? 0), 0)
          : 0;

        bodyHtml += `<div class="ci-stats-bar">
          <div class="ci-stat">
            <span class="ci-stat-num">${Object.keys(groupBySlug(entries)).length}</span>
            <span class="ci-stat-lbl">станцій</span>
          </div>
          <div class="ci-stat-sep"></div>
          <div class="ci-stat">
            <span class="ci-stat-num">${totalCheckins}</span>
            <span class="ci-stat-lbl">виходів</span>
          </div>
          <div class="ci-stat-sep"></div>
          <div class="ci-stat">
            <span class="ci-stat-num">${totalExitsAll > 0 ? Math.round(totalCheckins / totalExitsAll * 100) : 0}%</span>
            <span class="ci-stat-lbl">охоплення</span>
          </div>
        </div>`;

        const byStation = groupBySlug(entries);
        bodyHtml += Object.entries(byStation).map(([slug, items]) => {
          const st = stationsData?.[slug];
          const color = items[0].color || (st ? MetroApp.LINE_COLOR[st.line] : 'var(--text-muted)');
          const name  = st?.name || slug;
          const totalExits = st?.positions?.filter(p => !p.closed).length ?? 0;
          const checkedCount = items.length;
          const pct = totalExits > 0 ? Math.round(checkedCount / totalExits * 100) : 0;
          const lastTs = Math.max(...items.map(e => e.ts || 0));

          return `<button class="checkin-station-card" data-slug="${slug}" style="--ci-color:${color}">
            <div class="checkin-card-row">
              <div class="checkin-card-left">
                <span class="checkin-station-name-text">${name}</span>
                <span class="checkin-time">${formatCheckinTime(lastTs)}</span>
              </div>
              <div class="checkin-card-right">
                <span class="checkin-fraction" style="color:${color}">${checkedCount}<span class="checkin-fraction-total">/${totalExits}</span></span>
              </div>
            </div>
            <div class="checkin-progress-wrap">
              <div class="checkin-progress-bar" style="width:${pct}%;background:${color}"></div>
            </div>
          </button>`;
        }).join('');
      }

      s.innerHTML = `
        <div class="sheet-handle-bar"><div class="sheet-handle"></div><span class="sheet-sheet-title">Check-in</span><button class="sheet-close-btn" id="checkinClose" aria-label="Закрити">✕</button></div>
        <div class="sheet-body">${bodyHtml}</div>`;

      s.querySelector('#checkinClose')?.addEventListener('click', closeHandler);

      // Кліки по картках — відкрити станцію
      s.querySelectorAll('.checkin-station-card').forEach(card => {
        card.addEventListener('click', () => {
          const slug = card.dataset.slug;
          if (slug) {
            closeHandler();
            setTimeout(() => openStation(slug), 380);
          }
        });
      });

      let swY2 = 0, isSwipeCI = false;
      s.addEventListener('touchstart', e => { swY2 = e.touches[0].clientY; isSwipeCI = !!e.target.closest('.sheet-handle-bar'); }, { passive: true });
      s.addEventListener('touchend',   e => { if (isSwipeCI && e.changedTouches[0].clientY - swY2 > 60) closeHandler(); });
    }

    function groupBySlug(entries) {
      const map = {};
      entries.forEach(e => { if (!map[e.slug]) map[e.slug] = []; map[e.slug].push(e); });
      return map;
    }

    if (!checkinSheet) {
      checkinSheet = document.createElement('div');
      checkinSheet.id = 'checkinSheet';
      checkinSheet.className = 'station-sheet about-station-sheet';
      document.body.appendChild(checkinSheet);
    }
    renderCheckinContent();
    document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
    checkinSheet.classList.add('sheet-open', 'sheet-fullscreen', 'sheet-scrollable');
    document.getElementById('sheetOverlay').classList.add('overlay-visible');
  }

  function formatCheckinTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const diffMs = Date.now() - ts;
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) { const m = Math.floor(diffMs / 60000); return m < 1 ? 'щойно' : `${m} хв тому`; }
    if (diffH < 24) return `${diffH} год тому`;
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
  }

  function renderPositions(positions, color, multiRow) {
    positions = positions.filter(p => !p.closed);
    if (!positions.length) return '';

    function generatePills(wStr, dStr) {
      const wArr = String(wStr).split(',').map(s => s.trim());
      const dArr = String(dStr).split(',').map(s => s.trim());
      const blocks = [];
      const count = Math.max(wArr.length, dArr.length);
      for (let i = 0; i < count; i++) {
        blocks.push(`${pill('вагон', wArr[i] || wArr[0], color)}\n${pill('двері', dArr[i] || dArr[0], color)}`);
      }
      return blocks.join('<span class="pos-multi-sep" style="margin: 0 6px;">·</span>');
    }

    if (positions.length === 1) {
      const p = positions[0];
      const isMulti = String(p.wagon).includes(',');
const editedMark = p._edited ? `<span class="pos-edited-mark" data-slug="${p._slug}" data-idx="${p._posIdx}">${MetroApp.Icons.pencil}</span>` : '';
      // Спейсер більше не потрібен, бо олівець має position: absolute
      return `<div class="position-row ${isMulti ? 'position-row-multi' : ''}">${editedMark}${generatePills(p.wagon, p.doors)}</div>`;
          }

    if (multiRow) {
      const editedPos = positions.find(p => p._edited);
      const editedMark = editedPos ? `<span class="pos-edited-mark" data-slug="${editedPos._slug}" data-idx="${editedPos._posIdx}">${MetroApp.Icons.pencil}</span>` : '';
      const spacer = editedPos ? `<span class="pos-edited-spacer"></span>` : '';
      return `<div class="position-row position-row-multi">${editedMark}${positions.map((p, i) => `${i > 0 ? '<span class="pos-multi-sep">·</span>' : ''}${generatePills(p.wagon, p.doors)}`).join('')}${spacer}</div>`;
    }

    return positions.map(p => {
      return `<div class="position-row ${String(p.wagon).includes(',') ? 'position-row-multi' : ''}">${generatePills(p.wagon, p.doors)}</div>`;
    }).join('');
  }

  function renderDirections(s, color) {
    const isKhreshchatyk = s.slug === 'R.Khreshchatyk';

    if (isKhreshchatyk) {
      const mainDirs = s.directions.filter(d => d.from !== '__long_transfer__');
      const longDir = s.directions.find(d => d.from === '__long_transfer__');

      const mainHtml = mainDirs.map(dir => `
        <div class="direction-block">
          <div class="direction-label nav-label" data-name="${dir.from}">${dir.from}</div>
          ${dir.exits.map(exit => `${exit.label ? `<div class="exit-label nav-label" data-name="${exit.label}">${formatLabel(exit.label)}</div>` : ''}${renderPositions(exit.positions, color, true)}`).join('')}
        </div>`).join('');

      let longHtml = '';
      if (longDir) {
        const rows = longDir.exits.map(exit => {
          const posRows = exit.positions.map(p => `<div class="long-transfer-pos-row">${pill('вагон', p.wagon, color)}${pill('двері', p.doors, color)}</div>`).join('');
          return `<div class="long-transfer-exit"><div class="long-transfer-exit-label">${exit.label}</div>${posRows}</div>`;
        }).join('');
        longHtml = `<div class="long-transfer-block"><div class="long-transfer-title"><span class="transfer-label"><span class="transfer-line" style="background:${MetroApp.LINE_COLOR['blue']}"></span><span class="transfer-text">довгий&nbsp;перехід на&nbsp;Майдан&nbsp;Незалежності</span><span class="transfer-line" style="background:${MetroApp.LINE_COLOR['blue']}"></span></span></div>${rows}</div>`;
      }
      return mainHtml + longHtml;
    }

    return s.directions.map(dir => {
      if (dir.from === 'вихід праворуч') return `<div class="direction-block direction-exit-right"><div class="direction-label">вихід праворуч</div></div>`;
      return `<div class="direction-block">
        <div class="direction-label nav-label" data-name="${dir.from}">${dir.from}</div>
        ${dir.exits.map(exit => `${exit.label ? `<div class="exit-label nav-label" data-name="${exit.label}">${formatLabel(exit.label)}</div>` : ''}${renderPositions(exit.positions, color, false)}`).join('')}
      </div>`;
    }).join('');
  }

function applyFavPillStyles(container, lineColor, isFaved) {
    container.querySelectorAll('.pos-pill').forEach(pill => {
      if (isFaved) {
        pill.style.background = lineColor;
        const num = pill.querySelector('.pos-pill-num');
        const lbl = pill.querySelector('.pos-pill-label');
        // Використовуємо колір фону додатку як колір тексту на акцентній пілюлі
        if (num) num.style.color = 'var(--bg)'; 
        if (lbl) lbl.style.color = 'var(--bg)';
      } else {
        pill.style.background = '';
        const num = pill.querySelector('.pos-pill-num');
        const lbl = pill.querySelector('.pos-pill-label');
        if (num) num.style.color = lineColor;
        if (lbl) lbl.style.color = '';
      }
    });
  }

  function attachExitFavListeners(container, slug, lineColor) {
    const rows = container.querySelectorAll('.position-row');
    rows.forEach(row => {
      function getPillValues() {
        const nums = row.querySelectorAll('.pos-pill-num');
        if (nums.length < 2) return null;
        return { wagon: nums[0].textContent.trim(), doors: nums[1].textContent.trim() };
      }

      function showExitFavToast(row, added) {
        let existing = row.querySelector('.exit-fav-toast');
        if (existing) { existing.classList.remove('fav-note-open'); setTimeout(() => existing?.remove(), 300); }

        if (!added) return;
        const pv = getPillValues(); if (!pv) return;

const toast = document.createElement('div');
        toast.className = 'exit-fav-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.innerHTML = '<span class="exit-fav-toast-text">Вихід&nbsp;додано<br>до&nbsp;вибраного</span>';
                row.prepend(toast);
        requestAnimationFrame(() => toast.classList.add('fav-note-open'));

setTimeout(() => {
          toast.classList.remove('fav-note-open');
          setTimeout(() => toast.remove(), 300);
        }, 2500);
      }
function triggerExitFav() {
        const pv = getPillValues(); if (!pv) return;
        const dirBlock = row.closest('.direction-block') || row.closest('.long-transfer-block');
        const labelEl = dirBlock ? (dirBlock.querySelector('.direction-label') || dirBlock.querySelector('.transfer-text')) : null;
        const dirLabel = labelEl ? labelEl.textContent.trim() : '';
        
// Викликаємо оновлену функцію
        const result = toggleExitFav(slug, dirLabel, pv.wagon, pv.doors);

        // Ховаємо підказку назавжди, якщо це перше успішне додавання
        if (result.status === 'added') {
          const hint = document.getElementById('onboardingHint');
          if (hint) {
            hint.style.opacity = '0';
            setTimeout(() => hint.remove(), 300);
          }
        }

        // Перевіряємо, чи не влучили ми в ліміт
        if (result.status === 'limit') {
          if (typeof MetroApp.showCustomConfirm === 'function') {
            MetroApp.showCustomConfirm('Ліміт: можна зберегти не більше 3 виходів для одного напрямку.', () => {});
          }
          return; // Перериваємо функцію, жодні кольори не міняються!
        }

        const added = result.status === 'added';
                applyFavPillStyles(row, lineColor, added);
        showExitFavToast(row, added);

        const favBtnBar = document.querySelector('.fav-btn-bar');
        if (favBtnBar && favBtnBar.dataset.slug === slug) {
          const nowFav = isFav(slug);
          favBtnBar.innerHTML = heartSvg(nowFav, slug, lineColor);
          favBtnBar.classList.toggle('fav-active', nowFav);
        }
      }

      const pv = getPillValues();
      if (pv) {
        const dirBlock = row.closest('.direction-block') || row.closest('.long-transfer-block');
        const labelEl = dirBlock ? (dirBlock.querySelector('.direction-label') || dirBlock.querySelector('.transfer-text')) : null;
        const dirLabel = labelEl ? labelEl.textContent.trim() : '';
        if (isExitFav(slug, dirLabel, pv.wagon, pv.doors)) {
          applyFavPillStyles(row, lineColor, true);
        }
      }

      let longPressTimer = null;
      row.addEventListener('touchstart', e => {
        longPressTimer = setTimeout(() => { longPressTimer = null; triggerExitFav(); }, 600);
      }, { passive: true });
      row.addEventListener('touchend', () => { clearTimeout(longPressTimer); longPressTimer = null; }, { passive: true });
      row.addEventListener('touchmove', () => { clearTimeout(longPressTimer); longPressTimer = null; }, { passive: true });

      let tapCount = 0; let tapTimer = null;
      row.addEventListener('click', e => {
        if (e.target.closest('.pos-edited-mark, .exit-fav-cancel, .edit-info-panel')) return;
        tapCount++;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => { tapCount = 0; }, 500);
        if (tapCount >= 2) { tapCount = 0; clearTimeout(tapTimer); triggerExitFav(); }
      });
    });
  }

function withUnsavedCheck(proceed) {
    if (MetroApp.hasUnsavedFeedback?.()) {
      const _fbSlug = document.getElementById('fbStation')?.value || '';
      const _fbData = _fbSlug ? MetroApp.currentStationsData?.[_fbSlug] : null;
      const stationName = _fbData?.name || '';
      const question = stationName
        ? `Зберегти зміни для станції <span style="white-space: nowrap;">${stationName}?</span>`
        : 'Зберегти зміни?';
      MetroApp.showCustomConfirm(question,
        () => { MetroApp.triggerFeedbackSubmit?.(true); MetroApp.fbUnsaved = false; proceed(); },
        () => { MetroApp.fbUnsaved = false; proceed(); },
        () => {}
      );
      return true;
    }
    proceed();
    return false;
  }

function openStation(slug) {
    withUnsavedCheck(actualOpenStation);

    function actualOpenStation() {
      if (!stationsData?.[slug]) return;
      currentStationSlug = slug;
      const s = stationsData[slug];
      const color = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
      const fav = isFav(slug);

// Перевіряємо, чи є в користувача збережені виходи
// Оновлена підказка з іконкою та новим текстом
      const onboardingHtml = getExitFavs().length === 0 ? `<div class="onboarding-hint" id="onboardingHint"><span class="hint-icon-wrap">${MetroApp.Icons.info}</span>Натисніть двічі на вагон та двері, щоб зберегти вихід</div>` : '';

document.getElementById('stationTitleMain').textContent = s.name;
      sheetBody.innerHTML = `${onboardingHtml}${renderDirections(s, color)}`;
                  sheetBody.querySelectorAll('.nav-label').forEach(el => {
        const target = slugByName(el.dataset.name || '');
        if (target && target !== slug) el.classList.add('nav-link');
      });

      if (slug === 'R.Khreshchatyk') {
        sheet.classList.add('sheet-fullscreen', 'sheet-scrollable');
        sheet.style.maxHeight = '';
      } else {
        sheet.style.maxHeight = '';
        sheet.classList.remove('sheet-fullscreen', 'sheet-scrollable');
      }

      const handle = sheet.querySelector('.sheet-handle');
      if (handle) handle.style.background = color;

      const favBtnBar = sheet.querySelector('.fav-btn-bar');
 if (favBtnBar) {
        favBtnBar.dataset.slug = slug;
        favBtnBar.dataset.color = color;
        favBtnBar.innerHTML = heartSvg(fav, slug, color);
        favBtnBar.classList.toggle('fav-active', fav);
      }

      // ЗАКРИВАЄМО ВСІ ІНШІ ВІКНА (Вибране, Пошук тощо), щоб вони не висіли фоном
      document.querySelectorAll('.station-sheet').forEach(el => {
        if (el.id !== 'stationSheet') el.classList.remove('sheet-open');
      });

      if (!sheet.classList.contains('sheet-open')) { 
        sheet.classList.add('sheet-open'); 
        sheetOverlay.classList.add('overlay-visible'); 
      }
      attachExitFavListeners(sheetBody, slug, color);
      MetroApp.attachCheckinButtons(sheetBody, slug, color);
    }
  }
function closeAllSheets(force = false) {
    if (!force) {
      if (withUnsavedCheck(() => closeAllSheets(true))) return false;
    }

    const openSheets = [...document.querySelectorAll('.station-sheet.sheet-open')];
    const overlay = document.getElementById('sheetOverlay');
    const dropMenu = document.getElementById('dropMenu');
    if (dropMenu) { dropMenu.classList.remove('show'); dropMenu.hidden = true; }

    if (!openSheets.length) {
      overlay?.classList.remove('overlay-visible');
      return;
    }

    // Анімуємо тільки верхню (останню відкриту) шторку
    const topSheet = openSheets[openSheets.length - 1];
    MetroApp.animateSheetClose(topSheet, () => {
      openSheets.forEach(el => el.classList.remove('sheet-open'));
      overlay?.classList.remove('overlay-visible');
    });
  }
  MetroApp.closeAllSheets = closeAllSheets;

  MetroApp.refreshCurrentStation = function() {
    if (!currentStationSlug) return;
    if (typeof MetroApp.applyExitLabels === 'function') MetroApp.applyExitLabels(stationsData);
    if (stationsData[currentStationSlug] && sheet.classList.contains('sheet-open')) {
      const s = stationsData[currentStationSlug];
      const color = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
const prevScrollTop = sheetBody.scrollTop;
      document.getElementById('stationTitleMain').textContent = s.name;
      sheetBody.innerHTML = `${renderDirections(s, color)}`;
      sheetBody.querySelectorAll('.nav-label').forEach(el => {
        const target = slugByName(el.dataset.name || '');
        if (target && target !== currentStationSlug) el.classList.add('nav-link');
      });
      attachExitFavListeners(sheetBody, currentStationSlug, color);
      MetroApp.attachCheckinButtons(sheetBody, currentStationSlug, color);
      sheetBody.scrollTop = prevScrollTop;
    }
  };

  sheetClose.addEventListener('click', () => closeAllSheets());

  sheetBody.addEventListener('click', e => {
    // --- навігаційні мітки (пересадки) ---
    const navLabel = e.target.closest('.nav-label');
    if (navLabel) {
      const target = slugByName(navLabel.dataset.name || '');
      if (target && target !== currentStationSlug) {
        e.stopPropagation();
        openStation(target);
        return;
      }
    }

    // --- олівець «значення змінено користувачем» ---
    const pencil = e.target.closest('.pos-edited-mark');
    if (pencil) {
      e.stopPropagation();
      const row = pencil.closest('.position-row');
      const slug = pencil.dataset.slug; const idx = pencil.dataset.idx;

      let panel = row.nextElementSibling;
      if (panel && panel.classList.contains('edit-info-panel')) {
        panel.classList.remove('panel-open');
        setTimeout(() => { if (!panel.classList.contains('panel-open')) panel.remove(); }, 300);
        return;
      }

      document.querySelectorAll('.edit-info-panel').forEach(p => {
        p.classList.remove('panel-open');
        setTimeout(() => p.remove(), 300);
      });

      panel = document.createElement('div');
      panel.className = 'edit-info-panel';
      panel.innerHTML = '<div class="fb-closed-note-wrap" style="pointer-events:auto;margin:4px 0 0"><span class="fb-closed-note">Значення змінено користувачем</span><button class="fb-restore-exit edit-info-cancel" style="pointer-events:auto" data-slug="' + slug + '" data-idx="' + idx + '">' + MetroApp.Icons.undo + '</button></div>';
      row.after(panel);
      requestAnimationFrame(() => panel.classList.add('panel-open'));

      panel.querySelector('.edit-info-cancel').addEventListener('click', (ev) => {
        ev.stopPropagation();
        try {
          const edits = JSON.parse(localStorage.getItem('metro_local_edits') || '{}');
          if (edits[slug] && edits[slug][idx]) {
            delete edits[slug][idx];
            if (Object.keys(edits[slug]).length === 0) delete edits[slug];
            localStorage.setItem('metro_local_edits', JSON.stringify(edits));
            MetroApp.invalidateLocalEditsCache?.();
          }
          panel.classList.remove('panel-open');
setTimeout(() => panel.remove(), 300);
          reloadStationsData(true)
            .then(() => openStation(slug))
            .catch(err => {
              console.error('Помилка оновлення даних після скидання правок', err);
              MetroApp.showCustomConfirm('Помилка з\'єднання. Спробуйте ще раз.', () => {}, null, null);
            });
        } catch(err) { console.error('edit reset failed', err); }
      });
    }
  });

  sheet.querySelector('.fav-btn-bar')?.addEventListener('click', e => {
    const btn = e.currentTarget;
    const slug = btn.dataset.slug;
    if (!slug) return;
    const color = btn.dataset.color || 'var(--text-muted)';
    const nowFav = toggleFav(slug);
    btn.innerHTML = heartSvg(nowFav, slug, color);
    btn.classList.toggle('fav-active', nowFav);
  });

  sheetOverlay.addEventListener('click', (e) => {
    if (e.target !== sheetOverlay) return;
    const dropMenu = document.getElementById('dropMenu');
    if (dropMenu && dropMenu.classList.contains('show')) return;

    // --- ВІДНОВЛЮЄМО ЛОГІКУ ПЕРЕКЛЮЧЕННЯ МІЖ СТАНЦІЯМИ ---
    // Тимчасово ігноруємо оверлей, щоб зрозуміти, чи не натиснули ми на іншу станцію "під" ним
    sheetOverlay.style.pointerEvents = 'none';
    const elUnder = document.elementFromPoint(e.clientX, e.clientY);
    sheetOverlay.style.pointerEvents = '';

    const zone = elUnder?.closest('[id]');
    if (zone && zone.id) {
      const rawId = zone.id.replace(/\d+$/, '').toLowerCase();
      const slug = Object.keys(stationsData).find(k => k.toLowerCase() === rawId);
      if (slug && slug !== currentStationSlug) {
        // Якщо натиснули на іншу станцію — відкриваємо її (стара оновиться автоматично)
        openStation(slug);
        return;
      }
    }

    // Якщо натиснули просто на порожнє місце — закриваємо все
    closeAllSheets();
  });
  let isHandleSwipeMain = false;
  let swipeScrollTop = 0;
  let swipeStartYMain = 0;
  sheet.addEventListener('touchstart', e => { 
      swipeStartYMain = e.touches[0].clientY;
      swipeScrollTop = sheetBody.scrollTop;
      isHandleSwipeMain = !!e.target.closest('.sheet-handle-bar') || sheet.classList.contains('sheet-scrollable');
  }, { passive: true });
  sheet.addEventListener('touchend', e => { 
      if (!isHandleSwipeMain) return;
      const dy = e.changedTouches[0].clientY - swipeStartYMain;
      if (sheet.classList.contains('sheet-scrollable')) { if (dy > 60 && swipeScrollTop <= 0) closeAllSheets(); } 
      else { if (dy > 60) closeAllSheets(); }
  });

  const THEME_KEY = 'metro_theme';
  const root = document.documentElement;

function applyTheme(theme) {
    // Тимчасово блокуємо всі анімації на сторінці під час зміни теми
    const css = document.createElement('style');
    css.textContent = '*, *::before, *::after { transition: none !important; }';
    document.head.appendChild(css);

    root.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    const t = document.getElementById('settingsThemeToggle');
    if (t) t.checked = theme === 'dark';

    // Знімаємо блокування після відмальовки
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        css.remove();
      });
    });
  }
  
    applyTheme(localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  const menuBtn = document.getElementById('menuBtn');
  const dropMenu = document.getElementById('dropMenu');

  if (menuBtn && dropMenu) {
    menuBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      dropMenu.classList.toggle('show'); dropMenu.hidden = !dropMenu.classList.contains('show');
    });

    document.addEventListener('click', (e) => {
      if (!dropMenu.contains(e.target) && !menuBtn.contains(e.target)) { dropMenu.classList.remove('show'); dropMenu.hidden = true; }
    });

    document.getElementById('themeToggleItem')?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      dropMenu.classList.remove('show'); dropMenu.hidden = true;
      openSettingsSheet();
    });

    document.getElementById('feedbackItem')?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      dropMenu.classList.remove('show'); dropMenu.hidden = true;
      document.getElementById('aboutSheet')?.classList.remove('sheet-open');
      if (typeof MetroApp.openFeedbackSheet === 'function') MetroApp.openFeedbackSheet(stationsData);
    });

    document.getElementById('aboutItem')?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      dropMenu.classList.remove('show'); dropMenu.hidden = true;

      function executeAboutTransition() {
        document.getElementById('feedbackSheet')?.classList.remove('sheet-open');
        if (typeof openAboutSheet === 'function') openAboutSheet();
      }
      withUnsavedCheck(executeAboutTransition);
    });
  }

  function openAboutSheet() {
    let aboutSheet = document.getElementById('aboutSheet');
    if (!aboutSheet) {
      aboutSheet = document.createElement('div');
      aboutSheet.id = 'aboutSheet';
      aboutSheet.className = 'station-sheet about-station-sheet';
      
      const template = document.getElementById('tpl-about-sheet');
      aboutSheet.appendChild(template.content.cloneNode(true));
      
      document.body.appendChild(aboutSheet);
      
      document.getElementById('aboutClose').addEventListener('click', () => {
        MetroApp.animateSheetClose(aboutSheet, () => {
          aboutSheet.classList.remove('sheet-open');
          if (document.querySelectorAll('.station-sheet.sheet-open').length === 0) document.getElementById('sheetOverlay').classList.remove('overlay-visible');
        });
      });
    }
document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
    aboutSheet.classList.add('sheet-open', 'sheet-fullscreen', 'sheet-scrollable');
    document.getElementById('sheetOverlay').classList.add('overlay-visible');
  }

const searchBtnTop = document.getElementById('searchBtnTop');

function openSearchSheet() {
    let searchSheet = document.getElementById('searchSheet');
    
    if (!searchSheet) {
      searchSheet = document.createElement('div');
      searchSheet.id = 'searchSheet';
      searchSheet.className = 'station-sheet search-station-sheet sheet-scrollable';
      
      const template = document.getElementById('tpl-search-sheet');
      searchSheet.appendChild(template.content.cloneNode(true));
      
      document.body.appendChild(searchSheet);

      document.getElementById('searchClose').addEventListener('click', () => {
  searchSheet._cleanupVP?.();
  searchSheet.style.maxHeight = '';
  document.getElementById('searchInput').blur();
  MetroApp.animateSheetClose(searchSheet, () => {
    searchSheet.classList.remove('sheet-open');
    if (document.querySelectorAll('.station-sheet.sheet-open').length === 0) {
      document.getElementById('sheetOverlay').classList.remove('overlay-visible');
    }
  });
});

// ВСІ СЛУХАЧІ ВІШАЮТЬСЯ РІВНО 1 РАЗ ПРИ СТВОРЕННІ HTML
      const input = document.getElementById('searchInput');
      const resultsContainer = document.getElementById('searchResults');

      input.addEventListener('input', (e) => {
        renderSearchResults(e.target.value.trim().toLowerCase(), resultsContainer, activeLineFilter);
      });

      document.getElementById('searchLineFilter').addEventListener('click', e => {
        const btn = e.target.closest('.search-line-btn');
        if (!btn) return;
        const line = btn.dataset.line;
        const allBtn = document.querySelector('.search-line-btn[data-line=""]');

        if (line === '') {
          // «Всі» — скидаємо всі активні фільтри гілок
          activeLineFilter = new Set();
          document.querySelectorAll('.search-line-btn').forEach(b => b.classList.toggle('is-active', b === btn));
        } else {
          // Гілка: знімаємо «Всі», перемикаємо вибрану
          allBtn?.classList.remove('is-active');
          if (activeLineFilter.has(line)) {
            activeLineFilter.delete(line);
          } else {
            activeLineFilter.add(line);
          }
          btn.classList.toggle('is-active', activeLineFilter.has(line));
          // Якщо жодної не вибрано — повертаємось до «Всі»
          if (activeLineFilter.size === 0) {
            activeLineFilter = new Set();
            allBtn?.classList.add('is-active');
          }
        }
        renderSearchResults(input.value.trim().toLowerCase(), resultsContainer, activeLineFilter);
      });

      resultsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.search-item');
        if (!item) return;
        
        document.getElementById('searchInput').blur(); 
        document.getElementById('searchClose').click(); 
        setTimeout(() => openStation(item.dataset.slug), 200); 
      });

      let swY = 0; let isHandleSearch = false;
      searchSheet.addEventListener('touchstart', e => { swY = e.touches[0].clientY; isHandleSearch = !!e.target.closest('.sheet-handle-bar'); }, { passive: true });
      searchSheet.addEventListener('touchend', e => { if (isHandleSearch && (e.changedTouches[0].clientY - swY > 60)) document.getElementById('searchClose').click(); });
    }
// Адаптація під клавіатуру (visualViewport)
    // iOS: відступ знизу для системних елементів управління (home indicator, тулбар Safari)
    const IOS_BOTTOM_OFFSET = 56; // px — місце для жесту «додому» / адресного рядка
    if (window.visualViewport) {
      const onVPResize = () => {
        const safeH = window.visualViewport.height - IOS_BOTTOM_OFFSET;
        searchSheet.style.maxHeight = Math.max(200, safeH) + 'px';
      };
      onVPResize();
      window.visualViewport.addEventListener('resize', onVPResize);
      searchSheet._cleanupVP = () => window.visualViewport.removeEventListener('resize', onVPResize);
    } else {
      searchSheet.style.maxHeight = (window.innerHeight - IOS_BOTTOM_OFFSET) + 'px';
    }
    const input = document.getElementById('searchInput');
    const resultsContainer = document.getElementById('searchResults');
    activeLineFilter = new Set();
    document.querySelectorAll('.search-line-btn').forEach((b, i) => b.classList.toggle('is-active', i === 0));
    input.value = '';
    renderSearchResults('', resultsContainer, '');

document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
searchSheet.classList.add('sheet-open');
document.getElementById('sheetOverlay').classList.add('overlay-visible');

  }

  function renderSearchResults(query, container, lineFilter) {
    if (lineFilter === undefined) lineFilter = new Set();
    if (!stationsData) {
      container.innerHTML = '<p class="fav-empty-text">Дані ще завантажуються...</p>';
      return;
    }
    const allStations = Object.values(stationsData);
    let filtered = allStations;
    if (query) {
      const rawQuery = query.toLowerCase().trim().replace(/[''`]/g, '');
      const queryWords = rawQuery.split(/\s+/).filter(w => w.length > 0);
      const queryNoSpaces = rawQuery.replace(/\s+/g, '');
      filtered = allStations.filter(s =>
        queryWords.every(qWord => s._searchIndex.some(idxWord => idxWord.startsWith(qWord)))
        || s._searchIndex.includes(queryNoSpaces)
      );
    }
    if (lineFilter instanceof Set && lineFilter.size > 0) {
      filtered = filtered.filter(s => lineFilter.has(s.line));
    } else if (typeof lineFilter === 'string' && lineFilter) {
      filtered = filtered.filter(s => s.line === lineFilter);
    }
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    if (filtered.length === 0) {
      container.innerHTML = '<p class="fav-empty-text" style="padding-top:32px;">Станцію не знайдено</p>';
      return;
    }
    container.innerHTML = filtered.map(s => {
      const color = MetroApp.LINE_COLOR[s.line];
      return `<div class="search-item" data-slug="${s.slug}"><div class="search-item-line" style="background-color:${color}"></div><div>${s.name}</div></div>`;
    }).join('');
  }

  searchBtnTop.addEventListener('click', openSearchSheet);

// ══ ОФЛАЙН-ІНДИКАТОР ══
  (function() {
    const banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.className = 'offline-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.textContent = 'Офлайн — відображаються кешовані дані';
    banner.hidden = navigator.onLine;
    document.body.appendChild(banner);
    window.addEventListener('offline', () => { banner.hidden = false; });
    window.addEventListener('online',  () => { banner.hidden = true; });
  })();

  // ══ CHECK-IN MODE ══
  const CHECKIN_KEY = 'metro_checkins';

  function getCheckins() {
    try { return JSON.parse(localStorage.getItem(CHECKIN_KEY) || '{}'); }
    catch(e) { return {}; }
  }

  function checkinId(slug, dir, wagon, doors) { return `${slug}|${dir}|${wagon}|${doors}`; }

  function isCheckedIn(slug, dir, wagon, doors) {
    return !!getCheckins()[checkinId(slug, dir, wagon, doors)];
  }

  function toggleCheckin(slug, dir, wagon, doors, lineColor) {
    const id = checkinId(slug, dir, wagon, doors);
    const all = getCheckins();
    if (all[id]) { delete all[id]; }
    else { all[id] = { slug, dir, wagon, doors, color: lineColor, ts: Date.now() }; }
    localStorage.setItem(CHECKIN_KEY, JSON.stringify(all));
    updateCheckinDock();
    return !!all[id];
  }

  function isCheckinMode() { return localStorage.getItem('metro_checkin_mode') === 'true'; }

function updateCheckinDock() {
    const btn = document.getElementById('checkinBtn');
    if (!btn) return;
    btn.hidden = !isCheckinMode();
    // Лічильник повністю видалено
  }

  const CHECKIN_PIN_SVG_OFF = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16,1C9.925,1,5,5.925,5,12c0,9,11,18,11,18s11-9,11-18C27,5.925,22.075,1,16,1z M16,28.677 C13.71,26.629,6,19.202,6,12C6,6.486,10.486,2,16,2s10,4.486,10,10C26,19.202,18.29,26.629,16,28.677z M16,6c-3.314,0-6,2.686-6,6 s2.686,6,6,6s6-2.686,6-6S19.314,6,16,6z M16,17c-2.757,0-5-2.243-5-5s2.243-5,5-5s5,2.243,5,5S18.757,17,16,17z" fill="currentColor"/></svg>`;

  function checkinPinSvg(checked, lineColor) {
    if (!checked) return CHECKIN_PIN_SVG_OFF;
    return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M16,29.343C17.786,27.79,26.5,19.809,26.5,12c0-5.79-4.71-10.5-10.5-10.5S5.5,6.21,5.5,12 C5.5,19.809,14.214,27.79,16,29.343z" fill="${lineColor}"/>
      <circle cx="16" cy="12" r="5.5" fill="var(--bg)"/>
      <path d="M16,1C9.925,1,5,5.925,5,12c0,9,11,18,11,18s11-9,11-18C27,5.925,22.075,1,16,1z M16,28.677 C13.71,26.629,6,19.202,6,12C6,6.486,10.486,2,16,2s10,4.486,10,10C26,19.202,18.29,26.629,16,28.677z" fill="${lineColor}"/>
    </svg>`;
  }

  MetroApp.attachCheckinButtons = function(container, slug, lineColor) {
    if (!isCheckinMode()) return;
    container.querySelectorAll('.position-row').forEach(row => {
      if (row.querySelector('.pos-checkin-btn')) return;
      const nums = row.querySelectorAll('.pos-pill-num');
      if (nums.length < 2) return;
      const wagon = nums[0].textContent.trim();
      const doors  = nums[1].textContent.trim();
      const dirBlock = row.closest('.direction-block') || row.closest('.long-transfer-block');
      const labelEl  = dirBlock ? (dirBlock.querySelector('.direction-label') || dirBlock.querySelector('.transfer-text')) : null;
      const dir = labelEl ? labelEl.textContent.trim() : '';
      const checked = isCheckedIn(slug, dir, wagon, doors);

      const btn = document.createElement('button');
      btn.className = 'pos-checkin-btn' + (checked ? ' is-checked-in' : '');
      btn.setAttribute('aria-label', 'Позначити вихід');
      btn.innerHTML = checkinPinSvg(checked, lineColor);
      row.appendChild(btn);

      btn.addEventListener('click', e => {
        e.stopPropagation();
        const nowChecked = toggleCheckin(slug, dir, wagon, doors, lineColor);
        btn.classList.toggle('is-checked-in', nowChecked);
        btn.innerHTML = checkinPinSvg(nowChecked, lineColor);
      });
    });
  };

  // ══ SETTINGS SHEET ══
  function openSettingsSheet() {
    let settingsSheet = document.getElementById('settingsSheet');
    if (!settingsSheet) {
      settingsSheet = document.createElement('div');
      settingsSheet.id = 'settingsSheet';
      settingsSheet.className = 'station-sheet settings-station-sheet';
      const tpl = document.getElementById('tpl-settings-sheet');
      settingsSheet.appendChild(tpl.content.cloneNode(true));
      document.body.appendChild(settingsSheet);

      document.getElementById('settingsClose').addEventListener('click', () => {
        MetroApp.animateSheetClose(settingsSheet, () => {
          settingsSheet.classList.remove('sheet-open');
          if (!document.querySelectorAll('.station-sheet.sheet-open').length)
            document.getElementById('sheetOverlay').classList.remove('overlay-visible');
        });
      });

      const themeToggle = document.getElementById('settingsThemeToggle');
      if (themeToggle) {
        themeToggle.checked = (localStorage.getItem('metro_theme') || 'dark') === 'dark';
        themeToggle.addEventListener('change', e => applyTheme(e.target.checked ? 'dark' : 'light'));
      }
      const startFavToggle = document.getElementById('settingsStartFavToggle');
      if (startFavToggle) {
        startFavToggle.checked = localStorage.getItem('metro_start_on_fav') === 'true';
        startFavToggle.addEventListener('change', e => localStorage.setItem('metro_start_on_fav', e.target.checked));
      }
      const checkinToggle = document.getElementById('settingsCheckinToggle');
      if (checkinToggle) {
        checkinToggle.checked = isCheckinMode();
        checkinToggle.addEventListener('change', e => {
          localStorage.setItem('metro_checkin_mode', e.target.checked);
          updateCheckinDock();
          if (currentStationSlug && sheet.classList.contains('sheet-open')) {
            const color = MetroApp.LINE_COLOR[stationsData[currentStationSlug]?.line] || 'var(--text-muted)';
            if (e.target.checked) MetroApp.attachCheckinButtons(sheetBody, currentStationSlug, color);
            else sheetBody.querySelectorAll('.pos-checkin-btn').forEach(b => b.remove());
          }
        });
      }

      const checkinInfoBtn = document.getElementById('settingsCheckinInfo');
      const checkinHint    = document.getElementById('settingsCheckinHint');
      if (checkinInfoBtn && checkinHint) {
        checkinInfoBtn.addEventListener('click', () => {
          const open = !checkinHint.hidden;
          checkinHint.hidden = open;
          checkinInfoBtn.classList.toggle('settings-info-btn-active', !open);
        });
      }

      const clearCheckinBtn = document.getElementById('settingsClearCheckin');
      if (clearCheckinBtn) {
        clearCheckinBtn.addEventListener('click', () => {
          MetroApp.showCustomConfirm('Очистити весь журнал check‑in?', () => {
            localStorage.removeItem(CHECKIN_KEY);
            updateCheckinDock();
            document.querySelectorAll('.pos-checkin-btn.is-checked-in').forEach(b => {
              b.classList.remove('is-checked-in');
              b.innerHTML = CHECKIN_PIN_SVG_OFF;
            });
          }, null, null);
        });
      }

      let swY = 0, isSwipeSettings = false;
      settingsSheet.addEventListener('touchstart', e => { swY = e.touches[0].clientY; isSwipeSettings = !!e.target.closest('.sheet-handle-bar'); }, { passive: true });
      settingsSheet.addEventListener('touchend',   e => { if (isSwipeSettings && e.changedTouches[0].clientY - swY > 60) document.getElementById('settingsClose').click(); });
    } else {
      const t = document.getElementById('settingsThemeToggle');    if (t) t.checked = (localStorage.getItem('metro_theme') || 'dark') === 'dark';
      const s = document.getElementById('settingsStartFavToggle'); if (s) s.checked = localStorage.getItem('metro_start_on_fav') === 'true';
      const c = document.getElementById('settingsCheckinToggle');  if (c) c.checked = isCheckinMode();
    }
    document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
    settingsSheet.classList.add('sheet-open');
    document.getElementById('sheetOverlay').classList.add('overlay-visible');
  }

  updateCheckinDock();

MetroApp.animateSheetClose = function(sheetEl, callback) {
    if (!sheetEl || !sheetEl.classList.contains('sheet-open')) { callback?.(); return; }
    const rect = sheetEl.getBoundingClientRect();
    if (rect.height < 10) { callback?.(); return; }

    const baseStyle = [
      `position:fixed`, `top:${rect.top}px`, `left:${rect.left}px`,
      `width:${rect.width}px`, `height:${rect.height}px`,
      `margin:0`, `transform:none`, `pointer-events:none`, `z-index:9999`,
      `transition:transform 0.35s cubic-bezier(0.32,0.72,0,1),opacity 0.3s ease`
    ].join(';');

    const leftDoor  = sheetEl.cloneNode(true);
    const rightDoor = sheetEl.cloneNode(true);
    leftDoor.setAttribute('style',  baseStyle + ';clip-path:inset(0 50% 0 0)');
    rightDoor.setAttribute('style', baseStyle + ';clip-path:inset(0 0 0 50%)');

    document.body.appendChild(leftDoor);
    document.body.appendChild(rightDoor);
    sheetEl.style.visibility = 'hidden';

    void leftDoor.offsetWidth; // reflow

    leftDoor.style.transform  = 'translateX(-50%)';
    rightDoor.style.transform = 'translateX(50%)';
    leftDoor.style.opacity    = '0';
    rightDoor.style.opacity   = '0';

setTimeout(() => {
      leftDoor.remove();
      rightDoor.remove();
      callback?.(); // Спочатку відпрацьовує закриття
      // Чекаємо мить, поки CSS "вб'є" позицію, і тільки тоді повертаємо видимість
      setTimeout(() => { sheetEl.style.visibility = ''; }, 50);
    }, 360);
}; // <--- ОСЬ ЦЯ ДУЖКА ВРЯТУЄ ДОДАТОК! Вона закриває animateSheetClose.

MetroApp.showCustomConfirm = function(message, onYes, onNo, onCancel) {
    const overlay = document.createElement('div');
    overlay.className = 'global-confirm-overlay';
    
    overlay.innerHTML = `
      <div class="global-confirm-card">
        <div class="global-confirm-text">${message}</div>
        <div class="global-confirm-btns-main">
          <button class="confirm-main-btn confirm-btn-save" id="confirmYes">Зберегти</button>
          <button class="confirm-main-btn confirm-btn-discard" id="confirmNo">Не зберігати</button>
        </div>
        ${onCancel ? `<button class="confirm-text-btn" id="confirmCancel">Скасувати</button>` : ''}
      </div>
    `;
    document.body.appendChild(overlay);

function animateClose(callback) {
      const card = overlay.querySelector('.global-confirm-card');
      if (!card) {
        overlay.remove();
        if (callback) callback();
        return;
      }

      const rect = card.getBoundingClientRect();
      const leftDoor = card.cloneNode(true);
      const rightDoor = card.cloneNode(true);

      [leftDoor, rightDoor].forEach(door => {
        door.style.position = 'fixed';
        door.style.top = rect.top + 'px';
        door.style.left = rect.left + 'px';
        door.style.width = rect.width + 'px';
        door.style.height = rect.height + 'px';
        door.style.margin = '0';
        door.style.animation = 'none';
        door.style.transition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease';
        door.style.pointerEvents = 'none';
      });

      leftDoor.style.clipPath = 'inset(0 50% 0 0)';
      rightDoor.style.clipPath = 'inset(0 0 0 50%)';

      overlay.appendChild(leftDoor);
      overlay.appendChild(rightDoor);
      card.style.display = 'none';

      // 🛑 МАГІЯ ДЛЯ FIREFOX: Примусовий reflow. 
      // Читаючи offsetWidth, ми змушуємо браузер відмалювати елементи прямо зараз.
      void leftDoor.offsetWidth;

      // Тепер браузер точно знає стартову позицію і плавно відіграє зміну стилів
      overlay.style.transition = 'background-color 0.35s, backdrop-filter 0.35s';
      overlay.style.backgroundColor = 'transparent';
      overlay.style.backdropFilter = 'blur(0px)';
      
      leftDoor.style.transform = 'translateX(-50%)';
      rightDoor.style.transform = 'translateX(50%)';
      leftDoor.style.opacity = '0';
      rightDoor.style.opacity = '0';

      setTimeout(() => {
        overlay.remove();
        if (callback) callback();
      }, 350);
    }

    overlay.querySelector('#confirmYes').addEventListener('click', () => animateClose(onYes));
    overlay.querySelector('#confirmNo').addEventListener('click', () => animateClose(onNo));
    const cancelBtn = overlay.querySelector('#confirmCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => animateClose(onCancel));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) animateClose(onCancel); });
  };
})();

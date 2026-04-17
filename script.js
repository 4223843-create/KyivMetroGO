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
(function () {

  /* ==========================================================================
     1. ГЛОБАЛЬНІ ЗМІННІ ТА DOM ЕЛЕМЕНТИ
     ========================================================================== */
  const vp = document.getElementById('mapViewport');
  const inner = document.getElementById('mapInner');
  const img = document.getElementById('mapImg');
  
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

// Запобіжник (прибирає лоадер через 10 сек примусово, даючи час повільному інтернету)
  setTimeout(() => {
    const vp = document.getElementById('mapViewport');
    if (vp && vp.classList.contains('is-loading')) removeLoader();
  }, 10000);



/* ==========================================================================
     2. УПРАВЛІННЯ КАРТОЮ (ZOOM ТА PAN)
     ========================================================================== */
  const centerX = 0.485, centerY = 0.5;

  function applyZoomAndCenter() {
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    
    if (!natW || !natH) {
      if (img.complete) setTimeout(applyZoomAndCenter, 50);
      return;
    }
    
    const w = Math.min(window.innerWidth, document.documentElement.clientWidth);
    const sf = w <= 500 ? 4.5 : 1.5;
    const minZoom = vp.clientWidth / natW; 
    const zoom = Math.max(minZoom, Math.min(4.0, Math.round(vp.clientWidth * sf) / natW));
    
    const newW = Math.round(natW * zoom);
    const newH = Math.round(natH * zoom);
    
    inner.style.width = newW + 'px';
    inner.style.height = newH + 'px';
    
    const padX = Math.max(0, (vp.clientWidth - newW) / 2);
    const padY = Math.max(0, (vp.clientHeight - newH) / 2);
    inner.style.marginLeft = padX + 'px';
    inner.style.marginTop = padY + 'px';
    
    img.style.width = img.style.height = '100%';
    
    requestAnimationFrame(() => {
      const targetX = padX + newW * centerX;
      const targetY = padY + newH * centerY;
      vp.scrollLeft = Math.max(0, targetX - vp.clientWidth / 2);
      vp.scrollTop = Math.max(0, targetY - vp.clientHeight / 2);
      
      isMapReady = true;
      checkAppReady();
    });
  } // <--- ОСЬ ЦЯ ДУЖКА ЗАГУБИЛАСЯ МИНУЛОГО РАЗУ!

  function adjustViewportHeight() {
    if (!vp) return;
    const top = vp.getBoundingClientRect().top;
    const avail = Math.floor((window.visualViewport?.height ?? window.innerHeight) - top - 8);
    vp.style.height = Math.max(120, avail) + 'px';
  }

  MetroApp.applyZoomAndCenter = applyZoomAndCenter;
  
  if (img.complete) {
    adjustViewportHeight();
    applyZoomAndCenter();
  } else {
    img.addEventListener('load', () => {
      adjustViewportHeight();
      applyZoomAndCenter();
    });
  }

  let resizeTimer;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { adjustViewportHeight(); applyZoomAndCenter(); }, 120); };  
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 120));




  
document.addEventListener('DOMContentLoaded', () => { 
    if (localStorage.getItem('metro_start_on_fav') === 'true') {
      setTimeout(() => { openFavSheet(); }, 50);
    }
  });






/* Pinch zoom (ОПТИМІЗОВАНО з Throttling) */
  let lastPinchDist = null;
  let isPinching = false;

  document.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || sheetOverlay.classList.contains('overlay-visible')) return;
    e.preventDefault();

if (!isPinching && lastPinchDist) {
      isPinching = true;
      
      // ✅ Кешуємо координати ДО відкладеного виклику rAF
      const t0x = e.touches[0].clientX;
      const t0y = e.touches[0].clientY;
      const t1x = e.touches[1].clientX;
      const t1y = e.touches[1].clientY;

      requestAnimationFrame(() => {
        // Працюємо виключно зі збереженими цифрами
        const dx = t0x - t1x;
        const dy = t0y - t1y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const midX = (t0x + t1x) / 2;
        const midY = (t0y + t1y) / 2;

        const ratio = dist / lastPinchDist;
        const oldW = inner.offsetWidth;
        const oldH = inner.offsetHeight;
        const imgRect = inner.getBoundingClientRect();
        const relX = (midX - imgRect.left) / oldW;
        const relY = (midY - imgRect.top) / oldH;

        const natW = img.naturalWidth || img.width;
        const minW = vp.clientWidth;
        const maxW = Math.round(natW * 4.0);
        const newW = Math.max(minW, Math.min(maxW, Math.round(oldW * ratio)));
        const newH = Math.round(newW * oldH / oldW);

        const padX = Math.max(0, (vp.clientWidth - newW) / 2);
        const padY = Math.max(0, (vp.clientHeight - newH) / 2);

        inner.style.width = newW + 'px';
        inner.style.height = newH + 'px';
        inner.style.marginLeft = padX + 'px';
        inner.style.marginTop = padY + 'px';

        const vpRect = vp.getBoundingClientRect();
        vp.scrollLeft = Math.round((relX * newW + padX) - (midX - vpRect.left));
        vp.scrollTop = Math.round((relY * newH + padY) - (midY - vpRect.top));

        lastPinchDist = dist;
        isPinching = false;
      });
    } else if (!lastPinchDist) {
      const t0 = e.touches[0], t1 = e.touches[1];
      lastPinchDist = Math.sqrt(Math.pow(t0.clientX - t1.clientX, 2) + Math.pow(t0.clientY - t1.clientY, 2));
    }
  }, { passive: false });

  document.addEventListener('touchend', e => {
    if (e.touches.length < 2) {
      lastPinchDist = null;
      isPinching = false;
    }
  });





  /* ==========================================================================
     3. УТИЛІТИ, КОЛЬОРИ ТА ФОРМАТУВАННЯ
     ========================================================================== */

  MetroApp.NAME_TO_SLUG = {};

  MetroApp.ALWAYS_CAP = new Set(['україна','україни','українських','дніпра','незалежності','небесної','сотні','спорту','центр','площа','площі','героїв','лівий','правий']);

  MetroApp.properCase = function(name) {
    return name.split(/[\s\u00a0\u202f]+/).map((w, index) => {
      const wl = w.toLowerCase();
      const cleanWl = wl.replace(/[^а-яіїєґ]/g, '');
      return (index === 0 || MetroApp.ALWAYS_CAP.has(cleanWl)) 
        ? wl.replace(/[а-яіїєґ]/i, m => m.toUpperCase()) 
        : wl;
    }).join(' ');
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
    return stationsData;
  }










async function reloadStationsData(forceFresh = false) {
    const url = forceFresh ? `stations.json?nc=${Date.now()}` : 'stations.json';
    const response = await fetch(url, forceFresh ? { cache: 'no-store' } : undefined);
    const data = await response.json();
    const hydrated = hydrateStations(data);
    if (!forceFresh) renderMapZones();
    // Якщо вікно Обраного відкрилось до завантаження даних — перемалюємо його
    if (favSheet?.classList.contains('sheet-open') && favBody?.querySelector('.fav-empty-text')) {
      const favs = getFavs();
if (favs.length === 0) favBody.innerHTML = `<div class="fav-empty-state"><p class="fav-empty-text">Немає збережених станцій</p><div class="onboarding-hint"><span class="hint-icon-wrap">${MetroApp.Icons.info}</span>Натисніть двічі на вагон та двері, щоб зберегти вихід</div></div>`;
      else renderFavList(favs);
    }
    return hydrated;
  }
  MetroApp.reloadStationsData = reloadStationsData;

  function renderMapZones() {
    const mapInner = document.getElementById('mapInner');
    if (!mapInner || !stationsData) return;
    
    mapInner.querySelectorAll('.zone').forEach(z => z.remove());

    Object.values(stationsData).forEach(s => {
      if (!s.map_zones) return;
      s.map_zones.forEach(z => {
        const zone = document.createElement('a');
        const lineCode = s.slug.charAt(0);
        zone.className = `zone ${z.type || lineCode}`;
        if (z.tall) zone.classList.add('tall');
        zone.dataset.slug = s.slug;
        zone.style.left = z.x + '%';
        zone.style.top = z.y + '%';
        if (z.w) zone.style.width = z.w + '%';
        if (z.h) zone.style.height = z.h + '%';
        mapInner.appendChild(zone);
      });
    });
isZonesReady = true;
    checkAppReady();
  }

  reloadStationsData().catch(err => console.error('stations.json load failed', err));






  inner.addEventListener('click', e => {
    const zone = e.target.closest('a.zone');
    if (!zone) return;
    e.preventDefault();
    if (zone.dataset.slug) openStation(zone.dataset.slug);
  });

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
      favBody.innerHTML = `<div class="fav-empty-state"><p class="fav-empty-text">Немає збережених станцій</p><div class="onboarding-hint"><span class="hint-icon-wrap">${MetroApp.Icons.info}</span>Натисніть двічі на вагон та двері, щоб зберегти вихід</div></div>`;
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
      let displayName = item.name;
      if (item.slug === 'B.Ploshcha_Ukrainskikh_heroiv') {
        displayName = 'Пл. Українських героїв';
      }

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
            if (fsLower === 'контрактова площа') formattedStation = 'Контрактова';
            else if (fsLower === 'поштова площа') formattedStation = 'Поштова';
            else if (fsLower === 'майдан незалежності') formattedStation = 'Майдан';
            else if (fsLower === 'політехнічний інститут') formattedStation = 'Політехнічний';
            else if (fsLower === 'золоті ворота') formattedStation = 'Золоті';
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

    const isStartOnFav = localStorage.getItem('metro_start_on_fav') === 'true';
    const settingsHtml = `
      <div class="fav-settings-container">
        <div class="fav-settings-row">
          <span class="fav-settings-label">Зробити стартовою сторінкою</span>
        </div>
        <div class="fav-settings-toggle-wrap">
          <label class="ios-toggle">
            <input type="checkbox" id="startPageToggle" ${isStartOnFav ? 'checked' : ''}>
            <span class="ios-toggle-slider"></span>
          </label>
        </div>
      </div>
    `;

    favBody.innerHTML = listHtml + settingsHtml;

    const toggleInput = document.getElementById('startPageToggle');
    if (toggleInput) {
      toggleInput.addEventListener('change', (e) => {
        localStorage.setItem('metro_start_on_fav', e.target.checked);
      });
    }

    let dragSrc = null;
    function getDragItems() { return [...favBody.querySelectorAll('.fav-item')]; }
    function saveOrder() { 
      const items = getDragItems();
      const rowIds = items.map(i => i.dataset.rowId);
      localStorage.setItem('metro_fav_rows_order', JSON.stringify(rowIds));
      
      const currentSlugs = items.map(i => i.dataset.slug);
      const uniqueSlugs = [...new Set(currentSlugs)];
      saveFavs(uniqueSlugs); 
    }

    function getItemAtY(y) { return getDragItems().find(item => { const r = item.getBoundingClientRect(); return y >= r.top && y <= r.bottom; }); }
    function clearDragState() { getDragItems().forEach(i => i.classList.remove('fav-over')); }






// Створюємо глобальний контролер для миші
    if (favBody._dragController) favBody._dragController.abort();
    favBody._dragController = new AbortController();

    favBody.querySelectorAll('.fav-drag-handle').forEach(handle => {
      const item = handle.closest('.fav-item');
      
      // Touch events залишаємо як були...
      handle.addEventListener('touchstart', e => { e.preventDefault(); dragSrc = item; dragSrc.classList.add('fav-dragging'); }, { passive: false });
      handle.addEventListener('touchmove', e => { /* твій існуючий touchmove код */
        if (!dragSrc) return;
        e.preventDefault();
        if (!handle._isDragging) {
          handle._isDragging = true;
          requestAnimationFrame(() => {
            const target = getItemAtY(e.touches[0].clientY);
            if (target && target !== dragSrc) {
              clearDragState();
              target.classList.add('fav-over');
              const items = getDragItems();
              if (items.indexOf(dragSrc) < items.indexOf(target)) target.after(dragSrc); else target.before(dragSrc);
            }
            handle._isDragging = false;
          });
        }
      }, { passive: false });
      handle.addEventListener('touchend', () => {
        if (!dragSrc) return;
        dragSrc.classList.remove('fav-dragging');
        clearDragState();
        saveOrder(); dragSrc = null;
      });

      // Mouse events з AbortController
      handle.addEventListener('mousedown', () => { 
        dragSrc = item; 
        dragSrc.classList.add('fav-dragging'); 
        
        // Якщо контролер було обірвано попереднім mouseup, створюємо новий
        if (favBody._dragController.signal.aborted) {
          favBody._dragController = new AbortController();
        }
        const { signal } = favBody._dragController;

        // Передаємо signal. Коли ми викличемо abort(), ці слухачі зникнуть самі!
        document.addEventListener('mousemove', onMouseMove, { signal }); 
        document.addEventListener('mouseup', onMouseUp, { signal }); 
      });
    });

    function onMouseMove(e) {
      if (!dragSrc) return;
      if (!favBody._isMouseDragging) {
        favBody._isMouseDragging = true;
        requestAnimationFrame(() => {
          const target = getItemAtY(e.clientY);
          if (target && target !== dragSrc) {
            clearDragState();
            target.classList.add('fav-over');
            const items = getDragItems();
            if (items.indexOf(dragSrc) < items.indexOf(target)) target.after(dragSrc); else target.before(dragSrc);
          }
          favBody._isMouseDragging = false;
        });
      }
    }
    
    function onMouseUp() {
      if (!dragSrc) return;
      dragSrc.classList.remove('fav-dragging');
      clearDragState();
      saveOrder(); 
      dragSrc = null;
      favBody._isMouseDragging = false;
      
      // ВБИВАЄМО ВСІ СЛУХАЧІ МИШІ ОДНИМ ВИКЛИКОМ!
      favBody._dragController.abort();
    }
  }

  favBody.addEventListener('click', e => {

    const btn = e.target.closest('.fav-open-btn');
    if (!btn?.dataset.slug) return;
    openStation(btn.dataset.slug);
  });

function openFavSheet() {
    document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
    const favs = getFavs();    if (!stationsData) favBody.innerHTML = `<p class="fav-empty-text">Дані ще завантажуються…</p>`;
else if (favs.length === 0) favBody.innerHTML = `<div class="fav-empty-state"><p class="fav-empty-text">Немає збережених станцій</p><div class="onboarding-hint"><span class="hint-icon-wrap">${MetroApp.Icons.info}</span>Натисніть двічі на вагон та двері, щоб зберегти вихід</div></div>`;    else renderFavList(favs);
    favSheet.classList.add('sheet-open');
    sheetOverlay.classList.add('overlay-visible');
  }

  function closeFavSheet() {
    favSheet.classList.remove('sheet-open');
    if (!sheet.classList.contains('sheet-open')) sheetOverlay.classList.remove('overlay-visible');
  }

  favBtn.addEventListener('click', openFavSheet);
  favClose.addEventListener('click', closeFavSheet);

  let isHandleSwipeFav = false;
  let swipeStartYFav = 0;
  favSheet.addEventListener('touchstart', e => { swipeStartYFav = e.touches[0].clientY; isHandleSwipeFav = !!e.target.closest('.sheet-handle-bar'); }, { passive: true });
  favSheet.addEventListener('touchend', e => { if (isHandleSwipeFav && (e.changedTouches[0].clientY - swipeStartYFav > 60)) closeFavSheet(); });

  function renderPositions(positions, color, multiRow) {
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
        toast.innerHTML = '<span class="exit-fav-toast-text">Вихід&nbsp;додано<br>до&nbsp;вибраного</span>';
        row.prepend(toast);
        requestAnimationFrame(() => toast.classList.add('fav-note-open'));

setTimeout(() => {
          toast.classList.remove('fav-note-open');
          setTimeout(() => toast.remove(), 300);
        }, 3000);
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

function openStation(slug) {
    if (typeof MetroApp.hasUnsavedFeedback === 'function' && MetroApp.hasUnsavedFeedback()) {
      // Отримуємо назву поточної станції, яку ми редагували
const currentStationName = document.getElementById('fbStationLabel')?.textContent || '';
      const question = currentStationName ? `Зберегти зміни для станції <span style="white-space: nowrap;">${currentStationName}?</span>` : 'Зберегти зміни?';
      MetroApp.showCustomConfirm(question, () => {
        if (typeof MetroApp.triggerFeedbackSubmit === 'function') MetroApp.triggerFeedbackSubmit(true);
        MetroApp.fbUnsaved = false;
        actualOpenStation(); 
      }, () => { MetroApp.fbUnsaved = false; actualOpenStation(); }, () => { /* Скасувати */ });
      return; 
    }

    function actualOpenStation() {
      if (!stationsData?.[slug]) return;
      currentStationSlug = slug;
      const s = stationsData[slug];
      const color = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
      const fav = isFav(slug);

// Перевіряємо, чи є в користувача збережені виходи
// Оновлена підказка з іконкою та новим текстом
      const onboardingHtml = getExitFavs().length === 0 ? `<div class="onboarding-hint" id="onboardingHint"><span class="hint-icon-wrap">${MetroApp.Icons.info}</span>Натисніть двічі на вагон та двері, щоб зберегти вихід</div>` : '';

      sheetBody.innerHTML = `<div class="sheet-header"><span class="sheet-title">${s.name}</span></div>${onboardingHtml}${renderDirections(s, color)}`;
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

      document.querySelectorAll('.station-sheet').forEach(el => { if (el.id !== 'stationSheet') el.classList.remove('sheet-open'); });
      if (!sheet.classList.contains('sheet-open')) { sheet.classList.add('sheet-open'); sheetOverlay.classList.add('overlay-visible'); }
      attachExitFavListeners(sheetBody, slug, color);
    }
    actualOpenStation();
  }

function closeAllSheets(force = false) {
    if (!force && typeof MetroApp.hasUnsavedFeedback === 'function' && MetroApp.hasUnsavedFeedback()) {
      const stationName = document.getElementById('fbStationLabel')?.textContent || '';
      const question = stationName ? `Зберегти зміни для станції <span style="white-space: nowrap;">${stationName}?</span>` : 'Зберегти зміни?';
      
      MetroApp.showCustomConfirm(question, () => {
        if (typeof MetroApp.triggerFeedbackSubmit === 'function') MetroApp.triggerFeedbackSubmit(true);
        MetroApp.fbUnsaved = false; closeAllSheets(true); 
      }, () => { MetroApp.fbUnsaved = false; closeAllSheets(true); }, () => { /* Скасувати */ });
      return false;
    }
    
    // --- Цей шматок був загублений ---
    document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
    const overlay = document.getElementById('sheetOverlay');
    if (overlay) overlay.classList.remove('overlay-visible');
    
    const dropMenu = document.getElementById('dropMenu');
    if (dropMenu) {
        dropMenu.classList.remove('show');
        dropMenu.hidden = true;
    }
  }
  MetroApp.closeAllSheets = closeAllSheets;

  MetroApp.refreshCurrentStation = function() {
    if (!currentStationSlug) return;
    if (typeof MetroApp.applyExitLabels === 'function') MetroApp.applyExitLabels(stationsData);
    if (stationsData[currentStationSlug] && sheet.classList.contains('sheet-open')) {
      const s = stationsData[currentStationSlug];
      const color = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
      const prevScrollTop = sheetBody.scrollTop;
      sheetBody.innerHTML = `<div class="sheet-header"><span class="sheet-title">${s.name}</span></div>${renderDirections(s, color)}`;
      sheetBody.querySelectorAll('.nav-label').forEach(el => {
        const target = slugByName(el.dataset.name || '');
        if (target && target !== currentStationSlug) el.classList.add('nav-link');
      });
      attachExitFavListeners(sheetBody, currentStationSlug, color);
      sheetBody.scrollTop = prevScrollTop;
    }
  };

  sheetClose.addEventListener('click', () => closeAllSheets());

  sheetBody.addEventListener('click', e => {
    const navLabel = e.target.closest('.nav-label');
    if (navLabel) {
      const target = slugByName(navLabel.dataset.name || '');
      if (target && target !== currentStationSlug) {
        e.stopPropagation();
        openStation(target);
        return;
      }
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

    let clickedSlug = null;
    // Блискавичний геометричний пошук замість маніпуляцій з DOM
    const zones = document.querySelectorAll('a.zone');
    for (const zone of zones) {
      const rect = zone.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        clickedSlug = zone.dataset.slug;
        break;
      }
    }

    if (clickedSlug) {
      openStation(clickedSlug);
      return;
    }
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

  sheetBody.addEventListener('click', e => {
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
          }
          panel.classList.remove('panel-open');
          setTimeout(() => panel.remove(), 300);
          reloadStationsData(true).then(() => openStation(slug));
        } catch(err) { console.error('edit reset failed', err); }
      });
    }
  });

  const THEME_KEY = 'metro_theme';
  const root = document.documentElement;

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.innerHTML = theme === 'dark' ? MetroApp.Icons.sun : MetroApp.Icons.moon;
    localStorage.setItem(THEME_KEY, theme);
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
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
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
      
if (typeof MetroApp.hasUnsavedFeedback === 'function' && MetroApp.hasUnsavedFeedback()) {
        const stationName = document.getElementById('fbStationLabel')?.textContent || '';
        const question = stationName ? `Зберегти зміни для станції <span style="white-space: nowrap;">${stationName}?</span>` : 'Зберегти зміни?';
        
        MetroApp.showCustomConfirm(question, () => {
          if (typeof MetroApp.triggerFeedbackSubmit === 'function') MetroApp.triggerFeedbackSubmit(true);
          MetroApp.fbUnsaved = false; executeAboutTransition();
        }, () => { MetroApp.fbUnsaved = false; executeAboutTransition(); }, () => { /* Скасувати */ });
        return;
      }
      
      function executeAboutTransition() {
        document.getElementById('feedbackSheet')?.classList.remove('sheet-open');
        if (typeof openAboutSheet === 'function') openAboutSheet();
      }
      executeAboutTransition(); 
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
        aboutSheet.classList.remove('sheet-open');
        if (document.querySelectorAll('.station-sheet.sheet-open').length === 0) document.getElementById('sheetOverlay').classList.remove('overlay-visible');
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
        searchSheet.classList.remove('sheet-open');
        document.getElementById('searchInput').blur();
        if (document.querySelectorAll('.station-sheet.sheet-open').length === 0) {
          document.getElementById('sheetOverlay').classList.remove('overlay-visible');
        }
      });

      // ВСІ СЛУХАЧІ ВІШАЮТЬСЯ РІВНО 1 РАЗ ПРИ СТВОРЕННІ HTML
      const input = document.getElementById('searchInput');
      input.placeholder = ''; // Прибираємо підказку
      const resultsContainer = document.getElementById('searchResults');

      input.addEventListener('input', (e) => {
        renderSearchResults(e.target.value.trim().toLowerCase(), resultsContainer);
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

    const input = document.getElementById('searchInput');
    const resultsContainer = document.getElementById('searchResults');
    input.value = '';
    renderSearchResults('', resultsContainer);

    document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
    searchSheet.classList.add('sheet-open');
    document.getElementById('sheetOverlay').classList.add('overlay-visible');
  }

  function renderSearchResults(query, container) {
    if (!stationsData) {
      container.innerHTML = '<p class="fav-empty-text">Дані ще завантажуються...</p>';
      return;
    }

    const allStations = Object.values(stationsData);
    let filtered = allStations;

if (query) {
      const rawQuery = query.toLowerCase().trim().replace(/['’`]/g, '');
      const queryWords = rawQuery.split(/\s+/).filter(w => w.length > 0);
      const queryNoSpaces = rawQuery.replace(/\s+/g, '');
      
      filtered = allStations.filter(s => {
        return queryWords.every(qWord => 
          s._searchIndex.some(idxWord => idxWord.startsWith(qWord))
        ) || s._searchIndex.includes(queryNoSpaces);
      });
    }


    filtered.sort((a, b) => a.name.localeCompare(b.name, 'uk'));

    if (filtered.length === 0) {
      container.innerHTML = '<p class="fav-empty-text" style="padding-top:32px;">Станцію не знайдено</p>';
      return;
    }

    container.innerHTML = filtered.map(s => {
      const color = MetroApp.LINE_COLOR[s.line];
      return `
        <div class="search-item" data-slug="${s.slug}">
          <div class="search-item-line" style="background-color: ${color}"></div>
          <div>${s.name}</div>
        </div>
      `;
    }).join('');
  }

  searchBtnTop.addEventListener('click', openSearchSheet);

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
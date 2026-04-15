window.MetroApp = window.MetroApp || {};

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

  /* ==========================================================================
     2. УПРАВЛІННЯ КАРТОЮ (ZOOM ТА PAN)
     ========================================================================== */
  const centerX = 0.485, centerY = 0.5;

  function applyZoomAndCenter() {
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) return;
    
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
    });
  }

  function adjustViewportHeight() {
    if (!vp) return;
    const top = vp.getBoundingClientRect().top;
    const avail = Math.floor((window.visualViewport?.height ?? window.innerHeight) - top - 8);
    vp.style.height = Math.max(120, avail) + 'px';
  }

  if (img.complete) applyZoomAndCenter(); else img.addEventListener('load', applyZoomAndCenter);
  MetroApp.applyZoomAndCenter = applyZoomAndCenter;
  adjustViewportHeight();
  img.addEventListener('load', () => { adjustViewportHeight(); applyZoomAndCenter(); });

let resizeTimer;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { adjustViewportHeight(); applyZoomAndCenter(); }, 120); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
  
  document.addEventListener('DOMContentLoaded', () => { 
    document.body.classList.remove('loading'); 
    document.body.classList.add('loaded'); 
    
    // ЛОГІКА СТАРТУ: Відкриваємо Обране, якщо користувач так налаштував
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
      requestAnimationFrame(() => {
        const t0 = e.touches[0], t1 = e.touches[1];
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const midX = (t0.clientX + t1.clientX) / 2;
        const midY = (t0.clientY + t1.clientY) / 2;

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
  const EMOJI_TO_LINE = { '🟥': '#c8523a', '🟦': '#5b9bd5', '🟩': '#5aaa6a' };

  const NAME_TO_SLUG = {
    'деміївська': 'B.Demiivska', 'героїв дніпра': 'B.Heroiv_Dnipra', 'голосіївська': 'B.Holosiivska', 'іподром': 'B.Ipodrom',
    'контрактова площа': 'B.Kontraktova_ploshcha', 'либідська': 'B.Lybidska', 'майдан незалежності': 'B.Maidan_Nezalezhnosti',
    'мінська': 'B.Minska', 'оболонь': 'B.Obolon', 'олімпійська': 'B.Olimpiiska', 'палац „україна“': 'B.Palats_Ukraina',
    'площа українських героїв': 'B.Ploshcha_Ukrainskikh_heroiv', 'почайна': 'B.Pochaina', 'поштова площа': 'B.Poshtova_ploshcha',
    'тараса шевченко': 'B.Tarasa_Shevchenko', 'теремки': 'B.Teremky', 'васильківська': 'B.Vasylkivska', 'виставковий центр': 'B.Vystavkovyi_tsentr',
    'бориспільська': 'G.Boryspilska', 'червоний хутір': 'G.Chervonyi_khutir', 'дорогожичі': 'G.Dorohozhychi', 'харківська': 'G.Kharkivska',
    'кловська': 'G.Klovska', 'лукʼянівська': 'G.Lukianivska', 'осокорки': 'G.Osokorky', 'палац спорту': 'G.Palats_sportu',
    'печерська': 'G.Pecherska', 'позняки': 'G.Pozniaky', 'славутич': 'G.Slavutych', 'сирець': 'G.Syrets',
    'видубичі': 'G.Vydubychi', 'вирлиця': 'G.Vyrlytsia', 'золоті ворота': 'G.Zoloti_vorota', 'звіринецька': 'G.Zvirynetska',
    'академмістечко': 'R.Akademmistechko', 'арсенальна': 'R.Arsenalna', 'берестейська': 'R.Beresteiska', 'чернігівська': 'R.Chernihivska',
    'дарниця': 'R.Darnytsia', 'дніпро': 'R.Dnipro', 'гідропарк': 'R.Hidropark', 'хрещатик': 'R.Khreshchatyk',
    'лісова': 'R.Lisova', 'лівобережна': 'R.Livoberezhna', 'нивки': 'R.Nyvky', 'політехнічний інститут': 'R.Politekhnychnyi_instytut',
    'шулявська': 'R.Shuliavska', 'святошин': 'R.Sviatoshyn', 'театральна': 'R.Teatralna', 'університет': 'R.Universytet',
    'вокзальна': 'R.Vokzalna', 'житомирська': 'R.Zhytomyrska'
  };

function heartSvg(isFav, slug, lineColor) {
    const base = 'width="22" height="20" viewBox="0 0 24 22" xmlns="http://www.w3.org/2000/svg"';
    if (!isFav) return `<svg ${base} fill="none" stroke="currentColor" stroke-width="2"><path d="${MetroApp.Icons.heartPath}"/></svg>`;
    return `<svg ${base} fill="${lineColor}"><path d="${MetroApp.Icons.heartPath}"/></svg>`;
  }

  function formatLabel(raw) {
    let text = raw.replace(/\u00a0/g, ' ').trim();
    const emojiRe = /(🟥|🟦|🟩)/g;
    const firstEmoji = text.match(emojiRe)?.[0];
    const color = firstEmoji ? EMOJI_TO_LINE[firstEmoji] : null;
    if (!color) return `<span class="exit-label-text">${text}</span>`;
    const clean = text.replace(emojiRe, '').trim();
    return `<span class="transfer-label"><span class="transfer-line" style="background:${color}"></span><span class="transfer-text">${clean}</span><span class="transfer-line" style="background:${color}"></span></span>`;
  }

  function pill(label, value, color) {
    return `<div class="pos-pill"><div class="pos-pill-label">${label}</div><div class="pos-pill-num" style="color:${color}">${value}</div></div>`;
  }

const STATION_ALIASES = {
    'театральну': 'театральна',
    'площу українських героїв': 'площа українських героїв',
    'майдан незалежності': 'майдан незалежності',
    'палац спорту': 'палац спорту',
    'золоті ворота': 'золоті ворота',
    'хрещатик': 'хрещатик'
  };

  function slugByName(raw) {
    let normalized = raw.toLowerCase()
      .replace(/[\u00a0\u202f\u2009]/g, ' ')
      .replace(/[🟥🟦🟩]/g, '')
      .replace(/(?:короткий |довгий )?пере(?:садка|хід) на\s*/g, '')
      .replace(/попередня\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Заміна специфічних відмінків станцій
    for (const [alias, realName] of Object.entries(STATION_ALIASES)) {
      if (normalized.includes(alias)) {
        normalized = normalized.replace(alias, realName);
        break;
      }
    }

    return NAME_TO_SLUG[normalized] || null;
  }
  /* ==========================================================================
     4. ЗАВАНТАЖЕННЯ ДАНИХ ТА КЛІКИ ПО КАРТІ
     ========================================================================== */
function hydrateStations(data) {
    if (!stationsData) stationsData = {};
    Object.keys(stationsData).forEach(key => delete stationsData[key]);
    data.stations.forEach(s => { stationsData[s.slug] = s; });
    if (MetroApp.applyLocalEdits) MetroApp.applyLocalEdits(stationsData);
    if (MetroApp.applyExitLabels) MetroApp.applyExitLabels(stationsData);
    return stationsData;
  }

  async function reloadStationsData(forceFresh = false) {
    const url = forceFresh ? `stations.json?nc=${Date.now()}` : 'stations.json';
    const response = await fetch(url, forceFresh ? { cache: 'no-store' } : undefined);
    const data = await response.json();
    return hydrateStations(data);
  }
  MetroApp.reloadStationsData = reloadStationsData;

  const MAP_ZONES_DATA = [
    { slug: 'R.Akademmistechko', x: 0, y: 30.4, tall: true },
    { slug: 'R.Zhytomyrska', x: 3.3, y: 36.9 },
    { slug: 'R.Sviatoshyn', x: 6.5, y: 41.2 },
    { slug: 'R.Nyvky', x: 9.7, y: 45.6 },
    { slug: 'R.Beresteiska', x: 12.9, y: 49.9 },
    { slug: 'R.Shuliavska', x: 16.1, y: 54.3 },
    { slug: 'R.Politekhnychnyi_instytut', x: 19.4, y: 58.7 },
    { slug: 'R.Politekhnychnyi_instytut', x: 22.6, y: 58.8, w: 3, h: 6.3 },
    { slug: 'R.Vokzalna', x: 25.8, y: 63, tall: true },
    { slug: 'R.Universytet', x: 32.3, y: 58.7 },
    { slug: 'R.Universytet', x: 35.6, y: 56.5, w: 3, h: 8.7 },
    { slug: 'R.Arsenalna', x: 51.6, y: 43.5, tall: true },
    { slug: 'R.Dnipro', x: 58, y: 50, tall: true },
    { slug: 'R.Hidropark', x: 64.5, y: 45.6 },
    { slug: 'R.Hidropark', x: 67.7, y: 45.7, w: 3, h: 6.3 },
    { slug: 'R.Livoberezhna', x: 67.7, y: 41.3 },
    { slug: 'R.Darnytsia', x: 70.9, y: 36.9 },
    { slug: 'R.Chernihivska', x: 74.2, y: 32.6 },
    { slug: 'R.Lisova', x: 77.5, y: 26, tall: true },
    { slug: 'B.Heroiv_Dnipra', x: 35.5, y: 0, tall: true },
    { slug: 'B.Minska', x: 32.3, y: 6.4 },
    { slug: 'B.Obolon', x: 35.5, y: 10.8 },
    { slug: 'B.Pochaina', x: 32.3, y: 15.2 },
    { slug: 'B.Tarasa_Shevchenko', x: 35.5, y: 19.45 },
    { slug: 'B.Kontraktova_ploshcha', x: 38.7, y: 23.9 },
    { slug: 'B.Poshtova_ploshcha', x: 42, y: 28.2 },
    { slug: 'B.Olimpiiska', x: 42, y: 58.7 },
    { slug: 'B.Palats_Ukraina', x: 45.2, y: 63, tall: true },
    { slug: 'B.Lybidska', x: 48.4, y: 67.4 },
    { slug: 'B.Demiivska', x: 45.2, y: 71.7 },
    { slug: 'B.Holosiivska', x: 42, y: 76.1 },
    { slug: 'B.Vasylkivska', x: 38.7, y: 80.4 },
    { slug: 'B.Vystavkovyi_tsentr', x: 35.5, y: 84.7 },
    { slug: 'B.Ipodrom', x: 32.3, y: 89.1 },
    { slug: 'B.Teremky', x: 29, y: 93.6, tall: true },
    { slug: 'G.Syrets', x: 25.9, y: 26, tall: true },
    { slug: 'G.Dorohozhychi', x: 29.1, y: 32.6 },
    { slug: 'G.Lukianivska', x: 32.3, y: 36.9 },
    { slug: 'G.Lukianivska', x: 35.6, y: 36.9, w: 3, h: 6.3 },
    { slug: 'G.Klovska', x: 51.6, y: 58.7 },
    { slug: 'G.Pecherska', x: 54.9, y: 63 },
    { slug: 'G.Zvirynetska', x: 58.1, y: 67.4 },
    { slug: 'G.Vydubychi', x: 61.3, y: 71.7 },
    { slug: 'G.Vydubychi', x: 64.6, y: 71.7, w: 3, h: 6.3 },
    { slug: 'G.Slavutych', x: 67.7, y: 76.1, tall: true },
    { slug: 'G.Osokorky', x: 74.2, y: 71.7 },
    { slug: 'G.Osokorky', x: 77.4, y: 71.7, w: 3, h: 6.3 },
    { slug: 'G.Pozniaky', x: 77.4, y: 67.4 },
    { slug: 'G.Kharkivska', x: 80.6, y: 63 },
    { slug: 'G.Vyrlytsia', x: 83.9, y: 58.7 },
    { slug: 'G.Boryspilska', x: 87.1, y: 54.3 },
    { slug: 'G.Chervonyi_khutir', x: 90.3, y: 47.9, tall: true },
    { slug: 'B.Maidan_Nezalezhnosti', x: 45.2, y: 32.6, type: 'transfer' },
    { slug: 'B.Ploshcha_Ukrainskikh_heroiv', x: 45.2, y: 50, type: 'transfer' },
    { slug: 'R.Khreshchatyk', x: 45.2, y: 41.4, type: 'transfer' },
    { slug: 'R.Teatralna', x: 38.7, y: 50, type: 'transfer' },
    { slug: 'G.Palats_sportu', x: 51.6, y: 50, type: 'transfer' },
    { slug: 'G.Zoloti_vorota', x: 38.7, y: 41.4, type: 'transfer' }
  ];

  function renderMapZones() {
    const mapInner = document.getElementById('mapInner');
    if (!mapInner) return;
    MAP_ZONES_DATA.forEach(z => {
      const zone = document.createElement('a');
      const lineCode = z.slug.charAt(0);
      zone.className = `zone ${z.type || lineCode}`;
      if (z.tall) zone.classList.add('tall');
      zone.dataset.slug = z.slug;
      zone.style.left = z.x + '%';
      zone.style.top = z.y + '%';
      if (z.w) zone.style.width = z.w + '%';
      if (z.h) zone.style.height = z.h + '%';
      mapInner.appendChild(zone);
    });
  }
  renderMapZones();

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
    } else {
      const slugDirFavs = favs.filter(f => f.slug === slug && f.dir === dir);
      if (slugDirFavs.length >= 3) return false; 
      favs.push({ id, slug, dir, wagon, doors });
      let mainFavs = getFavs();
      if (!mainFavs.includes(slug)) {
        mainFavs.push(slug);
        saveFavs(mainFavs);
      }
    }
    
localStorage.setItem(EXIT_FAV_KEY, JSON.stringify(favs));
    exitFavCache = [...favs]; // <-- ДОДАТИ ЦЕЙ РЯДОК: Оновлюємо кеш після змін
    return idx < 0; 
  }

  function renderFavList(favs) {
    if (!favs.length) {
      favBody.innerHTML = `<p class="fav-empty-text">Немає збережених станцій.<br>Натисніть ♡ на картці станції,<br>щоб зберегти її до вибраного.</p>`;
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
let formattedStation = stationName.split(/[\s\u00a0\u202f]+/).map((w, index) => {
            const cleanW = w.replace(/[^а-яіїєґ]/g, ''); // Очищаємо від лапок
            return (index === 0 || MetroApp.ALWAYS_CAP.has(cleanW)) 
              ? w.replace(/[а-яіїєґ]/i, m => m.toUpperCase()) 
              : w;
          }).join(' ');

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

    favBody.querySelectorAll('.fav-drag-handle').forEach(handle => {
      const item = handle.closest('.fav-item');
      handle.addEventListener('touchstart', e => { e.preventDefault(); dragSrc = item; dragSrc.classList.add('fav-dragging'); }, { passive: false });
      
      handle.addEventListener('touchmove', e => {
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

      handle.addEventListener('mousedown', () => { dragSrc = item; dragSrc.classList.add('fav-dragging'); document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp); });
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
      saveOrder(); dragSrc = null;
      document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp);
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
    else if (favs.length === 0) favBody.innerHTML = `<p class="fav-empty-text">Немає збережених станцій.<br>Натисніть ♡ на картці станції,<br>щоб додати її до вибраного</p>`;
    else renderFavList(favs);
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
      const spacer = p._edited ? `<span class="pos-edited-spacer"></span>` : '';
      return `<div class="position-row ${isMulti ? 'position-row-multi' : ''}">${editedMark}${generatePills(p.wagon, p.doors)}${spacer}</div>`;
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
        longHtml = `<div class="long-transfer-block"><div class="long-transfer-title"><span class="transfer-label"><span class="transfer-line" style="background:${color}"></span><span class="transfer-text">довгий&nbsp;перехід на&nbsp;Майдан&nbsp;Незалежності</span><span class="transfer-line" style="background:${color}"></span></span></div>${rows}</div>`;
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
        if (num) num.style.color = '#1c1c1e'; /* <--- Тепер завжди контрастний темний! */
        if (lbl) lbl.style.color = '#1c1c1e'; /* <--- Для напису ВАГОН/ДВЕРІ теж */
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
        }, 10000);
      }

      function triggerExitFav() {
        const pv = getPillValues(); if (!pv) return;
        const dirBlock = row.closest('.direction-block') || row.closest('.long-transfer-block');
        const labelEl = dirBlock ? (dirBlock.querySelector('.direction-label') || dirBlock.querySelector('.transfer-text')) : null;
        const dirLabel = labelEl ? labelEl.textContent.trim() : '';
        const added = toggleExitFav(slug, dirLabel, pv.wagon, pv.doors);
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
      MetroApp.showCustomConfirm('Зберегти зміни та застосувати їх локально?', () => {
        if (typeof MetroApp.triggerFeedbackSubmit === 'function') MetroApp.triggerFeedbackSubmit(true);
        MetroApp.fbUnsaved = false;
        actualOpenStation(); 
      }, () => { MetroApp.fbUnsaved = false; actualOpenStation(); });
      return; 
    }

    function actualOpenStation() {
      if (!stationsData?.[slug]) return;
      currentStationSlug = slug;
      const s = stationsData[slug];
      const color = MetroApp.LINE_COLOR[s.line] || '#888';
      const fav = isFav(slug);

      sheetBody.innerHTML = `<div class="sheet-header"><span class="sheet-title">${s.name}</span></div>${renderDirections(s, color)}`;
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
      MetroApp.showCustomConfirm('Зберегти зміни та застосувати їх локально?', () => {
        if (typeof MetroApp.triggerFeedbackSubmit === 'function') MetroApp.triggerFeedbackSubmit(true);
        MetroApp.fbUnsaved = false; closeAllSheets(true); 
      }, () => { MetroApp.fbUnsaved = false; closeAllSheets(true); });
      return false;
    }
    document.querySelectorAll('.station-sheet').forEach(el => { el.classList.remove('sheet-open'); el.style.maxHeight = ''; });
    sheetOverlay.classList.remove('overlay-visible');
    return true;
  }
  MetroApp.closeAllSheets = closeAllSheets;

  MetroApp.refreshCurrentStation = function() {
    if (!currentStationSlug) return;
    if (typeof MetroApp.applyExitLabels === 'function') MetroApp.applyExitLabels(stationsData);
    if (stationsData[currentStationSlug] && sheet.classList.contains('sheet-open')) {
      const s = stationsData[currentStationSlug];
      const color = MetroApp.LINE_COLOR[s.line] || '#888';
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
    const color = btn.dataset.color || '#888';
    const nowFav = toggleFav(slug);
    btn.innerHTML = heartSvg(nowFav, slug, color);
    btn.classList.toggle('fav-active', nowFav);
  });

  sheetOverlay.addEventListener('click', (e) => {
    if (e.target !== sheetOverlay) return;
    const dropMenu = document.getElementById('dropMenu');
    if (dropMenu && dropMenu.classList.contains('show')) return;

    sheetOverlay.style.pointerEvents = 'none';
    const below = document.elementFromPoint(e.clientX, e.clientY);
    sheetOverlay.style.pointerEvents = '';

    if (below && below.closest('a.zone')) {
      const slug = below.closest('a.zone').dataset.slug;
      if (slug) openStation(slug);
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
        MetroApp.showCustomConfirm('Зберегти зміни та застосувати їх локально?', () => {
          if (typeof MetroApp.triggerFeedbackSubmit === 'function') MetroApp.triggerFeedbackSubmit(true);
          MetroApp.fbUnsaved = false; executeAboutTransition();
        }, () => { MetroApp.fbUnsaved = false; executeAboutTransition(); });
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
    aboutSheet.classList.add('sheet-open');
    document.getElementById('sheetOverlay').classList.add('overlay-visible');
  }

  const searchBtnTop = document.createElement('button');
  searchBtnTop.className = 'search-btn-top';
  searchBtnTop.setAttribute('aria-label', 'Пошук станції');
  searchBtnTop.innerHTML = MetroApp.Icons.search;
  document.body.appendChild(searchBtnTop);

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

      const input = document.getElementById('searchInput');
      const resultsContainer = document.getElementById('searchResults');

      input.addEventListener('input', (e) => {
        renderSearchResults(e.target.value.trim().toLowerCase(), resultsContainer);
      });

      if (!resultsContainer._hasListener) {
        resultsContainer.addEventListener('click', (e) => {
          const item = e.target.closest('.search-item');
          if (!item) return;
          
          document.getElementById('searchInput').blur(); 
          document.getElementById('searchClose').click(); 
          setTimeout(() => openStation(item.dataset.slug), 200); 
        });
        resultsContainer._hasListener = true;
      }

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

    setTimeout(() => input.focus(), 350);
  }

  function renderSearchResults(query, container) {
    if (!stationsData) {
      container.innerHTML = '<p class="fav-empty-text">Дані ще завантажуються...</p>';
      return;
    }

    const allStations = Object.values(stationsData);
    let filtered = allStations;

    if (query) {
      const rawQuery = query.toLowerCase().trim();
      const queryWords = rawQuery.split(/\s+/).filter(w => w.length > 0);
      const queryNoSpaces = rawQuery.replace(/\s+/g, '');
      
      filtered = allStations.filter(s => {
        const cleanName = s.name.toLowerCase().replace(/["'„“«».,]/g, '');
        const stationWords = cleanName.split(/[\s\u00a0\u202f\-]+/);
        
        const matchWords = queryWords.every(qWord => stationWords.some(sWord => sWord.startsWith(qWord)));
        if (matchWords) return true;

        const aliases = [];
        if (s.slug === 'R.Politekhnychnyi_instytut') aliases.push('кпі');
        if (s.slug === 'B.Ploshcha_Ukrainskikh_heroiv') { aliases.push('плуг'); aliases.push('площа льва толстого'); aliases.push('льва толстого'); }
        if (s.slug === 'G.Zvirynetska') { aliases.push('дружби народів'); }

        const matchAliases = aliases.some(alias => {
          const aliasWords = alias.toLowerCase().split(/[\s\u00a0\u202f\-]+/);
          return queryWords.every(qWord => aliasWords.some(aWord => aWord.startsWith(qWord)));
        });
        if (matchAliases) return true;

        const acronym = stationWords.map(w => w.charAt(0)).join('');
        if (acronym.length > 1 && acronym.startsWith(queryNoSpaces)) return true;

        return false;
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

  MetroApp.showCustomConfirm = function(message, onYes, onNo) {
    const overlay = document.createElement('div');
    overlay.className = 'global-confirm-overlay';
    overlay.innerHTML = `<div class="global-confirm-card"><div class="global-confirm-text">${message}</div><div class="global-confirm-btns"><button class="confirm-square confirm-square-yes" id="confirmYes">${MetroApp.Icons.check}</button><button class="confirm-square confirm-square-no" id="confirmNo">${MetroApp.Icons.cross}</button></div></div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#confirmYes').addEventListener('click', () => { overlay.remove(); if (onYes) onYes(); });
    overlay.querySelector('#confirmNo').addEventListener('click', () => { overlay.remove(); if (onNo) onNo(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); if (onNo) onNo(); } });
  };

})();
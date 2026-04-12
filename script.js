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
  window.applyZoomAndCenter = applyZoomAndCenter;
  adjustViewportHeight();
  img.addEventListener('load', () => { adjustViewportHeight(); applyZoomAndCenter(); });

  let resizeTimer;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { adjustViewportHeight(); applyZoomAndCenter(); }, 120); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
  document.addEventListener('DOMContentLoaded', () => { document.body.classList.remove('loading'); document.body.classList.add('loaded'); });

  /* Pinch zoom */
  let lastPinchDist = null;
  let lastPinchMidX = 0, lastPinchMidY = 0;

  document.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || sheetOverlay.classList.contains('overlay-visible')) return;
    e.preventDefault();

    const t0 = e.touches[0], t1 = e.touches[1];
    const dx = t0.clientX - t1.clientX;
    const dy = t0.clientY - t1.clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;

    if (lastPinchDist) {
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
    }
    lastPinchDist = dist;
    lastPinchMidX = midX;
    lastPinchMidY = midY;
  }, { passive: false });

  document.addEventListener('touchend', e => {
    if (e.touches.length < 2) lastPinchDist = null;
  });

  /* ==========================================================================
     3. УТИЛІТИ, КОЛЬОРИ ТА ФОРМАТУВАННЯ
     ========================================================================== */
  const LINE_COLOR = { red: '#c8523a', blue: '#5b9bd5', green: '#5aaa6a' };
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
    const path = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
    if (!isFav) return `<svg ${base} fill="none" stroke="#ABABAB" stroke-width="2"><path d="${path}"/></svg>`;
    return `<svg ${base} fill="${lineColor}"><path d="${path}"/></svg>`;
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

  function slugByName(raw) {
    const normalized = raw.replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/[🟥🟦🟩]/g, '').replace(/пересадка на\s*/i, '').replace(/короткий перехід на\s*/i, '').replace(/довгий перехід на\s*/i, '').replace(/перехід на\s*/i, '').replace(/попередня\s*/i, '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/театральну/, 'театральна').replace(/площу українських героїв/, 'площа українських героїв').replace(/майдан незалежності/, 'майдан незалежності').replace(/палац спорту/, 'палац спорту').replace(/золоті ворота/, 'золоті ворота').replace(/хрещатик/, 'хрещатик');
    return NAME_TO_SLUG[normalized] || null;
  }

  /* ==========================================================================
     4. ЗАВАНТАЖЕННЯ ДАНИХ ТА КЛІКИ ПО КАРТІ
     ========================================================================== */
  function hydrateStations(data) {
    if (!stationsData) stationsData = {};
    Object.keys(stationsData).forEach(key => delete stationsData[key]);
    data.stations.forEach(s => { stationsData[s.slug] = s; });
    if (window.applyLocalEdits) window.applyLocalEdits(stationsData);
    if (window.applyExitLabels) window.applyExitLabels(stationsData);
    return stationsData;
  }

  async function reloadStationsData(forceFresh = false) {
    const url = forceFresh ? `stations.json?nc=${Date.now()}` : 'stations.json';
    const response = await fetch(url, forceFresh ? { cache: 'no-store' } : undefined);
    const data = await response.json();
    return hydrateStations(data);
  }

  window.reloadStationsData = reloadStationsData;

  reloadStationsData().catch(err => console.error('stations.json load failed', err));

  inner.addEventListener('click', e => {
    const zone = e.target.closest('a.zone');
    if (!zone) return;
    e.preventDefault();
    if (zone.dataset.slug) openStation(zone.dataset.slug);
  });

  /* ==========================================================================
     5. ОБРАНІ СТАНЦІЇ (FAVOURITES)
     ========================================================================== */
  const FAV_KEY = 'metro_favs';
  let favCache = null;
  const getFavs = () => {
    if (favCache) return [...favCache];
    try { favCache = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
    catch { favCache = []; }
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
    if (e.key !== FAV_KEY) return;
    try { favCache = JSON.parse(e.newValue || '[]'); }
    catch { favCache = []; }
  });
























function formatExitFavs(slug) {
    const all = getExitFavs().filter(f => f.slug === slug);
    if (!all.length) return '';
    if (all.length === 1) return all[0].wagon + ' вагон, ' + all[0].doors + ' двері';
    return all.map(f => f.wagon + ' в., ' + f.doors + ' д.').join(', ');
  }

  // Відновлюємо загублену функцію renderFavList
  function renderFavList(favs) {
    if (!favs.length) {
      favBody.innerHTML = `<p class="fav-empty-text">Немає збережених станцій.<br>Натисніть ♡ на картці станції,<br>щоб зберегти її в обране.</p>`;
      return;
    }

    // Допоміжна функція для рендеру квадратів
    function renderExitFavsHtml(slug, color) {
      const exits = getExitFavs().filter(f => f.slug === slug);
      if (!exits.length) return '';
      
      // Якщо виходів 3 — додаємо клас для компактного вигляду
      const isCompact = exits.length > 2;
      const containerClass = isCompact ? 'fav-exits-container fav-exits-compact' : 'fav-exits-container';

      // Генеруємо групи та з'єднуємо їх відбивачем
      const groupsHtml = exits.map(f => `
        <div class="fav-exit-group">
          <div class="fav-pos-square" style="color:${color}">${f.wagon}</div>
          <div class="fav-pos-square" style="color:${color}">${f.doors}</div>
        </div>
      `).join('<div class="fav-exit-sep"></div>');
      
      return `<div class="${containerClass}">${groupsHtml}</div>`;
    }

// Тепер рендеримо список обраних станцій
    favBody.innerHTML = favs.map(slug => {
      const s = stationsData?.[slug];
      if (!s) return '';
      const color = LINE_COLOR[s.line] || '#888';
      
      // ДОДАНО: Скорочуємо довгі назви спеціально для Обраного
      let displayName = s.name;
      if (slug === 'B.Ploshcha_Ukrainskikh_heroiv') {
        displayName = 'Пл. Українських героїв';
      }
      // Можна додати інші скорочення в майбутньому, якщо знадобиться
      
      return `<div class="fav-item" data-slug="${slug}">
        <button class="fav-open-btn" data-slug="${slug}" style="border-left-color:${color}">
          <span class="fav-station-name">${displayName}</span>
          ${renderExitFavsHtml(slug, color)}
        </button>
        <div class="fav-drag-handle" aria-label="Перетягнути">⠿</div>
      </div>`;
    }).join('');

    let dragSrc = null;
    function getDragItems() { return [...favBody.querySelectorAll('.fav-item')]; }
    function saveOrder() { saveFavs(getDragItems().map(i => i.dataset.slug)); }
    function getItemAtY(y) { return getDragItems().find(item => { const r = item.getBoundingClientRect(); return y >= r.top && y <= r.bottom; }); }
    function clearDragState() {
      getDragItems().forEach(i => i.classList.remove('fav-over'));
    }

    favBody.querySelectorAll('.fav-drag-handle').forEach(handle => {
      const item = handle.closest('.fav-item');
      handle.addEventListener('touchstart', e => { e.preventDefault(); dragSrc = item; dragSrc.classList.add('fav-dragging'); }, { passive: false });
      handle.addEventListener('touchmove', e => {
        if (!dragSrc) return;
        e.preventDefault();
        const target = getItemAtY(e.touches[0].clientY);
        if (target && target !== dragSrc) {
          clearDragState();
          target.classList.add('fav-over');
          const items = getDragItems();
          if (items.indexOf(dragSrc) < items.indexOf(target)) target.after(dragSrc); else target.before(dragSrc);
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
      const target = getItemAtY(e.clientY);
      if (target && target !== dragSrc) {
        clearDragState();
        target.classList.add('fav-over');
        const items = getDragItems();
        if (items.indexOf(dragSrc) < items.indexOf(target)) target.after(dragSrc); else target.before(dragSrc);
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
    const favs = getFavs();
    if (!stationsData) favBody.innerHTML = `<p class="fav-empty-text">Дані ще завантажуються…</p>`;
    else if (favs.length === 0) favBody.innerHTML = `<p class="fav-empty-text">Немає збережених станцій.<br>Натисніть ♡ на картці станції,<br>щоб зберегти її в обране.</p>`;
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

  /* ==========================================================================
     6. РЕНДЕР КАРТКИ СТАНЦІЇ (STATION SHEET)
     ========================================================================== */
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
      const editedMark = p._edited ? `<span class="pos-edited-mark" data-slug="${p._slug}" data-idx="${p._posIdx}"><svg viewBox="-80 -80 672 672" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="17" height="17"><path d="M70.2,337.4l104.4,104.4L441.5,175L337,70.5L70.2,337.4z M0.6,499.8c-2.3,9.3,2.3,13.9,11.6,11.6L151.4,465L47,360.6 L0.6,499.8z M487.9,24.1c-46.3-46.4-92.8-11.6-92.8-11.6c-7.6,5.8-34.8,34.8-34.8,34.8l104.4,104.4c0,0,28.9-27.2,34.8-34.8 C499.5,116.9,534.3,70.6,487.9,24.1z"/></svg></span>` : '';
      const spacer = p._edited ? `<span class="pos-edited-spacer"></span>` : '';
      return `<div class="position-row ${isMulti ? 'position-row-multi' : ''}">${editedMark}${generatePills(p.wagon, p.doors)}${spacer}</div>`;
    }
    
    if (multiRow) {
      const editedPos = positions.find(p => p._edited);
      const editedMark = editedPos ? `<span class="pos-edited-mark" data-slug="${editedPos._slug}" data-idx="${editedPos._posIdx}"><svg viewBox="-80 -80 672 672" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="17" height="17"><path d="M70.2,337.4l104.4,104.4L441.5,175L337,70.5L70.2,337.4z M0.6,499.8c-2.3,9.3,2.3,13.9,11.6,11.6L151.4,465L47,360.6 L0.6,499.8z M487.9,24.1c-46.3-46.4-92.8-11.6-92.8-11.6c-7.6,5.8-34.8,34.8-34.8,34.8l104.4,104.4c0,0,28.9-27.2,34.8-34.8 C499.5,116.9,534.3,70.6,487.9,24.1z"/></svg></span>` : '';
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

  function openStation(slug) {
    if (typeof window.hasUnsavedFeedback === 'function' && window.hasUnsavedFeedback()) {
      window.showCustomConfirm('Зберегти зміни та застосувати їх локально?', () => {
        if (typeof window.triggerFeedbackSubmit === 'function') window.triggerFeedbackSubmit(true);
        window.fbUnsaved = false;
        actualOpenStation(); 
      }, () => { window.fbUnsaved = false; actualOpenStation(); });
      return; 
    }

    function actualOpenStation() {
      if (!stationsData?.[slug]) return;
      currentStationSlug = slug;
      const s = stationsData[slug];
      const color = LINE_COLOR[s.line] || '#888';
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
      // Exit favs & station fav pill styles
      attachExitFavListeners(sheetBody, slug, color);
    }
    actualOpenStation();
  }


  /* ==========================================================================
     ОБРАНЕ ВИХОДІВ (Exit Favourites)
     ========================================================================== */
const EXIT_FAV_KEY = 'metro_exit_favs';

  function getExitFavs() {
    try { return JSON.parse(localStorage.getItem(EXIT_FAV_KEY) || '[]'); } catch { return []; }
  }
  
  // Тепер ID включає напрямок
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
      // ПЕРЕВІРКА ЛІМІТУ: не більше 3 виходів для одного напрямку
      const slugDirFavs = favs.filter(f => f.slug === slug && f.dir === dir);
      if (slugDirFavs.length >= 3) return false; 
      
      favs.push({ id, slug, dir, wagon, doors });
    }
    
    localStorage.setItem(EXIT_FAV_KEY, JSON.stringify(favs));
    return idx < 0; 
  }

  function applyFavPillStyles(container, lineColor, isFaved) {
    container.querySelectorAll('.pos-pill').forEach(pill => {
      if (isFaved) {
        pill.style.background = lineColor;
        const num = pill.querySelector('.pos-pill-num');
        const lbl = pill.querySelector('.pos-pill-label');
        if (num) num.style.color = 'var(--bg-pill)';
        if (lbl) lbl.style.color = 'var(--bg-pill)';
      } else {
        pill.style.background = '';
        const num = pill.querySelector('.pos-pill-num');
        const lbl = pill.querySelector('.pos-pill-label');
        if (num) num.style.color = lineColor;
        if (lbl) lbl.style.color = '';
      }
    });
  }

  const UNDO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`;

  function attachExitFavListeners(container, slug, lineColor) {
    const rows = container.querySelectorAll('.position-row');
    rows.forEach(row => {
      // Get wagon/doors from first pill pair in this row
      function getPillValues() {
        const nums = row.querySelectorAll('.pos-pill-num');
        if (nums.length < 2) return null;
        return { wagon: nums[0].textContent.trim(), doors: nums[1].textContent.trim() };
      }

      function showExitFavToast(row, added) {
        // Remove existing toast
        let existing = row.querySelector('.exit-fav-toast');
        if (existing) { existing.classList.remove('fav-note-open'); setTimeout(() => existing?.remove(), 300); }

        if (!added) return;
        const pv = getPillValues(); if (!pv) return;

        const toast = document.createElement('div');
        toast.className = 'exit-fav-toast';
        toast.innerHTML = '<span class="exit-fav-toast-text">Вихід<br>додано<br>в обране</span>'
          + '<button class="exit-fav-toast-cancel" aria-label="Скасувати"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 7v6h6\"/><path d=\"M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13\"/></svg></button>';
        row.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('fav-note-open'));

toast.querySelector('.exit-fav-toast-cancel').addEventListener('click', (e) => {
          e.stopPropagation();
          const dirBlock = row.closest('.direction-block') || row.closest('.long-transfer-block');
          const labelEl = dirBlock ? (dirBlock.querySelector('.direction-label') || dirBlock.querySelector('.transfer-text')) : null;
          const dirLabel = labelEl ? labelEl.textContent.trim() : '';
          toggleExitFav(slug, dirLabel, pv.wagon, pv.doors);
          applyFavPillStyles(row, lineColor, false);
          toast.classList.remove('fav-note-open');
          setTimeout(() => toast.remove(), 300);
        });

        // Auto-hide after 3 seconds
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
        const added = toggleExitFav(slug, dirLabel, pv.wagon, pv.doors);
        applyFavPillStyles(row, lineColor, added);
        showExitFavToast(row, added);
      }

      // Apply stored fav state on render
      const pv = getPillValues();
      if (pv) {
        const dirBlock = row.closest('.direction-block') || row.closest('.long-transfer-block');
        const labelEl = dirBlock ? (dirBlock.querySelector('.direction-label') || dirBlock.querySelector('.transfer-text')) : null;
        const dirLabel = labelEl ? labelEl.textContent.trim() : '';
        if (isExitFav(slug, dirLabel, pv.wagon, pv.doors)) {
          applyFavPillStyles(row, lineColor, true);
        }
      }
      // Long press detection
      let longPressTimer = null;
      row.addEventListener('touchstart', e => {
        longPressTimer = setTimeout(() => { longPressTimer = null; triggerExitFav(); }, 600);
      }, { passive: true });
      row.addEventListener('touchend', () => { clearTimeout(longPressTimer); longPressTimer = null; }, { passive: true });
      row.addEventListener('touchmove', () => { clearTimeout(longPressTimer); longPressTimer = null; }, { passive: true });

      // Triple tap detection
      let tapCount = 0; let tapTimer = null;
      row.addEventListener('click', e => {
        if (e.target.closest('.pos-edited-mark, .exit-fav-cancel, .edit-info-panel')) return;
        tapCount++;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => { tapCount = 0; }, 500);
        if (tapCount >= 3) { tapCount = 0; clearTimeout(tapTimer); triggerExitFav(); }
      });
    });
  }
  /* ==========================================================================
     7. УПРАВЛІННЯ ВІКНАМИ, МЕНЮ ТА ТЕМАМИ
     ========================================================================== */
  function closeAllSheets(force = false) {
    if (!force && typeof window.hasUnsavedFeedback === 'function' && window.hasUnsavedFeedback()) {
      window.showCustomConfirm('Зберегти зміни та застосувати їх локально?', () => {
        if (typeof window.triggerFeedbackSubmit === 'function') window.triggerFeedbackSubmit(true);
        window.fbUnsaved = false; closeAllSheets(true); 
      }, () => { window.fbUnsaved = false; closeAllSheets(true); });
      return false;
    }
    document.querySelectorAll('.station-sheet').forEach(el => { el.classList.remove('sheet-open'); el.style.maxHeight = ''; });
    sheetOverlay.classList.remove('overlay-visible');
    return true;
  }
  window.closeAllSheets = closeAllSheets;

  // Called by feedback.js after saving an exit label so the card updates immediately
  window.refreshCurrentStation = function() {
    if (!currentStationSlug) return;
    // Re-apply exit labels to latest stationsData then re-render
    if (typeof window.applyExitLabels === 'function') window.applyExitLabels(stationsData);
    if (stationsData[currentStationSlug] && sheet.classList.contains('sheet-open')) {
      const s = stationsData[currentStationSlug];
      const color = LINE_COLOR[s.line] || '#888';
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

  // Обробка кліку на олівець (Slide-in info panel)
  sheetBody.addEventListener('click', e => {
    const pencil = e.target.closest('.pos-edited-mark');
    if (pencil) {
      e.stopPropagation();
      const row = pencil.closest('.position-row');
      const slug = pencil.dataset.slug; const idx = pencil.dataset.idx;

      // Знайти або створити edit-info-panel одразу після row
      let panel = row.nextElementSibling;
      if (panel && panel.classList.contains('edit-info-panel')) {
        // Другий тап — закрити
        panel.classList.remove('panel-open');
        setTimeout(() => { if (!panel.classList.contains('panel-open')) panel.remove(); }, 300);
        return;
      }

      // Закрити всі інші панелі
      document.querySelectorAll('.edit-info-panel').forEach(p => {
        p.classList.remove('panel-open');
        setTimeout(() => p.remove(), 300);
      });

      panel = document.createElement('div');
      panel.className = 'edit-info-panel';
      panel.innerHTML = '<div class="fb-closed-note-wrap" style="pointer-events:auto;margin:4px 0 0"><span class="fb-closed-note">Значення змінено користувачем</span><button class="fb-restore-exit edit-info-cancel" style="pointer-events:auto" data-slug="' + slug + '" data-idx="' + idx + '"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg></button></div>';
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
/* ==========================================================================
     8. ТЕМИ ТА ДРОПДАУН МЕНЮ (ABOUT)
     ========================================================================== */
  const THEME_KEY = 'metro_theme';
  const root = document.documentElement;

  const SVG_SUN  = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><circle cx="30" cy="30" r="30" fill="currentColor"/><path d="M 30,0 A 30,30 0 0,1 30,60 Z" fill="var(--bg-sheet)"/></svg>`;
  
  const SVG_MOON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><circle cx="30" cy="30" r="30" fill="currentColor"/><path d="M 30,0 A 30,30 0 0,0 30,60 Z" fill="var(--bg-sheet)"/></svg>`;

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.innerHTML = theme === 'dark' ? SVG_SUN : SVG_MOON;
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
      if (typeof openFeedbackSheet === 'function') openFeedbackSheet(stationsData);
    });

    document.getElementById('aboutItem')?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      dropMenu.classList.remove('show'); dropMenu.hidden = true;
      
      if (typeof window.hasUnsavedFeedback === 'function' && window.hasUnsavedFeedback()) {
        window.showCustomConfirm('Зберегти зміни та застосувати їх локально?', () => {
          if (typeof window.triggerFeedbackSubmit === 'function') window.triggerFeedbackSubmit(true);
          window.fbUnsaved = false; executeAboutTransition();
        }, () => { window.fbUnsaved = false; executeAboutTransition(); });
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
      aboutSheet.innerHTML = `
        <div class="sheet-handle-bar"><div class="sheet-handle"></div><span class="sheet-sheet-title about-version-title">KyivMetroGO</span><button class="sheet-close-btn" id="aboutClose" aria-label="Закрити">✕</button></div>
        <div class="sheet-body">
          <div class="about-content">
            <img src="icon-96x96.png" width="64" height="64" style="border-radius: 16px; margin-bottom: -10px;">
            <p style="text-align: center;">Додаток для заощадження часопростору у київському метро</p>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px; padding: 16px; background: var(--bg-card); border: 0.5px solid var(--border); border-radius: 14px;">
              <p style="margin:0; flex-shrink: 0; width: 96px; display: flex; justify-content: center;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 5" style="width: 96px; height: auto; border-radius: 4px;"><path class="pluh-bg" fill="#D0D0D5" d="M0 0h10v5H0z"/><path class="pluh-text" fill="#1C1C1E" transform="translate(-112.36 -152.57) scale(.26458)" d="m433.82 582.27v8.6389h1.2917v-9.7222h-7.1944v9.7222h1.3056v-8.6389zm5.5972 4.8611v-2.0694h2.375v5.8472h1.2917v-6.875h-4.9583v3.0417c0 2.6667-0.5 2.9861-1.2639 2.9861v0.84722c0.125 0.0417 0.44445 0.0695 0.65278 0.0695 1.1667 0 1.9028-0.65278 1.9028-3.8472zm11.681-5.9444-2.5556 5.1389-2.5556-5.1389h-1.4028l3.3472 6.6667-1.6806 3.0556h1.4028l4.8472-9.7222zm7.9861 1.0833v-1.0833h-4.9722v9.7222h1.3056v-8.6389z"/></svg></p>
              <p style="margin: 0; text-align: left; font-size: 18px; line-height: 1.4; flex: 1;">Натисніть на станцію, і отримаєте вагон та двері, які&nbsp;будуть якнайближче до&nbsp;виходу з&nbsp;підземки</p>
            </div>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px; padding: 16px; background: var(--bg-card); border: 0.5px solid var(--border); border-radius: 14px;">
              <p style="margin:0; flex-shrink: 0; width: 96px; display: flex; justify-content: center; color: var(--text-muted);"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 22" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></p>
              <p style="margin: 0; text-align: left; font-size: 18px; line-height: 1.4; flex: 1;">Для швидкого доступу до&nbsp;потрібних станцій, додайте&nbsp;їх в&nbsp;обране</p>
            </div>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px; padding: 16px; background: var(--bg-card); border: 0.5px solid var(--border); border-radius: 14px;">
              <p style="margin:0; flex-shrink: 0; width: 96px; display: flex; justify-content: center; color: var(--text-muted);"><svg viewBox="-80 -80 672 672" xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="32" height="32"><path d="M70.2,337.4l104.4,104.4L441.5,175L337,70.5L70.2,337.4z M0.6,499.8c-2.3,9.3,2.3,13.9,11.6,11.6L151.4,465L47,360.6 L0.6,499.8z M487.9,24.1c-46.3-46.4-92.8-11.6-92.8-11.6c-7.6,5.8-34.8,34.8-34.8,34.8l104.4,104.4c0,0,28.9-27.2,34.8-34.8 C499.5,116.9,534.3,70.6,487.9,24.1z"/></svg></p>
              <p style="margin: 0; text-align: left; font-size: 18px; line-height: 1.4; flex: 1;">Помітили неточність — виправте. Локальні&nbsp;зміни відобразяться&nbsp;миттєво</p>
            </div>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px; padding: 16px; background: var(--bg-card); border: 0.5px solid var(--border); border-radius: 14px;">
              <p style="margin:0; flex-shrink: 0; width: 96px; display: flex; justify-content: center; color: var(--text-muted);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 42" fill="currentColor"><path d="m312.043 291.275-2.063 8.438q-9.28 3.656-14.812 5.53-5.531 1.97-12.844 1.97-11.25 0-17.531-5.438-6.188-5.531-6.188-13.969 0-3.28.47-6.656.468-3.469 1.5-7.781l7.687-27.375q1.031-3.938 1.687-7.406.75-3.563.75-6.47 0-5.25-2.156-7.312t-8.25-2.062q-3 0-6.188.937-3.093.938-5.343 1.782l2.062-8.438q7.594-3.094 14.531-5.25 6.938-2.25 13.125-2.25 11.157 0 17.157 5.438 6.093 5.343 6.093 13.968 0 1.782-.468 6.282-.375 4.5-1.5 8.25l-7.688 27.28q-.937 3.282-1.687 7.5-.75 4.22-.75 6.376 0 5.437 2.437 7.406 2.438 1.969 8.438 1.969 2.812 0 6.375-.938 3.562-1.03 5.156-1.78m1.969-114.469q0 7.125-5.438 12.188-5.344 4.969-12.937 4.969-7.594 0-13.032-4.97-5.437-5.062-5.437-12.187t5.437-12.187 13.032-5.063 12.937 5.063q5.438 5.062 5.438 12.187" transform="translate(-65.818 -42.216)scale(.26458)"/></svg></p>
              <p style="margin: 0; text-align: left; font-size: 18px; line-height: 1.4; flex: 1;">Довідкові блоки</p>
            </div>
            <p class="about-footer">Зроблено з любовʼю до Києва</p>
          </div>
        </div>`;
      document.body.appendChild(aboutSheet);
      document.getElementById('aboutClose').addEventListener('click', () => {
        aboutSheet.classList.remove('sheet-open');
        if (document.querySelectorAll('.station-sheet.sheet-open').length === 0) document.getElementById('sheetOverlay').classList.remove('overlay-visible');
      });
    }
    document.getElementById('feedbackSheet')?.classList.remove('sheet-open');
    document.getElementById('stationSheet')?.classList.remove('sheet-open');
    aboutSheet.classList.add('sheet-open');
    document.getElementById('sheetOverlay').classList.add('overlay-visible');
  }

  /* ГЛОБАЛЬНИЙ ЕКСПОРТ (Вікно підтвердження) */
  window.showCustomConfirm = function(message, onYes, onNo) {
    const overlay = document.createElement('div');
    overlay.className = 'global-confirm-overlay';
    overlay.innerHTML = `<div class="global-confirm-card"><div class="global-confirm-text">${message}</div><div class="global-confirm-btns"><button class="confirm-square confirm-square-yes" id="confirmYes"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button><button class="confirm-square confirm-square-no" id="confirmNo"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div></div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#confirmYes').addEventListener('click', () => { overlay.remove(); if (onYes) onYes(); });
    overlay.querySelector('#confirmNo').addEventListener('click', () => { overlay.remove(); if (onNo) onNo(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); if (onNo) onNo(); } });
  };

})();

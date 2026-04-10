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
    if (e.touches.length !== 2 || document.querySelector('.station-sheet.sheet-open')) return;
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
    const path = 'M53.409 13.888q5.035 0 7.912 5.829 1.042 2.307 1.092 3.522h.074q.868-4.018 3.15-6.672 2.68-2.68 6.028-2.68 5.184 0 8.31 5.557.793 2.059.793 3.87 0 6.2-5.16 11.831l-13.12 15.751h-.15l-13.94-17.09q-4.167-5.085-4.167-10.492 0-5.234 4.936-8.31 2.084-1.116 4.242-1.116';
    const t = 'transform="translate(-44.23 -13.888)"';
    const base = 'width="22" height="20" viewBox="0 0 41.027 37.009" xmlns="http://www.w3.org/2000/svg"';
    if (!isFav) return `<svg ${base} fill="none" stroke="#636366" stroke-width="1.5"><path d="${path}" ${t}/></svg>`;
    return `<svg ${base} fill="${lineColor}" stroke="${lineColor}" stroke-width="0.5"><path d="${path}" ${t}/></svg>`;
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
  fetch('stations.json')
    .then(r => r.json())
    .then(data => {
      stationsData = {};
      data.stations.forEach(s => { stationsData[s.slug] = s; });
      if (window.applyLocalEdits) window.applyLocalEdits(stationsData);
      initZoneClicks();
    })
    .catch(err => console.error('stations.json load failed', err));

  function initZoneClicks() {
    document.querySelectorAll('a.zone').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        if (link.dataset.slug) openStation(link.dataset.slug);
      });
    });
  }

  /* ==========================================================================
     5. ОБРАНІ СТАНЦІЇ (FAVOURITES)
     ========================================================================== */
  const FAV_KEY = 'metro_favs';
  const getFavs = () => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } };
  const saveFavs = arr => localStorage.setItem(FAV_KEY, JSON.stringify(arr));
  const isFav = slug => getFavs().includes(slug);
  const toggleFav = slug => {
    let favs = getFavs();
    favs = favs.includes(slug) ? favs.filter(s => s !== slug) : [...favs, slug];
    saveFavs(favs); return favs.includes(slug);
  };

  function renderFavList(favs) {
    if (!favs.length) {
      favBody.innerHTML = `<p class="fav-empty-text">Немає збережених станцій.<br>Натисніть&nbsp;♡ на&nbsp;картці&nbsp;станції,<br>щоб зберегти&nbsp;її в&nbsp;обране.</p>`;
      return;
    }
    favBody.innerHTML = favs.map(slug => {
      const s = stationsData?.[slug];
      if (!s) return '';
      const color = LINE_COLOR[s.line] || '#888';
      return `<div class="fav-item" data-slug="${slug}">
        <button class="fav-open-btn" data-slug="${slug}" style="border-left-color:${color}">
          <span class="fav-station-name">${s.name}</span>
        </button>
        <div class="fav-drag-handle" aria-label="Перетягнути">⠿</div>
      </div>`;
    }).join('');

    favBody.querySelectorAll('.fav-open-btn').forEach(btn => btn.addEventListener('click', () => openStation(btn.dataset.slug)));

    let dragSrc = null, startY = 0, currentY = 0;
    function getDragItems() { return [...favBody.querySelectorAll('.fav-item')]; }
    function saveOrder() { saveFavs(getDragItems().map(i => i.dataset.slug)); }
    function getItemAtY(y) { return getDragItems().find(item => { const r = item.getBoundingClientRect(); return y >= r.top && y <= r.bottom; }); }

    favBody.querySelectorAll('.fav-drag-handle').forEach(handle => {
      const item = handle.closest('.fav-item');
      handle.addEventListener('touchstart', e => { e.preventDefault(); dragSrc = item; startY = e.touches[0].clientY; dragSrc.classList.add('fav-dragging'); }, { passive: false });
      handle.addEventListener('touchmove', e => {
        if (!dragSrc) return;
        e.preventDefault();
        currentY = e.touches[0].clientY;
        const target = getItemAtY(currentY);
        if (target && target !== dragSrc) {
          getDragItems().forEach(i => i.classList.remove('fav-over'));
          target.classList.add('fav-over');
          const items = getDragItems();
          if (items.indexOf(dragSrc) < items.indexOf(target)) target.after(dragSrc); else target.before(dragSrc);
        }
      }, { passive: false });
      handle.addEventListener('touchend', () => {
        if (!dragSrc) return;
        dragSrc.classList.remove('fav-dragging');
        getDragItems().forEach(i => i.classList.remove('fav-over'));
        saveOrder(); dragSrc = null;
      });

      handle.addEventListener('mousedown', () => { dragSrc = item; dragSrc.classList.add('fav-dragging'); document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp); });
    });

    function onMouseMove(e) {
      if (!dragSrc) return;
      const target = getItemAtY(e.clientY);
      if (target && target !== dragSrc) {
        getDragItems().forEach(i => i.classList.remove('fav-over'));
        target.classList.add('fav-over');
        const items = getDragItems();
        if (items.indexOf(dragSrc) < items.indexOf(target)) target.after(dragSrc); else target.before(dragSrc);
      }
    }
    function onMouseUp() {
      if (!dragSrc) return;
      dragSrc.classList.remove('fav-dragging');
      getDragItems().forEach(i => i.classList.remove('fav-over'));
      saveOrder(); dragSrc = null;
      document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp);
    }
  }

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
      const editedMark = p._edited ? `<span class="pos-edited-mark" data-slug="${p._slug}" data-idx="${p._posIdx}">✏️</span>` : '';
      const spacer = p._edited ? `<span class="pos-edited-spacer"></span>` : '';
      return `<div class="position-row ${isMulti ? 'position-row-multi' : ''}">${editedMark}${generatePills(p.wagon, p.doors)}${spacer}</div>`;
    }
    
    if (multiRow) {
      const editedPos = positions.find(p => p._edited);
      const editedMark = editedPos ? `<span class="pos-edited-mark" data-slug="${editedPos._slug}" data-idx="${editedPos._posIdx}">✏️</span>` : '';
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
      const s = stationsData[slug];
      const color = LINE_COLOR[s.line] || '#888';
      const fav = isFav(slug);

      sheetBody.innerHTML = `<div class="sheet-header"><span class="sheet-title">${s.name}</span></div>${renderDirections(s, color)}`;

      sheetBody.querySelectorAll('.nav-label').forEach(el => {
        const target = slugByName(el.dataset.name || '');
        if (target && target !== slug) {
          el.classList.add('nav-link');
          el.addEventListener('click', e => { e.stopPropagation(); openStation(target); });
        }
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
        const newBtn = favBtnBar.cloneNode(true);
        newBtn.innerHTML = heartSvg(fav, slug, color);
        newBtn.classList.toggle('fav-active', fav);
        favBtnBar.parentNode.replaceChild(newBtn, favBtnBar);
        newBtn.addEventListener('click', () => {
          const nowFav = toggleFav(slug);
          newBtn.innerHTML = heartSvg(nowFav, slug, color);
          newBtn.classList.toggle('fav-active', nowFav);
        });
      }

      document.querySelectorAll('.station-sheet').forEach(el => { if (el.id !== 'stationSheet') el.classList.remove('sheet-open'); });
      if (!sheet.classList.contains('sheet-open')) { sheet.classList.add('sheet-open'); sheetOverlay.classList.add('overlay-visible'); }
    }
    actualOpenStation();
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

  sheetClose.addEventListener('click', () => closeAllSheets());

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

  // Обробка кліку на олівець (Попап скасування)
  sheetBody.addEventListener('click', e => {
    const pencil = e.target.closest('.pos-edited-mark');
    if (pencil) {
      e.stopPropagation();
      document.querySelectorAll('.edit-popup').forEach(el => el.remove());
      const slug = pencil.dataset.slug; const idx = pencil.dataset.idx;

      const popup = document.createElement('div');
      popup.className = 'edit-popup';
      popup.innerHTML = `<div class="edit-popup-text">Значення змінено користувачем</div><div class="edit-popup-btns"><button class="edit-popup-btn btn-ok">✓</button><button class="edit-popup-btn btn-reset">✕</button></div>`;
      pencil.closest('.position-row').appendChild(popup);

      popup.querySelector('.btn-reset').addEventListener('click', (ev) => {
        ev.stopPropagation();
        try {
          const edits = JSON.parse(localStorage.getItem('metro_local_edits') || '{}');
          if (edits[slug] && edits[slug][idx]) {
            delete edits[slug][idx];
            if (Object.keys(edits[slug]).length === 0) delete edits[slug];
            localStorage.setItem('metro_local_edits', JSON.stringify(edits));
          }
          fetch(`stations.json?nc=${Date.now()}`).then(r => r.json()).then(d => {
            Object.keys(stationsData).forEach(k => delete stationsData[k]);
            d.stations.forEach(s => { stationsData[s.slug] = s; });
            if (window.applyLocalEdits) window.applyLocalEdits(stationsData);
            openStation(slug);
          });
        } catch(err) {}
      });

      popup.querySelector('.btn-ok').addEventListener('click', (ev) => { ev.stopPropagation(); popup.remove(); });
      setTimeout(() => { document.addEventListener('click', function closePopup(ev) { if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('click', closePopup); } }, {once: true}); }, 0);
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
              <p style="margin:0; flex-shrink: 0; width: 96px; display: flex; justify-content: center; color: var(--text-muted);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41.027 37.009" fill="currentColor"><path d="M53.409 13.888q5.035 0 7.912 5.829 1.042 2.307 1.092 3.522h.074q.868-4.018 3.15-6.672 2.68-2.68 6.028-2.68 5.184 0 8.31 5.557.793 2.059.793 3.87 0 6.2-5.16 11.831l-13.12 15.751h-.15l-13.94-17.09q-4.167-5.085-4.167-10.492 0-5.234 4.936-8.31 2.084-1.116 4.242-1.116" transform="translate(-44.23 -13.888)"/></svg></p>
              <p style="margin: 0; text-align: left; font-size: 18px; line-height: 1.4; flex: 1;">Для швидкого доступу до&nbsp;потрібних станцій, додайте&nbsp;їх в&nbsp;обране</p>
            </div>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px; padding: 16px; background: var(--bg-card); border: 0.5px solid var(--border); border-radius: 14px;">
              <p style="margin:0; flex-shrink: 0; width: 96px; display: flex; justify-content: center; color: var(--text-muted);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32.841 33.362" fill="currentColor"><path d="m78.908 50.896-8.136-3.472-23.515-23.515q-.744-.819-.967-1.34-.224-.545-.224-1.066t.224-1.141q.248-.62 1.166-1.612.719-.695 1.314-.943.62-.273 1.141-.273.62 0 1.24.323.645.297 1.365.992l23.713 23.713zm-2.828-2.034 1.042-1.041-1.39-4.267-.198 2.282-1.537-.496.347 1.786h-2.58zm-3.77-4.167.843-.843-17.016-17.016 1.042-1.042-.893-.893-2.977 2.977.893.893 1.092-1.092zM51.722 26.39l3.076-3.075-1.29-1.29-3.076 3.076zm-2.877-2.778 3.274-3.274q-.794-.818-1.315-1.042-.496-.223-1.017-.223-.322 0-.72.149-.396.149-.719.422-.347.272-.52.744-.15.471-.15.818.026.57.249 1.166.248.57.918 1.24" transform="translate(-46.066 -17.534)"/></svg></p>
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
    overlay.innerHTML = `<div class="global-confirm-card"><div class="edit-popup-text" style="font-size:16px">${message}</div><div class="edit-popup-btns"><button class="confirm-square confirm-square-yes" id="confirmYes"></button><button class="confirm-square confirm-square-no" id="confirmNo"></button></div></div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#confirmYes').addEventListener('click', () => { overlay.remove(); if (onYes) onYes(); });
    overlay.querySelector('#confirmNo').addEventListener('click', () => { overlay.remove(); if (onNo) onNo(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); if (onNo) onNo(); } });
  };

})();
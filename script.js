(function () {
  /* ── Viewport & zoom ── */
  const vp    = document.getElementById('mapViewport');
  const inner = document.getElementById('mapInner');
  const img   = document.getElementById('mapImg');
  const centerX = 0.485, centerY = 0.5;

function applyZoomAndCenter() {
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) return;
    const w  = Math.min(window.innerWidth, document.documentElement.clientWidth);
    const sf = w <= 500 ? 4.5 : 1.5;
    const minZoom = vp.clientWidth / natW; // Забороняє зумити менше ширини екрану
    const zoom = Math.max(minZoom, Math.min(4.0, Math.round(vp.clientWidth * sf) / natW));
    
    const newW = Math.round(natW * zoom);
    const newH = Math.round(natH * zoom);
    
    inner.style.width  = newW + 'px';
    inner.style.height = newH + 'px';
    
    // ДОДАНО: Центрування карти, якщо вона менша за екран
    const padX = Math.max(0, (vp.clientWidth - newW) / 2);
    const padY = Math.max(0, (vp.clientHeight - newH) / 2);
    inner.style.marginLeft = padX + 'px';
    inner.style.marginTop  = padY + 'px';
    
    img.style.width = img.style.height = '100%';
    
    requestAnimationFrame(() => {
      // Центруємо скрол з урахуванням нових відступів
      const targetX = padX + newW * centerX;
      const targetY = padY + newH * centerY;
      
      vp.scrollLeft = Math.max(0, targetX - vp.clientWidth / 2);
      vp.scrollTop  = Math.max(0, targetY - vp.clientHeight / 2);
    });
  }
  function adjustViewportHeight() {
    if (!vp) return;
    const top   = vp.getBoundingClientRect().top;
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

  /* ── Pinch zoom ── */
  let lastPinchDist = null;
  let lastPinchMidX = 0, lastPinchMidY = 0;

  document.addEventListener('touchmove', e => {
    if (e.touches.length !== 2) return;
    // Не зумити якщо відкрите будь-яке вікно
    if (document.querySelector('.station-sheet.sheet-open')) return;
    e.preventDefault();

    const t0 = e.touches[0], t1 = e.touches[1];
    const dx = t0.clientX - t1.clientX;
    const dy = t0.clientY - t1.clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Середня точка між пальцями (у координатах вікна)
    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;

if (lastPinchDist) {
      const ratio = dist / lastPinchDist;

      // Поточний розмір inner
      const oldW = inner.offsetWidth;
      const oldH = inner.offsetHeight;

      // Точка кліку відносно самого зображення (щоб зум не збивався через margin)
      const imgRect = inner.getBoundingClientRect();
      const relX = (midX - imgRect.left) / oldW;
      const relY = (midY - imgRect.top) / oldH;

      // Нові розміри з обмеженням
      const natW = img.naturalWidth || img.width;
      const natH = img.naturalHeight || img.height;
      const minW = vp.clientWidth; // НЕ менше ширини екрану
      const maxW = Math.round(natW * 4.0);
      const newW = Math.max(minW, Math.min(maxW, Math.round(oldW * ratio)));
      const newH = Math.round(newW * oldH / oldW);

      // ДОДАНО: Динамічне центрування при відзумлюванні
      const padX = Math.max(0, (vp.clientWidth - newW) / 2);
      const padY = Math.max(0, (vp.clientHeight - newH) / 2);

      // Застосовуємо нові розміри та відступи
      inner.style.width  = newW + 'px';
      inner.style.height = newH + 'px';
      inner.style.marginLeft = padX + 'px';
      inner.style.marginTop  = padY + 'px';

      // Скролимо так, щоб точка під пальцями залишилась на місці
      const vpRect = vp.getBoundingClientRect();
      vp.scrollLeft = Math.round((relX * newW + padX) - (midX - vpRect.left));
      vp.scrollTop  = Math.round((relY * newH + padY) - (midY - vpRect.top));
    }
    lastPinchDist = dist;
    lastPinchMidX = midX;
    lastPinchMidY = midY;
  }, { passive: false });

  document.addEventListener('touchend', e => {
    if (e.touches.length < 2) lastPinchDist = null;
  });

  /* ══ COLORS ══ */
  const LINE_COLOR = { red: '#c8523a', blue: '#5b9bd5', green: '#5aaa6a' };

  function heartSvg(isFav, slug, lineColor) {
    const path = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
    const base = 'width="22" height="20" viewBox="0 0 24 22" xmlns="http://www.w3.org/2000/svg"';
    if (!isFav) {
      return `<svg ${base} fill="none" stroke="#636366" stroke-width="2"><path d="${path}"/></svg>`;
    }
    // Варіант А для всіх: заливка + контур кольором гілки
    return `<svg ${base} fill="${lineColor}" stroke="${lineColor}" stroke-width="1"><path d="${path}"/></svg>`;
  }
  const LINE_LABEL = { red: 'Червона лінія', blue: 'Синя лінія', green: 'Зелена лінія' };

  /* ══ FORMAT LABEL ══ */
  const EMOJI_TO_LINE = { '🟥': '#c8523a', '🟦': '#5b9bd5', '🟩': '#5aaa6a' };
  function formatLabel(raw) {
    let text = raw.replace(/\u00a0/g, ' ').trim();
    const emojiRe = /(🟥|🟦|🟩)/g;
    const firstEmoji = text.match(emojiRe)?.[0];
    const color = firstEmoji ? EMOJI_TO_LINE[firstEmoji] : null;
    if (!color) return `<span class="exit-label-text">${text}</span>`;
    const clean = text.replace(emojiRe, '').trim();
    return `<span class="transfer-label">` +
      `<span class="transfer-line" style="background:${color}"></span>` +
      `<span class="transfer-text">${clean}</span>` +
      `<span class="transfer-line" style="background:${color}"></span>` +
      `</span>`;
  }

  /* ══ PILLS ══ */
  function pill(label, value, color) {
    return `<div class="pos-pill">
      <div class="pos-pill-label">${label}</div>
      <div class="pos-pill-num" style="color:${color}">${value}</div>
    </div>`;
  }

  /* ══ RENDER POSITIONS ══
     multiRow=true (Хрещатик): кілька positions в одному exit → один рядок.
     Інакше: кожна position — окремий рядок.
  */
/* ══ RENDER POSITIONS ══ */
  function renderPositions(positions, color, multiRow) {
    if (!positions.length) return '';

    // Магія розбиття: якщо є кома, малюємо кілька блоків пілюль підряд
    function generatePills(wStr, dStr) {
      const wArr = String(wStr).split(',').map(s => s.trim());
      const dArr = String(dStr).split(',').map(s => s.trim());
      const blocks = [];
      const count = Math.max(wArr.length, dArr.length);
      for (let i = 0; i < count; i++) {
        const w = wArr[i] || wArr[0];
        const d = dArr[i] || dArr[0];
        blocks.push(`${pill('вагон', w, color)}\n${pill('двері', d, color)}`);
      }
      return blocks.join('<span class="pos-multi-sep" style="margin: 0 6px;">·</span>');
    }

    if (positions.length === 1) {
      const p = positions[0];
      const isMulti = String(p.wagon).includes(',');
      const editedMark = p._edited ? `<span class="pos-edited-mark" data-slug="${p._slug}" data-idx="${p._posIdx}">✏️</span>` : '';
      const spacer = p._edited ? `<span class="pos-edited-spacer"></span>` : '';
      return `<div class="position-row ${isMulti ? 'position-row-multi' : ''}">
        ${editedMark}
        ${generatePills(p.wagon, p.doors)}
        ${spacer}
      </div>`;
    }
    
    if (multiRow) {
      const editedPos = positions.find(p => p._edited);
      const editedMark = editedPos ? `<span class="pos-edited-mark" data-slug="${editedPos._slug}" data-idx="${editedPos._posIdx}">✏️</span>` : '';
      const spacer = editedPos ? `<span class="pos-edited-spacer"></span>` : '';
      return `<div class="position-row position-row-multi">
        ${editedMark}
        ${positions.map((p, i) => `
          ${i > 0 ? '<span class="pos-multi-sep">·</span>' : ''}
          ${generatePills(p.wagon, p.doors)}
        `).join('')}
        ${spacer}
      </div>`;
    }
    
    return positions.map(p => {
      const isMulti = String(p.wagon).includes(',');
      return `<div class="position-row ${isMulti ? 'position-row-multi' : ''}">
        ${generatePills(p.wagon, p.doors)}
      </div>`;
    }).join('');
  }
  /* ══ RENDER DIRECTIONS ══ */
  function renderDirections(s, color) {
    const isKhreshchatyk = s.slug === 'R.Khreshchatyk';

    if (isKhreshchatyk) {
      const mainDirs  = s.directions.filter(d => d.from !== '__long_transfer__');
      const longDir   = s.directions.find(d => d.from === '__long_transfer__');

      const mainHtml = mainDirs.map(dir => `
        <div class="direction-block">
          <div class="direction-label nav-label" data-name="${dir.from}">${dir.from}</div>
          ${dir.exits.map(exit => `
            ${exit.label ? `<div class="exit-label nav-label" data-name="${exit.label}">${formatLabel(exit.label)}</div>` : ''}
            ${renderPositions(exit.positions, color, true)}
          `).join('')}
        </div>`).join('');

      // Компактний блок довгого переходу
      let longHtml = '';
      if (longDir) {
        // Кожен exit — підзаголовок (Попередня X), потім кожна position — окремий рядок зі стрілкою
        const rows = longDir.exits.map(exit => {
          const posRows = exit.positions.map(p => `
            <div class="long-transfer-pos-row">
              ${pill('вагон', p.wagon, color)}
              ${pill('двері', p.doors, color)}
            </div>`).join('');
          return `<div class="long-transfer-exit">
            <div class="long-transfer-exit-label">${exit.label}</div>
            ${posRows}
          </div>`;
        }).join('');

        longHtml = `<div class="long-transfer-block">
          <div class="long-transfer-title">
            <span class="transfer-label">
              <span class="transfer-line" style="background:${color}"></span>
              <span class="transfer-text">довгий&nbsp;перехід на&nbsp;Майдан&nbsp;Незалежності</span>
              <span class="transfer-line" style="background:${color}"></span>
            </span>
          </div>
          ${rows}
        </div>`;
      }

      return mainHtml + longHtml;
    }

    // Всі інші станції — стандартний макет
    return s.directions.map(dir => {
      if (dir.from === 'вихід праворуч') {
        return `<div class="direction-block direction-exit-right">
          <div class="direction-label">вихід праворуч</div>
        </div>`;
      }
      return `<div class="direction-block">
        <div class="direction-label nav-label" data-name="${dir.from}">${dir.from}</div>
        ${dir.exits.map(exit => `
          ${exit.label ? `<div class="exit-label nav-label" data-name="${exit.label}">${formatLabel(exit.label)}</div>` : ''}
          ${renderPositions(exit.positions, color, false)}
        `).join('')}
      </div>`;
    }).join('');
  }

  /* ══ STATIONS DATA ══ */
  let stationsData = null;
  fetch('stations.json')
    .then(r => r.json())
    .then(data => {
      stationsData = {};
      data.stations.forEach(s => { stationsData[s.slug] = s; });
      // Застосовуємо локальні правки користувача
      if (window.applyLocalEdits) applyLocalEdits(stationsData);
      initZoneClicks();
    })
    .catch(err => console.error('stations.json load failed', err));

  /* ══ DOM ══ */
  const sheet        = document.getElementById('stationSheet');
  const sheetBody    = document.getElementById('sheetBody');
  const sheetClose   = document.getElementById('sheetClose');
  const sheetOverlay = document.getElementById('sheetOverlay');
  const favSheet     = document.getElementById('favSheet');
  const favBody      = document.getElementById('favBody');
  const favClose     = document.getElementById('favClose');
  const favBtn       = document.getElementById('favListBtn');

  /* ══ FAVOURITES ══ */
  const FAV_KEY   = 'metro_favs';
  const getFavs   = () => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } };
  const saveFavs  = arr => localStorage.setItem(FAV_KEY, JSON.stringify(arr));
  const isFav     = slug => getFavs().includes(slug);
  const toggleFav = slug => {
    let favs = getFavs();
    favs = favs.includes(slug) ? favs.filter(s => s !== slug) : [...favs, slug];
    saveFavs(favs); return favs.includes(slug);
  };


  const NAME_TO_SLUG = {
    'деміївська': 'B.Demiivska',
    'героїв дніпра': 'B.Heroiv_Dnipra',
    'голосіївська': 'B.Holosiivska',
    'іподром': 'B.Ipodrom',
    'контрактова площа': 'B.Kontraktova_ploshcha',
    'либідська': 'B.Lybidska',
    'майдан незалежності': 'B.Maidan_Nezalezhnosti',
    'мінська': 'B.Minska',
    'оболонь': 'B.Obolon',
    'олімпійська': 'B.Olimpiiska',
    'палац „україна“': 'B.Palats_Ukraina',
    'площа українських героїв': 'B.Ploshcha_Ukrainskikh_heroiv',
    'почайна': 'B.Pochaina',
    'поштова площа': 'B.Poshtova_ploshcha',
    'тараса шевченко': 'B.Tarasa_Shevchenko',
    'теремки': 'B.Teremky',
    'васильківська': 'B.Vasylkivska',
    'виставковий центр': 'B.Vystavkovyi_tsentr',
    'бориспільська': 'G.Boryspilska',
    'червоний хутір': 'G.Chervonyi_khutir',
    'дорогожичі': 'G.Dorohozhychi',
    'харківська': 'G.Kharkivska',
    'кловська': 'G.Klovska',
    'лукʼянівська': 'G.Lukianivska',
    'осокорки': 'G.Osokorky',
    'палац спорту': 'G.Palats_sportu',
    'печерська': 'G.Pecherska',
    'позняки': 'G.Pozniaky',
    'славутич': 'G.Slavutych',
    'сирець': 'G.Syrets',
    'видубичі': 'G.Vydubychi',
    'вирлиця': 'G.Vyrlytsia',
    'золоті ворота': 'G.Zoloti_vorota',
    'звіринецька': 'G.Zvirynetska',
    'академмістечко': 'R.Akademmistechko',
    'арсенальна': 'R.Arsenalna',
    'берестейська': 'R.Beresteiska',
    'чернігівська': 'R.Chernihivska',
    'дарниця': 'R.Darnytsia',
    'дніпро': 'R.Dnipro',
    'гідропарк': 'R.Hidropark',
    'хрещатик': 'R.Khreshchatyk',
    'лісова': 'R.Lisova',
    'лівобережна': 'R.Livoberezhna',
    'нивки': 'R.Nyvky',
    'політехнічний інститут': 'R.Politekhnychnyi_instytut',
    'шулявська': 'R.Shuliavska',
    'святошин': 'R.Sviatoshyn',
    'театральна': 'R.Teatralna',
    'університет': 'R.Universytet',
    'вокзальна': 'R.Vokzalna',
    'житомирська': 'R.Zhytomyrska'
  };

  function slugByName(raw) {
    // нормалізуємо: прибираємо emoji, NBSP, службові слова, відмінки
    const normalized = raw
      .replace(/[\u00a0\u202f\u2009]/g, ' ')
      .replace(/[🟥🟦🟩]/g, '')
      .replace(/пересадка на\s*/i, '')
      .replace(/короткий перехід на\s*/i, '')
      .replace(/довгий перехід на\s*/i, '')
      .replace(/перехід на\s*/i, '')
      .replace(/попередня\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      // знахідний → називний для поширених форм
      .replace(/театральну/, 'театральна')
      .replace(/площу українських героїв/, 'площа українських героїв')
      .replace(/майдан незалежності/, 'майдан незалежності')
      .replace(/палац спорту/, 'палац спорту')
      .replace(/золоті ворота/, 'золоті ворота')
      .replace(/хрещатик/, 'хрещатик');
    return NAME_TO_SLUG[normalized] || null;
  }

/* ══ OPEN STATION ══ */
  function openStation(slug) {
    if (typeof window.hasUnsavedFeedback === 'function' && window.hasUnsavedFeedback()) {
      window.showCustomConfirm('Зберегти зміни та застосувати їх локально?', () => {
        if (typeof window.triggerFeedbackSubmit === 'function') window.triggerFeedbackSubmit(true);
        window.fbUnsaved = false;
        actualOpenStation(); 
      }, () => {
        window.fbUnsaved = false;
        actualOpenStation();
      });
      return; 
    }

    function actualOpenStation() {
      if (!stationsData?.[slug]) return;
      const s     = stationsData[slug];
      const color = LINE_COLOR[s.line] || '#888';
      const fav   = isFav(slug);

      sheetBody.innerHTML = `
        <div class="sheet-header">
          <span class="sheet-title">${s.name}</span>
        </div>
        ${renderDirections(s, color)}
      `;

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

      const favBtn = sheet.querySelector('.fav-btn-bar');
      if (favBtn) {
        const newBtn = favBtn.cloneNode(true);
        newBtn.innerHTML = heartSvg(fav, slug, color);
        newBtn.classList.toggle('fav-active', fav);
        favBtn.parentNode.replaceChild(newBtn, favBtn);
        newBtn.addEventListener('click', () => {
          const nowFav = toggleFav(slug);
          newBtn.innerHTML = heartSvg(nowFav, slug, color);
          newBtn.classList.toggle('fav-active', nowFav);
        });
      }

      document.querySelectorAll('.station-sheet').forEach(el => {
        if (el.id !== 'stationSheet') el.classList.remove('sheet-open');
      });

      if (!sheet.classList.contains('sheet-open')) {
        sheet.classList.add('sheet-open');
        sheetOverlay.classList.add('overlay-visible');
      }
    }
    actualOpenStation(); // Запускаємо, якщо немає незбережених змін
  }

  // 1. Універсальна функція закриття для ВСІХ відкритих вікон
  function closeAllSheets(force = false) {
    if (!force && typeof window.hasUnsavedFeedback === 'function' && window.hasUnsavedFeedback()) {
      window.showCustomConfirm('Зберегти зміни та застосувати їх локально?', () => {
        if (typeof window.triggerFeedbackSubmit === 'function') window.triggerFeedbackSubmit(true);
        window.fbUnsaved = false;
        closeAllSheets(true); 
      }, () => {
        window.fbUnsaved = false;
        closeAllSheets(true); 
      });
      return false;
    }
    document.querySelectorAll('.station-sheet').forEach(el => {
      el.classList.remove('sheet-open');
      el.style.maxHeight = ''; 
    });
    sheetOverlay.classList.remove('overlay-visible');
    return true;
  }
  window.closeAllSheets = closeAllSheets;
  // Обробка кліку на олівець (Попап скасування)
  sheetBody.addEventListener('click', e => {
    const pencil = e.target.closest('.pos-edited-mark');
    if (pencil) {
      e.stopPropagation();
      document.querySelectorAll('.edit-popup').forEach(el => el.remove()); // ховаємо старі

      const slug = pencil.dataset.slug;
      const idx = pencil.dataset.idx;

      const popup = document.createElement('div');
      popup.className = 'edit-popup';
popup.innerHTML = `
        <div class="edit-popup-text">Значення змінено користувачем</div>
        <div class="edit-popup-btns">
          <button class="edit-popup-btn btn-ok" aria-label="ОК">✓</button>
          <button class="edit-popup-btn btn-reset" aria-label="Скасувати">✕</button>
        </div>
      `;

      pencil.closest('.position-row').appendChild(popup);

      // Кнопка СКАСУВАТИ
      popup.querySelector('.btn-reset').addEventListener('click', (ev) => {
        ev.stopPropagation();
        try {
          const edits = JSON.parse(localStorage.getItem('metro_local_edits') || '{}');
          if (edits[slug] && edits[slug][idx]) {
            delete edits[slug][idx];
            if (Object.keys(edits[slug]).length === 0) delete edits[slug];
            localStorage.setItem('metro_local_edits', JSON.stringify(edits));
          }
          // Миттєве оновлення картки
          fetch('stations.json').then(r => r.json()).then(d => {
            Object.keys(stationsData).forEach(k => delete stationsData[k]);
            d.stations.forEach(s => { stationsData[s.slug] = s; });
            if (window.applyLocalEdits) window.applyLocalEdits(stationsData);
            openStation(slug);
          });
        } catch(err) {}
      });

      // Кнопка ОК
      popup.querySelector('.btn-ok').addEventListener('click', (ev) => {
        ev.stopPropagation();
        popup.remove();
      });

      // Авто-закриття, якщо клікнути деінде
      setTimeout(() => {
        document.addEventListener('click', function closePopup(ev) {
          if (!popup.contains(ev.target)) {
            popup.remove();
            document.removeEventListener('click', closePopup);
          }
        }, {once: true});
      }, 0);
    }
  });

  // 2. Хрестик закриває все
  sheetClose.addEventListener('click', closeAllSheets);

  // 3. Клік по фону: перевіряємо чи є зона карти під курсором
  sheetOverlay.addEventListener('click', (e) => {
    if (e.target !== sheetOverlay) return;
    const dropMenu = document.getElementById('dropMenu');
    if (dropMenu && dropMenu.classList.contains('show')) return;

    // Шукаємо зону карти під точкою кліку
    sheetOverlay.style.pointerEvents = 'none';
    const below = document.elementFromPoint(e.clientX, e.clientY);
    sheetOverlay.style.pointerEvents = '';

    if (below && below.closest('a.zone')) {
      // Клік на зону — відкрити станцію, не закривати
      const zone = below.closest('a.zone');
      const slug = zone.dataset.slug;
      if (slug) openStation(slug);
      return;
    }

    closeAllSheets();
  });  
let swipeStartY = 0;
  let isHandleSwipeMain = false;
  let swipeScrollTop = 0;
  sheet.addEventListener('touchstart', e => { 
      swipeStartY = e.touches[0].clientY;
      swipeScrollTop = sheetBody.scrollTop;
      isHandleSwipeMain = !!e.target.closest('.sheet-handle-bar') || sheet.classList.contains('sheet-scrollable');
  }, { passive: true });
  sheet.addEventListener('touchend', e => { 
      if (!isHandleSwipeMain) return;
      const dy = e.changedTouches[0].clientY - swipeStartY;
      // Для Хрещатика: свайп вниз тільки якщо вже прокручені до верху
      if (sheet.classList.contains('sheet-scrollable')) {
        if (dy > 60 && swipeScrollTop <= 0) closeAllSheets();
      } else {
        if (dy > 60) closeAllSheets();
      }
  });
    /* ══ FAVOURITES SHEET ══ */
  function renderFavList(favs) {
    if (!favs.length) {
      favBody.innerHTML = `<p class="fav-empty-text">Немає збережених станцій.<br>Натисніть ♡ на картці станції,<br>щоб зберегти її в обране.</p>`;
      return;
    }
    favBody.innerHTML = favs.map((slug, idx) => {
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

    // відкрити станцію по кліку
    favBody.querySelectorAll('.fav-open-btn').forEach(btn => {
      btn.addEventListener('click', () => openStation(btn.dataset.slug));
    });

    // Touch + mouse drag-and-drop
    let dragSrc = null, dragClone = null, startY = 0, currentY = 0;

    function getDragItems() { return [...favBody.querySelectorAll('.fav-item')]; }

    function saveOrder() {
      const newOrder = getDragItems().map(i => i.dataset.slug);
      saveFavs(newOrder);
    }

    function getItemAtY(y) {
      return getDragItems().find(item => {
        const r = item.getBoundingClientRect();
        return y >= r.top && y <= r.bottom;
      });
    }

    favBody.querySelectorAll('.fav-drag-handle').forEach(handle => {
      const item = handle.closest('.fav-item');

      // ── Touch ──
      handle.addEventListener('touchstart', e => {
        e.preventDefault();
        dragSrc = item;
        startY = e.touches[0].clientY;
        dragSrc.classList.add('fav-dragging');
      }, { passive: false });

      handle.addEventListener('touchmove', e => {
        if (!dragSrc) return;
        e.preventDefault();
        currentY = e.touches[0].clientY;
        const target = getItemAtY(currentY);
        if (target && target !== dragSrc) {
          getDragItems().forEach(i => i.classList.remove('fav-over'));
          target.classList.add('fav-over');
          const items = getDragItems();
          const si = items.indexOf(dragSrc);
          const ti = items.indexOf(target);
          if (si < ti) target.after(dragSrc);
          else target.before(dragSrc);
        }
      }, { passive: false });

      handle.addEventListener('touchend', () => {
        if (!dragSrc) return;
        dragSrc.classList.remove('fav-dragging');
        getDragItems().forEach(i => i.classList.remove('fav-over'));
        saveOrder();
        dragSrc = null;
      });

      // ── Mouse ──
      handle.addEventListener('mousedown', e => {
        dragSrc = item;
        dragSrc.classList.add('fav-dragging');
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });

    function onMouseMove(e) {
      if (!dragSrc) return;
      const target = getItemAtY(e.clientY);
      if (target && target !== dragSrc) {
        getDragItems().forEach(i => i.classList.remove('fav-over'));
        target.classList.add('fav-over');
        const items = getDragItems();
        if (items.indexOf(dragSrc) < items.indexOf(target)) target.after(dragSrc);
        else target.before(dragSrc);
      }
    }

    function onMouseUp() {
      if (!dragSrc) return;
      dragSrc.classList.remove('fav-dragging');
      getDragItems().forEach(i => i.classList.remove('fav-over'));
      saveOrder();
      dragSrc = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
  }

  function openFavSheet() {
    const favs = getFavs();
    if (!stationsData) {
      favBody.innerHTML = `<p class="fav-empty-text">Дані ще завантажуються…</p>`;
    } else if (favs.length === 0) {
      favBody.innerHTML = `<p class="fav-empty-text">Немає збережених станцій.<br>Натисніть ♡ на картці станції,<br>щоб зберегти її в обране.</p>`;
    } else {
      renderFavList(favs);
    }
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
  favSheet.addEventListener('touchstart', e => { 
      swipeStartY = e.touches[0].clientY; 
      isHandleSwipeFav = !!e.target.closest('.sheet-handle-bar');
  }, { passive: true });
  favSheet.addEventListener('touchend', e => { 
      if (isHandleSwipeFav && (e.changedTouches[0].clientY - swipeStartY > 60)) closeFavSheet(); 
  });
  /* ══ ZONE CLICKS ══ */
  function initZoneClicks() {
    document.querySelectorAll('a.zone').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const slug = link.dataset.slug;
        if (slug) openStation(slug);
      });
    });
  }

  /* ══ THEME ══ */
  const THEME_KEY = 'metro_theme';
  const root      = document.documentElement;

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    const icon  = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    if (icon)  icon.textContent  = theme === 'dark' ? '☀️' : '🌙';
    if (label) label.textContent = theme === 'dark' ? 'Світла тема' : 'Темна тема';
    localStorage.setItem(THEME_KEY, theme);
  }

  const savedTheme = localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(savedTheme);

/* ══ DROPDOWN MENU ══ */
  (function initDropdownMenu() {
    const menuBtn  = document.getElementById('menuBtn');
    const dropMenu = document.getElementById('dropMenu');

    if (!menuBtn || !dropMenu) return;

    // 1. Клік по кнопці меню: ТІЛЬКИ відкриває/ховає меню. Жодного вікна не чіпає.
    menuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropMenu.classList.toggle('show');
      dropMenu.hidden = !dropMenu.classList.contains('show');
    });

    // 2. Клік поза меню — ховаємо меню (не чіпаємо жодних вікон)
    document.addEventListener('click', (e) => {
      if (!dropMenu.contains(e.target) && !menuBtn.contains(e.target)) {
        dropMenu.classList.remove('show');
        dropMenu.hidden = true;
      }
    });

    // 3. Зміна теми: нічого не закриваємо
    document.getElementById('themeToggleItem')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      // Меню залишається відкритим після зміни теми
    });

    // 4. Запропонувати зміни: закриває Про, відкриває Зміни. Станція залишається.
    document.getElementById('feedbackItem')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropMenu.classList.remove('show');
      dropMenu.hidden = true;
      document.getElementById('aboutSheet')?.classList.remove('sheet-open');
      if (typeof openFeedbackSheet === 'function') openFeedbackSheet(stationsData);
    });

// 5. Про додаток: закриває Зміни, відкриває Про. Станція залишається.
    document.getElementById('aboutItem')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropMenu.classList.remove('show');
      dropMenu.hidden = true;
      
      // ОНОВЛЕНО: Тепер використовує наше красиве кастомне вікно
      if (typeof window.hasUnsavedFeedback === 'function' && window.hasUnsavedFeedback()) {
        window.showCustomConfirm('Зберегти зміни та застосувати їх локально?', () => {
          if (typeof window.triggerFeedbackSubmit === 'function') window.triggerFeedbackSubmit(true);
          window.fbUnsaved = false;
          executeAboutTransition();
        }, () => {
          window.fbUnsaved = false;
          executeAboutTransition();
        });
        return;
      }
      
      function executeAboutTransition() {
        document.getElementById('feedbackSheet')?.classList.remove('sheet-open');
        if (typeof openAboutSheet === 'function') openAboutSheet();
      }
      executeAboutTransition(); 
    });
    })(); 

/* ══ ABOUT SHEET ══ */
function openAboutSheet() {
  let aboutSheet = document.getElementById('aboutSheet');
  if (!aboutSheet) {
    aboutSheet = document.createElement('div');
    aboutSheet.id = 'aboutSheet';
    aboutSheet.className = 'station-sheet about-station-sheet';
    aboutSheet.innerHTML = `
        <div class="sheet-handle-bar">
          <div class="sheet-handle"></div>
          <span class="sheet-sheet-title about-version-title">KyivMetroGO · версія 0.9</span>
          <button class="sheet-close-btn" id="aboutClose" aria-label="Закрити">✕</button>
        </div>
        <div class="sheet-body">
          <div class="about-content">
         <img src="icon-96x96.png" width="64" height="64" style="border-radius: 16px;">
         <p style="text-align: center; margin: 0px 0 0px;">
         <p style="text-align: center;">Додаток для заощадження часопростору у київському метро</p>
            </p>

            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px; padding: 16px; background: var(--bg-card); border: 0.5px solid var(--border); border-radius: 14px;">
              <p style="margin:0; flex-shrink: 0; width: 96px; display: flex; justify-content: center;">
                <img src="pluh.svg" style="width: 96px; height: auto; border-radius: 4px; filter: grayscale(100%);">
              </p>
              <p style="margin: 0; text-align: left; font-size: 18px; line-height: 1.4; flex: 1;">Натисніть на станцію, і отримаєте вагон та двері, які будуть якнайближче до виходу з підземки.</p>
            </div>

            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px; padding: 16px; background: var(--bg-card); border: 0.5px solid var(--border); border-radius: 14px;">
              <p style="font-size:28px; margin:0; flex-shrink: 0; width: 96px; display: flex; justify-content: center;" class="about-heart-icon-wrapper">
                <span class="heart-light-emoji">🖤</span>
                <span class="heart-dark-emoji">🤍</span>
              </p>
              <p style="margin: 0; text-align: left; font-size: 18px; line-height: 1.4; flex: 1;">Для швидкого доступу до потрібних станцій, додайте їх в обране.</p>
            </div>

            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px; padding: 16px; background: var(--bg-card); border: 0.5px solid var(--border); border-radius: 14px;">
              <p style="font-size:28px; margin:0; flex-shrink: 0; width: 96px; display: flex; justify-content: center;" class="about-pencil-icon-wrapper">
                <span class="pencil-light-emoji">✏️</span>
                <span class="pencil-dark-emoji">✏️</span>
              </p>
              <p style="margin: 0; text-align: left; font-size: 18px; line-height: 1.4; flex: 1;">Помітили неточність — повідомте. Локальні зміни відобразяться миттєво.</p>
            </div>

            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px; padding: 16px; background: var(--bg-card); border: 0.5px solid var(--border); border-radius: 14px;">
              <p style="margin:0; flex-shrink: 0; width: 96px; display: flex; justify-content: center;">
                <span class="about-info-demo" style="width: 28px; height: 28px; border-width: 2.5px; font-size: 16px;">i</span>
              </p>
              <p style="margin: 0; text-align: left; font-size: 18px; line-height: 1.4; flex: 1;">Довідкові блоки позначені відповідним знаком.</p>
            </div>

            <p class="about-footer" style="margin: 4px 0 0 !important; text-align: center; opacity: 0.4; font-size: 13px;">
              Зроблено з любовʼю до Києва
            </p>
          </div>
        </div>`;
    document.body.appendChild(aboutSheet);
    document.getElementById('aboutClose').addEventListener('click', () => {
      aboutSheet.classList.remove('sheet-open');
      const anyOpen = document.querySelectorAll('.station-sheet.sheet-open').length > 0;
      if (!anyOpen) document.getElementById('sheetOverlay').classList.remove('overlay-visible');
    });
  }
  document.getElementById('feedbackSheet')?.classList.remove('sheet-open');
  document.getElementById('stationSheet')?.classList.remove('sheet-open');
  aboutSheet.classList.add('sheet-open');
  document.getElementById('sheetOverlay').classList.add('overlay-visible');
}
/* ══ CUSTOM CONFIRM WINDOW ══ */
window.showCustomConfirm = function(message, onYes, onNo) {
  const overlay = document.createElement('div');
  overlay.className = 'global-confirm-overlay';
  overlay.innerHTML = `
    <div class="global-confirm-card">
      <div class="edit-popup-text" style="font-size:16px">${message}</div>
      <div class="edit-popup-btns">
        <button class="edit-popup-btn btn-ok" id="confirmYes">✓</button>
        <button class="edit-popup-btn btn-reset" id="confirmNo">✕</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#confirmYes').addEventListener('click', () => {
    overlay.remove();
    if (onYes) onYes();
  });

  overlay.querySelector('#confirmNo').addEventListener('click', () => {
    overlay.remove();
    if (onNo) onNo();
  });
  
  // Закриття по кліку на фон (як "Ні")
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      if (onNo) onNo();
    }
  });
};

})();
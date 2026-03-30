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
    const zoom = Math.max(0.09, Math.min(4.0, Math.round(vp.clientWidth * sf) / natW));
    inner.style.width  = Math.round(natW * zoom) + 'px';
    inner.style.height = Math.round(natH * zoom) + 'px';
    img.style.width = img.style.height = '100%';
    requestAnimationFrame(() => {
      const left = Math.round(inner.clientWidth  * centerX - vp.clientWidth  / 2);
      let   top  = Math.round(inner.clientHeight * centerY - vp.clientHeight / 2);
      top = Math.max(0, Math.min(top, inner.clientHeight - vp.clientHeight));
      vp.scrollLeft = Math.max(0, left);
      vp.scrollTop  = top;
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
  let pinchScale = 1, lastPinchDist = null;
  document.addEventListener('touchmove', e => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (lastPinchDist) {
      pinchScale = Math.min(2, Math.max(0.5, pinchScale * dist / lastPinchDist));
      inner.style.transform = `scale(${pinchScale})`;
      inner.style.transformOrigin = '0 0';
    }
    lastPinchDist = dist;
  }, { passive: false });
  document.addEventListener('touchend', () => { lastPinchDist = null; });

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
  function renderPositions(positions, color, multiRow) {
    if (!positions.length) return '';
    if (positions.length === 1) {
      const p = positions[0];
      const editedMark = p._edited ? '<span class="pos-edited-mark" title="Значення для цього виходу змінені користувачем">✏</span>' : '';
      return `<div class="position-row">
        ${pill('вагон', p.wagon, color)}
        ${pill('двері', p.doors, color)}
        ${editedMark}
      </div>`;
    }
    if (multiRow) {
      const anyEdited = positions.some(p => p._edited);
      return `<div class="position-row position-row-multi">
        ${positions.map((p, i) => `
          ${i > 0 ? '<span class="pos-multi-sep">·</span>' : ''}
          ${pill('вагон', p.wagon, color)}
          ${pill('двері', p.doors, color)}
        `).join('')}
        ${anyEdited ? '<span class="pos-edited-mark" title="Значення для цього виходу змінені користувачем">✏</span>' : ''}
      </div>`;
    }
    return positions.map(p => `
      <div class="position-row">
        ${pill('вагон', p.wagon, color)}
        ${pill('двері', p.doors, color)}
      </div>
    `).join('');
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

    // nav-links: клікабельні назви станцій
    sheetBody.querySelectorAll('.nav-label').forEach(el => {
      const target = slugByName(el.dataset.name || '');
      if (target && target !== slug) {
        el.classList.add('nav-link');
        el.addEventListener('click', e => { e.stopPropagation(); openStation(target); });
      }
    });

    if (slug === 'R.Khreshchatyk') {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      sheet.style.maxHeight = vh + 'px';
    } else {
      sheet.style.maxHeight = '';
    }

    // колір handle = колір гілки
    const handle = sheet.querySelector('.sheet-handle');
    if (handle) handle.style.background = color;

    // серце в handle-bar
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

document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
    sheet.classList.add('sheet-open');
    sheetOverlay.classList.add('overlay-visible');
  }

  function closeSheet() {
    sheet.classList.remove('sheet-open');
    sheet.style.maxHeight = '';
    sheetOverlay.classList.remove('overlay-visible');
  }
  sheetClose.addEventListener('click', closeSheet);
  sheetOverlay.addEventListener('click', closeSheet);
  let swipeStartY = 0;
  sheet.addEventListener('touchstart', e => { swipeStartY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchend',   e => { if (e.changedTouches[0].clientY - swipeStartY > 60) closeSheet(); });

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
document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
    favSheet.classList.add('sheet-open');
    sheetOverlay.classList.add('overlay-visible');  }

  function closeFavSheet() {
    favSheet.classList.remove('sheet-open');
    if (!sheet.classList.contains('sheet-open')) sheetOverlay.classList.remove('overlay-visible');
  }
  favBtn.addEventListener('click', openFavSheet);
  favClose.addEventListener('click', closeFavSheet);
  favSheet.addEventListener('touchstart', e => { swipeStartY = e.touches[0].clientY; }, { passive: true });
  favSheet.addEventListener('touchend',   e => { if (e.changedTouches[0].clientY - swipeStartY > 60) closeFavSheet(); });

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
  document.addEventListener('DOMContentLoaded', () => {
    const menuBtn  = document.getElementById('menuBtn');
    const dropMenu = document.getElementById('dropMenu');

    // Відкрити/закрити меню
    menuBtn?.addEventListener('click', e => {
      e.stopPropagation();
      dropMenu.hidden = !dropMenu.hidden;
    });
    document.addEventListener('click', () => { if (dropMenu) dropMenu.hidden = true; });
    dropMenu?.addEventListener('click', e => e.stopPropagation());

    // Перемикач теми
    document.getElementById('themeToggleItem')?.addEventListener('click', () => {
      applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      dropMenu.hidden = true;
    });

    // Запропонувати зміни
    document.getElementById('feedbackItem')?.addEventListener('click', () => {
      dropMenu.hidden = true;
      openFeedbackSheet(stationsData);
    });

    // Про додаток
    document.getElementById('aboutItem')?.addEventListener('click', () => {
      dropMenu.hidden = true;
      openAboutSheet();
    });
  });

  /* ══ ABOUT SHEET ══ */
/* ══ ABOUT SHEET ══ */
function openAboutSheet() {
  // Створюємо sheet динамічно якщо ще немає
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
            <p>Додаток для заощадження часопростору у київському метро. Натисніть на станцію, і отримаєте вагон та двері, які будуть якнайближчими до виходу з підземки.</p>
            <p style="text-align:center;margin:16px 0 4px"><img src="icon-96x96.png" width="64" height="64" style="border-radius:16px"></p>
            <p>Для швидкого доступу до потрібних станцій, додайте їх в обране.</p>
            <p style="text-align:center;font-size:22px;margin:4px 0" class="about-heart-icon-wrapper">
              <span class="heart-light-emoji">🖤</span>
              <span class="heart-dark-emoji">🤍</span>
            </p>
            <p>Помітили неточність — повідомте. Локальні зміни після цього відобразяться миттєво.</p>
            <p style="text-align:center;font-size:22px;margin:4px 0">✏️</p>
            <p>Наразі це PWA-додаток: він відкривається в браузері і не потребує встановлення.</p>
            <p>Задля швидкого доступу додайте іконку на головний екран телефону.</p>
            <p class="about-footer"> Зроблено 🪖 з любовʼю до Києва</p>
          </div>
        </div>`;
    document.body.appendChild(aboutSheet);
    document.getElementById('aboutClose').addEventListener('click', () => {
      aboutSheet.classList.remove('sheet-open');
      document.getElementById('sheetOverlay').classList.remove('overlay-visible');
    });
  }
  aboutSheet.classList.add('sheet-open');
  document.getElementById('sheetOverlay').classList.add('overlay-visible');
}
})();

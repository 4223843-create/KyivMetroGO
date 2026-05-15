// --- file: src/sheets/renderStation.js ---
import { slugByName }      from '../data/stations.js';
import { state }           from '../core/state.js';
import { pill }            from '../ui/components.js';

// ══ ФОРМАТУВАННЯ ══
function formatDirLabel(raw) {
  if (!raw) return raw;
  const match = raw.trim().match(/^([^\s&]+)(?:\s+|&nbsp;)(.*)$/i);
  if (!match) return raw;
  return `${match[1].toLowerCase()} <span class="dir-name-caps">${match[2]}</span>`;
}

function formatLabel(raw) {
  const text      = raw.trim();
  const cleanText = text.replace(/&nbsp;/g, ' ').toLowerCase();
  const isTransfer = cleanText.includes('пересадка') || cleanText.includes('перехід');
  if (isTransfer) {
    const targetSlug = slugByName(cleanText);
    if (targetSlug && state.stationsData?.[targetSlug]) {
      const color = MetroApp.LINE_COLOR[state.stationsData[targetSlug].line];
      return `<span class="transfer-label"><span class="transfer-line" style="background:${color}"></span><span class="transfer-text">${text}</span><span class="transfer-line" style="background:${color}"></span></span>`;
    }
  }
  return `<span class="exit-label-text">${text}</span>`;
}

// ══ РЕНДЕР ПОЗИЦІЙ ══
// Зміни: data-wagon + data-doors на кожному .fav-tap-target
// Це єдине джерело правди для gestureHandler — більше не читаємо .pos-pill-num

function generatePills(wStr, dStr, color) {
  const wArr = String(wStr).split(',').map(s => s.trim());
  const dArr = String(dStr).split(',').map(s => s.trim());
  const blocks = [];
  const count  = Math.max(wArr.length, dArr.length);
  for (let i = 0; i < count; i++) {
    blocks.push(`${pill('вагон', wArr[i] || wArr[0], color)}\n${pill('двері', dArr[i] || dArr[0], color)}`);
  }
  return blocks.join('<span class="pos-multi-sep" style="margin: 0 6px;">·</span>');
}

// Єдина точка, де .fav-tap-target отримує data-wagon + data-doors
function favTargetHtml(wStr, dStr, color) {
  // Зберігаємо оригінальні рядки (можуть бути "1, 2" або "1-3")
  // щоб toggleExitFav отримав рівно те, що є у stationsData
  return `<div class="fav-tap-target"
               data-wagon="${wStr}"
               data-doors="${dStr}"
               style="display:flex;gap:6px;align-items:center;">
    ${generatePills(wStr, dStr, color)}
  </div>`;
}

function renderPositions(positions, color, multiRow) {
  positions = positions.filter(p => !p.closed);
  if (!positions.length) return '';

  if (positions.length === 1) {
    const p          = positions[0];
    const isMulti    = String(p.wagon).includes(',');
    const editedMark = p._edited
      ? `<span class="pos-edited-mark"
              data-slug="${p._slug}"
              data-idx="${p._posIdx}">${MetroApp.Icons.pencil}</span>`
      : '';
    return `<div class="position-row ${isMulti ? 'position-row-multi' : ''}">
      ${editedMark}
      ${favTargetHtml(p.wagon, p.doors, color)}
    </div>`;
  }

  if (multiRow) {
    // Один .position-row, кілька .fav-tap-target — кожен зі своїми data-*
    const editedPos  = positions.find(p => p._edited);
    const editedMark = editedPos
      ? `<span class="pos-edited-mark"
                data-slug="${editedPos._slug}"
                data-idx="${editedPos._posIdx}">${MetroApp.Icons.pencil}</span>`
      : '';
    const spacer = editedPos ? `<span class="pos-edited-spacer"></span>` : '';
    const targets = positions.map((p, i) =>
      `${i > 0 ? '<span class="pos-multi-sep">·</span>' : ''}${favTargetHtml(p.wagon, p.doors, color)}`
    ).join('');
    return `<div class="position-row position-row-multi">${editedMark}${targets}${spacer}</div>`;
  }

  return positions.map(p => {
    const isMulti = String(p.wagon).includes(',');
    return `<div class="position-row ${isMulti ? 'position-row-multi' : ''}">
      ${favTargetHtml(p.wagon, p.doors, color)}
    </div>`;
  }).join('');
}

// ══ РЕНДЕР НАПРЯМКІВ ══
function renderDirections(s, color) {
  const isKhreshchatyk = s.slug === 'R.Khreshchatyk';

  const renderExitLabel = (exit) => {
    if (!exit.label) return '';
    
    const editedMark = exit._labelEdited ? `<span class="pos-edited-mark label-pencil" data-slug="${exit._slug}">${MetroApp.Icons.pencil}</span>` : '';
    
    return `<div class="exit-label nav-label" data-name="${exit.label}">
              <div style="position: relative; display: inline-flex; align-items: center; justify-content: center;">
                ${formatLabel(exit.label)}
                ${editedMark}
              </div>
            </div>`;
  };

  if (isKhreshchatyk) {
    const mainDirs = s.directions.filter(d => d.from !== '__long_transfer__');
    const longDir  = s.directions.find(d => d.from === '__long_transfer__');
    
    const mainHtml = mainDirs.map(dir => `
      <div class="direction-block">
        <div class="direction-label nav-label" data-name="${dir.from}">${formatDirLabel(dir.from)}</div>
        ${dir.exits.map(exit => `${renderExitLabel(exit)}${renderPositions(exit.positions, color, true)}`).join('')}
      </div>`).join('');
      
    let longHtml = '';
    if (longDir) {
      const rows = longDir.exits.map(exit => {
        const posRows = exit.positions.map(p =>
          `<div class="long-transfer-pos-row">${pill('вагон', p.wagon, color)}${pill('двері', p.doors, color)}</div>`
        ).join('');
        const editedMark = exit._labelEdited ? `<span class="pos-edited-mark" data-slug="${exit._slug}">${MetroApp.Icons.pencil}</span>` : '';
        return `<div class="long-transfer-exit"><div class="long-transfer-exit-label" style="position: relative;">${editedMark}${exit.label}</div>${posRows}</div>`;
      }).join('');
      longHtml = `<div class="long-transfer-block"><div class="long-transfer-title"><span class="transfer-label"><span class="transfer-line" style="background:${MetroApp.LINE_COLOR['blue']}"></span><span class="transfer-text">довгий&nbsp;перехід на&nbsp;Майдан&nbsp;Незалежності</span><span class="transfer-line" style="background:${MetroApp.LINE_COLOR['blue']}"></span></span></div>${rows}</div>`;
    }
    return mainHtml + longHtml;
  }

  return s.directions.map(dir => {
    if (dir.from === 'вихід праворуч') {
      return `<div class="direction-block direction-exit-right"><div class="direction-label">вихід праворуч</div></div>`;
    }
    if (dir.from.trim().toLowerCase() === 'кінцева') {
      return `
        <div class="direction-block direction-exit-right" style="margin-bottom: 10px;">
          <div class="direction-label" style="margin: 0;">кінцева</div>
        </div>
        <div class="direction-block">
          ${dir.exits.map(exit => `${renderExitLabel(exit)}${renderPositions(exit.positions, color, false)}`).join('')}
        </div>`;
    }
    return `<div class="direction-block">
      <div class="direction-label nav-label" data-name="${dir.from}">${formatDirLabel(dir.from)}</div>
      ${dir.exits.map(exit => `${renderExitLabel(exit)}${renderPositions(exit.positions, color, false)}`).join('')}
    </div>`;
  }).join('');
}

function applyFavPillStyles(container, lineColor, isFaved) {
  container.querySelectorAll('.pos-pill').forEach(p => {
    p.style.background = isFaved ? lineColor : '';
    const num = p.querySelector('.pos-pill-num');
    const lbl = p.querySelector('.pos-pill-label');
    if (num) num.style.color = isFaved ? 'var(--bg)' : lineColor;
    if (lbl) lbl.style.color = isFaved ? 'var(--bg)' : '';
  });
}

export { renderDirections, applyFavPillStyles };
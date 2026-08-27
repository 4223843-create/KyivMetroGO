import { slugByName }          from '../data/stations.js';
import { state }               from '../core/state.js';
import { pill }                from '../ui/components.js';
import { LINE_COLOR }          from '../core/constants.js';
import { Icons }               from '../ui/icons.js';
import { isHideNoLiftEnabled } from '../features/settings.js';

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
      const color = LINE_COLOR[state.stationsData[targetSlug].line];
      return `<span class="transfer-label">` +
        `<span class="transfer-line" style="background:${color}"></span>` +
        `<span class="transfer-text">${text}</span>` +
        `<span class="transfer-line" style="background:${color}"></span>` +
        `</span>`;
    }
  }
  return `<span class="exit-label-text">${text}</span>`;
}

// ══ РЕНДЕР ПОЗИЦІЙ ══

function generatePills(wStr, dStr, color) {
  const wArr   = String(wStr).split(',').map(s => s.trim());
  const dArr   = String(dStr).split(',').map(s => s.trim());
  const blocks = [];
  const count  = Math.max(wArr.length, dArr.length);
  for (let i = 0; i < count; i++) {
    blocks.push(
      `${pill('вагон', wArr[i] || wArr[0], color)}\n${pill('двері', dArr[i] || dArr[0], color)}`
    );
  }
  return blocks.join('<span class="pos-multi-sep" style="margin: 0 6px;">·</span>');
}

function favTargetHtml(wStr, dStr, color) {
  return `<div class="fav-tap-target"
               data-wagon="${wStr}"
               data-doors="${dStr}"
               style="display:flex;gap:6px;align-items:center;">
    ${generatePills(wStr, dStr, color)}
  </div>`;
}

function groupPositions(positions) {
  const grouped = [];
  const map = new Map();

  positions.forEach(p => {
    if (p.closed) return;
    const key = `${String(p.wagon).trim()}:${String(p.doors).trim()}`;
    if (!map.has(key)) {
      const item = {
        ...p,
        isEscalator: !!p.isEscalator,
        isLift: !!p.isLift,
      };
      map.set(key, item);
      grouped.push(item);
    } else {
      const existing = map.get(key);
      if (p.isEscalator) existing.isEscalator = true;
      if (p.isLift) existing.isLift = true;
      if (p._edited) {
        existing._edited = true;
        existing._slug = p._slug;
        existing._posIdx = p._posIdx;
      }
    }
  });

  return grouped;
}

function renderIcons(p, exit) {
  let iconsHtml = '';

  if (p.isEscalator) {
    iconsHtml += `<span class="pos-lift-mark pos-escalator-mark" aria-label="Ескалатор">${Icons.escalator}</span>`;
  }

  if (p.isLift) {
    const label = (exit?.label || p.exit || '').toLowerCase();
    const isHoist = label.includes('підйомник');
    const icon = isHoist ? Icons.wheelchair : Icons.elevator;
    const ariaLabel = isHoist ? 'Підйомник' : 'Ліфт';
    const markClass = isHoist ? 'pos-hoist-mark' : 'pos-elevator-mark';
    iconsHtml += `<span class="pos-lift-mark ${markClass}" aria-label="${ariaLabel}">${icon}</span>`;
  }

  if (!iconsHtml) return '';
  return `<div class="pos-lift-marks-wrap">${iconsHtml}</div>`;
}

function renderPositions(positions, color, multiRow, exit = null) {
  const grouped = groupPositions(positions);
  if (!grouped.length) return '';

  if (grouped.length === 1) {
    const p          = grouped[0];
    const isMulti    = String(p.wagon).includes(',');
    const edited     = p._edited
      ? `<span class="pos-edited-mark" data-slug="${p._slug}" data-idx="${p._posIdx}">${Icons.pencil}</span>`
      : '';
    const icons      = renderIcons(p, exit);
    const hasSpecial = p.isLift || p.isEscalator;

    return `<div class="position-row ${isMulti ? 'position-row-multi' : ''} ${hasSpecial ? 'position-row-lift' : ''}">
      ${edited}${favTargetHtml(p.wagon, p.doors, color)}${icons}
    </div>`;
  }

  if (multiRow) {
    const editedPos = grouped.find(p => p._edited);
    const edited    = editedPos
      ? `<span class="pos-edited-mark" data-slug="${editedPos._slug}" data-idx="${editedPos._posIdx}">${Icons.pencil}</span>`
      : '';
    const spacer  = editedPos ? `<span class="pos-edited-spacer"></span>` : '';
    const targets = grouped.map((p, i) => {
      const icons = renderIcons(p, exit);
      return `${i > 0 ? '<span class="pos-multi-sep">·</span>' : ''}${favTargetHtml(p.wagon, p.doors, color)}${icons}`;
    }).join('');

    return `<div class="position-row position-row-multi">${edited}${targets}${spacer}</div>`;
  }

  return grouped.map(p => {
    const isMulti    = String(p.wagon).includes(',');
    const icons      = renderIcons(p, exit);
    const hasSpecial = p.isLift || p.isEscalator;

    return `<div class="position-row ${isMulti ? 'position-row-multi' : ''} ${hasSpecial ? 'position-row-lift' : ''}">
      ${favTargetHtml(p.wagon, p.doors, color)}${icons}
    </div>`;
  }).join('');
}






function renderExitLabel(exit) {
  if (!exit.label) return '';
  const edited = exit._labelEdited
    ? `<span class="pos-edited-mark label-pencil" data-slug="${exit._slug}">${Icons.pencil}</span>`
    : '';
  return `<div class="exit-label nav-label" data-name="${exit.label}">
    <div style="position:relative;display:inline-flex;align-items:center;justify-content:center;">
      ${formatLabel(exit.label)}${edited}
    </div>
  </div>`;
}

// ══ РЕНДЕР НАПРЯМКІВ ══

export function renderDirections(s, color) {
  const isKhreshchatyk = s.slug === 'R.Khreshchatyk';

  // Перевірка налаштування та наявності хоча б одного ліфта на станції
  const hideNoLift = isHideNoLiftEnabled();
  const hasLift = s.directions?.some(dir =>
    dir.exits?.some(exit =>
      exit.positions?.some(p => p.isLift)
    )
  );
  const filterLiftOnly = hideNoLift && hasLift;

  if (isKhreshchatyk) {
    const mainDirs = s.directions.filter(d => d.from !== '__long_transfer__');
    const longDir  = s.directions.find(d => d.from === '__long_transfer__');

    const mainHtml = mainDirs.map(dir => {
      const exitsHtml = dir.exits.map(exit => {
        const visiblePos = exit.positions?.filter(p => !p.closed && (!filterLiftOnly || p.isLift || p.isEscalator)) || [];
        if (!visiblePos.length) return '';
        return `${renderExitLabel(exit)}${renderPositions(visiblePos, color, true, exit)}`;
      }).join('');

      if (!exitsHtml) return '';
      return `<div class="direction-block">
        <div class="direction-label nav-label" data-name="${dir.from}">${formatDirLabel(dir.from)}</div>
        ${exitsHtml}
      </div>`;
    }).join('');

    let longHtml = '';
    if (longDir) {
      const rows = longDir.exits.map(exit => {
        const visiblePos = exit.positions?.filter(p => !p.closed && (!filterLiftOnly || p.isLift)) || [];
        if (!visiblePos.length) return '';
        const posRows = visiblePos.map(p =>
          `<div class="long-transfer-pos-row">${pill('вагон', p.wagon, color)}${pill('двері', p.doors, color)}</div>`
        ).join('');
        const edited = exit._labelEdited
          ? `<span class="pos-edited-mark" data-slug="${exit._slug}">${Icons.pencil}</span>`
          : '';
        return `<div class="long-transfer-exit">
          <div class="long-transfer-exit-label" style="position:relative;">${edited}${exit.label}</div>
          ${posRows}
        </div>`;
      }).filter(Boolean).join('');

      if (rows) {
        longHtml = `<div class="long-transfer-block">
          <div class="long-transfer-title">
            <span class="transfer-label">
              <span class="transfer-line" style="background:${LINE_COLOR['blue']}"></span>
              <span class="transfer-text">довгий&nbsp;перехід на&nbsp;Майдан&nbsp;Незалежності</span>
              <span class="transfer-line" style="background:${LINE_COLOR['blue']}"></span>
            </span>
          </div>
          ${rows}
        </div>`;
      }
    }

    return mainHtml + longHtml;
  }

  return s.directions.map(dir => {
    const fromLower = dir.from.trim().toLowerCase();

    const exitsHtml = dir.exits?.map(exit => {
      const visiblePos = exit.positions?.filter(p => !p.closed && (!filterLiftOnly || p.isLift || p.isEscalator)) || [];
      if (!visiblePos.length) return '';
      return `${renderExitLabel(exit)}${renderPositions(visiblePos, color, false, exit)}`;
    }).join('') || '';

    if (fromLower === 'вихід праворуч' || fromLower === 'кінцева') {
      const headerBlock = `<div class="direction-block direction-exit-right" style="${dir.exits?.length ? 'margin-bottom:10px;' : ''}">
        <div class="direction-label" style="margin:0;">${fromLower}</div>
      </div>`;

      if (!dir.exits?.length || !exitsHtml) {
        return headerBlock;
      }

      const positionsBlock = `<div class="direction-block">${exitsHtml}</div>`;
      return headerBlock + positionsBlock;
    }

    if (!exitsHtml) return '';

    return `<div class="direction-block">
      <div class="direction-label nav-label" data-name="${dir.from}">${formatDirLabel(dir.from)}</div>
      ${exitsHtml}
    </div>`;
  }).join('');
}

export function applyFavPillStyles(container, lineColor, isFaved) {
  container.querySelectorAll('.pos-pill').forEach(p => {
    p.style.background = isFaved ? lineColor : '';
    const num = p.querySelector('.pos-pill-num');
    const lbl = p.querySelector('.pos-pill-label');
    if (num) num.style.color = isFaved ? 'var(--bg)' : lineColor;
    if (lbl) lbl.style.color = isFaved ? 'var(--bg)' : '';
  });
}
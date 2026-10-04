// ══ БЕЗПЕЧНА ВСТАВКА ТЕКСТУ В HTML ══
// Екрани будуються рядками для innerHTML, тож текст із даних, резервної копії
// чи введений користувачем має проходити через ці функції. Інакше лапка в
// підписі ламає розмітку, а чужа резервна копія могла б виконати код.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Текст → HTML без жодної розмітки (для вмісту й значень атрибутів). */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);
}

/**
 * Як escapeHtml, але лишає те, що вживається в stations.json: перенос рядка
 * <br> і HTML-сутності на кшталт &nbsp;.
 */
export function richText(value) {
  return escapeHtml(value)
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&amp;(#\d+|#x[0-9a-f]+|[a-z]+);/gi, '&$1;');
}

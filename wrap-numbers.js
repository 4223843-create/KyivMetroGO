document.addEventListener('DOMContentLoaded', () => {
  const root = document.body;

  const IGNORED_TAGS = new Set([
    'SCRIPT', 'STYLE', 'A', 'TEXTAREA', 'INPUT',
    'SELECT', 'OPTION', 'NOSCRIPT'
  ]);

  const wagonRe = /(\d+(?:-\d+)?)\s*(вагон[^\s,]*)/gi;
  const doorRe  = /(\d+(?:-\d+)?)\s*(двер[^\s,]*)/gi;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (IGNORED_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest('.wagon-number, .door-number')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach(node => {
    let text = node.nodeValue;
    let changed = false;

    text = text.replace(wagonRe, (m, numRange, word) => {
      changed = true;
      return `<span class="wagon-number">${numRange}</span> ${word}`;
    });

    text = text.replace(doorRe, (m, numRange, word) => {
      changed = true;
      return `<span class="door-number">${numRange}</span> ${word}`;
    });

    if (changed) {
      const wrapper = document.createElement('span');
      wrapper.innerHTML = text;
      node.parentNode.replaceChild(wrapper, node);
    }
  });
});
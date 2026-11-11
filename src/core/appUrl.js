// ══ АДРЕСА ФАЙЛІВ ЗАСТОСУНКУ ══
// Сайт може жити в підпапці (GitHub Pages: /KyivMetroGO/), а сторінку відкривають
// і як /KyivMetroGO, і як /KyivMetroGO/index.html. Файли поруч з index.html
// (stations.json, addresses.json…) шукаємо відносно цієї папки.

/** Папка, з якої відкрито застосунок (завжди з кінцевим «/»). */
export function appBaseHref() {
  const { origin, pathname } = window.location;
  const normalizedPath = pathname.endsWith('/')
    ? pathname
    : pathname.split('/').pop()?.includes('.')
      ? pathname.slice(0, pathname.lastIndexOf('/') + 1)
      : `${pathname}/`;
  return new URL(normalizedPath, origin);
}

/** Повна адреса файлу поруч з index.html. */
export const appFileUrl = name => new URL(name, appBaseHref());

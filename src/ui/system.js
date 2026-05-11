export async function configureEdgeToEdge() {
  if (!window.Capacitor?.Plugins?.StatusBar) return;

  const { StatusBar, Style } = window.Capacitor.Plugins;
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
  } catch (e) {
    console.warn('[KyivMetroGO] StatusBar plugin error:', e);
  }
}

export function pushSheetHistory() {
  if (!history.state?.isSheetOpen) {
    history.pushState({ isSheetOpen: true }, '');
  }
}
(function(){
  const vp = document.getElementById('mapViewport');
  const inner = document.getElementById('mapInner');
  const img = document.getElementById('mapImg');

  // Налаштування
  const PHONE_BREAKPOINT = 700;
  const mobileScaleFactor = 3;
  const desktopScaleFactor = 3;
  let centerX = 0.50;
  let centerY = 0.36;

  function computeParams(){
    const w = Math.min(window.innerWidth, document.documentElement.clientWidth);
    return { targetScaleFactor: (w <= PHONE_BREAKPOINT)? mobileScaleFactor : desktopScaleFactor,
              centerX, centerY };
  }

  function applyZoomAndCenter(){
    window.applyZoomAndCenter = applyZoomAndCenter;
    const natW = img.naturalWidth |

| img.width;
    const natH = img.naturalHeight |

| img.height;
    if (!natW ||!natH) return;

    const { targetScaleFactor, centerX, centerY } = computeParams();
    const desiredDisplayWidth = Math.round(vp.clientWidth * targetScaleFactor);
    let zoom = desiredDisplayWidth / natW;

    const MIN_ZOOM = 0.09, MAX_ZOOM = 2.0;
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

    inner.style.width  = Math.round(natW * zoom) + 'px';
    inner.style.height = Math.round(natH * zoom) + 'px';

    img.style.width  = '100%';
    img.style.height = '100%';
    requestAnimationFrame(() => {
      const alignmentMode = 'bottom';
      const offsetPx = 120;
      function computeTopForMode(mode) {
        const innerH = inner.clientHeight;
        const vpH = vp.clientHeight;
        if (innerH <= vpH) return 0;
        if (mode === 'center') {
          return Math.round(innerH * centerY - vpH / 2);
        }
        if (mode === 'lower') {
          return Math.round(innerH * centerY - vpH / 2);
        }
        if (mode === 'bottom') {
          return Math.max(0, innerH - vpH);
        }
        if (mode === 'offset') {
          return Math.max(0, Math.min(innerH - vpH, offsetPx));
        }
        return Math.round(innerH * centerY - vpH / 2);
      }
      const left = Math.round(inner.clientWidth * centerX - vp.clientWidth / 2);
      let top = computeTopForMode(alignmentMode);
      if (top < 0) top = 0;
      if (top > inner.clientHeight - vp.clientHeight) top = Math.max(0, inner.clientHeight - vp.clientHeight);
      vp.scrollLeft = Math.max(0, left);
      vp.scrollTop  = top;
    });
  }

  if (img.complete) applyZoomAndCenter();
  else img.addEventListener('load', applyZoomAndCenter);
  window.applyZoomAndCenter = applyZoomAndCenter;
  let resizeTimer;
  function onResize(){ clearTimeout(resizeTimer); resizeTimer = setTimeout(applyZoomAndCenter, 120); }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
window.applyZoomAndCenter = applyZoomAndCenter;

  function adjustViewportHeight(){
    if(!vp) return;
    const top = vp.getBoundingClientRect().top;
    const bottomGap = 8;
    let available = Math.max(120, Math.floor(window.innerHeight - top - bottomGap));
    if (typeof window.visualViewport!== 'undefined') {
      available = Math.max(120, Math.floor(window.visualViewport.height - top - bottomGap));
    }
    vp.style.height = available + 'px';
  }
  adjustViewportHeight();
  window.addEventListener('resize', () => { adjustViewportHeight(); });
  window.addEventListener('orientationchange', () => { setTimeout(adjustViewportHeight, 120); });
  if (window.applyZoomAndCenter) {
    window.applyZoomAndCenter = applyZoomAndCenter;
    adjustViewportHeight();
    setTimeout(() => { window.applyZoomAndCenter(); }, 60);
  }
  const img = document.getElementById('mapImg');
  if(img) img.addEventListener('load', () => { adjustViewportHeight(); if(window.applyZoomAndCenter) window.applyZoomAndCenter(); });

})();
import { STORAGE_KEYS, Storage }  from '../core/storage.js';
import { setupDevModeTapCounter } from '../features/devmode.js';

const sheetOverlay = document.getElementById('sheetOverlay');

// ══ ДОПОМІЖНІ УТИЛІТИ КОЛЬОРУ ══
const getThemeColors = () => {
  const rs      = getComputedStyle(document.documentElement);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    red:   rs.getPropertyValue('--line-red').trim()   || '#c8523a',
    blue:  rs.getPropertyValue('--line-blue').trim()  || '#5b9bd5',
    green: rs.getPropertyValue('--line-green').trim() || '#5aaa6a',
    base:  rs.getPropertyValue('--bg-card').trim()    || (isLight ? '#ffffff' : '#2c2c2e'),
  };
};
const hexToRgb  = hex => { const n = parseInt(hex.replace('#',''),16); return [(n>>16)&255,(n>>8)&255,n&255]; };
const lerp      = (a,b,t) => Math.round(a+(b-a)*t);
const mixColors = (cHex,bHex,t) => { const[r1,g1,b1]=hexToRgb(cHex),[r2,g2,b2]=hexToRgb(bHex); return `rgb(${lerp(r2,r1,t)},${lerp(g2,g1,t)},${lerp(b2,b1,t)})`; };

// ══ ЛОГОТИПИ ══
const LOGOS = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26" id="aboutLogoImg">
    <g style="fill: var(--line-green); fill-opacity:1">
      <path d="M49.904 120.033h10v10h-10z" style="fill: var(--line-green); stroke-width:.10117" transform="matrix(.3355 0 0 1 -3.751 -117.033)"/>
      <path d="M59.82 120.033h10v10h-10z" style="fill: var(--line-green); stroke-width:.10117" transform="matrix(.3355 0 0 1 -3.751 -117.033)"/>
      <path d="M69.736 120.033h10v10h-10z" style="fill: var(--line-green); stroke-width:.10117" transform="matrix(.3355 0 0 1 -3.751 -117.033)"/>
    </g>
    <g style="fill: var(--line-blue); fill-opacity:1">
      <path d="M62.836 114.963H82.78v8H62.836z" style="fill: var(--line-blue); stroke-width:.127791" transform="matrix(.50098 0 0 1.25 -28.48 -140.705)"/>
    </g>
    <g style="fill: var(--line-green); fill-opacity:1">
      <path d="M144.141 82.952h14.995v2.314h-14.995z" style="fill: var(--line-green); stroke-width:.0595893" transform="matrix(.33374 0 0 2.16109 -40.118 -176.267)"/>
      <path d="M144.141 82.952h14.995v2.314h-14.995z" style="fill: var(--line-green); stroke-width:.0595893" transform="matrix(.33374 0 0 6.48327 -35.122 -529.802)"/>
    </g>
    <path d="M96.983 35h5v5h-5z" style="fill: var(--line-blue); stroke-width:.0505852" transform="matrix(1.00085 0 0 1 -84.074 -32)"/>
    <path d="M91.983 40h5v15h-5z" style="fill: var(--line-blue); stroke-width:.0876163" transform="matrix(1.00085 0 0 1 -84.074 -32)"/>
  </svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.82 -0.82 6.93 6.93" id="aboutLogoImg">
    <path d="M132.557 112.715h5.292v1.323h-5.292z" style="fill: var(--line-red);" transform="translate(-132.556 -110.067)"/>
    <g><path d="M190.554 82.982h14.974v2.314h-14.974z" style="fill: var(--line-green);" transform="matrix(.08834 0 0 .57185 -16.834 -44.805)"/></g>
    <g><path d="M190.554 82.982h14.974v2.314h-14.974z" style="fill: var(--line-green);" transform="matrix(.17669 0 0 .57185 -33.668 -47.453)"/></g>
    <g><path d="M49.904 120.033h10v10h-10z" style="fill: var(--line-green);" transform="matrix(.52917 0 0 .13256 -26.408 -14.586)"/></g>
    <g><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill: var(--line-red);" transform="matrix(.08827 0 0 .57285 -2.24 -43.166)"/></g>
    <g><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill: var(--line-red);" transform="matrix(.08827 0 0 1.14398 -.92 -86.203)"/></g>
    <g><path d="M120.43 105.01h5v5.001h-5z" style="fill: var(--line-red);" transform="matrix(.52913 0 0 .26507 -63.723 -23.866)"/></g>
    <g><path d="M190.554 82.982h14.974v2.314h-14.974z" style="fill: var(--line-green);" transform="matrix(.08834 0 0 1.14573 -15.514 -95.075)"/></g>
  </svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.82 -0.82 6.93 6.93" id="aboutLogoImg">
    <path d="M0 2.646h5.292v1.323H0Z" style="fill: var(--line-red);"/>
    <g><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill: var(--line-red);" transform="matrix(.17645 0 0 .57179 -1.832 -40.44)"/></g>
    <path d="M159.544 125.677h5.29V127h-5.29z" style="fill: var(--line-blue);" transform="translate(-159.544 -124.354)"/>
    <g><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill: var(--line-red);" transform="matrix(.08823 0 0 .57179 1.73 -43.087)"/></g>
    <path d="M163.513 127h1.323v1.323h-1.323z" style="fill: var(--line-blue);" transform="translate(-159.544 -124.354)"/>
    <path d="M162.189 124.354h2.646v1.323h-2.646z" style="fill: var(--line-blue);" transform="translate(-159.544 -124.354)"/>
    <g><path d="M25.38 77.668h14.995v2.314H25.38Z" style="fill: var(--line-red);" transform="matrix(.08823 0 0 1.14374 .413 -86.186)"/></g>
  </svg>`,
];

const HANDLE_GRADIENTS = [
  'linear-gradient(to right, var(--line-green) 50%, var(--line-blue) 50%)',
  'linear-gradient(to right, var(--line-red) 50%, var(--line-green) 50%)',
  'linear-gradient(to right, var(--line-blue) 50%, var(--line-red) 50%)',
];

// ══ САЛЮТ-АНІМАЦІЯ ══
function bindBottomLoader(aboutSheet) {
  const supportCard = aboutSheet.querySelector('.about-support-card');
  if (!supportCard) return;

  let overlay = supportCard.querySelector('#supportLoaderWrap');
  if (!overlay) {
    supportCard.style.position = 'relative';
    supportCard.style.overflow = 'hidden';
    overlay = document.createElement('div');
    overlay.id = 'supportLoaderWrap';
    overlay.style.cssText = 'display:none;position:absolute;top:0;left:0;width:100%;height:100%;background:var(--bg-card);border-radius:inherit;z-index:10;justify-content:center;align-items:center;flex-direction:row;opacity:0;transition:opacity 0.3s ease;';
    overlay.innerHTML = `
      <div id="saluteTextLeft" style="flex:1;text-align:right;font-size:14px;font-weight:500;color:var(--text-muted);font-variant:small-caps;letter-spacing:0.04em;transition:opacity 1s ease;"></div>
      <svg version="1.1" viewBox="-4 -4 44.3 45.1" style="width:100px;height:100px;overflow:visible;flex-shrink:0;margin:0 10px;">
        <g transform="translate(-162.85484,-126.18087)"><g transform="translate(32.460036,2.9988233)">
          <g class="eggPetals" transform="matrix(0.60937788,0,0,0.62637748,2.7606092,-11.401414)">
            <path class="st4" d="m 239.25,232.16 c 2.9,0 5.7,-2.9 5,-8 -0.6,-4.8 -3.3,-8.9 -5,-9.3 -1.9,0.5 -4.4,4.7 -5,9.3 -0.5,5.1 2.1,8 5,8 z"/>
            <path class="st4" d="m 226.85,244.46 c 0,-2.9 -2.9,-5.6 -8,-4.9 -4.9,0.6 -9,3.3 -9.4,4.9 0.5,1.9 4.7,4.4 9.4,4.9 5.1,0.6 8,-2 8,-4.9 z"/>
            <path class="st4" d="m 239.25,256.76 c -2.9,0 -5.6,2.9 -5,8 0.6,4.8 3.3,8.9 5,9.3 1.9,-0.5 4.4,-4.7 5,-9.3 0.6,-5.1 -2.1,-8 -5,-8 z"/>
            <path class="st4" d="m 251.65,244.46 c 0,-2.9 2.9,-5.6 8,-4.9 4.9,0.6 9,3.3 9.4,4.9 -0.5,1.9 -4.7,4.4 -9.4,4.9 5.1,0.6 8,-2 8,-4.9 z"/>
            <path class="st4" d="m 230.45,235.76 c 2.1,-2 2,-6 -2.2,-9.1 -3.9,-3 -8.7,-4 -10.2,-3.1 -1,1.7 0.2,6.4 3.1,10.1 3.4,4 7.3,4.1 9.3,2.1 z"/>
            <path class="st4" d="m 230.45,253.16 c -2.1,-2 -6,-1.9 -9.2,2.2 -3,3.9 -4,8.7 -3.1,10.1 1.7,1 6.5,-0.2 10.2,-3.1 4,-3.3 4.2,-7.2 2.1,-9.2 z"/>
            <path class="st4" d="m 248.05,253.16 c 2.1,-2 6,-1.9 9.2,2.2 3,3.9 4,8.7 3.1,10.1 -1.7,1 -6.5,-0.2 -10.2,-3.1 -4,-3.3 -4.2,-7.2 -2.1,-9.2 z"/>
            <path class="st4" d="m 248.05,235.76 c -2.1,-2 -2,-6 2.2,-9.1 -3.9,-3 8.7,-4 10.2,-3.1 1,1.7 -0.2,6.4 -3.1,10.1 -3.4,4 -7.3,4.1 -9.3,2.1 z"/>
            <path class="st4" d="m 227.95,217.46 c 2.1,-0.9 4.2,-1.3 4.8,1.4 0.5,2.5 -0.6,5.3 -1.7,6 -1.5,0.3 -4.1,-1 -5.5,-3 -1.4,-2.4 0.3,-3.6 2.4,-4.4 z"/>
            <path class="st4" d="m 212.05,255.66 c -0.9,-2.1 -1.3,-4.2 1.4,-4.7 2.5,-0.5 5.4,0.6 6,1.7 0.3,1.5 -1,4.1 -3.1,5.4 -2.2,1.4 -3.5,-0.3 -4.3,-2.4 z"/>
            <path class="st4" d="m 250.75,271.96 c 2.1,-0.9 3.9,-2.1 2.4,-4.4 -1.4,-2.1 -4.2,-3.3 -5.5,-3 -1.3,0.8 -2.2,3.6 -1.7,6 0.6,2.7 2.7,2.3 4.8,1.4 z"/>
            <path class="st4" d="m 212.05,233.26 c 0.9,-2.1 2.1,-3.9 4.4,-2.4 2.2,1.4 3.4,4.2 3.1,5.4 -0.8,1.3 -3.6,2.2 -6,1.7 -2.8,-0.6 -2.4,-2.6 -1.5,-4.7 z"/>
            <path class="st4" d="m 228.35,271.46 c -2.1,-0.9 -3.9,-2.1 -2.4,-4.4 1.4,-2.1 4.2,-3.3 5.5,-3 1.3,0.8 2.2,3.6 1.7,6 -0.6,2.7 -2.7,2.3 -4.8,1.4 z"/>
            <path class="st4" d="m 250.55,217.46 c 2.1,0.9 3.9,2.1 2.4,4.4 -1.4,2.1 -4.2,3.3 -5.5,3 -1.3,-0.8 -2.2,-3.6 -1.7,-6 0.6,-2.7 2.7,-2.3 4.8,-1.4 z"/>
            <path class="st4" d="m 266.45,233.26 c -0.9,-2.1 -2.1,-3.9 -4.4,-2.4 -2.2,1.4 -3.4,4.2 -3.1,5.4 0.8,1.3 3.6,2.2 6,1.7 2.8,-0.6 2.4,-2.6 1.5,-4.7 z"/>
            <path class="st4" d="m 266.45,255.66 c 0.9,-2.1 1.3,-4.2 -1.4,-4.7 -2.5,-0.5 -5.4,0.6 -6,1.7 -0.3,1.5 1,4.1 3.1,5.4 2.2,1.4 3.5,-0.3 4.3,-2.4 z"/>
          </g>
          <path class="eggCenter" d="m 155.49793,141.52659 c 0,3.8 -2.9,6.8 -6.4,6.8 -3.6,0 -6.4,-3 -6.4,-6.8 v 0 c 0,-3.8 2.9,-6.8 6.4,-6.8 3.5,0 6.4,3.1 6.4,6.8 z" style="fill: var(--line-red)"/>
        </g></g>
      </svg>
      <div id="saluteTextRight" style="flex:1;text-align:left;font-size:14px;font-weight:500;color:var(--text-muted);font-variant:small-caps;letter-spacing:0.04em;transition:opacity 1s ease;"></div>`;
    supportCard.appendChild(overlay);
  }

  const form    = aboutSheet.querySelector('#aboutBetaForm');
  const input   = aboutSheet.querySelector('.about-beta-input');
  const monoBtn = aboutSheet.querySelector('.about-donate-btn-mono');
  const textLeft  = overlay.querySelector('#saluteTextLeft');
  const textRight = overlay.querySelector('#saluteTextRight');
  let saluteTimer = null, animTimer = null, centerTimer = null;

  function stopSalute() {
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.display = 'none';
      textLeft.style.opacity = textRight.style.opacity = '1';
      clearTimeout(animTimer); cancelAnimationFrame(centerTimer);
    }, 300);
  }

  function startSalute(leftStr, rightStr) {
    clearTimeout(saluteTimer);
    textLeft.innerHTML = leftStr; textRight.innerHTML = rightStr;
    textLeft.style.opacity = textRight.style.opacity = '1';
    overlay.style.display = 'flex';
    void overlay.offsetWidth;
    overlay.style.opacity = '1';

    const TC     = getThemeColors();
    const petals = Array.from(overlay.querySelectorAll('.st4'));
    const center = overlay.querySelector('.eggCenter');
    const cb     = center.getBoundingClientRect();
    const cx     = cb.left + cb.width/2, cy = cb.top + cb.height/2;

    const sortedPetals = petals.map(p => {
      const b = p.getBoundingClientRect();
      return { element: p, angle: (Math.atan2(b.top+b.height/2-cy, b.left+b.width/2-cx)*180/Math.PI+90+360)%360 };
    }).sort((a,b) => a.angle-b.angle).map(p => p.element);

    let cycle = parseInt(Storage.get(STORAGE_KEYS.LOGO_EGG_CYCLE)||0);
    Storage.set(STORAGE_KEYS.LOGO_EGG_CYCLE, cycle+1);
    const SCHEMES = [
      {center:TC.red,   petals:[TC.blue,TC.green]},
      {center:TC.blue,  petals:[TC.red,TC.green]},
      {center:TC.green, petals:[TC.red,TC.blue]},
    ];
    const S = SCHEMES[cycle%3];
    sortedPetals.forEach(p => { p.style.fill=TC.base; p.style.transition='fill 0.25s ease'; });

    const runPetal = () => {
      if (overlay.style.display==='none') return;
      const i=Math.floor(Math.random()*sortedPetals.length), p=sortedPetals[i];
      p.style.fill = mixColors(S.petals[i%2],TC.base,0.85);
      setTimeout(()=>{ p.style.fill=TC.base; },400);
      animTimer = setTimeout(runPetal, 180+Math.random()*250);
    };
    const runCenter = () => {
      if (overlay.style.display==='none') return;
      const ph=(Date.now()/1000)%1.2;
      center.style.fill = mixColors(S.center,TC.base,0.35+Math.abs(Math.sin(ph*Math.PI))*0.65);
      centerTimer = requestAnimationFrame(runCenter);
    };
    runPetal(); runCenter();
    setTimeout(()=>{ if(overlay.style.display!=='none'){textLeft.style.opacity=textRight.style.opacity='0';} },2000);
    saluteTimer = setTimeout(stopSalute, 10000);
  }

  if (form && input) {
    form.onsubmit = e => {
      e.preventDefault();
      const val = input.value.trim();
      if (val.length>=3 && /^[a-zA-Z0-9.]+$/.test(val)) {
        input.blur(); window.location.href='thanks.html?type=beta';
      } else {
        const c = input.style.color;
        input.style.color='var(--line-red)';
        setTimeout(()=>{ input.style.color=c; },1500);
      }
    };
  }
  if (monoBtn) monoBtn.addEventListener('click', ()=>startSalute('Дякуємо','за підтримку!'));
}

// ══ ВІДКРИТТЯ ABOUT-ШТОРКИ ══
export function openAboutSheet() {
  let aboutSheet = document.getElementById('aboutSheet');
  if (!aboutSheet) {
    aboutSheet = document.createElement('div');
    aboutSheet.id        = 'aboutSheet';
    aboutSheet.className = 'station-sheet about-station-sheet';
    const template = document.getElementById('tpl-about-sheet');
    aboutSheet.appendChild(template.content.cloneNode(true));
    document.body.appendChild(aboutSheet);

    document.getElementById('aboutClose').addEventListener('click', () => {
      MetroApp.animateSheetClose?.(aboutSheet, () => {
        aboutSheet.classList.remove('sheet-open');
        if (!document.querySelectorAll('.station-sheet.sheet-open').length)
          sheetOverlay.classList.remove('overlay-visible');
      });
    });
    setupDevModeTapCounter(aboutSheet);
  }

  let logoState = Storage.get(STORAGE_KEYS.LOGO_STATE);

  function updateLogo() {
    const logoEl   = aboutSheet.querySelector('#aboutLogoImg');
    const handleEl = aboutSheet.querySelector('.sheet-handle');
    if (!logoEl) return;

    let idx = 0;
    if (logoState !== null) {
      idx = parseInt(logoState);
      if (isNaN(idx)||idx>=LOGOS.length||idx<0) { idx=0; Storage.set(STORAGE_KEYS.LOGO_STATE,0); }
      const div = document.createElement('div');
      div.innerHTML = LOGOS[idx];
      logoEl.replaceWith(div.firstChild);
    }
    if (handleEl) handleEl.style.background = HANDLE_GRADIENTS[idx];

    const currentLogo = aboutSheet.querySelector('#aboutLogoImg');
    if (!currentLogo) return;
    let taps=0, tapTimer=null, lastTap=0;
    currentLogo.addEventListener('click', ()=>{
      const now=Date.now(); if(now-lastTap<50) return; lastTap=now; taps++;
      clearTimeout(tapTimer);
      if(taps>=3){ taps=0; logoState=logoState===null?1:(parseInt(logoState)+1)%LOGOS.length; Storage.set(STORAGE_KEYS.LOGO_STATE,logoState); updateLogo(); }
      else tapTimer=setTimeout(()=>{taps=0;},1000);
    });
  }

  updateLogo();
  bindBottomLoader(aboutSheet);

  const btnAndroid=aboutSheet.querySelector('#btnInfoAndroid'), hintAndroid=aboutSheet.querySelector('#hintAndroid');
  const btnIOS=aboutSheet.querySelector('#btnInfoIOS'),         hintIOS=aboutSheet.querySelector('#hintIOS');

  const setActive=(btn,v)=>btn?.classList.toggle('info-btn-active',v);
  const scrollTo=el=>setTimeout(()=>{
    if(el.hidden) return;
    const r=el.getBoundingClientRect(), s=aboutSheet.getBoundingClientRect();
    if(r.bottom>s.bottom-20) el.scrollIntoView({behavior:'smooth',block:'end'});
  },100);

  if(btnAndroid&&hintAndroid&&btnIOS&&hintIOS){
    btnAndroid.addEventListener('click',e=>{
      e.stopPropagation();
      const o=hintAndroid.hidden; hintAndroid.hidden=!o; setActive(btnAndroid,o);
      if(o){hintIOS.hidden=true;setActive(btnIOS,false);scrollTo(hintAndroid);}
    });
    btnIOS.addEventListener('click',e=>{
      e.stopPropagation();
      const o=hintIOS.hidden; hintIOS.hidden=!o; setActive(btnIOS,o);
      if(o){hintAndroid.hidden=true;setActive(btnAndroid,false);scrollTo(hintIOS);}
    });
  }

  MetroApp.pushSheetHistory?.();
  document.querySelectorAll('.station-sheet').forEach(el=>el.classList.remove('sheet-open'));
  aboutSheet.classList.add('sheet-open','sheet-fullscreen','sheet-scrollable');
  sheetOverlay.classList.add('overlay-visible');
}

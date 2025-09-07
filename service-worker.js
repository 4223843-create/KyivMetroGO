const CACHE_NAME = 'kyiv-metro-cache-v1';
const ASSETS = [
  "./",
  "./index.html",
  "./B.Lybidska.html",
  "./B.Maidan_Nezalezhnosti.html",
  "./B.Minska.html",
  "./B.Obolon.html",
  "./B.Olimpiiska.html",
  "./B.Palats_Ukraina.html",
  "./B.Ploshcha_Ukrainskikh_heroiv.html",
  "./B.Pochaina.html",
  "./B.Poshtova_ploshcha.html",
  "./B.Tarasa_Shevchenko.html",
  "./B.Teremky.html",
  "./B.Vasylkivska.html",
  "./B.Vystavkovyi_tsentr.html",
  "./G.Boryspilska.html",
  "./G.Chervonyi_khutir.html",
  "./G.Dorohozhychi.html",
  "./G.Kharkivska.html",
  "./G.Klovska.html",
  "./G.Lukianivska.html",
  "./G.Osokorky.html",
  "./G.Palats_sportu.html",
  "./G.Pecherska.html",
  "./G.Pozniaky.html",
  "./G.Slavutych.html",
  "./G.Syrets.html",
  "./G.Vydubychi.html",
  "./G.Vyrlytsia.html",
  "./G.Zoloti_vorota.html",
  "./G.Zvirynetska.html",
  "./kvadraty priam lnk.png",
  "./R.Akademmistechko.html",
  "./R.Arsenalna.html",
  "./R.Beresteiska.html",
  "./R.Chernihivska.html",
  "./R.Darnytsia.html",
  "./R.Dnipro.html",
  "./R.Hidropark.html",
  "./R.Khreshchatyk.html",
  "./R.Lisova.html",
  "./R.Livoberezhna.html",
  "./R.Nyvky.html",
  "./R.Politekhnychnyi_instytut.html",
  "./R.Shuliavska.html",
  "./R.Sviatoshyn.html",
  "./R.Teatralna.html",
  "./R.Universytet.html",
  "./R.Vokzalna.html",
  "./R.Zhytomyrska.html",
  "./B.Demiivska.html",
  "./B.Heroiv_Dnipra.html",
  "./B.Holosiivska.html",
  "./B.Ipodrom.html",
  "./B.Kontraktova_ploshcha.html",
  "icons/icon-512.png",
  "icons/icon-192.png",
  "icons/icon-144.png",
  "icons/icon-128.png",
  "icons/icon-72.png",
  "icons/favicon.ico"
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => { caches.open(CACHE_NAME).then(cache=>cache.put(req,res.clone())); return res; }).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(r=>r||fetch(req)));
});

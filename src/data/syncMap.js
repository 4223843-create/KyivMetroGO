// ══ DATA: КАРТА РУЧНИХ ЗВ'ЯЗКІВ ВИХОДІВ (SYNC MAP) ══
// Пов'язує масиви виходів (exitIndex) між різними напрямками станцій.
// Індекс 0 — перший вихід у JSON, індекс 1 — другий вихід у JSON.

export const SYNC_MAP = {
  // 🔴 ЧЕРВОНА ГІЛКА (Святошинсько-Броварська)
  "R.Akademmistechko": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "кінцева", exitIndex: 0 }],
    [{ dir: "до Лісової", exitIndex: 1 }, { dir: "кінцева", exitIndex: 1 }]
  ],
  "R.Zhytomyrska": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }],
    [{ dir: "до Лісової", exitIndex: 1 }, { dir: "до Академмістечка", exitIndex: 1 }]
  ],
  "R.Sviatoshyn": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }],
    [{ dir: "до Лісової", exitIndex: 1 }, { dir: "до Академмістечка", exitIndex: 1 }]
  ],
  "R.Nyvky": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }],
    [{ dir: "до Лісової", exitIndex: 1 }, { dir: "до Академмістечка", exitIndex: 1 }]
  ],
  "R.Beresteiska": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }]
  ],
  "R.Shuliavska": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }]
  ],
  "R.Politekhnychnyi_instytut": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }]
  ],
  "vokzalna": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }]
  ],
  "R.Universytet": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }]
  ],
  "R.Teatralna": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }]
  ],
  "R.Khreshchatyk": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }],
    [{ dir: "до Лісової", exitIndex: 1 }, { dir: "до Академмістечка", exitIndex: 1 }]
  ],
  "R.Arsenalna": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }]
  ],
  "R.Dnipro": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }]
  ],
  "R.Hidropark": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }],
    [{ dir: "до Лісової", exitIndex: 1 }, { dir: "до Академмістечка", exitIndex: 1 }]
  ],
  "R.Livoberezhna": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }],
    [{ dir: "до Лісової", exitIndex: 1 }, { dir: "до Академмістечка", exitIndex: 1 }]
  ],
  "R.Darnytsia": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }],
    [{ dir: "до Лісової", exitIndex: 1 }, { dir: "до Академмістечка", exitIndex: 1 }]
  ],
  "R.Chernihivska": [
    [{ dir: "до Лісової", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }],
    [{ dir: "до Лісової", exitIndex: 1 }, { dir: "до Академмістечка", exitIndex: 1 }]
  ],
  "R.Lisova": [
    [{ dir: "кінцева", exitIndex: 0 }, { dir: "до Академмістечка", exitIndex: 0 }],
    [{ dir: "кінцева", exitIndex: 1 }, { dir: "до Академмістечка", exitIndex: 1 }]
  ],

  // 🔵 СИНЯ ГІЛКА (Оболонсько-Теремківська)
  "B.Heroiv_Dnipra": [
    [{ dir: "до Теремків", exitIndex: 0 }, { dir: "кінцева", exitIndex: 0 }],
    [{ dir: "до Теремків", exitIndex: 1 }, { dir: "кінцева", exitIndex: 1 }]
  ],
  "B.Minska": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }],
    [{ dir: "до Героїв Дніпра", exitIndex: 1 }, { dir: "до Теремків", exitIndex: 1 }]
  ],
  "B.Obolon": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }],
    [{ dir: "до Героїв Дніпра", exitIndex: 1 }, { dir: "до Теремків", exitIndex: 1 }]
  ],
  "B.Pochaina": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }],
    [{ dir: "до Героїв Дніпра", exitIndex: 1 }, { dir: "до Теремків", exitIndex: 1 }]
  ],
  "B.Tarasa_Shevchenka": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }]
  ],
  "B.Kontraktova_Ploshcha": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }],
    [{ dir: "до Героїв Дніпра", exitIndex: 1 }, { dir: "до Теремків", exitIndex: 1 }]
  ],
  "B.Poshtova_Ploshcha": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }]
  ],
  "B.Maidan_Nezalezhnosti": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }]
  ],
  "B.Ploshcha_Ukrainskikh_heroiv": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }]
  ],
  "B.Olimpiiska": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }]
  ],
  "B.Palats_Ukraina": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }]
  ],
  "B.Lybidska": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }]
  ],
  "B.Demiivska": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }]
  ],
  "B.Holosiivska": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }]
  ],
  "B.Vasylkivska": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }],
    [{ dir: "до Героїв Дніпра", exitIndex: 1 }, { dir: "до Теремків", exitIndex: 1 }]
  ],
  "B.Vystavkovyi_Tsentr": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }]
  ],
  "B.Ipodrom": [
    [{ dir: "до Героїв Дніпра", exitIndex: 0 }, { dir: "до Теремків", exitIndex: 0 }]
  ],
  "B.Teremky": [
    [{ dir: "кінцева", exitIndex: 0 }, { dir: "до Героїв Дніпра", exitIndex: 0 }],
    [{ dir: "кінцева", exitIndex: 1 }, { dir: "до Героїв Дніпра", exitIndex: 1 }]
  ],

  // 🟢 ЗЕЛЕНА ГІЛКА (Сирецько-Печерська)
  "G.Syrets": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "кінцева", exitIndex: 0 }]
  ],
  "G.Dorogozhychi": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }]
  ],
  "G.Lukianivska": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }]
  ],
  "G.Zoloti_Vorota": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }]
  ],
  "G.Palats_Sportu": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }]
  ],
  "G.Klovska": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }]
  ],
  "G.Pecherska": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }]
  ],
  "G.Zvirynetska": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }]
  ],
  "G.Vydubychi": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }],
    [{ dir: "до Червоного хутора", exitIndex: 1 }, { dir: "до Сирця", exitIndex: 1 }]
  ],
  "G.Slavutych": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }]
  ],
  "G.Osokorky": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }],
    [{ dir: "до Червоного хутора", exitIndex: 1 }, { dir: "до Сирця", exitIndex: 1 }]
  ],
  "G.Pozniaky": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }],
    [{ dir: "до Червоного хутора", exitIndex: 1 }, { dir: "до Сирця", exitIndex: 1 }]
  ],
  "G.Kharkivska": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }],
    [{ dir: "до Червоного хутора", exitIndex: 1 }, { dir: "до Сирця", exitIndex: 1 }]
  ],
  "G.Vyrlytsia": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }]
  ],
  "G.Boryspilska": [
    [{ dir: "до Червоного хутора", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }],
    [{ dir: "до Червоного хутора", exitIndex: 1 }, { dir: "до Сирця", exitIndex: 1 }]
  ],
  "G.Chervonyi_khutir": [
    [{ dir: "кінцева", exitIndex: 0 }, { dir: "до Сирця", exitIndex: 0 }],
    [{ dir: "кінцева", exitIndex: 1 }, { dir: "до Сирця", exitIndex: 1 }]
  ]
};
const STATIONS_FOR_FORM = {
  "B.Demiivska": {
    "name": "Деміївська",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Либідська",
        "exit": "",
        "wagon": "3",
        "doors": "1"
      },
      {
        "dir": "попередня Голосіївська",
        "exit": "",
        "wagon": "4",
        "doors": "3"
      }
    ]
  },
  "B.Heroiv_Dnipra": {
    "name": "Героїв Дніпра",
    "line": "blue",
    "positions": [
      {
        "dir": "кінцева",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "кінцева",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "B.Holosiivska": {
    "name": "Голосіївська",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Деміївська",
        "exit": "",
        "wagon": "3",
        "doors": "1"
      },
      {
        "dir": "попередня Васильківська",
        "exit": "",
        "wagon": "4",
        "doors": "3"
      }
    ]
  },
  "B.Ipodrom": {
    "name": "Іподром",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Виставковий центр",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Виставковий центр",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Теремки",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Теремки",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "B.Kontraktova_ploshcha": {
    "name": "Контрактова площа",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Поштова площа",
        "exit": "до Верхнього валу",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Поштова площа",
        "exit": "до Контрактової площі",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Тараса Шевченка",
        "exit": "до Контрактової площі",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Тараса Шевченка",
        "exit": "до Верхнього валу",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "B.Lybidska": {
    "name": "Либідська",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Палац „Україна“",
        "exit": "",
        "wagon": "4",
        "doors": "3"
      },
      {
        "dir": "попередня Деміївська",
        "exit": "",
        "wagon": "2",
        "doors": "3"
      }
    ]
  },
  "B.Maidan_Nezalezhnosti": {
    "name": "Майдан Незалежності",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Площа Українських героїв",
        "exit": "пересадка на 🟥 Хрещатик 🟥",
        "wagon": "5",
        "doors": "3"
      },
      {
        "dir": "попередня Площа Українських героїв",
        "exit": "вихід в місто",
        "wagon": "1",
        "doors": "2"
      },
      {
        "dir": "попередня Поштова площа",
        "exit": "пересадка на 🟥 Хрещатик 🟥",
        "wagon": "1",
        "doors": "3"
      },
      {
        "dir": "попередня Поштова площа",
        "exit": "вихід в місто",
        "wagon": "5",
        "doors": "3"
      }
    ]
  },
  "B.Minska": {
    "name": "Мінська",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Оболонь",
        "exit": "до Мінського ринку",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Оболонь",
        "exit": "до Smart Plaza, McDonald's",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Героїв Дніпра",
        "exit": "до Smart Plaza, McDonald's",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Героїв Дніпра",
        "exit": "до Мінського ринку",
        "wagon": "1",
        "doors": "1"
      }
    ]
  },
  "B.Obolon": {
    "name": "Оболонь",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Почайна",
        "exit": "в бік Dream Town",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Почайна",
        "exit": "до Lake Plaza",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Мінська",
        "exit": "до Lake Plaza",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Мінська",
        "exit": "в бік Dream Town",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "B.Olimpiiska": {
    "name": "Олімпійська",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Площа Українських героїв",
        "exit": "",
        "wagon": "5",
        "doors": "2-3"
      },
      {
        "dir": "попередня Палац „Україна“",
        "exit": "",
        "wagon": "1",
        "doors": "3-4"
      }
    ]
  },
  "B.Palats_Ukraina": {
    "name": "Палац „Україна“",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Олімпійська",
        "exit": "",
        "wagon": "2",
        "doors": "2-3"
      },
      {
        "dir": "попередня Либідська",
        "exit": "",
        "wagon": "4",
        "doors": "3"
      }
    ]
  },
  "B.Ploshcha_Ukrainskikh_heroiv": {
    "name": "Площа Українських героїв",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Майдан Незалежності",
        "exit": "пересадка на 🟩 Палац спорту 🟩",
        "wagon": "2",
        "doors": "3"
      },
      {
        "dir": "попередня Майдан Незалежності",
        "exit": "вихід в місто",
        "wagon": "1",
        "doors": "4"
      },
      {
        "dir": "попередня Олімпійська",
        "exit": "пересадка на 🟩 Палац спорту 🟩",
        "wagon": "4",
        "doors": "4"
      },
      {
        "dir": "попередня Олімпійська",
        "exit": "вихід в місто",
        "wagon": "5",
        "doors": "3"
      }
    ]
  },
  "B.Pochaina": {
    "name": "Почайна",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Тараса Шевченко",
        "exit": "до книжкового ринку",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Тараса Шевченко",
        "exit": "в бік ТЦ Gorodok",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Оболонь",
        "exit": "до книжкового ринку",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Оболонь",
        "exit": "в бік ТЦ Gorodok",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "B.Poshtova_ploshcha": {
    "name": "Поштова площа",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Майдан Незалежності",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Контрактова",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      }
    ]
  },
  "B.Tarasa_Shevchenko": {
    "name": "Тараса Шевченко",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Контрактова площа",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Почайна",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      }
    ]
  },
  "B.Teremky": {
    "name": "Теремки",
    "line": "blue",
    "positions": [
      {
        "dir": "кінцева",
        "exit": "",
        "wagon": "1",
        "doors": "1-2"
      },
      {
        "dir": "кінцева",
        "exit": "",
        "wagon": "5",
        "doors": "3-4"
      }
    ]
  },
  "B.Vasylkivska": {
    "name": "Васильківська",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Голосіївська",
        "exit": "",
        "wagon": "5",
        "doors": "3"
      },
      {
        "dir": "попередня Голосіївська",
        "exit": "",
        "wagon": "1",
        "doors": "2"
      },
      {
        "dir": "попередня Виставковий центр",
        "exit": "",
        "wagon": "1",
        "doors": "2"
      },
      {
        "dir": "попередня Виставковий центр",
        "exit": "",
        "wagon": "5",
        "doors": "3"
      }
    ]
  },
  "B.Vystavkovyi_tsentr": {
    "name": "Виставковий центр",
    "line": "blue",
    "positions": [
      {
        "dir": "попередня Васильківська",
        "exit": "",
        "wagon": "1",
        "doors": "2"
      },
      {
        "dir": "попередня Іподром",
        "exit": "",
        "wagon": "5",
        "doors": "3-4"
      }
    ]
  },
  "G.Boryspilska": {
    "name": "Бориспільська",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Вирлиця",
        "exit": "",
        "wagon": "1",
        "doors": "2"
      },
      {
        "dir": "попередня Вирлиця",
        "exit": "",
        "wagon": "5",
        "doors": "3"
      },
      {
        "dir": "попередня Червоний Хутір",
        "exit": "",
        "wagon": "1",
        "doors": "2"
      },
      {
        "dir": "попередня Червоний Хутір",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "G.Chervonyi_khutir": {
    "name": "Червоний Хутір",
    "line": "green",
    "positions": [
      {
        "dir": "кінцева",
        "exit": "",
        "wagon": "5",
        "doors": "1"
      }
    ]
  },
  "G.Dorohozhychi": {
    "name": "Дорогожичі",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Лукʼянівська",
        "exit": "",
        "wagon": "2",
        "doors": "2"
      },
      {
        "dir": "попередня Сирець",
        "exit": "",
        "wagon": "4",
        "doors": "3"
      }
    ]
  },
  "G.Kharkivska": {
    "name": "Харківська",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Позняки",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Позняки",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Вирлиця",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Вирлиця",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "G.Klovska": {
    "name": "Кловська",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Палац спорту",
        "exit": "",
        "wagon": "5",
        "doors": "2"
      },
      {
        "dir": "попередня Печерська",
        "exit": "",
        "wagon": "1",
        "doors": "4"
      }
    ]
  },
  "G.Lukianivska": {
    "name": "Лукʼянівська",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Золоті ворота",
        "exit": "",
        "wagon": "1",
        "doors": "3-4"
      },
      {
        "dir": "попередня Дорогожичі",
        "exit": "",
        "wagon": "5",
        "doors": "1"
      }
    ]
  },
  "G.Osokorky": {
    "name": "Осокорки",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Славутич",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Позняки",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      }
    ]
  },
  "G.Palats_sportu": {
    "name": "Палац спорту",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Золоті ворота",
        "exit": "пересадка на 🟦 Площу Українських героїв 🟦",
        "wagon": "5",
        "doors": "2"
      },
      {
        "dir": "попередня Золоті ворота",
        "exit": "вихід в місто",
        "wagon": "1",
        "doors": "2"
      },
      {
        "dir": "попередня Кловська",
        "exit": "пересадка на 🟦 Площу Українських героїв 🟦",
        "wagon": "1",
        "doors": "3"
      },
      {
        "dir": "попередня Кловська",
        "exit": "вихід в місто",
        "wagon": "5",
        "doors": "3"
      }
    ]
  },
  "G.Pecherska": {
    "name": "Печерська",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Кловська",
        "exit": "",
        "wagon": "5",
        "doors": "3"
      },
      {
        "dir": "попередня Звіринецька",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      }
    ]
  },
  "G.Pozniaky": {
    "name": "Позняки",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Осокорки",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Осокорки",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Харківська",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Харківська",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "G.Slavutych": {
    "name": "Славутич",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Видубичі",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Осокорки",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      }
    ]
  },
  "G.Syrets": {
    "name": "Сирець",
    "line": "green",
    "positions": [
      {
        "dir": "кінцева",
        "exit": "",
        "wagon": "1",
        "doors": "4"
      }
    ]
  },
  "G.Vydubychi": {
    "name": "Видубичі",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Звіринецька",
        "exit": "до електричок",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Звіринецька",
        "exit": "у місто",
        "wagon": "1",
        "doors": "3-4"
      },
      {
        "dir": "попередня Славутич",
        "exit": "до електричок",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Славутич",
        "exit": "у місто",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "G.Vyrlytsia": {
    "name": "Вирлиця",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Харківська",
        "exit": "",
        "wagon": "4",
        "doors": "3"
      },
      {
        "dir": "попередня Бориспільська",
        "exit": "",
        "wagon": "3",
        "doors": "2-3"
      }
    ]
  },
  "G.Zoloti_vorota": {
    "name": "Золоті ворота",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Палац спорту",
        "exit": "пересадка на 🟥 Театральну 🟥",
        "wagon": "5",
        "doors": "2"
      },
      {
        "dir": "попередня Палац спорту",
        "exit": "вихід в місто",
        "wagon": "1",
        "doors": "2"
      },
      {
        "dir": "попередня Лукʼянівська",
        "exit": "пересадка на 🟥 Театральну 🟥",
        "wagon": "1",
        "doors": "3"
      },
      {
        "dir": "попередня Лукʼянівська",
        "exit": "вихід в місто",
        "wagon": "5",
        "doors": "3"
      }
    ]
  },
  "G.Zvirynetska": {
    "name": "Звіринецька",
    "line": "green",
    "positions": [
      {
        "dir": "попередня Печерська",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Видубичі",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      }
    ]
  },
  "R.Akademmistechko": {
    "name": "Академмістечко",
    "line": "red",
    "positions": [
      {
        "dir": "кінцева",
        "exit": "",
        "wagon": "1",
        "doors": "2"
      },
      {
        "dir": "кінцева",
        "exit": "",
        "wagon": "5",
        "doors": "3"
      }
    ]
  },
  "R.Arsenalna": {
    "name": "Арсенальна",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Хрещатик",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Дніпро",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      }
    ]
  },
  "R.Beresteiska": {
    "name": "Берестейська",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Шулявська",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Нивки",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      }
    ]
  },
  "R.Chernihivska": {
    "name": "Чернігівська",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Дарниця",
        "exit": "",
        "wagon": "1",
        "doors": "4"
      },
      {
        "dir": "попередня Дарниця",
        "exit": "",
        "wagon": "5",
        "doors": "1"
      },
      {
        "dir": "попередня Лісова",
        "exit": "",
        "wagon": "1",
        "doors": "4"
      },
      {
        "dir": "попередня Лісова",
        "exit": "",
        "wagon": "5",
        "doors": "1"
      }
    ]
  },
  "R.Darnytsia": {
    "name": "Дарниця",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Лівобережна",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Лівобережна",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Чернігівська",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Чернігівська",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "R.Dnipro": {
    "name": "Дніпро",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Арсенальна",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Гідропарк",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      }
    ]
  },
  "R.Hidropark": {
    "name": "Гідропарк",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Дніпро",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Дніпро",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Лівобережна",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Лівобережна",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "R.Khreshchatyk": {
    "name": "Хрещатик",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Театральна",
        "exit": "короткий перехід на 🟦 Майдан Незалежності 🟦",
        "wagon": "2",
        "doors": "1-3"
      },
      {
        "dir": "попередня Театральна",
        "exit": "вихід в місто (Хрещатик)",
        "wagon": "4",
        "doors": "1"
      },
      {
        "dir": "попередня Театральна",
        "exit": "вихід в місто (Героїв Небесної сотні)",
        "wagon": "2",
        "doors": "1"
      },
      {
        "dir": "попередня Арсенальна",
        "exit": "короткий перехід на 🟦 Майдан Незалежності 🟦",
        "wagon": "5",
        "doors": "1"
      },
      {
        "dir": "попередня Арсенальна",
        "exit": "вихід в місто (Хрещатик)",
        "wagon": "2",
        "doors": "4"
      },
      {
        "dir": "попередня Арсенальна",
        "exit": "вихід в місто (Героїв Небесної сотні)",
        "wagon": "5",
        "doors": "3"
      },
      {
        "dir": "попередня Театральна",
        "exit": "довгий перехід на 🟦 Майдан Незалежності 🟦",
        "wagon": "2",
        "doors": "1, 4"
      },
      {
        "dir": "попередня Театральна",
        "exit": "довгий перехід на 🟦 Майдан Незалежності 🟦",
        "wagon": "3",
        "doors": "3"
      },
      {
        "dir": "попередня Арсенальна",
        "exit": "довгий перехід на 🟦 Майдан Незалежності 🟦",
        "wagon": "5",
        "doors": "3"
      },
      {
        "dir": "попередня Арсенальна",
        "exit": "довгий перехід на 🟦 Майдан Незалежності 🟦",
        "wagon": "3",
        "doors": "3"
      }
    ]
  },
  "R.Lisova": {
    "name": "Лісова",
    "line": "red",
    "positions": [
      {
        "dir": "кінцева",
        "exit": "вихід до автостанції",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "кінцева",
        "exit": "вихід до ринку",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "R.Livoberezhna": {
    "name": "Лівобережна",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Гідропарк",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Гідропарк",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Дарниця",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Дарниця",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "R.Nyvky": {
    "name": "Нивки",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Берестейська",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Берестейська",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      },
      {
        "dir": "попередня Святошин",
        "exit": "",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Святошин",
        "exit": "",
        "wagon": "5",
        "doors": "4"
      }
    ]
  },
  "R.Politekhnychnyi_instytut": {
    "name": "Політехнічний інститут",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Вокзальна",
        "exit": "",
        "wagon": "4",
        "doors": "1-2"
      },
      {
        "dir": "попередня Шулявська",
        "exit": "",
        "wagon": "2",
        "doors": "4"
      }
    ]
  },
  "R.Shuliavska": {
    "name": "Шулявська",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Політехнічний інститут",
        "exit": "",
        "wagon": "3",
        "doors": "1"
      },
      {
        "dir": "попередня Берестейська",
        "exit": "",
        "wagon": "3",
        "doors": "4"
      }
    ]
  },
  "R.Sviatoshyn": {
    "name": "Святошин",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Нивки",
        "exit": "до електричок",
        "wagon": "1",
        "doors": "1"
      },
      {
        "dir": "попередня Нивки",
        "exit": "у місто",
        "wagon": "5",
        "doors": "3"
      },
      {
        "dir": "попередня Житомирська",
        "exit": "до електричок",
        "wagon": "5",
        "doors": "3-4"
      },
      {
        "dir": "попередня Житомирська",
        "exit": "у місто",
        "wagon": "1",
        "doors": "1"
      }
    ]
  },
  "R.Teatralna": {
    "name": "Театральна",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Хрещатик",
        "exit": "пересадка на 🟩 Золоті ворота 🟩",
        "wagon": "2",
        "doors": "1"
      },
      {
        "dir": "попередня Хрещатик",
        "exit": "пересадка на 🟩 Золоті ворота 🟩",
        "wagon": "3",
        "doors": "1"
      },
      {
        "dir": "попередня Хрещатик",
        "exit": "вихід в місто",
        "wagon": "4",
        "doors": "2"
      },
      {
        "dir": "попередня Університет",
        "exit": "пересадка на 🟩 Золоті ворота 🟩",
        "wagon": "4",
        "doors": "1-2"
      },
      {
        "dir": "попередня Університет",
        "exit": "вихід в місто",
        "wagon": "1",
        "doors": "4"
      }
    ]
  },
  "R.Universytet": {
    "name": "Університет",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Театральна",
        "exit": "",
        "wagon": "4",
        "doors": "2"
      },
      {
        "dir": "попередня Вокзальна",
        "exit": "",
        "wagon": "2",
        "doors": "2-3"
      }
    ]
  },
  "R.Vokzalna": {
    "name": "Вокзальна",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Університет",
        "exit": "",
        "wagon": "2",
        "doors": "3"
      },
      {
        "dir": "попередня Політехнічний інститут",
        "exit": "",
        "wagon": "4",
        "doors": "1"
      }
    ]
  },
  "R.Zhytomyrska": {
    "name": "Житомирська",
    "line": "red",
    "positions": [
      {
        "dir": "попередня Святошин",
        "exit": "",
        "wagon": "1",
        "doors": "2"
      },
      {
        "dir": "попередня Академмістечко",
        "exit": "",
        "wagon": "5",
        "doors": "3"
      }
    ]
  }
};
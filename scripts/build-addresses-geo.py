#!/usr/bin/env python3
"""Координати будинків для кнопки «Поточне місцезнаходження» (public/addresses-geo.json).

У public/addresses.json немає координат, лише найближчі станції. Цей скрипт бере
адреси з OSM (вузли й контури будівель з addr:street + addr:housenumber), зіставляє
їх з вулицями й будинками addresses.json і записує координати тих, що збіглися.
Назва й номер — як в addresses.json, щоб пошук знайшов саме цю адресу.

Запуск (див. .github/workflows/addresses-geo.yml):
  python3 scripts/build-addresses-geo.py kyiv.osm.pbf public/stations.json \\
      public/addresses.json public/addresses-geo.json

Формат виходу (schema 1):
  {
    "schema": 1, "version": 20261107, "source": "...",
    "streets": [назва, ...],
    "points":  "s номер dx y|s номер dx y|..."
  }
  s — індекс у streets; x, y — метри від точки (30.5° сх. д., 50.45° пн. ш.),
  x на схід, y на північ (як xy() у build-addresses.py). Точки відсортовані за x,
  dx — різниця з x попередньої точки (перша — від 0).
"""
import importlib.util
import json
import math
import os
import sys
import time
from collections import defaultdict

import osmium

_spec = importlib.util.spec_from_file_location(
    'build_addresses', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build-addresses.py'))
ba = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ba)

# Адреса OSM далі за це від найближчого виходу з тих, що addresses.json дає
# цьому будинку, плюс запас — це інший будинок з такою самою назвою вулиці
MAX_EXTRA_M = 300


class Addresses(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.addr = {}          # (вулиця, будинок) → [sum_x, sum_y, n]

    def _add(self, tags, x, y):
        street, house = tags.get('addr:street'), tags.get('addr:housenumber')
        if not street or not house:
            return
        for h in house.replace(';', ',').split(','):
            h = h.strip()
            if h:
                a = self.addr.setdefault((street.strip(), h), [0.0, 0.0, 0])
                a[0] += x
                a[1] += y
                a[2] += 1

    def node(self, n):
        if 'addr:housenumber' in n.tags:
            self._add(n.tags, *ba.xy(n.location.lon, n.location.lat))

    def way(self, w):
        if 'addr:housenumber' not in w.tags:
            return
        pts = [ba.xy(n.lon, n.lat) for n in w.nodes if n.location.valid()]
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts = pts[:-1]
        if pts:
            self._add(w.tags, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def main(pbf, stations_path, addresses_path, out_path):
    t0 = time.time()
    h = Addresses()
    h.apply_file(pbf, locations=True, idx='flex_mem')
    print(f'OSM: {len(h.addr)} адрес ({time.time()-t0:.0f} с)')

    exits_xy = {(slug, num): (x, y) for slug, num, x, y in ba.load_exits(stations_path)}
    data = json.load(open(addresses_path, encoding='utf-8'))
    exit_xy = [exits_xy.get((slug, num)) for slug, num in data['exits']]

    # (тип, слова) → [(індекс вулиці, {ключ будинку: (номер, [(x, y, м), ...])})]
    by_key = defaultdict(list)
    for si, (name, _district, raw_houses, _parts, *alias) in enumerate(data['streets']):
        if not raw_houses:
            continue
        houses = {}
        for entry in raw_houses.split('|'):
            p = entry.split(' ')
            near = []
            for i in range(1, len(p) - 1, 2):
                c = exit_xy[int(p[i])]
                if c:
                    near.append((c[0], c[1], int(p[i + 1]) * 10))
            houses[ba.house_key(p[0])] = (p[0], near)
        keys = {ba.name_key(name)}
        if alias:
            keys.add(ba.name_key(alias[0]))
        for k in keys:
            by_key[k].append((si, houses))

    found = {}                 # (індекс вулиці, номер) → (x, y)
    no_street = no_house = too_far = 0
    for (street, house), (sx, sy, n) in h.addr.items():
        cands = by_key.get(ba.name_key(street))
        if not cands:
            no_street += 1
            continue
        hk = ba.house_key(house)
        x, y = sx / n, sy / n
        best = None
        for si, houses in cands:
            hit = houses.get(hk)
            if not hit:
                continue
            num, near = hit
            # Пряма відстань до виходу не більша за пішохідну: так відсіюємо
            # однойменну вулицю в іншому кінці міста
            excess = min((math.hypot(ex - x, ey - y) - m for ex, ey, m in near), default=0)
            if best is None or excess < best[0]:
                best = (excess, si, num)
        if best is None:
            no_house += 1
            continue
        if best[0] > MAX_EXTRA_M:
            too_far += 1
            continue
        found.setdefault((best[1], best[2]), (x, y))

    print(f'збіглося {len(found)}; вулиці немає в addresses.json: {no_street}, '
          f'будинку немає: {no_house}, далеко від своїх станцій: {too_far}')

    used = sorted({si for si, _ in found})
    remap = {si: i for i, si in enumerate(used)}
    rows = sorted(((round(x), round(y), remap[si], num) for (si, num), (x, y) in found.items()))
    parts, prev = [], 0
    for x, y, s, num in rows:
        parts.append(f'{s} {num} {x - prev} {y}')
        prev = x

    out = {
        'schema': 1,
        'version': int(time.strftime('%Y%m%d')),
        'source': 'Координати будинків: © OpenStreetMap contributors',
        'streets': [data['streets'][si][0] for si in used],
        'points': '|'.join(parts),
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    total = sum(len(r[2].split('|')) for r in data['streets'] if r[2])
    print(f'записано {out_path}: {len(rows)} будинків з {total} ({100 * len(rows) / total:.0f}%), '
          f'{len(used)} вулиць ({time.time()-t0:.0f} с)')


if __name__ == '__main__':
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main(*sys.argv[1:])

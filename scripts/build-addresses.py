#!/usr/bin/env python3
"""Адреса → найближчі станції метро пішки (public/addresses.json).

Бере вирізку OSM по межі Києва (.osm.pbf), будує пішохідний граф (усі дороги
й доріжки, крім автомагістралей і заборонених для пішоходів), прив'язує до
нього виходи метро з public/stations.json і будинки з адресою, і для кожного
будинку зберігає 3 найближчі станції за пішохідною відстанню (з номером
найближчого виходу).

Запуск (див. .github/workflows/addresses.yml):
  python3 scripts/build-addresses.py kyiv.osm.pbf public/stations.json public/addresses.json

Формат виходу:
  {
    "schema": 1, "version": 20261016,
    "exits":   [["R.Akademmistechko", "1"], ...],       # індекс → станція, номер виходу
    "streets": [["вулиця Хрещатик", "22 12 35 14 80 3 95|24 ..."], ...]
  }
  Рядок вулиці — будинки через «|»: номер будинку, далі пари
  «індекс виходу, відстань у десятках метрів» для 1–3 станцій.
"""
import json
import math
import sys
import time
from collections import defaultdict

import numpy as np
import osmium
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

LAT0 = 50.45
M_PER_DEG_LAT = 111_320.0
M_PER_DEG_LON = 111_320.0 * math.cos(math.radians(LAT0))

TOP_N = 3
# Будинок далі за це від найближчої пішохідної точки — помилка прив'язки, пропускаємо
MAX_SNAP_M = 400

NO_WALK_HIGHWAY = {
    'motorway', 'motorway_link', 'construction', 'proposed', 'raceway',
    'bus_guideway', 'abandoned', 'razed', 'disused', 'escape', 'busway',
}
NO_ACCESS = {'no', 'private'}
YES_FOOT = {'yes', 'designated', 'permissive', 'destination'}


def xy(lon, lat):
    return ((lon - 30.5) * M_PER_DEG_LON, (lat - LAT0) * M_PER_DEG_LAT)


def walkable(tags):
    hw = tags.get('highway')
    if not hw or hw in NO_WALK_HIGHWAY:
        return False
    if tags.get('area') == 'yes' and hw not in ('pedestrian', 'footway'):
        return False
    foot = tags.get('foot')
    if foot in NO_ACCESS:
        return False
    if tags.get('access') in NO_ACCESS and foot not in YES_FOOT:
        return False
    return True


def norm_house(h):
    return ' '.join(h.strip().lower().replace(' ', '').split())


class Collector(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.node_idx = {}          # osm id → індекс вузла графа
        self.node_xy = []
        self.edges_u, self.edges_v, self.edges_w = [], [], []
        self.addr = {}              # (вулиця, будинок) → [sum_x, sum_y, n]

    def _nid(self, n):
        i = self.node_idx.get(n.ref)
        if i is None:
            i = len(self.node_xy)
            self.node_idx[n.ref] = i
            self.node_xy.append(xy(n.lon, n.lat))
        return i

    def _add_addr(self, tags, x, y):
        street = tags.get('addr:street')
        house = tags.get('addr:housenumber')
        if not street or not house:
            return
        for h in house.replace(';', ',').split(','):
            h = norm_house(h)
            if not h:
                continue
            a = self.addr.setdefault((street.strip(), h), [0.0, 0.0, 0])
            a[0] += x
            a[1] += y
            a[2] += 1

    def node(self, n):
        if 'addr:housenumber' in n.tags:
            self._add_addr(n.tags, *xy(n.location.lon, n.location.lat))

    def way(self, w):
        tags = w.tags
        if walkable(tags):
            prev = None
            for n in w.nodes:
                if not n.location.valid():
                    prev = None
                    continue
                i = self._nid(n)
                if prev is not None and prev != i:
                    (x1, y1), (x2, y2) = self.node_xy[prev], self.node_xy[i]
                    self.edges_u.append(prev)
                    self.edges_v.append(i)
                    self.edges_w.append(math.hypot(x2 - x1, y2 - y1))
                prev = i
        if 'addr:housenumber' in tags:
            pts = [xy(n.lon, n.lat) for n in w.nodes if n.location.valid()]
            if len(pts) > 1 and pts[0] == pts[-1]:
                pts = pts[:-1]
            if pts:
                self._add_addr(tags, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def load_exits(stations_path):
    data = json.load(open(stations_path, encoding='utf-8'))
    exits = []                  # (slug, num, x, y)
    for st in data['stations']:
        seen = set()
        for item in (st.get('exits_catalog') or {}).values():
            for e in item.get('exit_numbers') or []:
                c = e.get('coordinates')
                num = str(e.get('num', ''))
                if not c or (num in seen):
                    continue
                seen.add(num)
                exits.append((st['slug'], num, *xy(c[0], c[1])))
    return exits


def main(pbf, stations_path, out_path):
    t0 = time.time()
    h = Collector()
    h.apply_file(pbf, locations=True, idx='flex_mem')
    n_nodes = len(h.node_xy)
    print(f'граф: {n_nodes} вузлів, {len(h.edges_u)} ребер, адрес: {len(h.addr)} ({time.time()-t0:.0f} с)')

    node_xy = np.array(h.node_xy)
    # Прив'язуємо лише до найбільшої зв'язної частини мережі: окремі шматки
    # (доріжка у дворі без з'єднань) дали б «немає маршруту»
    base = coo_matrix((h.edges_w, (h.edges_u, h.edges_v)), shape=(n_nodes, n_nodes))
    _, labels = connected_components(base, directed=False)
    main_ids = np.flatnonzero(labels == np.bincount(labels).argmax())
    print(f'головна мережа: {len(main_ids)} з {n_nodes} вузлів')
    _tree = cKDTree(node_xy[main_ids])

    class _Tree:
        @staticmethod
        def query(pts):
            d, i = _tree.query(pts)
            return d, main_ids[i]
    tree = _Tree()

    exits = load_exits(stations_path)
    ex_xy = np.array([(e[2], e[3]) for e in exits])
    ex_d, ex_node = tree.query(ex_xy)
    print(f'виходів: {len(exits)}, прив\'язка: медіана {np.median(ex_d):.0f} м, макс {ex_d.max():.0f} м')

    # Віртуальний вузол на кожен вихід, з'єднаний із найближчою точкою графа
    n_total = n_nodes + len(exits)
    virt = np.arange(n_nodes, n_total)
    u = np.concatenate([h.edges_u, virt])
    v = np.concatenate([h.edges_v, ex_node])
    w = np.concatenate([h.edges_w, ex_d + 0.01])
    graph = coo_matrix((w, (u, v)), shape=(n_total, n_total)).tocsr()

    keys = list(h.addr.keys())
    a_xy = np.array([(s[0] / s[2], s[1] / s[2]) for s in (h.addr[k] for k in keys)])
    a_d, a_node = tree.query(a_xy)
    ok = a_d <= MAX_SNAP_M
    print(f'адреси прив\'язано: {ok.sum()} з {len(keys)}; медіана {np.median(a_d):.0f} м')

    by_station = defaultdict(list)
    for i, e in enumerate(exits):
        by_station[e[0]].append(n_nodes + i)
    slugs = list(by_station)

    dist = np.full((len(keys), len(slugs)), np.inf, dtype=np.float32)
    best_exit = np.zeros((len(keys), len(slugs)), dtype=np.int32)
    for j, slug in enumerate(slugs):
        d, _, src = dijkstra(graph, directed=False, indices=by_station[slug],
                             min_only=True, return_predecessors=True)
        dist[:, j] = d[a_node] + a_d
        best_exit[:, j] = src[a_node] - n_nodes
    print(f'дейкстра по {len(slugs)} станціях ({time.time()-t0:.0f} с)')

    streets = defaultdict(list)
    unreachable = 0
    for i, (street, house) in enumerate(keys):
        if not ok[i]:
            continue
        order = np.argsort(dist[i])[:TOP_N]
        parts = [house.replace(' ', '')]
        for j in order:
            if not np.isfinite(dist[i, j]):
                continue
            parts += [str(int(best_exit[i, j])), str(int(round(dist[i, j] / 10)))]
        if len(parts) == 1:
            unreachable += 1
            continue
        streets[street].append(' '.join(parts))
    print(f'без маршруту до метро: {unreachable}')

    out = {
        'schema': 1,
        'version': int(time.strftime('%Y%m%d')),
        'exits': [[e[0], e[1]] for e in exits],
        'streets': [[s, '|'.join(sorted(hs, key=_house_key))] for s, hs in sorted(streets.items())],
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    total = sum(len(hs) for hs in streets.values())
    print(f'записано {out_path}: {len(streets)} вулиць, {total} будинків ({time.time()-t0:.0f} с)')


def _house_key(entry):
    house = entry.split(' ', 1)[0]
    digits = ''
    for ch in house:
        if not ch.isdigit():
            break
        digits += ch
    return (int(digits[:6]) if digits else 0, house)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])

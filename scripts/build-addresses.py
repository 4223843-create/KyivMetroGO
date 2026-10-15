#!/usr/bin/env python3
"""Адреса → найближчі станції метро пішки (public/addresses.json).

Адреси й лінії вулиць — з міського ГІС Києва (KYIV_API/Адреси: шар 0 «Повна
адреса», шар 1 «Вулиці»). Пішохідна мережа — з OSM (.osm.pbf, вирізка по межі
Києва): усі дороги й доріжки, крім автомагістралей і заборонених для пішоходів.
Виходи метро — з public/stations.json.

Для кожного будинку — 3 найближчі станції за пішохідним маршрутом (з номером
найближчого виходу). Для кожної вулиці — станції, найближчі до різних її частин
(за будинками; якщо будинків немає — за лінією вулиці з міського ГІС).

Запуск (див. .github/workflows/addresses.yml):
  python3 scripts/build-addresses.py kyiv.osm.pbf public/stations.json \\
      city-addresses.json city-streets.json public/addresses.json

Формат виходу (schema 2):
  {
    "schema": 2, "version": 20261016, "source": "...",
    "exits":   [["R.Akademmistechko", "1"], ...],   # індекс → станція, номер виходу
    "streets": [[назва, район, будинки, частини], ...]
  }
  будинки — через «|»: «номер e1 d1 e2 d2 e3 d3» (e — індекс виходу,
            d — відстань у десятках метрів), відсортовані за номером;
  частини — через «|»: «e d перший_будинок останній_будинок» (або лише «e d»,
            якщо будинків немає), у порядку вздовж вулиці.
"""
import json
import math
import re
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
MAX_PARTS = 5              # станцій на вулицю без номера
LINE_STEP_M = 40           # крок точок уздовж лінії вулиці
# Точка далі за це від найближчої пішохідної точки — помилка прив'язки, пропускаємо
MAX_SNAP_M = 400

NO_WALK_HIGHWAY = {
    'motorway', 'motorway_link', 'construction', 'proposed', 'raceway',
    'bus_guideway', 'abandoned', 'razed', 'disused', 'escape', 'busway',
}
NO_ACCESS = {'no', 'private'}
YES_FOOT = {'yes', 'designated', 'permissive', 'destination'}

# Типи вулиць — для зіставлення назв ГІС («Бажана Миколи», проспект) з OSM
# («проспект Миколи Бажана»), де порядок слів інший
STREET_TYPES = {
    'вулиця', 'провулок', 'проспект', 'бульвар', 'шосе', 'набережна', 'узвіз',
    'дорога', 'площа', 'проїзд', 'лінія', 'тупик', 'алея', 'майдан', 'острів',
    'сквер', 'парк', 'шлях', 'урочище', 'просіка', 'квартал',
}


def xy(lon, lat):
    return ((lon - 30.5) * M_PER_DEG_LON, (lat - LAT0) * M_PER_DEG_LAT)


def name_key(name, street_type=''):
    s = f'{street_type} {name}'.lower()
    s = re.sub(r"[''`ʼ’]", '', s)
    s = re.sub(r'[^\w\s-]', ' ', s)
    words = [w for w in re.split(r'[\s-]+', s) if w]
    kind = next((w for w in words if w in STREET_TYPES), '')
    return kind, frozenset(w for w in words if w not in STREET_TYPES)


def house_lead(h):
    m = re.match(r'\d+', h)
    return int(m.group()) if m else 0


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


class Collector(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.node_idx = {}          # osm id → індекс вузла графа
        self.node_xy = []
        self.edges_u, self.edges_v, self.edges_w = [], [], []
        self.osm_names = {}         # (тип, слова) → назва в OSM

    def _nid(self, n):
        i = self.node_idx.get(n.ref)
        if i is None:
            i = len(self.node_xy)
            self.node_idx[n.ref] = i
            self.node_xy.append(xy(n.lon, n.lat))
        return i

    def way(self, w):
        tags = w.tags
        if not walkable(tags):
            return
        name = tags.get('name')
        if name:
            self.osm_names.setdefault(name_key(name), name)
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


def load_city(addr_path, streets_path):
    """Вулиці з ГІС: код → {name, type, district, houses: {номер: (x, y)}, line: [(x, y)]}."""
    streets = {}

    def street(code, name, kind):
        s = streets.get(code)
        if s is None:
            s = streets[code] = {'name': ' '.join(name.split()), 'type': (kind or '').strip(),
                                 'district': '', 'houses': {}, 'line': []}
        return s

    feats = json.load(open(addr_path, encoding='utf-8'))['features']
    # Шар вулиць має лише код типу (101, 108…) — назви типів беремо з адрес
    type_names = {}
    for f in feats:
        a = f['attributes']
        if a.get('codetype') and a.get('type_vul'):
            type_names.setdefault(a['codetype'], a['type_vul'].strip())
    best = {}                   # (код, номер) → стан адреси (755 — чинна, беремо її)
    for f in feats:
        a, g = f['attributes'], f.get('geometry')
        house = (a.get('addrnumb1') or '').strip()
        code, name = a.get('strcodeobj'), (a.get('ukrnamef') or '').strip()
        if not house or not code or not name or not g:
            continue
        s = street(code, name, a.get('type_vul'))
        district = (a.get('district1') or a.get('full_addr_short') or '').split(',')[0]
        if district and not s['district']:
            s['district'] = district.replace(' район', '').strip()
        key = (code, house)
        if key in best and best[key] == 755:
            continue
        best[key] = a.get('addrcond')
        s['houses'][house] = xy(g['x'], g['y'])

    for f in json.load(open(streets_path, encoding='utf-8'))['features']:
        a, g = f['attributes'], f.get('geometry')
        code, name = a.get('strcodeobj'), (a.get('ukrnamef') or '').strip()
        if not code or not name or not g:
            continue
        s = streets.get(code)
        if s is None:
            s = street(code, name, type_names.get(a.get('codetype'), ''))
            s['district'] = (a.get('districts') or '').split(',')[0].strip()
        for path in g.get('paths', []):
            pts = [xy(p[0], p[1]) for p in path]
            for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
                n = max(1, int(math.hypot(x2 - x1, y2 - y1) // LINE_STEP_M))
                s['line'] += [(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n) for k in range(n)]
            if pts:
                s['line'].append(pts[-1])
    return streets


def display_name(s, osm_names):
    """Назва, як її пишуть люди: з OSM («проспект Миколи Бажана»), інакше з ГІС."""
    kind, words = name_key(s['name'], s['type'])
    osm = osm_names.get((kind, words))
    if osm:
        return osm
    return f"{s['type']} {s['name']}".strip()


def main(pbf, stations_path, addr_path, streets_path, out_path):
    t0 = time.time()
    h = Collector()
    h.apply_file(pbf, locations=True, idx='flex_mem')
    n_nodes = len(h.node_xy)
    print(f'граф: {n_nodes} вузлів, {len(h.edges_u)} ребер ({time.time()-t0:.0f} с)')

    node_xy = np.array(h.node_xy)
    # Прив'язуємо лише до найбільшої зв'язної частини мережі: окремі шматки
    # (доріжка у дворі без з'єднань) дали б «немає маршруту»
    base = coo_matrix((h.edges_w, (h.edges_u, h.edges_v)), shape=(n_nodes, n_nodes))
    _, labels = connected_components(base, directed=False)
    main_ids = np.flatnonzero(labels == np.bincount(labels).argmax())
    print(f'головна мережа: {len(main_ids)} з {n_nodes} вузлів')
    tree = cKDTree(node_xy[main_ids])

    def snap(pts):
        d, i = tree.query(np.asarray(pts, dtype=float).reshape(-1, 2))
        return d, main_ids[i]

    exits = load_exits(stations_path)
    ex_d, ex_node = snap([(e[2], e[3]) for e in exits])
    print(f'виходів: {len(exits)}, прив\'язка: медіана {np.median(ex_d):.0f} м, макс {ex_d.max():.0f} м')

    streets = load_city(addr_path, streets_path)
    n_houses = sum(len(s['houses']) for s in streets.values())
    print(f'ГІС: {len(streets)} вулиць, {n_houses} будинків')

    # Усі точки, до яких рахуємо відстані: будинки й точки ліній вулиць без будинків
    points, owners = [], []      # owners: (код, номер будинку або None)
    for code, s in streets.items():
        if s['houses']:
            for house, p in s['houses'].items():
                points.append(p)
                owners.append((code, house))
        else:
            for p in s['line']:
                points.append(p)
                owners.append((code, None))
    p_d, p_node = snap(points)
    ok = p_d <= MAX_SNAP_M
    print(f'точок: {len(points)}, прив\'язано {ok.sum()}; медіана {np.median(p_d):.0f} м')

    # Віртуальний вузол на кожен вихід, з'єднаний із найближчою точкою графа
    n_total = n_nodes + len(exits)
    virt = np.arange(n_nodes, n_total)
    graph = coo_matrix((np.concatenate([h.edges_w, ex_d + 0.01]),
                        (np.concatenate([h.edges_u, virt]), np.concatenate([h.edges_v, ex_node]))),
                       shape=(n_total, n_total)).tocsr()

    by_station = defaultdict(list)
    for i, e in enumerate(exits):
        by_station[e[0]].append(n_nodes + i)
    slugs = list(by_station)

    dist = np.full((len(points), len(slugs)), np.inf, dtype=np.float32)
    best_exit = np.zeros((len(points), len(slugs)), dtype=np.int32)
    for j, slug in enumerate(slugs):
        d, _, src = dijkstra(graph, directed=False, indices=by_station[slug],
                             min_only=True, return_predecessors=True)
        dist[:, j] = d[p_node] + p_d
        best_exit[:, j] = src[p_node] - n_nodes
    print(f'дейкстра по {len(slugs)} станціях ({time.time()-t0:.0f} с)')

    def near(i, n=TOP_N):
        out = []
        for j in np.argsort(dist[i])[:n]:
            if np.isfinite(dist[i, j]):
                out.append((int(j), int(best_exit[i, j]), int(round(dist[i, j] / 10))))
        return out

    # Групуємо результати по вулицях
    rows = defaultdict(list)
    for i, (code, house) in enumerate(owners):
        if ok[i]:
            rows[code].append((house, i))

    names = {code: display_name(s, h.osm_names) for code, s in streets.items()}
    osm_hits = sum(1 for c, s in streets.items() if names[c] != f"{s['type']} {s['name']}".strip())
    print(f'назви з OSM: {osm_hits} з {len(streets)}')

    out_streets = []
    for code, items in rows.items():
        s = streets[code]
        houses, parts = [], []
        if s['houses']:
            items.sort(key=lambda t: (house_lead(t[0]), t[0]))
            per_station = {}     # станція → [вихід, мін. відстань, перший, останній, к-сть]
            order = []
            for house, i in items:
                nn = near(i)
                if not nn:
                    continue
                houses.append(' '.join([house.replace(' ', '')] + [f'{e} {d}' for _, e, d in nn]))
                j, e, d = nn[0]
                ps = per_station.get(j)
                if ps is None:
                    ps = per_station[j] = [e, d, house, house, 0]
                    order.append(j)
                if d < ps[1]:
                    ps[0], ps[1] = e, d
                ps[3] = house
                ps[4] += 1
            keep = sorted(order, key=lambda j: -per_station[j][4])[:MAX_PARTS]
            for j in order:
                if j in keep:
                    e, d, first, last, _ = per_station[j]
                    parts.append(f'{e} {d} {first.replace(" ", "")} {last.replace(" ", "")}')
        else:
            best = {}            # станція → (відстань, вихід)
            for _, i in items:
                for j, e, d in near(i, 1):
                    if j not in best or d < best[j][0]:
                        best[j] = (d, e)
            for j, (d, e) in sorted(best.items(), key=lambda t: t[1][0])[:MAX_PARTS]:
                parts.append(f'{e} {d}')
        if houses or parts:
            out_streets.append([names[code], s['district'], '|'.join(houses), '|'.join(parts)])

    out_streets.sort(key=lambda r: (r[0], r[1]))
    out = {
        'schema': 2,
        'version': int(time.strftime('%Y%m%d')),
        'source': 'Адреси: ГІС Києва (KYIV_API/Адреси). Пішохідна мережа: © OpenStreetMap contributors',
        'exits': [[e[0], e[1]] for e in exits],
        'streets': out_streets,
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    total = sum(r[2].count('|') + 1 for r in out_streets if r[2])
    print(f'записано {out_path}: {len(out_streets)} вулиць, {total} будинків ({time.time()-t0:.0f} с)')


if __name__ == '__main__':
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    main(*sys.argv[1:])

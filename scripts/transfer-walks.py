"""Пішохідна відстань від виходів метро до пересадок (кільцева електричка, фунікулер).

Пішохідна мережа — OSM, та сама, що й для адрес (walkable() з build-addresses.py).
Цілі — платформи й станції залізниці/фунікулера з OSM у радіусі SEARCH_M від виходів.
Скрипт нічого не змінює: друкує таблицю кандидатів «пряма / пішки» для перевірки.

    python scripts/transfer-walks.py kyiv.osm.pbf public/stations.json
"""
import importlib.util
import json
import math
import sys
from pathlib import Path

import numpy as np
import osmium
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

_spec = importlib.util.spec_from_file_location('ba', Path(__file__).with_name('build-addresses.py'))
ba = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ba)
xy = ba.xy

SEARCH_M = 700


def is_target(tags):
    """Платформа / станція наземної залізниці чи фунікулера (не метро)."""
    rw = tags.get('railway')
    pt = tags.get('public_transport')
    if rw not in ('platform', 'station', 'halt', 'stop') and pt not in ('platform', 'station'):
        return False
    if tags.get('station') == 'subway' or tags.get('subway') == 'yes':
        return False
    if pt and not rw and not (tags.get('train') == 'yes' or tags.get('funicular') == 'yes'):
        return False
    if any(tags.get(k) == 'yes' for k in ('bus', 'tram', 'trolleybus', 'share_taxi')):
        return False
    return True


class Collector(ba.Collector):
    def __init__(self):
        super().__init__()
        self.targets = []           # (опис, [(x, y)], [osm id вузлів])

    def _target(self, kind, obj, pts, refs):
        t = obj.tags
        desc = ' '.join(f'{k}={t[k]}' for k in ('name', 'railway', 'public_transport', 'highway', 'station',
                                                  'train', 'funicular', 'layer', 'level') if k in t)
        self.targets.append((f'{kind}{obj.id} {desc}', pts, refs))

    def node(self, n):
        super().node(n)
        if is_target(n.tags):
            self._target('n', n, [xy(n.location.lon, n.location.lat)], [n.id])

    def way(self, w):
        super().way(w)
        if is_target(w.tags):
            nodes = [n for n in w.nodes if n.location.valid()]
            if nodes:
                self._target('w', w, [xy(n.lon, n.lat) for n in nodes], [n.ref for n in nodes])


def lonlat(p):
    return [round(p[0] / ba.M_PER_DEG_LON + 30.5, 6), round(p[1] / ba.M_PER_DEG_LAT + ba.LAT0, 6)]


def main(pbf, stations_path):
    h = Collector()
    h.apply_file(pbf, locations=True, idx='flex_mem')
    n_nodes = len(h.node_xy)
    node_xy = np.array(h.node_xy)
    base = coo_matrix((h.edges_w, (h.edges_u, h.edges_v)), shape=(n_nodes, n_nodes)).tocsr()
    _, labels = connected_components(base, directed=False)
    big = labels == np.bincount(labels).argmax()
    main_ids = np.flatnonzero(big)
    tree = cKDTree(node_xy[main_ids])
    print(f'граф: {n_nodes} вузлів, головна мережа {len(main_ids)}; цілей у OSM: {len(h.targets)}')

    features = []
    data = json.load(open(stations_path, encoding='utf-8-sig'))
    for st in data['stations']:
        conns = {k: v for k, v in (st.get('connections') or {}).items() if k in ('city_train', 'funicular')}
        for kind, conn in conns.items():
            exits = {}
            for item in (st.get('exits_catalog') or {}).values():
                for e in item.get('exit_numbers') or []:
                    if e.get('coordinates'):
                        exits.setdefault(str(e['num']), xy(*e['coordinates']))
            use = {n: p for n, p in exits.items() if not conn.get('exits') or n in conn['exits']}
            print(f'\n=== {st["name"]} ({st["slug"]}) · {kind} «{conn.get("name")}» · '
                  f'виходи {",".join(use)} · зараз {conn.get("distance_m")} м')
            if not use:
                print('   немає координат виходів')
                continue
            names = list(use)
            ex_pts = np.array(list(use.values()))
            d_ex, i_ex = tree.query(ex_pts)
            src = main_ids[i_ex]
            print('   прив\'язка виходів до мережі: ' + ', '.join(f'{n} — {d:.0f} м' for n, d in zip(names, d_ex)))
            dist, pred = dijkstra(base, directed=False, indices=src, return_predecessors=True)
            dist = dist + d_ex[:, None]

            rows = []
            for desc, pts, refs in h.targets:
                p = np.array(pts)
                straight = np.min(np.hypot(p[:, None, 0] - ex_pts[None, :, 0], p[:, None, 1] - ex_pts[None, :, 1]))
                if straight > SEARCH_M:
                    continue
                # Справжній вхід на платформу: її вузол, спільний із пішохідною мережею
                acc = [h.node_idx[r] for r in refs if r in h.node_idx and big[h.node_idx[r]]]
                if acc:
                    walk = dist[:, acc]
                    k = np.unravel_index(np.argmin(walk), walk.shape)
                    rows.append((walk[k], straight, k[0], acc[k[1]], 0.0, desc))
                else:
                    d_t, i_t = tree.query(p)
                    walk = dist[:, main_ids[i_t]] + d_t[None, :]
                    k = np.unravel_index(np.argmin(walk), walk.shape)
                    rows.append((walk[k], straight, k[0], main_ids[i_t[k[1]]], d_t[k[1]], desc))
            rows.sort(key=lambda r: (r[4] > 0, r[0]))       # спершу з'єднані з мережею
            for n, (walk, straight, ei, node, snap, desc) in enumerate(rows[:8]):
                how = "з'єднана з тротуаром" if snap == 0 else f'НЕ з\'єднана, прив\'язка {snap:.0f} м'
                print(f'   пішки {walk:6.0f} м · пряма {straight:5.0f} м · вихід {names[ei]:>3} · {how} · {desc}')
                if n == 0:
                    path, v = [], node
                    while v >= 0:
                        path.append(lonlat(node_xy[v]))
                        v = pred[ei, v]
                    path.append(lonlat(ex_pts[ei]))
                    features.append({'type': 'Feature',
                                     'properties': {'station': st['name'], 'exit': names[ei],
                                                    'walk_m': round(float(walk)), 'target': desc},
                                     'geometry': {'type': 'LineString', 'coordinates': path[::-1]}})
    print('\nGEOJSON ' + json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False))


if __name__ == '__main__':
    main(*sys.argv[1:3])

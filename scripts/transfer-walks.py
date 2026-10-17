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
        self.targets = []           # (опис, [(x, y)])

    def _target(self, kind, obj, pts):
        t = obj.tags
        desc = ' '.join(f'{k}={t[k]}' for k in ('name', 'railway', 'public_transport', 'station',
                                                  'train', 'funicular', 'layer', 'level') if k in t)
        self.targets.append((f'{kind}{obj.id} {desc}', pts))

    def node(self, n):
        super().node(n)
        if is_target(n.tags):
            self._target('n', n, [xy(n.location.lon, n.location.lat)])

    def way(self, w):
        super().way(w)
        if is_target(w.tags):
            pts = [xy(n.lon, n.lat) for n in w.nodes if n.location.valid()]
            if pts:
                self._target('w', w, pts)


def main(pbf, stations_path):
    h = Collector()
    h.apply_file(pbf, locations=True, idx='flex_mem')
    n_nodes = len(h.node_xy)
    node_xy = np.array(h.node_xy)
    base = coo_matrix((h.edges_w, (h.edges_u, h.edges_v)), shape=(n_nodes, n_nodes)).tocsr()
    _, labels = connected_components(base, directed=False)
    main_ids = np.flatnonzero(labels == np.bincount(labels).argmax())
    tree = cKDTree(node_xy[main_ids])
    print(f'граф: {n_nodes} вузлів, головна мережа {len(main_ids)}; цілей у OSM: {len(h.targets)}')

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
            ex_pts = np.array(list(use.values()))
            d_ex, i_ex = tree.query(ex_pts)
            src = main_ids[i_ex]
            dist = dijkstra(base, directed=False, indices=src)          # (виходи, вузли)
            dist = dist + d_ex[:, None]

            rows = []
            for desc, pts in h.targets:
                p = np.array(pts)
                straight = np.min(np.hypot(p[:, None, 0] - ex_pts[None, :, 0], p[:, None, 1] - ex_pts[None, :, 1]))
                if straight > SEARCH_M:
                    continue
                d_t, i_t = tree.query(p)
                walk = dist[:, main_ids[i_t]] + d_t[None, :]             # (виходи, точки цілі)
                k = np.unravel_index(np.argmin(walk), walk.shape)
                rows.append((walk[k], straight, list(use)[k[0]], d_t[k[1]], desc))
            for walk, straight, ex, snap, desc in sorted(rows)[:8]:
                print(f'   пішки {walk:6.0f} м · пряма {straight:5.0f} м · вихід {ex:>3} · '
                      f'прив\'язка цілі {snap:4.0f} м · {desc}')


if __name__ == '__main__':
    main(*sys.argv[1:3])

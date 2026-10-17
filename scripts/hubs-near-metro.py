"""Залізничні вокзали й автостанції біля станцій метро: пішохідна відстань по OSM.

Шукає amenity=bus_station та вокзали (building/railway з «вокзал» у назві, building=train_station)
у радіусі SEARCH_M від виходів і рахує маршрут від кожного виходу. Лише друкує звіт.

    python scripts/hubs-near-metro.py kyiv.osm.pbf public/stations.json
"""
import importlib.util
import json
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

SEARCH_M = 800
ENTRANCE_M = 25          # вхід (entrance=*) не далі за це від контуру — вхід цього об'єкта


def hub_kind(tags):
    name = (tags.get('name') or '').lower()
    if tags.get('amenity') == 'bus_station':
        return 'автостанція'
    if 'вокзал' in name and (tags.get('building') or tags.get('railway') or tags.get('public_transport')):
        return 'вокзал'
    if tags.get('building') == 'train_station':
        return 'вокзал'
    return None


class Collector(ba.Collector):
    def __init__(self):
        super().__init__()
        self.hubs = []          # (вид, опис, [(x, y)], [osm id вузлів])
        self.entrances = []     # ((x, y), osm id)

    def _hub(self, kind, obj, pts, refs):
        t = obj.tags
        desc = ' '.join(f'{k}={t[k]}' for k in ('name', 'official_name', 'amenity', 'building', 'railway',
                                                  'public_transport', 'operator') if k in t)
        self.hubs.append((kind, f'{"w" if len(refs) > 1 else "n"}{obj.id} {desc}', pts, refs))

    def node(self, n):
        super().node(n)
        kind = hub_kind(n.tags)
        if kind:
            self._hub(kind, n, [xy(n.location.lon, n.location.lat)], [n.id])
        if 'entrance' in n.tags or n.tags.get('railway') == 'train_station_entrance':
            self.entrances.append((xy(n.location.lon, n.location.lat), n.id))

    def way(self, w):
        super().way(w)
        kind = hub_kind(w.tags)
        if kind:
            nodes = [n for n in w.nodes if n.location.valid()]
            if nodes:
                self._hub(kind, w, [xy(n.lon, n.lat) for n in nodes], [n.ref for n in nodes])


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
    ent_xy = np.array([e[0] for e in h.entrances]) if h.entrances else np.zeros((0, 2))
    ent_tree = cKDTree(ent_xy) if len(ent_xy) else None
    print(f'вокзалів і автостанцій в OSM: {len(h.hubs)}')
    for kind, desc, pts, _ in h.hubs:
        print(f'   {kind}: {desc}')

    def access_nodes(pts, refs):
        """Вузли мережі, через які заходять в об'єкт: входи біля контуру, спільні вузли, інакше прив'язка."""
        acc = []
        if ent_tree is not None:
            for p in pts:
                for i in ent_tree.query_ball_point(p, ENTRANCE_M):
                    ref = h.entrances[i][1]
                    if ref in h.node_idx and big[h.node_idx[ref]]:
                        acc.append((h.node_idx[ref], 0.0, 'вхід'))
        if not acc:
            acc = [(h.node_idx[r], 0.0, 'контур') for r in refs if r in h.node_idx and big[h.node_idx[r]]]
        if not acc:
            d, i = tree.query(np.array(pts))
            k = int(np.argmin(d))
            acc = [(main_ids[i[k]], float(d[k]), f'прив\'язка {d[k]:.0f} м')]
        return acc

    data = json.load(open(stations_path, encoding='utf-8-sig'))
    for st in data['stations']:
        exits = {}
        for item in (st.get('exits_catalog') or {}).values():
            for e in item.get('exit_numbers') or []:
                if e.get('coordinates'):
                    exits.setdefault(str(e['num']), xy(*e['coordinates']))
        if not exits:
            continue
        names = list(exits)
        ex_pts = np.array(list(exits.values()))
        near = []
        for kind, desc, pts, refs in h.hubs:
            p = np.array(pts)
            straight = np.min(np.hypot(p[:, None, 0] - ex_pts[None, :, 0], p[:, None, 1] - ex_pts[None, :, 1]))
            if straight <= SEARCH_M:
                near.append((straight, kind, desc, pts, refs))
        if not near:
            continue
        d_ex, i_ex = tree.query(ex_pts)
        dist = dijkstra(base, directed=False, indices=main_ids[i_ex]) + d_ex[:, None]
        print(f'\n=== {st["name"]} ({st["slug"]})')
        for straight, kind, desc, pts, refs in sorted(near):
            acc = access_nodes(pts, refs)
            best = []
            for ei, ex in enumerate(names):
                w = min(dist[ei, v] + extra for v, extra, _ in acc)
                best.append((w, ex))
            best.sort()
            how = acc[0][2]
            top = ', '.join(f'вихід {ex} — {w:.0f} м' for w, ex in best[:3])
            print(f'   {kind} · пряма {straight:4.0f} м · через {how} · {top} · {desc}')


if __name__ == '__main__':
    main(*sys.argv[1:3])

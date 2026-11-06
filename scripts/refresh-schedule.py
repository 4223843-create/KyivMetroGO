#!/usr/bin/env python3
"""Оновлює розклад метро в public/stations.json з міського ГІС Києва.

Джерело: KyivMetro/FeatureServer, шари
  5 — режим роботи станцій (open_max, close_min, halls_cnt, halls_open)
  6 — перший/останній поїзд по станції й напрямку
  7 — погодинні інтервали по лініях (будні/вихідні × прямий/зворотній)

Чіпає лише stations[].schedule і line_intervals; усе інше (виходи, id,
зв'язки, ручні правки) лишається як є. Якщо щось змінилось — піднімає
version, щоб Android підтягнув нові дані.

Запуск:
  python scripts/refresh-schedule.py                 # завантажити з ГІС
  python scripts/refresh-schedule.py --from-dir DIR  # layer5.json, layer6.json, layer7.json
  --dry-run   нічого не записувати, лише показати зміни
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

STATIONS = os.path.join(os.path.dirname(__file__), '..', 'public', 'stations.json')

SERVERS = [
    'https://gisserver-stage.kyivcity.gov.ua/mayno/rest/services/Transport/KyivMetro/FeatureServer',
    'https://gisserver.kyivcity.gov.ua/mayno/rest/services/Transport/KyivMetro/FeatureServer',
]
UA = 'KyivMetroGO/1.0 (+https://github.com/4223843-create/KyivMetroGO)'

# Лінія в ГІС → ключ у stations.json; «Прямий» напрямок їде до st, «Зворотній» — до rv.
# Назви кінцевих — як у line_intervals і schedule.trains (застосунок шукає їх саме так).
LINES = {
    'Святошинсько-Броварська': ('red', 'Лісова', 'Академмістечко'),
    'Оболонсько-Теремківська': ('blue', 'Теремки', 'Героїв Дніпра'),
    'Сирецько-Печерська': ('green', 'Червоний хутір', 'Сирець'),
}
DIRECTION = {'Прямий': 1, 'Зворотній': 2, 'Зворотний': 2}

# Межі здорового глузду: якщо ГІС віддав менше — це збій, а не зміна розкладу.
MIN_ROWS = {5: 50, 6: 100, 7: 54}


def doh_resolve(host):
    """Адреса через DNS-over-HTTPS — на раннерах GitHub звичайний DNS
    інколи не знаходить *.kyivcity.gov.ua."""
    for url in (f'https://dns.google/resolve?name={host}&type=A',
                f'https://cloudflare-dns.com/dns-query?name={host}&type=A'):
        try:
            req = urllib.request.Request(url, headers={'Accept': 'application/dns-json', 'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                resp = json.load(r)
            ans = [a['data'] for a in resp.get('Answer', []) if a.get('type') == 1]
            if not ans:
                print(f'DoH {url.split("/")[2]}: {host} → Status {resp.get("Status")}, '
                      f'{resp.get("Answer") or resp.get("Authority") or resp.get("Comment")}', file=sys.stderr)
            if ans:
                return ans[0]
        except Exception as e:  # noqa: BLE001
            print(f'DoH {url.split("/")[2]}: {e}', file=sys.stderr)
    return None


def get_json(url, ip=None):
    host = urllib.parse.urlsplit(url).hostname
    cmd = ['curl', '-fsS', '-m', '90', '--retry', '2', '-A', UA, url]
    if ip:
        cmd[1:1] = ['--resolve', f'{host}:443:{ip}']
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode:
        raise RuntimeError(out.stderr.strip() or f'curl {out.returncode}')
    return json.loads(out.stdout)


def fetch_layer(layer):
    last_err = None
    for base in SERVERS:
        host = urllib.parse.urlsplit(base).hostname
        for ip in (None, 'doh'):
            try:
                if ip == 'doh':
                    ip = doh_resolve(host)
                    if not ip:
                        break
                    print(f'{host}: пробую через DoH → {ip}', file=sys.stderr)
                rows, offset = [], 0
                while True:
                    q = urllib.parse.urlencode({
                        'where': '1=1', 'outFields': '*', 'returnGeometry': 'false',
                        'orderByFields': 'objectid', 'resultOffset': offset,
                        'resultRecordCount': 1000, 'f': 'json',
                    })
                    d = get_json(f'{base}/{layer}/query?{q}', ip)
                    if 'error' in d:
                        raise RuntimeError(d['error'])
                    feats = d.get('features', [])
                    rows += [f['attributes'] for f in feats]
                    if not d.get('exceededTransferLimit') or not feats:
                        break
                    offset += len(feats)
                print(f'шар {layer}: {len(rows)} рядків ({host})')
                return rows
            except Exception as e:  # noqa: BLE001 — пробуємо далі
                last_err = e
                print(f'шар {layer}: {host} не відповів: {e}', file=sys.stderr)
                time.sleep(2)
    raise SystemExit(f'шар {layer}: жоден сервер не відповів ({last_err})')


def load_dir(path, layer):
    with open(os.path.join(path, f'layer{layer}.json'), encoding='utf-8-sig') as f:
        d = json.load(f)
    return [f['attributes'] for f in d['features']]


def code_st(code1):
    # «mb01_210» → «210»
    m = re.fullmatch(r'\w+_(\d+)', (code1 or '').strip())
    return m.group(1) if m else None


def hhmm(v):
    v = (v or '').strip()
    m = re.fullmatch(r'(\d{1,2}):(\d{2})(?::\d{2})?', v)
    return f'{int(m.group(1)):02d}:{m.group(2)}' if m else None


def interval(v):
    # «7:30-5:30» / «11:00 -7:30» → [330, 450] у секундах, менше першим
    parts = re.findall(r'(\d{1,2}):(\d{2})', v or '')
    if len(parts) != 2:
        raise SystemExit(f'незрозумілий інтервал: {v!r}')
    secs = sorted(int(a) * 60 + int(b) for a, b in parts)
    return secs


def build(rows5, rows6, rows7):
    for layer, rows in ((5, rows5), (6, rows6), (7, rows7)):
        if len(rows) < MIN_ROWS[layer]:
            raise SystemExit(f'шар {layer}: лише {len(rows)} рядків, очікувалось ≥{MIN_ROWS[layer]}')

    schedule = {}
    for a in rows5:
        c = code_st(a.get('code1'))
        o, cl = hhmm(a.get('open_max')), hhmm(a.get('close_min'))
        if not c or not o or not cl:
            continue
        schedule[c] = {'open': o, 'close': cl, 'halls': a.get('halls_cnt'),
                       'halls_open': a.get('halls_open'), 'trains': {}}

    trains = {}
    for a in rows6:
        c = code_st(a.get('code1'))
        line = LINES.get((a.get('line') or '').strip())
        d = DIRECTION.get((a.get('napryamok') or '').strip())
        first, last = hhmm(a.get('first_trn1')), hhmm(a.get('last_trn1'))
        if not c or not line or not d or not first or not last:
            continue
        trains.setdefault(c, {})[d] = (line[d], {'first': first, 'last': last})
    for c, by_dir in trains.items():
        if c in schedule:
            schedule[c]['trains'] = {name: t for _, (name, t) in sorted(by_dir.items())}

    intervals = {}
    for a in sorted(rows7, key=lambda a: (a.get('line') or '', a.get('timeperiod') or '')):
        line = LINES.get((a.get('line') or '').strip())
        if not line:
            raise SystemExit(f'невідома лінія в шарі 7: {a.get("line")!r}')
        key, st, rv = line
        period = re.findall(r'\d{1,2}:\d{2}', a.get('timeperiod') or '')
        if len(period) != 2:
            raise SystemExit(f'незрозумілий період: {a.get("timeperiod")!r}')
        intervals.setdefault(key, []).append({
            'from': hhmm(period[0]), 'to': hhmm(period[1]),
            'weekday': {st: interval(a.get('st_weekday')), rv: interval(a.get('rv_weekday'))},
            'holiday': {st: interval(a.get('st_holiday')), rv: interval(a.get('rv_holiday'))},
        })
    return schedule, intervals


def apply(data, schedule, intervals):
    changes = []
    for s in data['stations']:
        new = schedule.get(str(s.get('code_st')))
        if new is None:
            print(f'увага: у ГІС немає розкладу для {s["name"]} ({s.get("code_st")}), лишаю як було', file=sys.stderr)
            continue
        old = s.get('schedule')
        if old != new:
            changes.append(describe(s['name'], old or {}, new))
            s['schedule'] = new
    old_iv = data.get('line_intervals', {})
    for key in ('red', 'blue', 'green'):
        if key not in intervals:
            raise SystemExit(f'у шарі 7 немає лінії {key}')
        if old_iv.get(key) != intervals[key]:
            changed = [r['from'] for r, o in zip(intervals[key], old_iv.get(key, []) + [None] * 24) if r != o]
            changes.append(f'інтервали {key}: змінились години {", ".join(changed)}')
    data['line_intervals'] = {k: intervals[k] for k in old_iv if k in intervals} | \
                             {k: v for k, v in intervals.items() if k not in old_iv}
    return changes


def describe(name, old, new):
    bits = []
    for k in ('open', 'close', 'halls', 'halls_open'):
        if old.get(k) != new.get(k):
            bits.append(f'{k} {old.get(k)} → {new.get(k)}')
    if old.get('trains') != new.get('trains'):
        for t in sorted(set(old.get('trains', {})) | set(new.get('trains', {}))):
            o, n = old.get('trains', {}).get(t), new.get('trains', {}).get(t)
            if o != n:
                fmt = lambda x: f'{x["first"]}–{x["last"]}' if x else 'немає'  # noqa: E731
                bits.append(f'поїзди до {t} {fmt(o)} → {fmt(n)}')
    return f'{name}: ' + '; '.join(bits)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from-dir')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--summary', help='куди записати список змін (markdown)')
    args = ap.parse_args()

    if args.from_dir:
        rows = [load_dir(args.from_dir, n) for n in (5, 6, 7)]
    else:
        rows = [fetch_layer(n) for n in (5, 6, 7)]
    schedule, intervals = build(*rows)

    with open(STATIONS, encoding='utf-8', newline='') as f:
        raw = f.read()
    data = json.loads(raw)
    changes = apply(data, schedule, intervals)

    if not changes:
        print('розклад у ГІС не змінився')
    else:
        old_v = str(data['version'])
        today = datetime.date.today().strftime('%Y%m%d')
        data['version'] = str(max(int(today), int(old_v) + 1))
        print(f'змін: {len(changes)}, версія {old_v} → {data["version"]}')
        for c in changes:
            print(' -', c)
        if not args.dry_run:
            out = json.dumps(data, ensure_ascii=False, indent=2).replace('\n', '\r\n') + '\r\n'
            with open(STATIONS, 'w', encoding='utf-8', newline='') as f:
                f.write(out)
    if args.summary:
        with open(args.summary, 'w', encoding='utf-8') as f:
            f.write('\n'.join(f'- {c}' for c in changes) + '\n' if changes else '')


if __name__ == '__main__':
    main()

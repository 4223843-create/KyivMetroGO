"""Дає кожній позиції в public/stations.json постійний id.

id — «<id виходу>-<номер>», унікальний у межах станції. Наявні id не
змінюються; нові позиції отримують наступний вільний номер для свого виходу.
Застосунок прив'язує до id вибране, чекіни, локальні правки й нотатки, тож
id позиції не можна змінювати чи використовувати повторно.

Запуск: python3 scripts/assign-position-ids.py
"""
import json
import re
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / 'public' / 'stations.json'

with open(PATH, encoding='utf-8', newline='') as f:
    raw = f.read()
newline = '\r\n' if '\r\n' in raw else '\n'
data = json.loads(raw)

added = 0
for station in data['stations']:
    positions = [
        (exit_, pos)
        for direction in station.get('directions') or []
        for exit_ in direction.get('exits') or []
        for pos in exit_.get('positions') or []
    ]
    used = {pos['id'] for _, pos in positions if pos.get('id')}
    for exit_, pos in positions:
        if pos.get('id'):
            continue
        prefix = str(exit_.get('id') or 'x')
        n = 1
        while f'{prefix}-{n}' in used:
            n += 1
        # id ставимо першим полем, щоб його було видно в кожній позиції
        new = {'id': f'{prefix}-{n}', **pos}
        pos.clear()
        pos.update(new)
        used.add(new['id'])
        added += 1

text = json.dumps(data, ensure_ascii=False, indent=2).replace('\n', newline)
if raw.endswith(newline):
    text += newline
PATH.write_text(text, encoding='utf-8', newline='')
print(f'Додано id: {added}')

import re
from collections import Counter
from pathlib import Path

chats_dir = Path("./signal_chats")
SYMBOLS = set(".,!?:;\"'«»“”’'–—…-()[]{}/\\<>@#$%^&*+=|`~№₴")

symbol_counts = Counter()
total_symbols = 0

re_urls = re.compile(r'https?://\S+')
re_filepaths = re.compile(r'\S+\.\w{2,4}')
re_emojis = re.compile(r':[a-zA-Z0-9_+-]+:')
re_dates = re.compile(r'\b\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?\b')
re_timestamps = re.compile(r'\b\d{1,2}:\d{2}(:\d{2})?\b')
re_name_headers = re.compile(r'^\s*(\*\*.*?\*\*|\[.*?\])\s*:\s*')
re_uuids = re.compile(r'\b[a-f0-9]{4,}(-[a-f0-9]{4,})+\b', re.IGNORECASE)
re_bullet_dash = re.compile(r'^\s*-\s+')
re_multi_hyphens = re.compile(r'-{2,}')

for file_path in chats_dir.glob("**/*.md"):
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line_str = line.strip()

            # Пропускаємо порожні рядки, заголовки та лінії-розділювачі (наприклад, ---)
            if not line_str or line_str.startswith("#") or line_str.startswith("<"):
                continue
            if set(line_str).issubset({'-', '*', '=', ' '}):
                continue

            # Очищення від артефактів експорту
            line_str = re_urls.sub('', line_str)
            line_str = re_filepaths.sub('', line_str)
            line_str = re_emojis.sub('', line_str)
            line_str = re_dates.sub('', line_str)
            line_str = re_timestamps.sub('', line_str)
            line_str = re_uuids.sub('', line_str)
            line_str = re_name_headers.sub('', line_str)
            line_str = re_bullet_dash.sub('', line_str)
            line_str = re_multi_hyphens.sub('', line_str)

            for char in line_str:
                if char in SYMBOLS:
                    symbol_counts[char] += 1
                    total_symbols += 1

print("\n" + "="*45)
print(f" РЕАЛЬНА СТАТИСТИКА ЗНАКІВ: {total_symbols}")
print("="*45 + "\n")

for char, count in symbol_counts.most_common():
    pct = (count / total_symbols * 100) if total_symbols > 0 else 0
    print(f"Символ '{char}':  {count:>7} шт.   ({pct:>5.2f}%)")

import os
from collections import Counter
from pathlib import Path

chats_dir = Path("./signal_chats")
SYMBOLS = set(".,!?:;\"'«»“”’'–—…-()[]{}/\\<>@#$%^&*+=|`~№₴")

symbol_counts = Counter()
total_symbols = 0

if not chats_dir.exists():
    print("Помилка: папку 'signal_chats' не знайдено!")
    exit()

for file_path in chats_dir.glob("**/*"):
    if file_path.is_file() and file_path.suffix in [".md", ".txt", ".html"]:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
                for char in text:
                    if char in SYMBOLS:
                        symbol_counts[char] += 1
                        total_symbols += 1
        except Exception as e:
            print(f"Помилка зчитування {file_path.name}: {e}")

print("\n" + "="*45)
print(f" ЗАГАЛОМ ЗНАЙДЕНО СИМВОЛІВ: {total_symbols}")
print("="*45 + "\n")

for char, count in symbol_counts.most_common():
    pct = (count / total_symbols * 100) if total_symbols > 0 else 0
    print(f"Символ '{char}':  {count:>7} шт.   ({pct:>5.2f}%)")

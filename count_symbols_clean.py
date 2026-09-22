import re
from collections import Counter
from pathlib import Path

chats_dir = Path("./signal_chats")
SYMBOLS = set(".,!?:;\"'«»“”’'–—…-()[]{}/\\<>@#$%^&*+=|`~№₴")

symbol_counts = Counter()
total_symbols = 0

# Регулярні вирази для видалення синтаксису Markdown, дат та технічних вкладень
re_links = re.compile(r'!?\[.*?\]\(.*?\)')
re_timestamps = re.compile(r'\b\d{2,4}[-/\.]\d{2}[-/\.]\d{2,4}\b|\b\d{1,2}:\d{2}(:\d{2})?\b')
re_md_symbols = re.compile(r'[\*\_~`#>]')

for file_path in chats_dir.glob("**/*.md"):
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line_str = line.strip()

            # Пропускаємо технічні заголовки файлів, HTML-теги та сповіщення про вкладення
            if (line_str.startswith("#") or 
                line_str.startswith("<") or 
                "Attachment" in line_str or 
                "Sticker" in line_str or
                "Original Message" in line_str):
                continue

            # Очищення від Markdown-структури
            cleaned_line = re_links.sub('', line_str)
            cleaned_line = re_timestamps.sub('', cleaned_line)
            cleaned_line = re_md_symbols.sub('', cleaned_line)

            # Підраховуємо знаки тільки в живій мові
            for char in cleaned_line:
                if char in SYMBOLS:
                    symbol_counts[char] += 1
                    total_symbols += 1

print("\n" + "="*45)
print(f" ЗВАЖЕНИЙ ПІДРАХУНОК (БЕЗ ТЕХНІЧНИХ ЗНАКІВ): {total_symbols}")
print("="*45 + "\n")

for char, count in symbol_counts.most_common():
    pct = (count / total_symbols * 100) if total_symbols > 0 else 0
    print(f"Символ '{char}':  {count:>7} шт.   ({pct:>5.2f}%)")

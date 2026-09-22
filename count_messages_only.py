import re
from collections import Counter
from pathlib import Path

chats_dir = Path("./signal_chats")
SYMBOLS = set(".,!?:;\"'«»“”’'–—…-()[]{}/\\<>@#$%^&*+=|`~№₴")

symbol_counts = Counter()
total_symbols = 0

# Регулярний вираз виділяє (1) Ім'я відправника та (2) Чистий текст повідомлення
line_pattern = re.compile(r'^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]\s+([^:]+):\s*(.*)$')
media_pattern = re.compile(r'!?\[.*?\]\(\./media.*?\)')
url_pattern = re.compile(r'https?://\S+')

for file_path in chats_dir.glob("**/*.md"):
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            match = line_pattern.match(line.strip())
            if not match:
                continue

            sender, content = match.group(1).strip(), match.group(2).strip()

            # Якщо потрібно рахувати ТІЛЬКИ ВЛАСНІ повідомлення, розкоментуйте рядок нижче:
            # if sender != "Me": continue

            # Видаляємо медіа-посилання та веб-посилання
            content = media_pattern.sub('', content)
            content = url_pattern.sub('', content)
            content = content.strip()

            if not content:
                continue

            for char in content:
                if char in SYMBOLS:
                    symbol_counts[char] += 1
                    total_symbols += 1

print("\n" + "="*45)
print(f" ПІДРАХУНОК ЗНАКІВ У ЖИВОМУ ТЕКСТІ: {total_symbols}")
print("="*45 + "\n")

for char, count in symbol_counts.most_common():
    pct = (count / total_symbols * 100) if total_symbols > 0 else 0
    print(f"Символ '{char}':  {count:>7} шт.   ({pct:>5.2f}%)")

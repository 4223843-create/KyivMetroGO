import re
from collections import Counter
from pathlib import Path

chats_dir = Path("./signal_chats")
MY_NAME = "Me"

# Твій розширений список знаків + варіації апострофів
USER_SYMBOLS = ",.-«»—ʼ:()\"–?!…№%;•$/§+₴[]€#×°@*©_~{}\\|^'’`"
SYMBOLS = set(USER_SYMBOLS)

symbol_counts = Counter()
total_symbols = 0

line_pattern = re.compile(r'^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]\s+([^:]+):\s*(.*)$')
media_pattern = re.compile(r'!?\[.*?\]\(\./media.*?\)')
url_pattern = re.compile(r'https?://\S+')
re_system = re.compile(
    r'(voice call|video call|call \([^)]+\)|message deleted|safety number|joined signal|attachment|sticker)', 
    re.IGNORECASE
)

for file_path in chats_dir.glob("**/*.md"):
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            match = line_pattern.match(line.strip())
            if not match:
                continue

            sender, content = match.group(1).strip(), match.group(2).strip()

            if sender.lower() != MY_NAME.lower():
                continue

            content = media_pattern.sub('', content)
            content = url_pattern.sub('', content).strip()

            if not content or re_system.search(content):
                continue

            for char in content:
                if char in SYMBOLS:
                    symbol_counts[char] += 1
                    total_symbols += 1

print("\n" + "="*50)
print(f" РЕЗУЛЬТАТ ПІДРАХУНОК РОЗШИРЕНОГО СПИСКУ (ВСЬОГО: {total_symbols})")
print("="*50 + "\n")

for char, count in symbol_counts.most_common():
    pct = (count / total_symbols * 100) if total_symbols > 0 else 0
    print(f"Символ '{char}':  {count:>7} шт.   ({pct:>5.2f}%)")

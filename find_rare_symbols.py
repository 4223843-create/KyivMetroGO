import re
from pathlib import Path

chats_dir = Path("./signal_chats")
MY_NAME = "Me"
TARGET_SYMBOLS = set("{}©€°")

line_pattern = re.compile(r'^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]\s+([^:]+):\s*(.*)$')
media_pattern = re.compile(r'!?\[.*?\]\(\./media.*?\)')
url_pattern = re.compile(r'https?://\S+')

re_system = re.compile(
    r'(voice call|video call|call \([^)]+\)|message deleted|safety number|joined signal|attachment|sticker)', 
    re.IGNORECASE
)

# Фільтр для команд терміналу, бектиків та синтаксису розробки
re_code = re.compile(
    r'(`|npx\s|npm\s|git\s|cd\s|pip\s|python\s|docker\s|curl\s|--\w+|\*\*/\*|\.\{\w+)',
    re.IGNORECASE
)

print("\n" + "="*50)
print(" ЗНАЙДЕНІ ПОВІДОМЛЕННЯ З {}©€° (БЕЗ КОДУ ТА КОМАНД):")
print("="*50 + "\n")

found_count = 0

for file_path in chats_dir.glob("**/*.md"):
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            match = line_pattern.match(line.strip())
            if not match:
                continue

            timestamp, sender, content = match.group(1), match.group(2).strip(), match.group(3).strip()

            if sender.lower() != MY_NAME.lower():
                continue

            content = media_pattern.sub('', content)
            content = url_pattern.sub('', content).strip()

            if not content or re_system.search(content) or re_code.search(content):
                continue

            found_chars = set(content) & TARGET_SYMBOLS
            if found_chars:
                found_count += 1
                symbols_str = ", ".join(sorted(found_chars))
                print(f"[{timestamp}] (Знаки: {symbols_str})")
                print(f"Чат: {file_path.stem}")
                print(f"Текст: {content}")
                print("-" * 50)

if found_count == 0:
    print("Повідомлень із цими символами у звичайному мовленні не знайдено.")

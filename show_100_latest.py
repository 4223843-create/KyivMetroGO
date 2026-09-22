import re
from pathlib import Path

chats_dir = Path("./signal_chats")
MY_NAME = "Me"

line_pattern = re.compile(r'^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]\s+([^:]+):\s*(.*)$')
media_pattern = re.compile(r'!?\[.*?\]\(\./media.*?\)')
url_pattern = re.compile(r'https?://\S+')

re_system = re.compile(
    r'(voice call|video call|call \([^)]+\)|message deleted|safety number|joined signal|attachment|sticker)', 
    re.IGNORECASE
)

re_code = re.compile(
    r'(`|npx\s|npm\s|git\s|cd\s|pip\s|python\s|docker\s|curl\s|--\w+|\*\*/\*|\.\{\w+)',
    re.IGNORECASE
)

all_messages = []

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

            all_messages.append((timestamp, content))

# Сортування за часовим штампом від найстаріших до найновіших
all_messages.sort(key=lambda x: x[0])

# Беремо 100 найостанніших
latest_100 = all_messages[-100:]

print("\n" + "="*60)
print(f" 100 НАЙНОВІШИХ (КРАЙНІХ) ВАШИХ РЕПЛІК:")
print("="*60 + "\n")

for idx, (ts, text) in enumerate(latest_100, 1):
    print(f"{idx:>3}. [{ts}] {text}")

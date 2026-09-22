import re
from pathlib import Path

chats_dir = Path("./signal_chats")
MY_NAME = "Me"
count = 0

line_pattern = re.compile(r'^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]\s+([^:]+):\s*(.*)$')
media_pattern = re.compile(r'!?\[.*?\]\(\./media.*?\)')
url_pattern = re.compile(r'https?://\S+')

print("\n" + "="*45)
print(" ПЕРШІ 15 ВАШИХ РЕПЛІК:")
print("="*45 + "\n")

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

            if not content:
                continue

            count += 1
            print(f"{count:>2}. {content}")

            if count >= 15:
                break
    if count >= 15:
        break

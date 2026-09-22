from pathlib import Path

chats_dir = Path("./signal_chats")
count = 0

for file_path in chats_dir.glob("**/*.md"):
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if ":" in line:
                print(repr(line.strip()))
                count += 1
                if count >= 15:
                    break
    if count >= 15:
        break

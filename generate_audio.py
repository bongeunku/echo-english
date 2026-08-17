#!/usr/bin/env python3
"""Pre-generate natural US neural audio for every practice line."""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent
DATA_JS = ROOT / "data.js"
AUDIO_DIR = ROOT / "audio"

VOICES = [
    "en-US-AvaNeural",
    "en-US-EmmaNeural",
    "en-US-AndrewNeural",
]


def load_topics() -> list[dict]:
    raw = DATA_JS.read_text(encoding="utf-8")
    topics = []
    current = None
    for match in re.finditer(
        r'id:\s*"([^"]+)"|en:\s*"([^"]+)"',
        raw,
    ):
        if match.group(1):
            current = {"id": match.group(1), "lines": []}
            topics.append(current)
        elif current is not None and match.group(2):
            current["lines"].append({"en": match.group(2)})
    if not topics:
        raise SystemExit("Could not parse data.js")
    return topics


async def save_line(text: str, voice: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 2000:
        return
    communicate = edge_tts.Communicate(text, voice=voice, rate="+0%", pitch="+0Hz")
    await communicate.save(str(dest))
    print(f"saved {dest.relative_to(ROOT)}")


async def main() -> None:
    topics = load_topics()
    tasks = []
    for voice in VOICES:
        for topic in topics:
            for index, line in enumerate(topic["lines"]):
                dest = AUDIO_DIR / voice / f"{topic['id']}-{index}.mp3"
                tasks.append(save_line(line["en"], voice, dest))
    # modest concurrency so Microsoft TTS is not overwhelmed
    sem = asyncio.Semaphore(4)

    async def limited(coro):
        async with sem:
            await coro

    await asyncio.gather(*(limited(t) for t in tasks))
    print("done")


if __name__ == "__main__":
    asyncio.run(main())

#!/usr/bin/env python3
"""Generate natural US neural audio for quiz vocabulary."""

from __future__ import annotations

import asyncio
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "audio" / "quiz"
VOICE = "en-US-JennyNeural"

WORDS = [
    "apart",
    "break up",
    "continent",
    "glacier",
    "icy",
    "in the past",
    "join",
    "large",
    "little bit",
    "Pangaea",
    "piece",
    "still",
    "apple",
    "thank you",
]


def slug(word: str) -> str:
    return word.lower().replace(" ", "-").replace("'", "")


async def save(word: str) -> None:
    dest = OUT / f"{slug(word)}.mp3"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"skip {dest.name}")
        return
    communicate = edge_tts.Communicate(word, voice=VOICE, rate="+0%")
    await communicate.save(str(dest))
    print(f"saved {dest.name}")


async def main() -> None:
    for word in WORDS:
        await save(word)
    print("done")


if __name__ == "__main__":
    asyncio.run(main())

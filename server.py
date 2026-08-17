#!/usr/bin/env python3
"""ECHO local server: static files + natural US neural TTS (edge-tts)."""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import edge_tts

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 5173

VOICES = [
    {"id": "en-US-JennyNeural", "label": "Jenny (여성 · 자연스러움)", "gender": "female"},
    {"id": "en-US-AriaNeural", "label": "Aria (여성 · 또렷함)", "gender": "female"},
    {"id": "en-US-SaraNeural", "label": "Sara (여성 · 밝음)", "gender": "female"},
    {"id": "en-US-GuyNeural", "label": "Guy (남성 · 자연스러움)", "gender": "male"},
    {"id": "en-US-DavisNeural", "label": "Davis (남성 · 차분함)", "gender": "male"},
    {"id": "en-US-ChristopherNeural", "label": "Christopher (남성 · 뉴스톤)", "gender": "male"},
]

ALLOWED_VOICES = {v["id"] for v in VOICES}
CACHE_DIR = ROOT / ".tts-cache"
CACHE_DIR.mkdir(exist_ok=True)

RATE_MAP = {
    "0.75": "-25%",
    "0.9": "-10%",
    "1": "+0%",
    "1.1": "+10%",
}


def sanitize_text(text: str) -> str:
    text = unquote(text or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text[:280]


def cache_key(text: str, voice: str, rate: str) -> Path:
    digest = hashlib.sha1(f"{voice}|{rate}|{text}".encode("utf-8")).hexdigest()
    return CACHE_DIR / f"{digest}.mp3"


async def synthesize(text: str, voice: str, rate: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice=voice, rate=rate)
    buffer = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buffer.write(chunk["data"])
    return buffer.getvalue()


def run_tts(text: str, voice: str, rate: str) -> bytes:
    path = cache_key(text, voice, rate)
    if path.exists() and path.stat().st_size > 0:
        return path.read_bytes()

    audio = asyncio.run(synthesize(text, voice, rate))
    if not audio:
        raise RuntimeError("empty audio")
    path.write_bytes(audio)
    return audio


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[echo] {self.address_string()} - {fmt % args}")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/voices":
            self._json(200, {"voices": VOICES})
            return
        if parsed.path == "/api/tts":
            self._tts(parsed)
            return
        super().do_GET()

    def _tts(self, parsed) -> None:
        qs = parse_qs(parsed.query)
        text = sanitize_text((qs.get("text") or [""])[0])
        voice = (qs.get("voice") or ["en-US-JennyNeural"])[0]
        speed = (qs.get("speed") or ["0.9"])[0]

        if not text:
            self._json(400, {"error": "text required"})
            return
        if voice not in ALLOWED_VOICES:
            voice = "en-US-JennyNeural"

        rate = RATE_MAP.get(speed, "-10%")

        try:
            audio = run_tts(text, voice, rate)
        except Exception as exc:  # noqa: BLE001
            self._json(500, {"error": str(exc)})
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(audio)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(audio)

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"ECHO running at http://{HOST}:{PORT}")
    print("Natural US voices via Microsoft Neural TTS (Jenny / Aria / Guy ...)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()

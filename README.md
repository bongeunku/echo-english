# ECHO — 따라하기만 하면 되는 영어

듣고 → 따라 말하고 → 입이 열리는 영어 연습 앱입니다.

## 웹에서 바로 쓰기

https://bongeunku.github.io/echo-english/

## 로컬에서 실행

음성 파일(`audio/`)이 이미 들어 있어서, 정적 서버만 켜도 됩니다.

```bash
py -3 -m http.server 5173
```

브라우저에서 http://localhost:5173 접속

고급(실시간 Neural TTS):

```bash
py -3 -m pip install edge-tts
py -3 server.py
```

## 사용법

1. **오늘 연습 시작** → 주제 선택
2. 상단에서 **미국 음성** 고르기 (Ava 추천)
3. **듣기** — 문장을 먼저 듣기
4. **따라하기** — 듣고 바로 따라 말하기 (마이크 허용 시 유사도 표시)
5. **다음** — 다음 문장

Chrome 브라우저를 권장합니다. (말하기 인식)

## 구성

- `index.html` — 화면
- `styles.css` — 스타일
- `data.js` — 연습 문장
- `app.js` — 따라하기 / 음성 재생 / 인식
- `audio/` — 미국식 Neural 음성 MP3
- `server.py` — (선택) 실시간 TTS 서버
- `generate_audio.py` — 음성 파일 재생성 스크립트

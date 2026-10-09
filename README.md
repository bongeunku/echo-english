# ECHO — 따라하기만 하면 되는 영어

듣고 → 따라 말하고 → 입이 열리는 영어 연습 앱입니다.

## 웹에서 바로 쓰기

https://bongeunku.github.io/echo-english/

`main`에 push되면 GitHub Actions가 Vite 빌드 후 GitHub Pages에 배포합니다.

## 로컬 개발

- Node.js 18+ (권장: LTS)

```bash
npm install
npm run dev
```

브라우저: http://127.0.0.1:5173/

```bash
npm run build    # dist/ 생성 (Pages용 base=/echo-english/)
npm run preview  # 빌드 결과 미리보기
```

## 구성

- `src/` — React 앱 (연습 + 스펠링 퀴즈)
- `legacy/` — 이전 vanilla HTML/JS/CSS (참고용)
- `audio/` — 사전 녹음 MP3
- `server.py` — (선택) 로컬 Neural TTS
- `.github/workflows/deploy-pages.yml` — Pages 자동 배포

## 사용법

1. **오늘 연습 시작** → 주제 선택
2. **듣기** → **따라하기** → **다음**
3. 스펠링 퀴즈는 풀 저장·GitHub 로그인(공유) 가능
4. Chrome 권장 (말하기 인식)

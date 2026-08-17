(() => {
  const STORAGE_KEY = "echo-quiz-list-v1";

  const MEANINGS = {
    apart: "떨어져, 따로",
    "break up": "부수다, 부서지다",
    continent: "대륙",
    glacier: "빙하",
    icy: "얼음같이 찬, 얼음에 뒤덮인",
    "in the past": "옛날에, 과거에",
    join: "연결하다, 합치다",
    large: "큰, 대형의",
    "little bit": "조금, 약간",
    pangaea: "판게아(모든 대륙이 붙어 있던 초대륙)",
    piece: "부분, 조각",
    still: "아직도, 여전히",
    apple: "사과",
    thank: "고맙다",
    "thank you": "고맙습니다",
  };

  const SKIP_HEADINGS = /^(part\s*\d+|unit\s*\d+|day\s*\d+|단어|vocabulary|words?|quiz)$/i;

  const els = {
    view: document.getElementById("quiz-view"),
    progressText: document.getElementById("quiz-progress-text"),
    progressFill: document.getElementById("quiz-progress-fill"),
    setupPanel: document.getElementById("quiz-setup-panel"),
    playPanel: document.getElementById("quiz-play-panel"),
    hint: document.getElementById("quiz-setup-hint"),
    text: document.getElementById("quiz-text"),
    sampleBtn: document.getElementById("quiz-sample-btn"),
    startBtn: document.getElementById("quiz-start-btn"),
    prompt: document.getElementById("quiz-prompt"),
    sentence: document.getElementById("quiz-sentence"),
    listenBtn: document.getElementById("quiz-listen-btn"),
    form: document.getElementById("quiz-form"),
    answer: document.getElementById("quiz-answer"),
    checkBtn: document.getElementById("quiz-check-btn"),
    feedback: document.getElementById("quiz-feedback"),
    nextBtn: document.getElementById("quiz-next-btn"),
    missList: document.getElementById("quiz-miss-list"),
  };

  const SAMPLE = `apart
break up
continent
glacier
icy
in the past
join
large
little bit
Pangaea
piece
still`;

  const state = {
    questions: [],
    index: 0,
    score: 0,
    answered: false,
    audio: null,
    misses: [],
  };

  function setProgress(label, ratio) {
    els.progressText.textContent = label;
    els.progressFill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  function normalizeAnswer(text) {
    return (text || "")
      .toLowerCase()
      .replace(/[’`]/g, "'")
      .replace(/[^a-z0-9'\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractHangul(text) {
    const parts = (text || "").match(/[가-힣]+(?:\s*[·,/]?\s*[가-힣]+)*/g);
    return parts ? parts.join(", ").replace(/\s+,/g, ",").trim() : "";
  }

  function lookupMeaning(en) {
    return MEANINGS[normalizeAnswer(en)] || "";
  }

  function takeVocab(text) {
    const cleaned = (text || "")
      .replace(/[가-힣]+/g, " ")
      .replace(/[*_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    const kept = [];
    for (const word of words) {
      const plain = word.replace(/[.,:;!?]+$/g, "");
      if (!/^[A-Za-z][A-Za-z'-]*$/.test(plain)) {
        if (kept.length) break;
        continue;
      }
      kept.push(plain);
      if (kept.length >= 4) break;
    }
    return kept.join(" ");
  }

  function parseLine(line) {
    const trimmed = line.trim();
    if (!trimmed || SKIP_HEADINGS.test(trimmed)) return null;

    const numbered = trimmed.match(/^\s*(\d{1,2})[.):\-]?\s+(.+)$/);
    if (numbered) {
      const body = numbered[2];
      const ko = extractHangul(body);
      const en = takeVocab(body.replace(/[가-힣·,/]+/g, " "));
      if (en) return { en, ko };
    }

    const dash = trimmed.match(/^([A-Za-z][A-Za-z' -]{1,40})\s*[-–—]\s*(.+)$/);
    if (dash) {
      return { en: takeVocab(dash[1]), ko: extractHangul(dash[2]) };
    }

    const ko = extractHangul(trimmed);
    const en = takeVocab(trimmed.replace(/[가-힣·,/]+/g, " "));
    if (en) return { en, ko };
    return null;
  }

  function parseWordList(rawText) {
    const items = [];
    const seen = new Set();
    (rawText || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const item = parseLine(line);
        if (!item) return;
        const key = normalizeAnswer(item.en);
        if (!key || key.length < 2 || seen.has(key)) return;
        seen.add(key);
        items.push(item);
      });
    return items;
  }

  function stopSpeech() {
    window.speechSynthesis.cancel();
    if (state.audio) {
      state.audio.onended = null;
      state.audio.pause();
      state.audio.src = "";
      state.audio = null;
    }
  }

  function speakLocal(text, lang) {
    return new Promise((resolve) => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang || "en-US";
      utter.rate = lang === "ko-KR" ? 0.95 : 0.92;
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        lang === "ko-KR"
          ? voices.find((v) => /ko-KR|ko_KR|^ko/i.test(v.lang) && /Google|Neural|Heami|Yuna|SunHi|InJoon/i.test(v.name)) ||
            voices.find((v) => /ko-KR|ko_KR|^ko/i.test(v.lang))
          : voices.find((v) => /en-US/i.test(v.lang) && /Google|Neural|Aria|Jenny|Ava|Samantha/i.test(v.name)) ||
            voices.find((v) => /en-US/i.test(v.lang)) ||
            voices.find((v) => /^en/i.test(v.lang));
      if (preferred) utter.voice = preferred;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    });
  }

  function koreanForSpeech(text) {
    return (text || "")
      .replace(/\(.*?\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function wordSlug(text) {
    return normalizeAnswer(text).replace(/\s+/g, "-");
  }

  function quizAudioUrl(text) {
    return `audio/quiz/${wordSlug(text)}.mp3`;
  }

  function playAudioFile(url) {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      state.audio = audio;
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
      audio.play().then(() => {}).catch(() => resolve(false));
    });
  }

  async function speakWord(text) {
    stopSpeech();
    const played = await playAudioFile(quizAudioUrl(text));
    if (played) return;

    try {
      const res = await fetch(
        `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent("en-US-JennyNeural")}&speed=1`
      );
      if (res.ok && (res.headers.get("content-type") || "").includes("audio")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        state.audio = audio;
        await audio.play();
        await new Promise((resolve) => {
          audio.onended = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
        });
        return;
      }
    } catch {
      /* ignore */
    }

    await speakLocal(text, "en-US");
  }

  function speakKorean(text) {
    stopSpeech();
    const spoken = koreanForSpeech(text);
    if (!spoken) return Promise.resolve();
    return speakLocal(spoken, "ko-KR");
  }

  function resetAnswerStyle() {
    els.answer.classList.remove("wrong", "correct");
  }

  function buildQuestions(rawText) {
    return parseWordList(rawText).slice(0, 30).map((item) => {
      const ko = item.ko || lookupMeaning(item.en);
      return {
        prompt: ko || `${item.en}의 스펠링`,
        answer: item.en,
        translated: Boolean(ko),
      };
    });
  }

  function renderQuestion() {
    const item = state.questions[state.index];
    if (!item) return;
    stopSpeech();
    state.answered = false;
    els.prompt.textContent = item.translated
      ? "다음 뜻의 영어 스펠링을 쓰세요"
      : "다음 영어의 스펠링을 쓰세요";
    els.sentence.textContent = item.prompt;
    els.feedback.hidden = true;
    if (els.missList) {
      els.missList.hidden = true;
      els.missList.innerHTML = "";
    }
    els.nextBtn.hidden = true;
    els.nextBtn.textContent = state.index >= state.questions.length - 1 ? "결과 보기" : "다음";
    els.answer.disabled = false;
    els.checkBtn.disabled = false;
    els.answer.value = "";
    resetAnswerStyle();
    els.form.hidden = false;
    if (els.listenBtn) els.listenBtn.hidden = false;
    setProgress(`${state.index + 1} / ${state.questions.length}`, (state.index + 1) / state.questions.length);
    window.setTimeout(() => els.answer.focus(), 50);
    speakKorean(item.prompt);
  }

  function checkAnswer(event) {
    if (event) event.preventDefault();
    if (state.answered) return;
    const item = state.questions[state.index];
    const typed = els.answer.value.trim();
    if (!typed) {
      els.feedback.hidden = false;
      els.feedback.textContent = "스펠링을 입력해 주세요.";
      els.answer.focus();
      return;
    }
    state.answered = true;
    const correct = normalizeAnswer(typed) === normalizeAnswer(item.answer);
    if (correct) {
      state.score += 1;
    } else {
      state.misses.push({
        prompt: item.prompt,
        answer: item.answer,
        typed,
      });
    }
    els.answer.disabled = true;
    els.checkBtn.disabled = true;
    els.answer.classList.toggle("correct", correct);
    els.answer.classList.toggle("wrong", !correct);
    els.feedback.hidden = false;
    if (correct) {
      els.feedback.innerHTML = `정답입니다. (<strong>${item.answer}</strong>)`;
    } else {
      els.feedback.innerHTML = `오답입니다. 입력: <span class="quiz-wrong-spell">${typed}</span> · 정답: <strong>${item.answer}</strong>`;
    }
    els.nextBtn.hidden = false;
    speakWord(item.answer);
  }

  function startQuiz() {
    const raw = els.text.value.trim();
    if (!raw) {
      if (els.hint) els.hint.textContent = "단어 목록을 입력하거나 예시를 불러와 주세요.";
      return;
    }
    localStorage.setItem(STORAGE_KEY, raw);
    const questions = buildQuestions(raw);
    if (questions.length < 1) {
      if (els.hint) {
        els.hint.textContent = "목록을 읽지 못했습니다. 영어 단어를 한 줄에 하나씩 적어 주세요.";
      }
      setProgress("입력 확인", 0);
      return;
    }
    state.questions = questions;
    state.index = 0;
    state.score = 0;
    state.misses = [];
    els.setupPanel.hidden = true;
    els.playPanel.hidden = false;
    renderQuestion();
  }

  function showResult() {
    stopSpeech();
    const total = state.questions.length;
    els.prompt.textContent = "퀴즈 완료";
    els.sentence.textContent = `${state.score} / ${total}`;
    els.form.hidden = true;
    if (els.listenBtn) els.listenBtn.hidden = true;
    els.feedback.hidden = false;
    if (state.score === total) {
      els.feedback.textContent = "전부 맞았습니다. 스펠링이 몸에 익었습니다.";
      if (els.missList) {
        els.missList.hidden = true;
        els.missList.innerHTML = "";
      }
    } else {
      els.feedback.textContent = `틀린 단어 ${state.misses.length}개입니다.`;
      if (els.missList) {
        els.missList.hidden = false;
        els.missList.innerHTML = state.misses
          .map(
            (miss) =>
              `<li><span class="quiz-miss-ko">${miss.prompt}</span> · 입력 <span class="quiz-wrong-spell">${miss.typed}</span> → 정답 <strong>${miss.answer}</strong></li>`
          )
          .join("");
      }
    }
    els.nextBtn.textContent = "목록 수정";
    els.nextBtn.hidden = false;
    els.nextBtn.dataset.done = "1";
    setProgress("완료", 1);
  }

  function nextQuestion() {
    if (state.index >= state.questions.length - 1) {
      showResult();
      return;
    }
    els.nextBtn.dataset.done = "";
    state.index += 1;
    renderQuestion();
  }

  function resetSetup() {
    stopSpeech();
    els.setupPanel.hidden = false;
    els.playPanel.hidden = true;
    setProgress("목록 입력", 0);
    els.nextBtn.dataset.done = "";
    if (els.hint) {
      els.hint.textContent = "영어 단어만 한 줄에 하나씩 적어도 됩니다. Part 2 같은 제목은 자동으로 건너뜁니다.";
    }
  }

  function open() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) els.text.value = saved;
    resetSetup();
    els.view.hidden = false;
  }

  els.sampleBtn.addEventListener("click", () => {
    els.text.value = SAMPLE;
    if (els.hint) els.hint.textContent = "예시 목록을 넣었습니다. 그대로 시작하거나 내 단어로 바꿔 주세요.";
  });

  els.startBtn.addEventListener("click", startQuiz);
  els.form.addEventListener("submit", checkAnswer);
  els.nextBtn.addEventListener("click", () => {
    if (els.nextBtn.dataset.done === "1") {
      resetSetup();
      return;
    }
    nextQuestion();
  });
  if (els.listenBtn) {
    els.listenBtn.addEventListener("click", () => {
      const item = state.questions[state.index];
      if (item) speakWord(item.answer);
    });
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.getVoices();
  }

  window.EchoQuiz = { open, stop: stopSpeech };
})();

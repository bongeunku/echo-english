(() => {
  const STORAGE_KEY = "echo-quiz-list-v1";
  const MEMORY_KEY = "echo-quiz-memory-v1";
  const INTERVALS = [1, 3, 7, 14, 30];

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
    memoryStatus: document.getElementById("quiz-memory-status"),
    text: document.getElementById("quiz-text"),
    sampleBtn: document.getElementById("quiz-sample-btn"),
    saveBtn: document.getElementById("quiz-save-btn"),
    reviewBtn: document.getElementById("quiz-review-btn"),
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
    reviewMode: false,
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

  function todayStamp() {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function loadMemory() {
    try {
      const data = JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}");
      return data.words && typeof data.words === "object" ? data : { words: {} };
    } catch {
      return { words: {} };
    }
  }

  function saveMemory(memory) {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  }

  function rememberWords(items) {
    const memory = loadMemory();
    items.forEach((item) => {
      const key = normalizeAnswer(item.en);
      const existing = memory.words[key] || {};
      memory.words[key] = {
        en: item.en,
        ko: item.ko || existing.ko || lookupMeaning(item.en),
        streak: existing.streak || 0,
        intervalIndex: existing.intervalIndex || 0,
        lastReviewed: existing.lastReviewed || 0,
        nextReview: existing.nextReview || todayStamp(),
        wrongCount: existing.wrongCount || 0,
        correctCount: existing.correctCount || 0,
      };
    });
    saveMemory(memory);
    if (window.EchoCloud && window.EchoCloud.isReady()) {
      window.EchoCloud.upsertWords(Object.values(memory.words).filter((word) => items.some((item) => normalizeAnswer(item.en) === normalizeAnswer(word.en))));
    }
    return memory;
  }

  function recordReview(answer, correct) {
    const key = normalizeAnswer(answer);
    const memory = loadMemory();
    const word = memory.words[key];
    if (!word) return;
    const today = todayStamp();
    word.lastReviewed = today;
    if (correct) {
      word.correctCount = (word.correctCount || 0) + 1;
      word.streak = (word.streak || 0) + 1;
      word.intervalIndex = Math.min(INTERVALS.length - 1, (word.intervalIndex || 0) + (word.streak === 1 ? 0 : 1));
      word.nextReview = today + INTERVALS[word.intervalIndex] * 24 * 60 * 60 * 1000;
    } else {
      word.wrongCount = (word.wrongCount || 0) + 1;
      word.streak = 0;
      word.intervalIndex = 0;
      word.nextReview = today + INTERVALS[0] * 24 * 60 * 60 * 1000;
    }
    memory.words[key] = word;
    saveMemory(memory);
    if (window.EchoCloud && window.EchoCloud.isReady()) {
      window.EchoCloud.upsertWord(word);
    }
  }

  function dueWords() {
    const today = todayStamp();
    return Object.values(loadMemory().words)
      .filter((word) => !word.nextReview || word.nextReview <= today)
      .sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0));
  }

  function updateMemoryStatus() {
    if (!els.memoryStatus) return;
    const all = Object.values(loadMemory().words);
    const due = dueWords();
    const cloud = window.EchoCloud ? window.EchoCloud.statusText() : "이 기기에만 저장";
    els.memoryStatus.textContent = `저장된 단어 ${all.length}개 · 오늘 복습 ${due.length}개 · ${cloud}`;
  }

  async function syncFromCloud() {
    if (!window.EchoCloud) return;
    const ok = await window.EchoCloud.init();
    if (!ok) {
      updateMemoryStatus();
      return;
    }
    const remote = await window.EchoCloud.pullWords();
    if (!remote.length) {
      const local = Object.values(loadMemory().words);
      if (local.length) await window.EchoCloud.upsertWords(local);
      updateMemoryStatus();
      return;
    }
    const memory = loadMemory();
    remote.forEach((word) => {
      const key = normalizeAnswer(word.en);
      const existing = memory.words[key];
      if (!existing || (word.lastReviewed || 0) >= (existing.lastReviewed || 0)) {
        memory.words[key] = word;
      }
    });
    saveMemory(memory);
    updateMemoryStatus();
  }

  function questionsFromItems(items) {
    return items.slice(0, 30).map((item) => {
      const ko = item.ko || lookupMeaning(item.en);
      return {
        prompt: ko || `${item.en}의 스펠링`,
        answer: item.en,
        translated: Boolean(ko),
      };
    });
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

  function playFromUrl(url) {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      state.audio = audio;
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(ok);
      };
      const timer = window.setTimeout(() => {
        if (audio.paused && audio.currentTime === 0) {
          audio.pause();
          done(false);
        }
      }, 4000);
      audio.onplaying = () => window.clearTimeout(timer);
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      audio.play().then(() => {}).catch(() => done(false));
    });
  }

  function playBlob(blob) {
    const url = URL.createObjectURL(blob);
    return playFromUrl(url).then((ok) => {
      URL.revokeObjectURL(url);
      return ok;
    });
  }

  function openAudioDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("echo-quiz-audio-v1", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("clips");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getCachedAudio(slug) {
    try {
      const db = await openAudioDb();
      return await new Promise((resolve) => {
        const tx = db.transaction("clips", "readonly");
        const req = tx.objectStore("clips").get(slug);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async function setCachedAudio(slug, blob) {
    try {
      const db = await openAudioDb();
      await new Promise((resolve) => {
        const tx = db.transaction("clips", "readwrite");
        tx.objectStore("clips").put(blob, slug);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      /* ignore */
    }
  }

  async function fetchNeuralAudio(text) {
    const res = await fetch(
      `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent("en-US-JennyNeural")}&speed=1`
    );
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.includes("audio")) return null;
    return res.blob();
  }

  function googleTtsUrl(text) {
    return `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=en-US&q=${encodeURIComponent(text)}`;
  }

  function pickEnglishVoice() {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => /en-US/i.test(v.lang) && /Google US English|Microsoft (Aria|Jenny|Guy|Ava|Andrew) Online/i.test(v.name)) ||
      voices.find((v) => /en-US/i.test(v.lang) && /Google|Neural|Natural|Online/i.test(v.name)) ||
      voices.find((v) => /en-US/i.test(v.lang) && !/Korean|Heami|Yuna|SunHi|InJoon/i.test(v.name)) ||
      voices.find((v) => /^en(-|_)US/i.test(v.lang)) ||
      voices.find((v) => /^en/i.test(v.lang) && !/ko/i.test(v.lang)) ||
      null
    );
  }

  function speakLocal(text, lang) {
    return new Promise((resolve) => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang || "en-US";
      utter.rate = lang === "ko-KR" ? 0.95 : 0.9;
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        lang === "ko-KR"
          ? voices.find((v) => /ko-KR|ko_KR|^ko/i.test(v.lang) && /Google|Neural|Heami|Yuna|SunHi|InJoon/i.test(v.name)) ||
            voices.find((v) => /ko-KR|ko_KR|^ko/i.test(v.lang))
          : pickEnglishVoice();
      if (preferred) utter.voice = preferred;
      if (lang !== "ko-KR" && preferred && /ko/i.test(preferred.lang)) {
        resolve();
        return;
      }
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    });
  }

  async function speakWord(text) {
    stopSpeech();
    const slug = wordSlug(text);

    if (await playFromUrl(quizAudioUrl(text))) return;

    const cached = await getCachedAudio(slug);
    if (cached && (await playBlob(cached))) return;

    try {
      const blob = await fetchNeuralAudio(text);
      if (blob) {
        await setCachedAudio(slug, blob);
        if (await playBlob(blob)) return;
      }
    } catch {
      /* GitHub Pages has no /api/tts */
    }

    if (await playFromUrl(googleTtsUrl(text))) return;

    await speakLocal(text, "en-US");
  }

  async function prefetchAudio(items) {
    const list = (items || []).slice(0, 30);
    for (const item of list) {
      const text = item.en || item.answer;
      if (!text) continue;
      const slug = wordSlug(text);
      if (await getCachedAudio(slug)) continue;
      try {
        const probe = await fetch(quizAudioUrl(text), { method: "HEAD" });
        if (probe.ok) continue;
      } catch {
        /* continue */
      }
      try {
        const blob = await fetchNeuralAudio(text);
        if (blob) await setCachedAudio(slug, blob);
      } catch {
        break;
      }
    }
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
    return questionsFromItems(parseWordList(rawText));
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
    recordReview(item.answer, correct);
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

  function beginQuiz(questions, reviewMode) {
    state.questions = questions;
    state.index = 0;
    state.score = 0;
    state.misses = [];
    state.reviewMode = Boolean(reviewMode);
    els.setupPanel.hidden = true;
    els.playPanel.hidden = false;
    renderQuestion();
  }

  function saveCurrentList() {
    const raw = els.text.value.trim();
    if (!raw) {
      if (els.hint) els.hint.textContent = "저장할 단어를 먼저 입력해 주세요.";
      return;
    }
    const items = parseWordList(raw);
    if (!items.length) {
      if (els.hint) els.hint.textContent = "목록을 읽지 못했습니다. 영어 단어를 한 줄에 하나씩 적어 주세요.";
      return;
    }
    localStorage.setItem(STORAGE_KEY, raw);
    rememberWords(items);
    updateMemoryStatus();
    prefetchAudio(items);
    if (els.hint) els.hint.textContent = `${items.length}개 단어를 저장했습니다. 같은 브라우저에서 복습할 수 있습니다.`;
  }

  function startReview() {
    const due = dueWords();
    if (!due.length) {
      if (els.hint) els.hint.textContent = "오늘은 복습할 단어가 없습니다. 새 단어를 저장하거나 퀴즈를 풀어 보세요.";
      updateMemoryStatus();
      return;
    }
    beginQuiz(questionsFromItems(due), true);
    prefetchAudio(due);
  }

  function startQuiz() {
    const raw = els.text.value.trim();
    if (!raw) {
      if (els.hint) els.hint.textContent = "단어 목록을 입력하거나 예시를 불러와 주세요.";
      return;
    }
    localStorage.setItem(STORAGE_KEY, raw);
    const items = parseWordList(raw);
    const questions = questionsFromItems(items);
    if (questions.length < 1) {
      if (els.hint) {
        els.hint.textContent = "목록을 읽지 못했습니다. 영어 단어를 한 줄에 하나씩 적어 주세요.";
      }
      setProgress("입력 확인", 0);
      return;
    }
    rememberWords(items);
    updateMemoryStatus();
    prefetchAudio(items);
    beginQuiz(questions, false);
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
      els.feedback.textContent = state.reviewMode
        ? "오늘 복습을 모두 맞았습니다. 맞은 단어는 며칠 뒤에 다시 나옵니다."
        : "전부 맞았습니다. 이 단어들은 저장되어 나중에 복습됩니다.";
      if (els.missList) {
        els.missList.hidden = true;
        els.missList.innerHTML = "";
      }
    } else {
      els.feedback.textContent = `틀린 단어 ${state.misses.length}개입니다. 이 단어들은 내일 복습에 다시 나옵니다.`;
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
      els.hint.textContent =
        "단어를 저장해 두면 같은 폰·브라우저에서 복습할 수 있습니다. 틀린 단어는 내일, 맞은 단어는 며칠 뒤에 다시 나옵니다.";
    }
    updateMemoryStatus();
  }

  async function open() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) els.text.value = saved;
    resetSetup();
    els.view.hidden = false;
    await syncFromCloud();
  }

  els.sampleBtn.addEventListener("click", () => {
    els.text.value = SAMPLE;
    if (els.hint) els.hint.textContent = "예시 목록을 넣었습니다. 저장하거나 퀴즈를 시작해 주세요.";
  });

  if (els.saveBtn) els.saveBtn.addEventListener("click", saveCurrentList);
  if (els.reviewBtn) els.reviewBtn.addEventListener("click", startReview);
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

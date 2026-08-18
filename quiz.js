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
    loadedText: document.getElementById("quiz-loaded-text"),
    poolBtns: document.getElementById("quiz-pool-btns"),
    saveBtn: document.getElementById("quiz-save-btn"),
    deleteBtn: document.getElementById("quiz-delete-btn"),
    githubBtn: document.getElementById("quiz-github-btn"),
    logoutBtn: document.getElementById("quiz-logout-btn"),
    startKoBtn: document.getElementById("quiz-start-ko-btn"),
    startEnBtn: document.getElementById("quiz-start-en-btn"),
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

  const state = {
    questions: [],
    index: 0,
    score: 0,
    answered: false,
    audio: null,
    misses: [],
    poolId: 0,
    pools: [],
    loadedWords: [],
    quizType: "ko",
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
      .replace(/[()（）[*_]/g, " ")
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

    const paren = trimmed.match(/^([A-Za-z][A-Za-z' -]{0,40}?)\s*[\(（]\s*([^)）]+)\s*[\)）]\s*$/);
    if (paren) {
      const en = takeVocab(paren[1]) || paren[1].trim();
      const ko = extractHangul(paren[2]) || paren[2].replace(/[()（）]/g, "").trim();
      if (en) return { en, ko };
    }

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

  function memoryKey(en, poolId) {
    return `${Number(poolId) > 0 ? Number(poolId) : 1}:${normalizeAnswer(en)}`;
  }

  function loadMemory() {
    try {
      const data = JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}");
      if (!data.words || typeof data.words !== "object") return { words: {} };
      const next = { words: {} };
      Object.entries(data.words).forEach(([key, word]) => {
        if (!word) return;
        if (String(key).includes(":")) {
          next.words[key] = { ...word, poolId: word.poolId || Number(String(key).split(":")[0]) || 1 };
          return;
        }
        const poolId = word.poolId || 1;
        next.words[memoryKey(word.en || key, poolId)] = { ...word, poolId };
      });
      return next;
    } catch {
      return { words: {} };
    }
  }

  function saveMemory(memory) {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  }

  function rememberWords(items, poolId) {
    const id = Number(poolId) > 0 ? Number(poolId) : 1;
    const memory = loadMemory();
    items.forEach((item) => {
      const key = memoryKey(item.en, id);
      const existing = memory.words[key] || {};
      memory.words[key] = {
        en: item.en,
        ko: item.ko || existing.ko || lookupMeaning(item.en),
        poolId: id,
        streak: existing.streak || 0,
        intervalIndex: existing.intervalIndex || 0,
        lastReviewed: existing.lastReviewed || 0,
        nextReview: existing.nextReview || todayStamp(),
        wrongCount: existing.wrongCount || 0,
        correctCount: existing.correctCount || 0,
        updatedAt: Date.now(),
      };
    });
    saveMemory(memory);
    return Object.values(memory.words).filter(
      (word) => word.poolId === id && items.some((item) => normalizeAnswer(item.en) === normalizeAnswer(word.en))
    );
  }

  function forgetWords(items, poolId) {
    const memory = loadMemory();
    items.forEach((item) => {
      if (Number(poolId) > 0) {
        delete memory.words[memoryKey(item.en, poolId)];
        return;
      }
      Object.keys(memory.words).forEach((key) => {
        if (normalizeAnswer(memory.words[key].en) === normalizeAnswer(item.en)) {
          delete memory.words[key];
        }
      });
    });
    saveMemory(memory);
  }

  function recordReview(answer, correct) {
    const memory = loadMemory();
    const wanted = normalizeAnswer(answer);
    const entry = Object.entries(memory.words).find(([key, word]) => {
      if (normalizeAnswer(word.en) !== wanted) return false;
      if (state.poolId) return (Number(word.poolId) || 1) === state.poolId || key.startsWith(`${state.poolId}:`);
      return true;
    });
    if (!entry) return;
    const word = entry[1];
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
    memory.words[entry[0]] = word;
    saveMemory(memory);
    if (window.EchoCloud && window.EchoCloud.isReady()) {
      window.EchoCloud.upsertWord(word);
    }
  }

  function localWordList() {
    return Object.values(loadMemory().words).sort((a, b) => (b.updatedAt || b.lastReviewed || 0) - (a.updatedAt || a.lastReviewed || 0));
  }

  function localPoolIds() {
    const ids = [];
    Object.values(loadMemory().words).forEach((word) => {
      const id = Number(word.poolId) || 1;
      if (!ids.includes(id)) ids.push(id);
    });
    return ids.sort((a, b) => a - b);
  }

  function localPoolWords(poolId) {
    const id = Number(poolId) || 1;
    return Object.values(loadMemory().words)
      .filter((word) => (Number(word.poolId) || 1) === id)
      .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  }

  function formatWordLine(word) {
    return word.ko ? `${word.en} - ${word.ko}` : word.en;
  }

  function mergeRemoteIntoMemory(words, poolId) {
    if (!words || !words.length) return;
    const id = Number(poolId) || Number(words[0].poolId) || 1;
    const memory = loadMemory();
    words.forEach((word) => {
      const key = memoryKey(word.en, word.poolId || id);
      if (!key) return;
      memory.words[key] = {
        ...(memory.words[key] || {}),
        ...word,
        poolId: word.poolId || id,
      };
    });
    saveMemory(memory);
  }

  async function storedCount() {
    const local = localWordList().length;
    if (window.EchoCloud && window.EchoCloud.isReady()) {
      const count = await window.EchoCloud.countWords();
      if (typeof count === "number") return Math.max(count, local);
    }
    return local;
  }

  function renderPoolButtons(ids) {
    state.pools = ids || [];
    if (!els.poolBtns) return;
    if (!state.pools.length) {
      els.poolBtns.innerHTML = '<span class="quiz-text-label">저장된 풀이 없습니다.</span>';
      return;
    }
    els.poolBtns.innerHTML = state.pools
      .map(
        (id) =>
          `<button type="button" class="btn ghost small${Number(id) === Number(state.poolId) ? " selected" : ""}" data-pool="${id}">${id}</button>`
      )
      .join("");
  }

  async function refreshPools() {
    let ids = [];
    if (window.EchoCloud && window.EchoCloud.isReady()) {
      ids = await window.EchoCloud.listPools();
    }
    if (!ids.length) ids = localPoolIds();
    renderPoolButtons(ids);
    return ids;
  }

  async function updateMemoryStatus() {
    if (!els.memoryStatus) return;
    const count = await storedCount();
    const cloud = window.EchoCloud ? window.EchoCloud.statusText() : "이 기기에만 저장";
    const poolText = state.poolId ? ` · 풀 ${state.poolId}` : "";
    els.memoryStatus.textContent = `저장된 단어 ${count}개${poolText} · ${cloud}`;
    if (els.githubBtn) els.githubBtn.hidden = Boolean(window.EchoCloud && window.EchoCloud.isGitHub && window.EchoCloud.isGitHub());
    if (els.logoutBtn) els.logoutBtn.hidden = !(window.EchoCloud && window.EchoCloud.isGitHub && window.EchoCloud.isGitHub());
  }

  async function ensureCloud() {
    if (!window.EchoCloud) return false;
    if (window.EchoCloud.isReady()) return true;
    return window.EchoCloud.init();
  }

  async function loadPool(poolId, announce) {
    await ensureCloud();
    const id = Number(poolId) || 0;
    if (!id) {
      state.poolId = 0;
      state.loadedWords = [];
      if (els.loadedText) els.loadedText.value = "";
      await refreshPools();
      await updateMemoryStatus();
      return;
    }
    let words = [];
    let source = "local";
    if (window.EchoCloud && window.EchoCloud.isReady()) {
      const remote = await window.EchoCloud.pullPool(id);
      if (!remote.error && remote.words.length) {
        mergeRemoteIntoMemory(remote.words, id);
        words = remote.words;
        source = "cloud";
      }
    }
    if (!words.length) words = localPoolWords(id);
    state.poolId = id;
    state.loadedWords = words;
    if (els.loadedText) els.loadedText.value = words.map(formatWordLine).join("\n");
    await refreshPools();
    await updateMemoryStatus();
    if (words.length) prefetchAudio(words);
    if (announce && els.hint) {
      if (!words.length) {
        els.hint.textContent = `${id}번 풀에 단어가 없습니다.`;
        return;
      }
      const where = source === "cloud" ? "클라우드" : "이 기기";
      els.hint.textContent = `${where} ${id}번 풀 단어 ${words.length}개를 열었습니다.`;
    }
  }

  function questionsFromItems(items) {
    return items.map((item) => {
      const ko = item.ko || lookupMeaning(item.en);
      return {
        type: "spelling",
        prompt: ko || `${item.en}의 스펠링`,
        answer: item.en,
        answerEn: item.en,
        translated: Boolean(ko),
      };
    });
  }

  function wordKo(item) {
    return (item && (item.ko || lookupMeaning(item.en))) || "";
  }

  function meaningQuestionsFromItems(items) {
    return items
      .map((item) => {
        const ko = wordKo(item);
        if (!ko) return null;
        return {
          type: "meaning",
          prompt: item.en,
          answer: ko,
          answerEn: item.en,
        };
      })
      .filter(Boolean);
  }

  function normalizeKorean(text) {
    return (text || "")
      .replace(/\(.*?\)/g, "")
      .replace(/[·,/|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function koreanMatches(typed, answer) {
    const input = normalizeKorean(typed);
    if (!input) return false;
    const full = normalizeKorean(answer);
    if (input === full) return true;
    const alts = String(answer || "")
      .split(/[·,/|]/)
      .map((part) => normalizeKorean(part.replace(/\(.*?\)/g, "")))
      .filter(Boolean);
    return alts.some((alt) => input === alt);
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
      const audio = new Audio();
      state.audio = audio;
      audio.preload = "auto";
      audio.preservesPitch = true;
      audio.playbackRate = 1;
      audio.volume = 1;
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
      }, 5000);
      audio.onplaying = () => window.clearTimeout(timer);
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      audio.src = url;
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
      const req = indexedDB.open("echo-quiz-audio-v2", 1);
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

  function youdaoUsUrl(text) {
    return `https://dict.youdao.com/dictvoice?type=2&audio=${encodeURIComponent(text)}`;
  }

  async function dictionaryAudioUrl(text) {
    const word = normalizeAnswer(text);
    if (!word || word.split(" ").length > 2) return "";
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!res.ok) return "";
      const data = await res.json();
      const clips = (data && data[0] && data[0].phonetics) || [];
      const us = clips.find((item) => item.audio && /[-_]us[-_.]/i.test(item.audio));
      const any = clips.find((item) => item.audio);
      return (us && us.audio) || (any && any.audio) || "";
    } catch {
      return "";
    }
  }

  function pickEnglishVoice() {
    const voices = window.speechSynthesis.getVoices();
    const english = voices.filter((v) => /^en(-|_)US/i.test(v.lang) && !/ko|Korean|Heami|Yuna|SunHi|InJoon|Compact/i.test(`${v.lang} ${v.name}`));
    return (
      english.find((v) => /Microsoft (Ava|Jenny|Aria|Andrew|Guy) Online/i.test(v.name)) ||
      english.find((v) => /Natural|Neural|Online/i.test(v.name)) ||
      english.find((v) => /Google US English/i.test(v.name)) ||
      english.find((v) => /Google/i.test(v.name)) ||
      english.find((v) => /Microsoft (Ava|Jenny|Zira|David)/i.test(v.name)) ||
      english[0] ||
      voices.find((v) => /^en/i.test(v.lang) && !/ko/i.test(v.lang)) ||
      null
    );
  }

  function speakLocal(text, lang) {
    return new Promise((resolve) => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang || "en-US";
      utter.rate = lang === "ko-KR" ? 0.95 : 1;
      utter.pitch = 1;
      utter.volume = 1;
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

  async function cacheAndPlay(slug, blob) {
    if (!blob || blob.size < 1200) return false;
    await setCachedAudio(slug, blob);
    return playBlob(blob);
  }

  async function speakWord(text) {
    stopSpeech();
    const spoken = String(text || "").trim();
    if (!spoken) return;
    const slug = wordSlug(spoken);
    await new Promise((resolve) => window.setTimeout(resolve, 40));

    if (await playFromUrl(quizAudioUrl(spoken))) return;

    const cached = await getCachedAudio(slug);
    if (cached && cached.size >= 1200 && (await playBlob(cached))) return;

    try {
      const blob = await fetchNeuralAudio(spoken);
      if (await cacheAndPlay(slug, blob)) return;
    } catch {
      /* GitHub Pages has no /api/tts */
    }

    const dictUrl = await dictionaryAudioUrl(spoken);
    if (dictUrl && (await playFromUrl(dictUrl))) return;

    if (await playFromUrl(youdaoUsUrl(spoken))) return;

    await speakLocal(spoken, "en-US");
  }

  async function prefetchAudio(items) {
    const list = items || [];
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
        if (blob && blob.size >= 1200) {
          await setCachedAudio(slug, blob);
          continue;
        }
      } catch {
        /* GitHub Pages has no /api/tts */
      }
      const dictUrl = await dictionaryAudioUrl(text);
      if (!dictUrl) continue;
      try {
        const clip = await fetch(dictUrl);
        if (clip.ok) {
          const blob = await clip.blob();
          if (blob.size >= 1200) await setCachedAudio(slug, blob);
        }
      } catch {
        /* continue */
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

  function renderQuestion() {
    const item = state.questions[state.index];
    if (!item) return;
    stopSpeech();
    state.answered = false;
    els.feedback.hidden = true;
    if (els.missList) {
      els.missList.hidden = true;
      els.missList.innerHTML = "";
    }
    els.nextBtn.hidden = true;
    els.nextBtn.textContent = state.index >= state.questions.length - 1 ? "결과 보기" : "다음";
    resetAnswerStyle();
    els.answer.value = "";
    els.answer.disabled = false;
    els.checkBtn.disabled = false;
    els.form.hidden = false;
    if (els.listenBtn) els.listenBtn.hidden = false;
    setProgress(`${state.index + 1} / ${state.questions.length}`, (state.index + 1) / state.questions.length);

    if (item.type === "meaning") {
      els.prompt.textContent = "다음 영어의 한국어 뜻을 쓰세요";
      els.sentence.textContent = item.prompt;
      els.answer.placeholder = "한국어 뜻 입력";
      window.setTimeout(() => els.answer.focus(), 50);
      speakWord(item.answerEn || item.prompt);
      return;
    }

    els.prompt.textContent = item.translated
      ? "다음 뜻의 영어 스펠링을 쓰세요"
      : "다음 영어의 스펠링을 쓰세요";
    els.sentence.textContent = item.prompt;
    els.answer.placeholder = "영어 스펠링 입력";
    window.setTimeout(() => els.answer.focus(), 50);
    speakKorean(item.prompt);
  }

  function finishAnswer(correct, typed) {
    const item = state.questions[state.index];
    if (correct) {
      state.score += 1;
    } else {
      state.misses.push({
        prompt: item.prompt,
        answer: item.answer,
        typed,
      });
    }
    recordReview(item.answerEn || item.answer, correct);
    els.feedback.hidden = false;
    if (correct) {
      els.feedback.innerHTML = `정답입니다. (<strong>${item.answer}</strong>)`;
    } else {
      els.feedback.innerHTML = `오답입니다. 입력: <span class="quiz-wrong-spell">${typed}</span> · 정답: <strong>${item.answer}</strong>`;
    }
    els.nextBtn.hidden = false;
    if (item.type === "meaning") {
      speakKorean(item.answer);
    } else {
      speakWord(item.answerEn || item.answer);
    }
  }

  function checkAnswer(event) {
    if (event) event.preventDefault();
    if (state.answered) return;
    const item = state.questions[state.index];
    if (!item) return;
    const typed = els.answer.value.trim();
    if (!typed) {
      els.feedback.hidden = false;
      els.feedback.textContent = item.type === "meaning" ? "한국어 뜻을 입력해 주세요." : "스펠링을 입력해 주세요.";
      els.answer.focus();
      return;
    }
    state.answered = true;
    const correct =
      item.type === "meaning"
        ? koreanMatches(typed, item.answer)
        : normalizeAnswer(typed) === normalizeAnswer(item.answer);
    els.answer.disabled = true;
    els.checkBtn.disabled = true;
    els.answer.classList.toggle("correct", correct);
    els.answer.classList.toggle("wrong", !correct);
    finishAnswer(correct, typed);
  }

  function beginQuiz(questions, quizType) {
    state.questions = questions;
    state.index = 0;
    state.score = 0;
    state.misses = [];
    state.quizType = quizType || "ko";
    els.setupPanel.hidden = true;
    els.playPanel.hidden = false;
    renderQuestion();
  }

  async function saveCurrentList() {
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
    const cloudOk = await ensureCloud();
    if (!cloudOk) {
      const localId = (localPoolIds().pop() || 0) + 1;
      rememberWords(items, localId);
      if (els.hint) els.hint.textContent = `${localId}번 풀에 이 기기에만 저장했습니다. 연결 후 다시 저장해 주세요.`;
      await refreshPools();
      await loadPool(localId, false);
      return;
    }
    const poolId = await window.EchoCloud.nextPoolId();
    const pooled = rememberWords(items, poolId);
    const ok = await window.EchoCloud.upsertWords(pooled, poolId);
    if (!ok) {
      if (els.hint) {
        els.hint.textContent =
          (window.EchoCloud.lastError && window.EchoCloud.lastError()) ||
          window.EchoCloud.statusText() ||
          "클라우드 저장에 실패했습니다. 목록을 유지합니다.";
      }
      await updateMemoryStatus();
      return;
    }

    els.text.value = "";
    localStorage.removeItem(STORAGE_KEY);
    prefetchAudio(items);
    await loadPool(poolId, false);

    if (els.hint) {
      els.hint.textContent = `${items.length}개 단어를 ${poolId}번 풀에 저장했습니다.`;
    }
  }

  async function deleteCurrentList() {
    const raw = els.text.value.trim();
    if (!raw) {
      if (els.hint) els.hint.textContent = "삭제할 단어를 왼쪽에 입력해 주세요.";
      return;
    }
    const items = parseWordList(raw);
    if (!items.length) {
      if (els.hint) els.hint.textContent = "목록을 읽지 못했습니다. 영어 단어를 한 줄에 하나씩 적어 주세요.";
      return;
    }
    if (!window.confirm(`입력한 ${items.length}개 단어를 삭제할까요?`)) return;
    forgetWords(items, state.poolId);
    if (await ensureCloud()) {
      const ok = await window.EchoCloud.deleteWords(items, state.poolId);
      if (!ok) {
        if (els.hint) els.hint.textContent = "클라우드 삭제에 실패했습니다. 이 기기에서는 지웠습니다.";
        await updateMemoryStatus();
        return;
      }
    }
    els.text.value = "";
    const ids = await refreshPools();
    if (state.poolId && ids.includes(state.poolId)) {
      await loadPool(state.poolId, false);
    } else if (ids.length) {
      await loadPool(ids[0], false);
    } else {
      state.poolId = 0;
      state.loadedWords = [];
      if (els.loadedText) els.loadedText.value = "";
      await updateMemoryStatus();
    }
    if (els.hint) els.hint.textContent = `${items.length}개 단어를 삭제했습니다.`;
  }

  async function startQuiz(quizType) {
    const loadedItems = state.loadedWords && state.loadedWords.length
      ? state.loadedWords
      : parseWordList(els.loadedText ? els.loadedText.value.trim() : "");
    const typedItems = parseWordList(els.text.value.trim());
    const items = loadedItems.length ? loadedItems : typedItems;
    if (!items.length) {
      if (els.hint) els.hint.textContent = "오른쪽 풀 번호를 누르거나 왼쪽에 단어를 입력해 주세요.";
      return;
    }
    const mode = quizType === "en" ? "en" : "ko";
    const questions = mode === "en" ? meaningQuestionsFromItems(items) : questionsFromItems(items);
    if (questions.length < 1) {
      if (els.hint) {
        els.hint.textContent =
          mode === "en"
            ? "한국어 뜻이 있는 단어가 없습니다. 뜻을 같이 저장해 주세요."
            : "목록을 읽지 못했습니다. 영어 단어를 한 줄에 하나씩 적어 주세요.";
      }
      setProgress("입력 확인", 0);
      return;
    }
    const saved = rememberWords(items, state.poolId || 1);
    if (await ensureCloud() && state.poolId) {
      window.EchoCloud.upsertWords(saved, state.poolId);
    }
    updateMemoryStatus();
    prefetchAudio(items);
    beginQuiz(questions, mode);
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
      els.feedback.textContent = "전부 맞았습니다.";
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
    els.nextBtn.textContent = "목록으로";
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
        "왼쪽에서 저장하면 1, 2, 3번 풀로 쌓입니다. 오른쪽 번호를 눌러 그 풀로 퀴즈를 시작하세요.";
    }
    updateMemoryStatus();
  }

  async function open() {
    els.text.value = "";
    if (els.loadedText) els.loadedText.value = "";
    state.poolId = 0;
    state.loadedWords = [];
    resetSetup();
    els.view.hidden = false;
    await ensureCloud();
    const ids = await refreshPools();
    await updateMemoryStatus();
    if (ids.length) await loadPool(ids[0], false);
  }

  if (els.poolBtns) {
    els.poolBtns.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-pool]");
      if (!btn) return;
      loadPool(Number(btn.dataset.pool), true);
    });
  }
  if (els.saveBtn) els.saveBtn.addEventListener("click", saveCurrentList);
  if (els.deleteBtn) els.deleteBtn.addEventListener("click", deleteCurrentList);
  if (els.githubBtn) {
    els.githubBtn.addEventListener("click", async () => {
      if (!window.EchoCloud || !window.EchoCloud.signInWithGitHub) return;
      const ok = await window.EchoCloud.signInWithGitHub();
      if (!ok && els.hint) els.hint.textContent = window.EchoCloud.statusText();
    });
  }
  if (els.logoutBtn) {
    els.logoutBtn.addEventListener("click", async () => {
      if (!window.EchoCloud || !window.EchoCloud.signOut) return;
      await window.EchoCloud.signOut();
      await updateMemoryStatus();
      const ids = await refreshPools();
      if (ids.length) await loadPool(ids[0], false);
    });
  }
  if (els.startKoBtn) els.startKoBtn.addEventListener("click", () => startQuiz("ko"));
  if (els.startEnBtn) els.startEnBtn.addEventListener("click", () => startQuiz("en"));
  if (els.startBtn) els.startBtn.addEventListener("click", () => startQuiz("ko"));
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
      if (!item) return;
      speakWord(item.answerEn || item.answer);
    });
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.getVoices();
  }

  window.EchoQuiz = { open, stop: stopSpeech };
})();

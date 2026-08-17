(() => {
  const STORAGE_KEY = "echo-english-progress-v1";
  const VOICE_KEY = "echo-english-voice-v1";

  const views = {
    home: document.getElementById("home-view"),
    pick: document.getElementById("pick-view"),
    practice: document.getElementById("practice-view"),
    quiz: document.getElementById("quiz-view"),
    done: document.getElementById("done-view"),
  };

  const els = {
    startBtn: document.getElementById("start-btn"),
    continueBtn: document.getElementById("continue-btn"),
    topicGrid: document.getElementById("topic-grid"),
    backBtn: document.getElementById("back-btn"),
    topicLabel: document.getElementById("topic-label"),
    progressText: document.getElementById("progress-text"),
    progressFill: document.getElementById("progress-fill"),
    voice: document.getElementById("voice"),
    speed: document.getElementById("speed"),
    koText: document.getElementById("ko-text"),
    enText: document.getElementById("en-text"),
    hintText: document.getElementById("hint-text"),
    phaseBadge: document.getElementById("phase-badge"),
    listenBtn: document.getElementById("listen-btn"),
    echoBtn: document.getElementById("echo-btn"),
    nextBtn: document.getElementById("next-btn"),
    micStatus: document.getElementById("mic-status"),
    micLabel: document.getElementById("mic-label"),
    transcript: document.getElementById("transcript"),
    showEnBtn: document.getElementById("show-en-btn"),
    repeatSetBtn: document.getElementById("repeat-set-btn"),
    againBtn: document.getElementById("again-btn"),
    homeBtn: document.getElementById("home-btn"),
    doneSummary: document.getElementById("done-summary"),
    voiceNote: document.getElementById("voice-note"),
    pauseAllBtn: document.getElementById("pause-all-btn"),
  };

  const state = {
    topicId: null,
    index: 0,
    hideEnglish: false,
    speaking: false,
    listening: false,
    recognition: null,
    audio: null,
    mode: "topic",
    playlist: [],
    playToken: 0,
    allListenPlaying: false,
    speakDone: null,
  };

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveProgress(patch) {
    const next = { ...loadProgress(), ...patch, updatedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
      el.hidden = key !== name;
    });
  }

  function buildPlaylist() {
    return window.ECHO_TOPICS.flatMap((topic) =>
      topic.lines.map((line, index) => ({
        en: line.en,
        ko: line.ko,
        topicId: topic.id,
        topicTitle: topic.title,
        audioIndex: index,
      }))
    );
  }

  function currentTopic() {
    if (state.mode === "all") {
      return {
        id: "all",
        title: "전체 듣기",
        lines: state.playlist,
      };
    }
    return window.ECHO_TOPICS.find((t) => t.id === state.topicId);
  }

  function currentLine() {
    const topic = currentTopic();
    return topic ? topic.lines[state.index] : null;
  }

  function setPhase(phase) {
    els.phaseBadge.textContent = phase;
    els.phaseBadge.className = `phase ${phase.toLowerCase()}`;
  }

  function stopSpeech() {
    window.speechSynthesis.cancel();
    if (state.audio) {
      state.audio.onended = null;
      state.audio.onerror = null;
      state.audio.pause();
      state.audio.src = "";
      state.audio = null;
    }
    state.speaking = false;
    const done = state.speakDone;
    state.speakDone = null;
    if (done) done("stopped");
  }

  function stopAllListen() {
    state.playToken += 1;
    state.allListenPlaying = false;
    if (els.pauseAllBtn) {
      els.pauseAllBtn.textContent = "이어 듣기";
    }
  }

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function setAllListenUi(visible) {
    if (!els.pauseAllBtn) return;
    els.pauseAllBtn.hidden = !visible;
    els.pauseAllBtn.textContent = state.allListenPlaying ? "일시정지" : "이어 듣기";
  }

  function stopRecognition() {
    if (state.recognition) {
      try {
        state.recognition.onresult = null;
        state.recognition.onerror = null;
        state.recognition.onend = null;
        state.recognition.stop();
      } catch {
        /* ignore */
      }
    }
    state.listening = false;
    els.micStatus.hidden = true;
  }

  function currentAudioUrl() {
    const line = currentLine();
    const voice = els.voice?.value || "en-US-AvaNeural";
    if (!line) return "";
    const topicId = line.topicId || state.topicId;
    const index = line.audioIndex ?? state.index;
    return `audio/${voice}/${topicId}-${index}.mp3`;
  }

  function speak(text) {
    void text;
    return new Promise((resolve, reject) => {
      stopSpeech();
      const url = currentAudioUrl();
      const audio = new Audio(url);
      audio.playbackRate = Number(els.speed.value) || 1;
      audio.preservesPitch = true;
      state.audio = audio;
      state.speaking = true;
      state.speakDone = (result) => {
        if (result === "error") reject(new Error("audio missing"));
        else resolve();
      };
      if (els.voiceNote) {
        const label = els.voice?.selectedOptions?.[0]?.text || "미국 음성";
        els.voiceNote.textContent = `${label} · 자연 발음 재생`;
      }

      audio.onended = () => {
        state.speaking = false;
        state.audio = null;
        const done = state.speakDone;
        state.speakDone = null;
        if (done) done("ok");
      };
      audio.onerror = () => {
        state.speaking = false;
        state.audio = null;
        if (els.voiceNote) {
          els.voiceNote.textContent = "음성 파일을 찾지 못했습니다. 페이지를 새로고침해 주세요.";
        }
        const done = state.speakDone;
        state.speakDone = null;
        if (done) done("error");
      };
      audio.play().catch((err) => {
        state.speaking = false;
        state.audio = null;
        state.speakDone = null;
        reject(err);
      });
    });
  }

  function createRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    return recognition;
  }

  function startListening() {
    stopRecognition();
    const recognition = createRecognition();
    if (!recognition) {
      els.micStatus.hidden = false;
      els.micLabel.textContent = "이 브라우저는 말하기 인식을 지원하지 않아요. 그래도 따라 말해 보세요!";
      els.transcript.hidden = true;
      return;
    }

    state.recognition = recognition;
    state.listening = true;
    els.micStatus.hidden = false;
    els.micLabel.textContent = "따라 말해 보세요…";
    els.transcript.hidden = true;
    els.transcript.textContent = "";

    recognition.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        text += event.results[i][0].transcript;
      }
      els.transcript.hidden = false;
      els.transcript.textContent = `내가 말한 것: ${text.trim()}`;
      if (event.results[event.results.length - 1].isFinal) {
        const score = similarity(currentLine()?.en || "", text);
        els.micLabel.textContent =
          score >= 0.55 ? `좋아요! 유사도 ${Math.round(score * 100)}%` : `다시 한 번? 유사도 ${Math.round(score * 100)}%`;
      }
    };

    recognition.onerror = () => {
      els.micLabel.textContent = "마이크를 확인한 뒤 다시 시도해 주세요.";
      state.listening = false;
    };

    recognition.onend = () => {
      state.listening = false;
    };

    try {
      recognition.start();
    } catch {
      els.micLabel.textContent = "마이크를 바로 다시 켤 수 없어요. 잠깐 후 다시 눌러 주세요.";
    }
  }

  function normalize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function similarity(a, b) {
    const aa = normalize(a).split(" ").filter(Boolean);
    const bb = normalize(b).split(" ").filter(Boolean);
    if (!aa.length || !bb.length) return 0;
    const setB = new Set(bb);
    const hit = aa.filter((w) => setB.has(w)).length;
    return hit / Math.max(aa.length, bb.length);
  }

  function renderLine() {
    const topic = currentTopic();
    const line = currentLine();
    if (!topic || !line) return;

    els.topicLabel.textContent = topic.title;
    els.progressText.textContent = `${state.index + 1} / ${topic.lines.length}`;
    els.progressFill.style.width = `${((state.index + 1) / topic.lines.length) * 100}%`;
    els.koText.textContent = line.ko;
    els.enText.textContent = line.en;
    els.enText.classList.toggle("hidden-en", state.hideEnglish);
    els.hintText.textContent =
      state.mode === "all"
        ? `${line.topicTitle} · 일상부터 스몰톡까지 이어서 들려줍니다`
        : "먼저 듣고, 같은 리듬으로 따라 말하세요.";
    els.transcript.hidden = true;
    els.micStatus.hidden = true;
    setPhase("READY");

    saveProgress({ topicId: topic.id, index: state.index });
  }

  function openTopic(topicId, index = 0) {
    stopAllListen();
    stopSpeech();
    stopRecognition();
    state.mode = "topic";
    state.topicId = topicId;
    state.index = index;
    showView("practice");
    setAllListenUi(false);
    renderLine();
  }

  function openAllListen(index = 0) {
    stopAllListen();
    stopSpeech();
    stopRecognition();
    state.mode = "all";
    state.playlist = buildPlaylist();
    state.topicId = "all";
    state.index = index;
    showView("practice");
    setAllListenUi(true);
    renderLine();
    startAllListen();
  }

  async function startAllListen() {
    const token = (state.playToken += 1);
    state.allListenPlaying = true;
    setAllListenUi(true);
    setPhase("LISTEN");

    for (let i = state.index; i < state.playlist.length; i += 1) {
      if (token !== state.playToken) return;
      state.index = i;
      renderLine();
      setPhase("LISTEN");
      els.hintText.textContent = `${currentLine().topicTitle} · 전체 듣기 재생 중`;
      try {
        await speak(currentLine().en);
      } catch {
        if (token === state.playToken) {
          stopAllListen();
          setPhase("READY");
        }
        return;
      }
      if (token !== state.playToken) return;
      await delay(700);
    }

    if (token !== state.playToken) return;
    stopAllListen();
    saveProgress({ topicId: "all", index: 0, completedAt: Date.now() });
    els.doneSummary.textContent = `일상 대화부터 스몰톡까지 ${state.playlist.length}문장 듣기를 마쳤습니다.`;
    showView("done");
  }

  async function handleListen() {
    const line = currentLine();
    if (!line || state.speaking) return;
    if (state.mode === "all") {
      stopAllListen();
      setAllListenUi(true);
    }
    stopRecognition();
    setPhase("LISTEN");
    els.hintText.textContent = "귀로만 집중해서 들어보세요.";
    try {
      await speak(line.en);
    } catch {
      setPhase("READY");
      return;
    }
    setPhase("READY");
    els.hintText.textContent =
      state.mode === "all"
        ? "이어 듣기를 누르면 다음 문장부터 다시 재생됩니다."
        : "이제 ‘따라하기’를 눌러 같은 문장을 말해 보세요.";
  }

  async function handleEcho() {
    const line = currentLine();
    if (!line || state.speaking) return;
    if (state.mode === "all") {
      stopAllListen();
      setAllListenUi(true);
    }
    stopRecognition();
    setPhase("LISTEN");
    els.hintText.textContent = "듣고…";
    try {
      await speak(line.en);
    } catch {
      setPhase("READY");
      return;
    }
    setPhase("ECHO");
    els.hintText.textContent = "지금! 바로 따라 말하세요.";
    startListening();
  }

  function handleNext() {
    const topic = currentTopic();
    if (!topic) return;
    if (state.mode === "all") {
      stopAllListen();
      stopSpeech();
      stopRecognition();
      if (state.index >= state.playlist.length - 1) {
        saveProgress({ topicId: "all", index: 0, completedAt: Date.now() });
        els.doneSummary.textContent = `일상 대화부터 스몰톡까지 ${state.playlist.length}문장 듣기를 마쳤습니다.`;
        showView("done");
        return;
      }
      state.index += 1;
      renderLine();
      startAllListen();
      return;
    }
    stopSpeech();
    stopRecognition();

    if (state.index >= topic.lines.length - 1) {
      saveProgress({ topicId: topic.id, index: 0, completedAt: Date.now() });
      els.doneSummary.textContent = `「${topic.title}」 ${topic.lines.length}문장 완료. 같은 세트를 반복할수록 입이 편해집니다.`;
      showView("done");
      return;
    }

    state.index += 1;
    renderLine();
  }

  function renderTopics() {
    els.topicGrid.innerHTML = "";
    window.ECHO_TOPICS.forEach((topic) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "topic";
      btn.innerHTML = `
        <span class="emoji" aria-hidden="true">${topic.emoji}</span>
        <h3>${topic.title}</h3>
        <p>${topic.desc}</p>
        <div class="meta">${topic.lines.length}문장 · 따라하기</div>
      `;
      btn.addEventListener("click", () => openTopic(topic.id, 0));
      els.topicGrid.appendChild(btn);
    });

    const allCount = window.ECHO_TOPICS.reduce((sum, topic) => sum + topic.lines.length, 0);
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "topic listen-all";
    allBtn.innerHTML = `
      <span class="emoji" aria-hidden="true">🎧</span>
      <h3>전체 듣기</h3>
      <p>일상 대화부터 스몰톡까지 이어서 듣기</p>
      <div class="meta">${allCount}문장 · 자동 재생</div>
    `;
    allBtn.addEventListener("click", () => openAllListen(0));
    els.topicGrid.appendChild(allBtn);

    const quizBtn = document.createElement("button");
    quizBtn.type = "button";
    quizBtn.className = "topic quiz-card-btn";
    quizBtn.innerHTML = `
      <span class="emoji" aria-hidden="true">📷</span>
      <h3>스펠링 퀴즈</h3>
      <p>단어를 저장하고, 틀린 단어는 나중에 복습</p>
      <div class="meta">저장 · 오늘 복습</div>
    `;
    quizBtn.addEventListener("click", () => {
      stopAllListen();
      stopSpeech();
      stopRecognition();
      showView("quiz");
      if (window.EchoQuiz) window.EchoQuiz.open();
    });
    els.topicGrid.appendChild(quizBtn);
  }

  function syncContinueButton() {
    const progress = loadProgress();
    if (progress.topicId === "all") {
      els.continueBtn.hidden = false;
      els.continueBtn.textContent = "이어서: 전체 듣기";
      return;
    }
    const topic = window.ECHO_TOPICS.find((t) => t.id === progress.topicId);
    if (!topic) {
      els.continueBtn.hidden = true;
      return;
    }
    els.continueBtn.hidden = false;
    els.continueBtn.textContent = `이어서: ${topic.title}`;
  }

  function restoreVoiceChoice() {
    const saved = localStorage.getItem(VOICE_KEY);
    if (saved && els.voice) {
      const option = [...els.voice.options].find((o) => o.value === saved);
      if (option) els.voice.value = saved;
    }
  }

  els.startBtn.addEventListener("click", () => {
    showView("pick");
  });

  els.continueBtn.addEventListener("click", () => {
    const progress = loadProgress();
    if (progress.topicId === "all") {
      openAllListen(progress.index || 0);
      return;
    }
    if (progress.topicId) openTopic(progress.topicId, progress.index || 0);
  });

  els.backBtn.addEventListener("click", () => {
    stopAllListen();
    stopSpeech();
    stopRecognition();
    showView("pick");
  });

  els.listenBtn.addEventListener("click", handleListen);
  els.echoBtn.addEventListener("click", handleEcho);
  els.nextBtn.addEventListener("click", handleNext);

  els.showEnBtn.addEventListener("click", () => {
    state.hideEnglish = !state.hideEnglish;
    els.enText.classList.toggle("hidden-en", state.hideEnglish);
    els.showEnBtn.textContent = state.hideEnglish ? "영어 보기" : "영어 가리기/보기";
  });

  els.repeatSetBtn.addEventListener("click", () => {
    state.index = 0;
    renderLine();
    if (state.mode === "all") startAllListen();
  });

  els.againBtn.addEventListener("click", () => {
    if (state.mode === "all") {
      openAllListen(0);
      return;
    }
    openTopic(state.topicId, 0);
  });

  els.homeBtn.addEventListener("click", () => {
    stopAllListen();
    stopSpeech();
    showView("pick");
    syncContinueButton();
  });

  if (els.voice) {
    els.voice.addEventListener("change", () => {
      localStorage.setItem(VOICE_KEY, els.voice.value);
    });
  }

  if (els.pauseAllBtn) {
    els.pauseAllBtn.addEventListener("click", () => {
      if (state.mode !== "all") return;
      if (state.allListenPlaying) {
        stopAllListen();
        stopSpeech();
        setPhase("READY");
        els.hintText.textContent = "일시정지됨. 이어 듣기를 누르면 이어서 재생됩니다.";
        setAllListenUi(true);
        return;
      }
      startAllListen();
    });
  }

  const quizBackBtn = document.getElementById("quiz-back-btn");
  if (quizBackBtn) {
    quizBackBtn.addEventListener("click", () => {
      if (window.EchoQuiz && window.EchoQuiz.stop) window.EchoQuiz.stop();
      showView("pick");
    });
  }
  renderTopics();
  syncContinueButton();
  showView("home");
})();

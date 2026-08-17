(() => {
  const STORAGE_KEY = "echo-english-progress-v1";
  const VOICE_KEY = "echo-english-voice-v1";

  const views = {
    home: document.getElementById("home-view"),
    pick: document.getElementById("pick-view"),
    practice: document.getElementById("practice-view"),
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
  };

  const state = {
    topicId: null,
    index: 0,
    hideEnglish: false,
    speaking: false,
    listening: false,
    recognition: null,
    audio: null,
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

  function currentTopic() {
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
    const topic = currentTopic();
    const voice = els.voice?.value || "en-US-AvaNeural";
    if (!topic) return "";
    return `audio/${voice}/${topic.id}-${state.index}.mp3`;
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
      if (els.voiceNote) {
        const label = els.voice?.selectedOptions?.[0]?.text || "미국 음성";
        els.voiceNote.textContent = `${label} · 자연 발음 재생`;
      }

      audio.onended = () => {
        state.speaking = false;
        state.audio = null;
        resolve();
      };
      audio.onerror = () => {
        state.speaking = false;
        state.audio = null;
        if (els.voiceNote) {
          els.voiceNote.textContent = "음성 파일을 찾지 못했습니다. 페이지를 새로고침해 주세요.";
        }
        reject(new Error("audio missing"));
      };
      audio.play().catch((err) => {
        state.speaking = false;
        state.audio = null;
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
    els.hintText.textContent = "먼저 듣고, 같은 리듬으로 따라 말하세요.";
    els.transcript.hidden = true;
    els.micStatus.hidden = true;
    setPhase("READY");

    saveProgress({ topicId: topic.id, index: state.index });
  }

  function openTopic(topicId, index = 0) {
    stopSpeech();
    stopRecognition();
    state.topicId = topicId;
    state.index = index;
    showView("practice");
    renderLine();
  }

  async function handleListen() {
    const line = currentLine();
    if (!line || state.speaking) return;
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
    els.hintText.textContent = "이제 ‘따라하기’를 눌러 같은 문장을 말해 보세요.";
  }

  async function handleEcho() {
    const line = currentLine();
    if (!line || state.speaking) return;
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
  }

  function syncContinueButton() {
    const progress = loadProgress();
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
    if (progress.topicId) openTopic(progress.topicId, progress.index || 0);
  });

  els.backBtn.addEventListener("click", () => {
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
  });

  els.againBtn.addEventListener("click", () => {
    openTopic(state.topicId, 0);
  });

  els.homeBtn.addEventListener("click", () => {
    showView("pick");
    syncContinueButton();
  });

  if (els.voice) {
    els.voice.addEventListener("change", () => {
      localStorage.setItem(VOICE_KEY, els.voice.value);
    });
  }

  restoreVoiceChoice();
  renderTopics();
  syncContinueButton();
  showView("home");
})();

(() => {
  const STOP = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "to",
    "of",
    "in",
    "on",
    "at",
    "for",
    "from",
    "with",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "am",
    "it",
    "this",
    "that",
    "these",
    "those",
    "i",
    "you",
    "he",
    "she",
    "we",
    "they",
    "my",
    "your",
    "our",
    "their",
  ]);

  const els = {
    view: document.getElementById("quiz-view"),
    backBtn: document.getElementById("quiz-back-btn"),
    progressText: document.getElementById("quiz-progress-text"),
    progressFill: document.getElementById("quiz-progress-fill"),
    uploadPanel: document.getElementById("quiz-upload-panel"),
    playPanel: document.getElementById("quiz-play-panel"),
    dropzone: document.getElementById("quiz-dropzone"),
    file: document.getElementById("quiz-file"),
    preview: document.getElementById("quiz-preview"),
    ocrStatus: document.getElementById("quiz-ocr-status"),
    text: document.getElementById("quiz-text"),
    startBtn: document.getElementById("quiz-start-btn"),
    prompt: document.getElementById("quiz-prompt"),
    sentence: document.getElementById("quiz-sentence"),
    options: document.getElementById("quiz-options"),
    feedback: document.getElementById("quiz-feedback"),
    nextBtn: document.getElementById("quiz-next-btn"),
  };

  const state = {
    questions: [],
    index: 0,
    score: 0,
    answered: false,
    previewUrl: "",
  };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("OCR 스크립트를 불러오지 못했습니다."));
      document.head.appendChild(script);
    });
  }

  async function ensureOcr() {
    if (window.Tesseract) return window.Tesseract;
    els.ocrStatus.textContent = "글자 인식 엔진을 불러오는 중…";
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
    return window.Tesseract;
  }

  function shuffle(list) {
    const next = [...list];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function wordsIn(text) {
    return (text.match(/[A-Za-z']+/g) || []).filter(Boolean);
  }

  function contentWords(text) {
    return wordsIn(text).filter((word) => {
      const lower = word.toLowerCase();
      return lower.length >= 3 && !STOP.has(lower);
    });
  }

  function splitSentences(text) {
    const cleaned = text.replace(/\s+/g, " ").trim();
    const parts = cleaned.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    const usable = parts.filter((s) => contentWords(s).length >= 1 && wordsIn(s).length >= 4);
    if (usable.length) return usable;
    return cleaned
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => contentWords(s).length >= 1 && wordsIn(s).length >= 3);
  }

  function blankSentence(sentence, answer) {
    const pattern = new RegExp(`\\b${answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    return sentence.replace(pattern, "_____");
  }

  function buildQuestions(rawText) {
    const sentences = splitSentences(rawText);
    const pool = [...new Set(contentWords(rawText).map((w) => w.toLowerCase()))];
    const questions = [];

    sentences.forEach((sentence) => {
      const candidates = contentWords(sentence);
      if (!candidates.length) return;
      const answer = candidates.sort((a, b) => b.length - a.length)[0];
      const answerKey = answer.toLowerCase();
      const distractors = shuffle(pool.filter((w) => w !== answerKey))
        .slice(0, 3)
        .map((w) => {
          const sample = contentWords(rawText).find((item) => item.toLowerCase() === w);
          return sample || w;
        });
      while (distractors.length < 3) {
        distractors.push(["really", "always", "today", "please"][distractors.length]);
      }
      questions.push({
        sentence: blankSentence(sentence, answer),
        answer,
        options: shuffle([answer, ...distractors.slice(0, 3)]),
      });
    });

    return questions.slice(0, 12);
  }

  function setProgress(label, ratio) {
    els.progressText.textContent = label;
    els.progressFill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  function resetUpload() {
    els.uploadPanel.hidden = false;
    els.playPanel.hidden = true;
    els.text.value = "";
    els.preview.hidden = true;
    els.ocrStatus.textContent = "아직 사진을 올리지 않았습니다.";
    setProgress("사진 올리기", 0);
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = "";
    }
  }

  async function recognizeImage(file) {
    els.ocrStatus.textContent = "사진을 읽고 있습니다…";
    setProgress("글자 인식 중", 0.15);
    const Tesseract = await ensureOcr();
    const result = await Tesseract.recognize(file, "eng", {
      logger: (info) => {
        if (info.status === "recognizing text" && info.progress) {
          setProgress("글자 인식 중", 0.15 + info.progress * 0.7);
          els.ocrStatus.textContent = `사진을 읽고 있습니다… ${Math.round(info.progress * 100)}%`;
        }
      },
    });
    const text = (result?.data?.text || "").replace(/[^\S\n]+/g, " ").trim();
    els.text.value = text;
    if (!text) {
      els.ocrStatus.textContent = "글자를 찾지 못했습니다. 더 선명한 영어 사진을 올려 주세요.";
      setProgress("인식 실패", 0);
      return;
    }
    els.ocrStatus.textContent = "인식이 끝났습니다. 틀린 부분은 고친 뒤 퀴즈를 시작하세요.";
    setProgress("퀴즈 준비", 1);
  }

  async function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      els.ocrStatus.textContent = "이미지 파일만 올릴 수 있습니다.";
      return;
    }
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(file);
    els.preview.src = state.previewUrl;
    els.preview.hidden = false;
    try {
      await recognizeImage(file);
    } catch (err) {
      els.ocrStatus.textContent = err.message || "글자 인식에 실패했습니다. 인터넷 연결을 확인해 주세요.";
    }
  }

  function renderQuestion() {
    const item = state.questions[state.index];
    if (!item) return;
    state.answered = false;
    els.prompt.textContent = "빈칸에 들어갈 단어를 고르세요";
    els.sentence.textContent = item.sentence;
    els.feedback.hidden = true;
    els.nextBtn.hidden = true;
    els.nextBtn.textContent = state.index >= state.questions.length - 1 ? "결과 보기" : "다음";
    setProgress(`${state.index + 1} / ${state.questions.length}`, (state.index + 1) / state.questions.length);
    els.options.innerHTML = "";
    item.options.forEach((option) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quiz-choice";
      btn.textContent = option;
      btn.addEventListener("click", () => choose(option, btn));
      els.options.appendChild(btn);
    });
  }

  function choose(option, button) {
    if (state.answered) return;
    state.answered = true;
    const item = state.questions[state.index];
    const correct = option.toLowerCase() === item.answer.toLowerCase();
    if (correct) state.score += 1;
    [...els.options.children].forEach((btn) => {
      btn.disabled = true;
      if (btn.textContent.toLowerCase() === item.answer.toLowerCase()) btn.classList.add("correct");
    });
    if (!correct) button.classList.add("wrong");
    els.feedback.hidden = false;
    els.feedback.textContent = correct ? "정답입니다." : `오답입니다. 정답은 ${item.answer}`;
    els.nextBtn.hidden = false;
  }

  function startQuiz() {
    const questions = buildQuestions(els.text.value);
    if (questions.length < 1) {
      els.ocrStatus.textContent = "퀴즈를 만들 문장이 부족합니다. 영어 문장이 더 보이게 올려 주세요.";
      return;
    }
    state.questions = questions;
    state.index = 0;
    state.score = 0;
    els.uploadPanel.hidden = true;
    els.playPanel.hidden = false;
    renderQuestion();
  }

  function nextQuestion() {
    if (state.index >= state.questions.length - 1) {
      const total = state.questions.length;
      els.sentence.textContent = `${state.score} / ${total}`;
      els.prompt.textContent = "퀴즈 완료";
      els.options.innerHTML = "";
      els.feedback.hidden = false;
      els.feedback.textContent =
        state.score === total
          ? "전부 맞았습니다. 같은 사진으로 한 번 더 해도 좋습니다."
          : "틀린 문장은 텍스트를 다시 보고 한 번 더 풀어 보세요.";
      els.nextBtn.textContent = "사진부터 다시";
      els.nextBtn.hidden = false;
      els.nextBtn.dataset.done = "1";
      setProgress("완료", 1);
      return;
    }
    els.nextBtn.dataset.done = "";
    state.index += 1;
    renderQuestion();
  }

  function open() {
    resetUpload();
    els.view.hidden = false;
  }

  els.file.addEventListener("change", () => {
    const file = els.file.files && els.file.files[0];
    if (file) handleFile(file);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    els.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    els.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove("dragover");
    });
  });
  els.dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  els.startBtn.addEventListener("click", startQuiz);
  els.nextBtn.addEventListener("click", () => {
    if (els.nextBtn.dataset.done === "1") {
      resetUpload();
      return;
    }
    nextQuestion();
  });

  window.EchoQuiz = { open };
})();

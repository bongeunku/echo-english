(() => {
  const els = {
    view: document.getElementById("quiz-view"),
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
    form: document.getElementById("quiz-form"),
    answer: document.getElementById("quiz-answer"),
    checkBtn: document.getElementById("quiz-check-btn"),
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
      if (window.Tesseract) {
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

  function cleanEnglish(text) {
    return (text || "")
      .replace(/[가-힣]+/g, " ")
      .replace(/[|\[\]{}<>~^_=+*#@]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s.,;:!?-]+|[\s.,;:]+$/g, "")
      .trim();
  }

  function extractHangul(text) {
    const parts = (text || "").match(/[가-힣]+(?:\s+[가-힣]+)*/g);
    return parts ? parts.join(" ").trim() : "";
  }

  function mergeNumberLines(lines) {
    const merged = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const next = lines[i + 1];
      if (/^(?:\d+|[IlO|])[.)]?$/.test(line) && next && /[A-Za-z가-힣]/.test(next)) {
        merged.push(`${line} ${next}`);
        i += 1;
      } else {
        merged.push(line);
      }
    }
    return merged;
  }

  function parseNumberedItems(rawText) {
    const lines = mergeNumberLines(
      (rawText || "")
        .split(/\n+/)
        .map((line) => line.replace(/[|]/g, "1").trim())
        .filter(Boolean)
    );
    const items = [];
    const seen = new Set();

    lines.forEach((line) => {
      const match = line.match(/^\s*(?:\d+|[IlO])[.)\-:]{0,2}\s+(.+)$/);
      if (!match) return;
      const rest = match[1].trim();
      const en = cleanEnglish(rest);
      const ko = extractHangul(rest);
      const key = normalizeAnswer(en);
      if (!/[a-z]/i.test(en) || key.length < 2 || seen.has(key)) return;
      seen.add(key);
      items.push({ en, ko });
    });

    if (items.length) return items;

    const inline = [...(rawText || "").matchAll(/(?:^|\s)(?:\d+|[IlO])[.)\-]{0,2}\s*([A-Za-z][A-Za-z'’\s-]{1,40})/g)];
    inline.forEach((match) => {
      const en = cleanEnglish(match[1]);
      const key = normalizeAnswer(en);
      if (!/[a-z]/i.test(en) || key.length < 2 || seen.has(key)) return;
      seen.add(key);
      items.push({ en, ko: "" });
    });

    if (items.length) return items;

    (rawText || "")
      .split(/\n+/)
      .map((line) => cleanEnglish(line))
      .filter((en) => /[a-z]/i.test(en) && en.split(" ").length <= 8)
      .forEach((en) => {
        const key = normalizeAnswer(en);
        if (key.length < 2 || seen.has(key)) return;
        seen.add(key);
        items.push({ en, ko: "" });
      });

    return items;
  }

  function formatItemList(items) {
    return items.map((item, index) => `${index + 1}. ${item.en}${item.ko ? `  ${item.ko}` : ""}`).join("\n");
  }

  async function translateEnToKo(text) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ko`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("translate failed");
    const data = await res.json();
    const translated = (data?.responseData?.translatedText || "").trim();
    if (!translated || /error|invalid/i.test(translated)) return "";
    return translated;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("이미지를 열 수 없습니다."));
      image.src = src;
    });
  }

  async function preprocessImage(file) {
    const src = URL.createObjectURL(file);
    try {
      const image = await loadImage(src);
      const scale = Math.max(2.2, 1800 / Math.max(image.width, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = pixels.data;
      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = data[i + 1] = data[i + 2] = gray;
        total += gray;
      }
      const avg = total / (data.length / 4);
      const threshold = Math.max(140, Math.min(200, avg * 0.9));
      for (let i = 0; i < data.length; i += 4) {
        const value = data[i] > threshold ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = value;
      }
      ctx.putImageData(pixels, 0, 0);
      return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    } finally {
      URL.revokeObjectURL(src);
    }
  }

  async function runOcr(blob, Tesseract, logger) {
    const worker = await Tesseract.createWorker("eng", 1, { logger });
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1",
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?'’-:",
      });
      const first = await worker.recognize(blob);
      await worker.setParameters({ tessedit_pageseg_mode: "4" });
      const second = await worker.recognize(blob);
      const a = first?.data?.text || "";
      const b = second?.data?.text || "";
      return parseNumberedItems(a).length >= parseNumberedItems(b).length ? a : b;
    } finally {
      await worker.terminate();
    }
  }

  async function recognizeImage(file) {
    els.ocrStatus.textContent = "사진을 선명하게 만든 뒤 숫자를 기준으로 읽고 있습니다…";
    setProgress("글자 인식 중", 0.1);
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
    const blob = await preprocessImage(file);
    const raw = await runOcr(blob, window.Tesseract, (info) => {
      if (info.status === "recognizing text" && info.progress) {
        setProgress("글자 인식 중", 0.15 + info.progress * 0.7);
        els.ocrStatus.textContent = `번호 옆 영어를 읽는 중… ${Math.round(info.progress * 100)}%`;
      }
    });
    const items = parseNumberedItems(raw);
    els.text.value = items.length ? formatItemList(items) : (raw || "").trim();
    if (!items.length) {
      els.ocrStatus.textContent =
        "번호 옆 영어를 잘 못 읽었습니다. 아래 목록을 1. apple 형식으로 직접 고친 뒤 퀴즈를 시작하세요.";
      setProgress("직접 수정 필요", 0.4);
      return;
    }
    els.ocrStatus.textContent = `${items.length}개를 찾았습니다. 틀린 줄만 고친 뒤 퀴즈를 시작하세요.`;
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

  async function buildQuestions(rawText) {
    const items = parseNumberedItems(rawText).slice(0, 12);
    const questions = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      setProgress(`뜻 만드는 중 ${i + 1}/${items.length}`, (i + 1) / items.length);
      els.ocrStatus.textContent = `한국어 문제를 만드는 중… ${i + 1}/${items.length}`;
      let ko = item.ko;
      if (!ko) {
        try {
          ko = await translateEnToKo(item.en);
        } catch {
          ko = "";
        }
      }
      questions.push({
        prompt: ko || item.en,
        answer: item.en,
        translated: Boolean(ko),
      });
    }
    return questions;
  }

  function renderQuestion() {
    const item = state.questions[state.index];
    if (!item) return;
    state.answered = false;
    els.prompt.textContent = item.translated
      ? "다음 뜻의 영어 스펠링을 쓰세요"
      : "다음 영어를 보고 스펠링을 그대로 쓰세요";
    els.sentence.textContent = item.prompt;
    els.feedback.hidden = true;
    els.nextBtn.hidden = true;
    els.nextBtn.textContent = state.index >= state.questions.length - 1 ? "결과 보기" : "다음";
    els.answer.disabled = false;
    els.checkBtn.disabled = false;
    els.answer.value = "";
    els.form.hidden = false;
    setProgress(`${state.index + 1} / ${state.questions.length}`, (state.index + 1) / state.questions.length);
    window.setTimeout(() => els.answer.focus(), 50);
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
    if (correct) state.score += 1;
    els.answer.disabled = true;
    els.checkBtn.disabled = true;
    els.feedback.hidden = false;
    els.feedback.textContent = correct ? "정답입니다." : `오답입니다. 정답은 ${item.answer}`;
    els.nextBtn.hidden = false;
  }

  async function startQuiz() {
    els.startBtn.disabled = true;
    try {
      const questions = await buildQuestions(els.text.value);
      if (questions.length < 1) {
        els.ocrStatus.textContent = "목록이 비었습니다. 1. apple 형식으로 영어를 적어 주세요.";
        return;
      }
      state.questions = questions;
      state.index = 0;
      state.score = 0;
      els.uploadPanel.hidden = true;
      els.playPanel.hidden = false;
      els.form.hidden = false;
      renderQuestion();
    } finally {
      els.startBtn.disabled = false;
    }
  }

  function showResult() {
    const total = state.questions.length;
    els.prompt.textContent = "퀴즈 완료";
    els.sentence.textContent = `${state.score} / ${total}`;
    els.form.hidden = true;
    els.feedback.hidden = false;
    els.feedback.textContent =
      state.score === total ? "전부 맞았습니다. 스펠링이 몸에 익었습니다." : "틀린 단어는 목록을 보고 한 번 더 써 보세요.";
    els.nextBtn.textContent = "사진부터 다시";
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

  function resetUpload() {
    els.uploadPanel.hidden = false;
    els.playPanel.hidden = true;
    els.text.value = "";
    els.preview.hidden = true;
    els.ocrStatus.textContent = "아직 사진을 올리지 않았습니다.";
    setProgress("사진 올리기", 0);
    els.nextBtn.dataset.done = "";
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = "";
    }
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
  els.form.addEventListener("submit", checkAnswer);
  els.nextBtn.addEventListener("click", () => {
    if (els.nextBtn.dataset.done === "1") {
      resetUpload();
      return;
    }
    nextQuestion();
  });

  window.EchoQuiz = { open };
})();

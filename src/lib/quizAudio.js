import { normalizeAnswer } from "./vocabParse";

let currentAudio = null;
let speakToken = 0;

function assetUrl(path) {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}${path.replace(/^\//, "")}`;
}

export function stopQuizSpeech() {
  speakToken += 1;
  window.speechSynthesis?.cancel();
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.onplaying = null;
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

function wordSlug(text) {
  return normalizeAnswer(text).replace(/\s+/g, "-");
}

function quizAudioUrl(text) {
  return assetUrl(`audio/quiz/${wordSlug(text)}.mp3`);
}

function koreanForSpeech(text) {
  return (text || "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, ms);
    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(null);
      });
  });
}

/** Resolves true once playback starts (not when it ends). */
function playFromUrl(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const audio = new Audio();
    currentAudio = audio;
    audio.preload = "auto";
    audio.preservesPitch = true;
    audio.playbackRate = 1;
    audio.volume = 1;
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (!ok && currentAudio === audio) {
        audio.pause();
        audio.src = "";
        currentAudio = null;
      }
      resolve(ok);
    };
    const timer = window.setTimeout(() => done(false), timeoutMs);
    audio.onplaying = () => done(true);
    audio.onerror = () => done(false);
    audio.src = url;
    audio.play().then(() => {}).catch(() => done(false));
  });
}

function playBlob(blob, timeoutMs = 1200) {
  const url = URL.createObjectURL(blob);
  return playFromUrl(url, timeoutMs).then((ok) => {
    if (!ok) URL.revokeObjectURL(url);
    else {
      const audio = currentAudio;
      if (audio) {
        audio.onended = () => URL.revokeObjectURL(url);
      } else {
        URL.revokeObjectURL(url);
      }
    }
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
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 700);
  try {
    const res = await fetch(
      `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent("en-US-JennyNeural")}&speed=1`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.includes("audio")) return null;
    return res.blob();
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function youdaoUsUrl(text) {
  return `https://dict.youdao.com/dictvoice?type=2&audio=${encodeURIComponent(text)}`;
}

async function dictionaryAudioUrl(text) {
  const word = normalizeAnswer(text);
  if (!word || word.split(" ").length > 2) return "";
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 900);
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: controller.signal,
    });
    window.clearTimeout(timer);
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
  const english = voices.filter(
    (v) => /^en(-|_)US/i.test(v.lang) && !/ko|Korean|Heami|Yuna|SunHi|InJoon|Compact/i.test(`${v.lang} ${v.name}`)
  );
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
  return playBlob(blob, 1200);
}

async function localFileExists(url) {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 400);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    window.clearTimeout(timer);
    const type = res.headers.get("content-type") || "";
    return res.ok && type.includes("audio");
  } catch {
    return false;
  }
}

export async function speakWord(text) {
  stopQuizSpeech();
  const token = speakToken;

  const spoken = String(text || "").trim();
  if (!spoken) return;
  const slug = wordSlug(spoken);
  const stillActive = () => token === speakToken;

  const cached = await withTimeout(getCachedAudio(slug), 400);
  if (!stillActive()) return;
  if (cached && cached.size >= 1200 && (await playBlob(cached, 1000))) return;

  const localUrl = quizAudioUrl(spoken);
  if (await localFileExists(localUrl)) {
    if (!stillActive()) return;
    if (await playFromUrl(localUrl, 1000)) return;
  }

  if (!stillActive()) return;
  const neural = await fetchNeuralAudio(spoken);
  if (!stillActive()) return;
  if (neural && (await cacheAndPlay(slug, neural))) return;

  if (!stillActive()) return;
  const dictUrl = await dictionaryAudioUrl(spoken);
  if (!stillActive()) return;
  if (dictUrl && (await playFromUrl(dictUrl, 1500))) return;

  if (!stillActive()) return;
  if (await playFromUrl(youdaoUsUrl(spoken), 1500)) return;

  if (!stillActive()) return;
  await speakLocal(spoken, "en-US");
}

export function speakKorean(text) {
  stopQuizSpeech();
  const spoken = koreanForSpeech(text);
  if (!spoken) return Promise.resolve();
  return speakLocal(spoken, "ko-KR");
}

export async function prefetchAudio(items) {
  const list = items || [];
  for (const item of list) {
    const text = item.en || item.answer;
    if (!text) continue;
    const slug = wordSlug(text);
    if (await getCachedAudio(slug)) continue;
    if (await localFileExists(quizAudioUrl(text))) continue;
    try {
      const blob = await fetchNeuralAudio(text);
      if (blob && blob.size >= 1200) {
        await setCachedAudio(slug, blob);
        continue;
      }
    } catch {
      /* continue */
    }
    const dictUrl = await dictionaryAudioUrl(text);
    if (!dictUrl) continue;
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 1500);
      const clip = await fetch(dictUrl, { signal: controller.signal });
      window.clearTimeout(timer);
      if (clip.ok) {
        const blob = await clip.blob();
        if (blob.size >= 1200) await setCachedAudio(slug, blob);
      }
    } catch {
      /* continue */
    }
  }
}

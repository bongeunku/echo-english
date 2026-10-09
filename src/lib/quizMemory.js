import { lookupMeaning, normalizeAnswer } from "./vocabParse";

const MEMORY_KEY = "echo-quiz-memory-v1";
const INTERVALS = [1, 3, 7, 14, 30];

function todayStamp() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

export function memoryKey(en, poolId) {
  return `${Number(poolId) > 0 ? Number(poolId) : 1}:${normalizeAnswer(en)}`;
}

export function loadMemory() {
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

export function rememberWords(items, poolId) {
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

export function forgetWords(items, poolId) {
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

export function recordReview(answer, correct, poolId, onCloudUpsert) {
  const memory = loadMemory();
  const wanted = normalizeAnswer(answer);
  const entry = Object.entries(memory.words).find(([key, word]) => {
    if (normalizeAnswer(word.en) !== wanted) return false;
    if (poolId) return (Number(word.poolId) || 1) === poolId || key.startsWith(`${poolId}:`);
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
  if (onCloudUpsert) onCloudUpsert(word);
}

export function localPoolIds() {
  const ids = [];
  Object.values(loadMemory().words).forEach((word) => {
    const id = Number(word.poolId) || 1;
    if (!ids.includes(id)) ids.push(id);
  });
  return ids.sort((a, b) => a - b);
}

export function lastPoolId(ids) {
  const list = (ids && ids.length ? ids : localPoolIds()).map(Number).filter((id) => id > 0);
  return list.length ? Math.max(...list) : 0;
}

export function localPoolWords(poolId) {
  const id = Number(poolId) || 1;
  return Object.values(loadMemory().words)
    .filter((word) => (Number(word.poolId) || 1) === id)
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
}

export function localWordCount() {
  return Object.keys(loadMemory().words).length;
}

export function mergeRemoteIntoMemory(words, poolId) {
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

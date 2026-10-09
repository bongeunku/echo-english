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

export function normalizeAnswer(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractHangul(text) {
  const parts = (text || "").match(/[가-힣]+(?:\s*[·,/]?\s*[가-힣]+)*/g);
  return parts ? parts.join(", ").replace(/\s+,/g, ",").trim() : "";
}

export function lookupMeaning(en) {
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

export function parseLine(line) {
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

export function parseWordList(rawText) {
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

export function formatWordLine(word) {
  return word.ko ? `${word.en} - ${word.ko}` : word.en;
}

export function questionsFromItems(items) {
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

export function meaningQuestionsFromItems(items) {
  return items
    .map((item) => {
      const ko = item.ko || lookupMeaning(item.en);
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

export function koreanMatches(typed, answer) {
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

export function shuffle(list) {
  const next = (list || []).slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = next[i];
    next[i] = next[j];
    next[j] = temp;
  }
  return next;
}

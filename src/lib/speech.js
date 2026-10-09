export function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function similarity(a, b) {
  const aa = normalize(a).split(" ").filter(Boolean);
  const bb = normalize(b).split(" ").filter(Boolean);
  if (!aa.length || !bb.length) return 0;
  const setB = new Set(bb);
  const hit = aa.filter((w) => setB.has(w)).length;
  return hit / Math.max(aa.length, bb.length);
}

export function audioUrl({ voice, topicId, index }) {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}audio/${voice}/${topicId}-${index}.mp3`;
}

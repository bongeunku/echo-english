const STORAGE_KEY = "echo-english-progress-v1";
const VOICE_KEY = "echo-english-voice-v1";

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveProgress(patch) {
  const next = { ...loadProgress(), ...patch, updatedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function loadVoice() {
  return localStorage.getItem(VOICE_KEY) || "en-US-AvaNeural";
}

export function saveVoice(voice) {
  localStorage.setItem(VOICE_KEY, voice);
}

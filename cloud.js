(() => {
  const cfg = window.ECHO_SUPABASE || {};
  const state = {
    supabase: null,
    userId: null,
    ready: false,
    error: "",
  };

  function statusText() {
    if (state.ready) return "클라우드 연결됨";
    if (state.error) return state.error;
    return "이 기기에만 저장";
  }

  async function init() {
    if (!cfg.url || !cfg.key || !window.supabase) {
      state.error = "클라우드 설정 없음";
      return false;
    }
    try {
      state.supabase = window.supabase.createClient(cfg.url, cfg.key);
      const existing = await state.supabase.auth.getSession();
      if (!existing.data.session) {
        const signed = await state.supabase.auth.signInAnonymously();
        if (signed.error) {
          state.error = "익명 로그인을 켜 주세요";
          return false;
        }
      }
      const user = await state.supabase.auth.getUser();
      state.userId = user.data.user && user.data.user.id;
      if (!state.userId) {
        state.error = "로그인 실패";
        return false;
      }
      state.ready = true;
      state.error = "";
      return true;
    } catch (err) {
      state.error = "클라우드 연결 실패";
      return false;
    }
  }

  function rowFromWord(word) {
    return {
      user_id: state.userId,
      en: word.en,
      ko: word.ko || "",
      en_key: (word.en || "").toLowerCase().replace(/[^a-z0-9'\s-]/g, " ").replace(/\s+/g, " ").trim(),
      streak: word.streak || 0,
      interval_index: word.intervalIndex || 0,
      last_reviewed: word.lastReviewed || 0,
      next_review: word.nextReview || 0,
      wrong_count: word.wrongCount || 0,
      correct_count: word.correctCount || 0,
      updated_at: new Date().toISOString(),
    };
  }

  function wordFromRow(row) {
    return {
      en: row.en,
      ko: row.ko || "",
      streak: row.streak || 0,
      intervalIndex: row.interval_index || 0,
      lastReviewed: Number(row.last_reviewed) || 0,
      nextReview: Number(row.next_review) || 0,
      wrongCount: row.wrong_count || 0,
      correctCount: row.correct_count || 0,
    };
  }

  async function pullWords() {
    if (!state.ready) return [];
    const { data, error } = await state.supabase.from("vocab_words").select("*");
    if (error || !data) return [];
    return data.map(wordFromRow);
  }

  async function upsertWord(word) {
    if (!state.ready) return;
    const { error } = await state.supabase.from("vocab_words").upsert(rowFromWord(word), {
      onConflict: "user_id,en_key",
    });
    if (error) state.error = "저장 실패";
  }

  async function upsertWords(words) {
    if (!state.ready || !words.length) return;
    const { error } = await state.supabase.from("vocab_words").upsert(words.map(rowFromWord), {
      onConflict: "user_id,en_key",
    });
    if (error) state.error = "저장 실패";
  }

  window.EchoCloud = {
    init,
    pullWords,
    upsertWord,
    upsertWords,
    statusText,
    isReady: () => state.ready,
  };
})();

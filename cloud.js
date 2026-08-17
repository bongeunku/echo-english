(() => {
  const cfg = window.ECHO_SUPABASE || {};
  const state = {
    supabase: null,
    userId: null,
    ready: false,
    error: "",
    provider: "",
    userLabel: "",
  };

  function redirectTo() {
    const path = window.location.pathname.endsWith("/")
      ? window.location.pathname
      : window.location.pathname.replace(/[^/]+$/, "");
    return `${window.location.origin}${path || "/"}`;
  }

  function statusText() {
    if (state.ready && state.provider === "github") {
      return state.userLabel ? `공유 목록 · ${state.userLabel}` : "공유 목록 · GitHub";
    }
    if (state.ready) return "공유 목록 연결됨";
    if (state.error) return state.error;
    return "이 기기에만 저장";
  }

  function applyUser(user) {
    state.userId = user && user.id;
    state.provider = (user && user.app_metadata && user.app_metadata.provider) || "";
    if (user && user.is_anonymous) state.provider = "anonymous";
    const meta = (user && user.user_metadata) || {};
    state.userLabel = meta.user_name || meta.preferred_username || meta.full_name || "";
    state.ready = Boolean(state.userId);
    state.error = state.ready ? "" : "로그인 실패";
    return state.ready;
  }

  async function init() {
    if (!cfg.url || !cfg.key || !window.supabase) {
      state.error = "클라우드 설정 없음";
      return false;
    }
    try {
      state.supabase = window.supabase.createClient(cfg.url, cfg.key, {
        auth: {
          persistSession: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      });
      const existing = await state.supabase.auth.getSession();
      if (existing.data.session && existing.data.session.user) {
        return applyUser(existing.data.session.user);
      }
      const signed = await state.supabase.auth.signInAnonymously();
      if (signed.error) {
        state.error = "GitHub로 로그인해 주세요";
        return false;
      }
      const user = signed.data.user || (await state.supabase.auth.getUser()).data.user;
      return applyUser(user);
    } catch (err) {
      state.error = "클라우드 연결 실패";
      return false;
    }
  }

  async function signInWithGitHub() {
    if (!state.supabase) {
      const ok = await init();
      if (!state.supabase) return ok;
    }
    const { error } = await state.supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: redirectTo() },
    });
    if (error) {
      state.error = "GitHub 로그인을 켜 주세요";
      return false;
    }
    return true;
  }

  async function signOut() {
    if (!state.supabase) return;
    await state.supabase.auth.signOut();
    state.userId = null;
    state.ready = false;
    state.provider = "";
    state.userLabel = "";
    state.error = "";
    return init();
  }

  function enKey(text) {
    return (text || "")
      .toLowerCase()
      .replace(/[’`]/g, "'")
      .replace(/[^a-z0-9'\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function rowFromWord(word) {
    return {
      user_id: state.userId,
      en: word.en,
      ko: word.ko || "",
      en_key: enKey(word.en),
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

  async function countWords() {
    if (!state.ready) return 0;
    const { count, error } = await state.supabase
      .from("vocab_words")
      .select("*", { count: "exact", head: true });
    if (error) return 0;
    return count || 0;
  }

  async function pullWordsPage(offset, limit) {
    if (!state.ready) return { words: [], total: 0, error: "not-ready" };
    const from = Math.max(0, offset);
    const to = from + Math.max(1, limit) - 1;
    const { data, error, count } = await state.supabase
      .from("vocab_words")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (error) {
      state.error = "불러오기 실패";
      return { words: [], total: 0, error: error.message || "불러오기 실패" };
    }
    const rows = data || [];
    return { words: rows.map(wordFromRow), total: count ?? rows.length };
  }

  async function upsertWord(word) {
    if (!state.ready) return false;
    const { error } = await state.supabase.from("vocab_words").upsert(rowFromWord(word), {
      onConflict: "en_key",
    });
    if (error) {
      state.error = "저장 실패";
      return false;
    }
    return true;
  }

  async function upsertWords(words) {
    if (!state.ready || !words.length) return false;
    const { error } = await state.supabase.from("vocab_words").upsert(words.map(rowFromWord), {
      onConflict: "en_key",
    });
    if (error) {
      state.error = "저장 실패";
      return false;
    }
    return true;
  }

  async function deleteWords(words) {
    if (!state.ready || !words.length) return false;
    const keys = words.map((word) => enKey(word.en || word)).filter(Boolean);
    if (!keys.length) return false;
    const { error } = await state.supabase.from("vocab_words").delete().in("en_key", keys);
    if (error) {
      state.error = "삭제 실패";
      return false;
    }
    return true;
  }

  window.EchoCloud = {
    init,
    signInWithGitHub,
    signOut,
    countWords,
    pullWordsPage,
    upsertWord,
    upsertWords,
    deleteWords,
    statusText,
    isReady: () => state.ready,
    isGitHub: () => state.provider === "github",
  };
})();

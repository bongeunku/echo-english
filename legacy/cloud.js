(() => {
  const cfg = window.ECHO_SUPABASE || {};
  const state = {
    supabase: null,
    userId: null,
    ready: false,
    error: "",
    provider: "",
    userLabel: "",
    noPoolColumn: false,
    lastError: "",
  };

  function redirectTo() {
    const path = window.location.pathname.endsWith("/")
      ? window.location.pathname
      : window.location.pathname.replace(/[^/]+$/, "");
    return `${window.location.origin}${path || "/"}`;
  }

  function statusText() {
    if (state.lastError) return state.lastError;
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

  function rowFromWord(word, withPool) {
    const row = {
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
    if (withPool !== false && !state.noPoolColumn) {
      row.pool_id = Number(word.poolId) > 0 ? Number(word.poolId) : 1;
    }
    return row;
  }

  function wordFromRow(row) {
    return {
      en: row.en,
      ko: row.ko || "",
      poolId: Number(row.pool_id) || 1,
      streak: row.streak || 0,
      intervalIndex: row.interval_index || 0,
      lastReviewed: Number(row.last_reviewed) || 0,
      nextReview: Number(row.next_review) || 0,
      wrongCount: row.wrong_count || 0,
      correctCount: row.correct_count || 0,
    };
  }

  function markMissingPool(error) {
    const msg = (error && error.message) || "";
    if (/column .*pool_id|pool_id.*does not exist|Could not find the 'pool_id' column/i.test(msg)) {
      state.noPoolColumn = true;
    }
    return msg;
  }

  async function listPools() {
    if (!state.ready) return [];
    if (state.noPoolColumn) {
      const count = await countWords();
      return count ? [1] : [];
    }
    const { data, error } = await state.supabase
      .from("vocab_words")
      .select("pool_id")
      .order("pool_id", { ascending: true });
    if (error) {
      markMissingPool(error);
      if (state.noPoolColumn) {
        const count = await countWords();
        return count ? [1] : [];
      }
      return [];
    }
    const ids = [];
    (data || []).forEach((row) => {
      const id = Number(row.pool_id) || 1;
      if (!ids.includes(id)) ids.push(id);
    });
    return ids;
  }

  async function nextPoolId() {
    const ids = await listPools();
    return ids.length ? Math.max(...ids) + 1 : 1;
  }

  async function countWords() {
    if (!state.ready) return 0;
    const { count, error } = await state.supabase
      .from("vocab_words")
      .select("*", { count: "exact", head: true });
    if (error) return 0;
    return count || 0;
  }

  async function pullPool(poolId) {
    if (!state.ready) return { words: [], poolId, error: "not-ready" };
    const id = Number(poolId) || 1;
    let query = state.supabase.from("vocab_words").select("*").order("updated_at", { ascending: true });
    if (!state.noPoolColumn) query = query.eq("pool_id", id);
    const { data, error } = await query;
    if (error) {
      markMissingPool(error);
      if (state.noPoolColumn) return pullPool(1);
      state.error = "불러오기 실패";
      return { words: [], poolId: id, error: error.message || "불러오기 실패" };
    }
    return { words: (data || []).map(wordFromRow), poolId: state.noPoolColumn ? 1 : id };
  }

  function failSave(error) {
    const msg = (error && error.message) || "알 수 없는 오류";
    state.lastError = `저장 실패: ${msg}`;
    state.error = state.lastError;
    return false;
  }

  async function writeRows(rows) {
    const conflicts = [];
    if (!state.noPoolColumn) conflicts.push("pool_id,en_key");
    conflicts.push("en_key");
    let lastError = null;
    for (const onConflict of conflicts) {
      const { error } = await state.supabase.from("vocab_words").upsert(rows, { onConflict });
      if (!error) {
        state.lastError = "";
        return true;
      }
      lastError = error;
      markMissingPool(error);
      if (state.noPoolColumn) {
        rows.forEach((row) => {
          delete row.pool_id;
        });
      }
    }
    const inserted = await state.supabase.from("vocab_words").insert(rows);
    if (!inserted.error) {
      state.lastError = "";
      return true;
    }
    return failSave(inserted.error || lastError);
  }

  async function upsertWord(word) {
    if (!state.ready) return false;
    return writeRows([rowFromWord(word, !state.noPoolColumn)]);
  }

  async function upsertWords(words, poolId) {
    if (!state.ready || !words.length) return false;
    const id = state.noPoolColumn ? 1 : Number(poolId) > 0 ? Number(poolId) : await nextPoolId();
    const rows = words.map((word) => rowFromWord({ ...word, poolId: id }, !state.noPoolColumn));
    const ok = await writeRows(rows);
    return ok ? id : false;
  }

  async function deleteWords(words, poolId) {
    if (!state.ready || !words.length) return false;
    const keys = words.map((word) => enKey(word.en || word)).filter(Boolean);
    if (!keys.length) return false;
    let query = state.supabase.from("vocab_words").delete().in("en_key", keys);
    if (Number(poolId) > 0) query = query.eq("pool_id", Number(poolId));
    const { error } = await query;
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
    listPools,
    nextPoolId,
    pullPool,
    upsertWord,
    upsertWords,
    deleteWords,
    statusText,
    lastError: () => state.lastError,
    isReady: () => state.ready,
    isGitHub: () => state.provider === "github",
  };
})();

import { createClient } from "@supabase/supabase-js";
import { SUPABASE } from "./config";

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

function failSave(error) {
  const msg = (error && error.message) || "알 수 없는 오류";
  state.lastError = `저장 실패: ${msg}`;
  state.error = state.lastError;
  return false;
}

async function writeRows(rows) {
  // pool이 있으면 pool_id+en_key만 사용. en_key만으로 upsert하면 다른 풀 단어를 덮어씀.
  const conflicts = state.noPoolColumn ? ["en_key"] : ["pool_id,en_key"];
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

/** Supabase 기본 1000행 제한을 넘는 조회용 */
async function fetchAllRows(buildQuery, pageSize = 1000) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { data: rows, error: null };
}

export const echoCloud = {
  statusText() {
    if (state.lastError) return state.lastError;
    if (state.ready && state.provider === "github") {
      return state.userLabel ? `공유 목록 · ${state.userLabel}` : "공유 목록 · GitHub";
    }
    if (state.ready) return "공유 목록 연결됨";
    if (state.error) return state.error;
    return "이 기기에만 저장";
  },

  lastError() {
    return state.lastError;
  },

  isReady() {
    return state.ready;
  },

  isGitHub() {
    return state.provider === "github";
  },

  async init() {
    if (!SUPABASE.url || !SUPABASE.key) {
      state.error = "클라우드 설정 없음";
      return false;
    }
    try {
      state.supabase = createClient(SUPABASE.url, SUPABASE.key, {
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
    } catch {
      state.error = "클라우드 연결 실패";
      return false;
    }
  },

  async signInWithGitHub() {
    if (!state.supabase) {
      const ok = await this.init();
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
  },

  async signOut() {
    if (!state.supabase) return false;
    await state.supabase.auth.signOut();
    state.userId = null;
    state.ready = false;
    state.provider = "";
    state.userLabel = "";
    state.error = "";
    return this.init();
  },

  async countWords() {
    if (!state.ready) return 0;
    const { count, error } = await state.supabase
      .from("vocab_words")
      .select("*", { count: "exact", head: true });
    if (error) return 0;
    return count || 0;
  },

  async listPools() {
    if (!state.ready) return [];
    if (state.noPoolColumn) {
      const count = await this.countWords();
      return count ? [1] : [];
    }
    // 전체 행을 받지 않고 최대 pool_id만 구한 뒤, 존재 여부만 병렬 확인
    const { data, error } = await state.supabase
      .from("vocab_words")
      .select("pool_id")
      .order("pool_id", { ascending: false })
      .limit(1);
    if (error) {
      markMissingPool(error);
      if (state.noPoolColumn) {
        const count = await this.countWords();
        return count ? [1] : [];
      }
      return [];
    }
    const max = data && data[0] ? Number(data[0].pool_id) || 0 : 0;
    if (max <= 0) return [];
    const found = await Promise.all(
      Array.from({ length: max }, (_, i) => i + 1).map(async (id) => {
        const { count, error: countError } = await state.supabase
          .from("vocab_words")
          .select("*", { count: "exact", head: true })
          .eq("pool_id", id);
        if (countError || !count) return null;
        return id;
      })
    );
    return found.filter(Boolean);
  },

  async nextPoolId() {
    if (!state.ready) return 1;
    if (state.noPoolColumn) return 1;
    const { data, error } = await state.supabase
      .from("vocab_words")
      .select("pool_id")
      .order("pool_id", { ascending: false })
      .limit(1);
    if (error) {
      markMissingPool(error);
      if (state.noPoolColumn) return 1;
      const ids = await this.listPools();
      return ids.length ? Math.max(...ids) + 1 : 1;
    }
    const max = data && data[0] ? Number(data[0].pool_id) || 0 : 0;
    return max + 1;
  },

  async pullPool(poolId) {
    if (!state.ready) return { words: [], poolId, error: "not-ready" };
    const id = Number(poolId) || 1;
    const { data, error } = await fetchAllRows(() => {
      let query = state.supabase
        .from("vocab_words")
        .select("*")
        .order("updated_at", { ascending: true });
      if (!state.noPoolColumn) query = query.eq("pool_id", id);
      return query;
    });
    if (error) {
      markMissingPool(error);
      if (state.noPoolColumn) return this.pullPool(1);
      state.error = "불러오기 실패";
      return { words: [], poolId: id, error: error.message || "불러오기 실패" };
    }
    return { words: (data || []).map(wordFromRow), poolId: state.noPoolColumn ? 1 : id };
  },

  async upsertWord(word) {
    if (!state.ready) return false;
    return writeRows([rowFromWord(word, !state.noPoolColumn)]);
  },

  async upsertWords(words, poolId) {
    if (!state.ready || !words.length) return false;
    const id = state.noPoolColumn ? 1 : Number(poolId) > 0 ? Number(poolId) : await this.nextPoolId();
    const rows = words.map((word) => rowFromWord({ ...word, poolId: id }, !state.noPoolColumn));
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const ok = await writeRows(rows.slice(i, i + chunkSize));
      if (!ok) return false;
    }
    return id;
  },

  async deleteWords(words, poolId) {
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
  },
};

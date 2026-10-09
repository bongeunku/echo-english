import { useCallback, useEffect, useRef, useState } from "react";
import { echoCloud } from "../lib/echoCloud";
import {
  forgetWords,
  lastPoolId,
  localPoolIds,
  localPoolWords,
  localWordCount,
  mergeRemoteIntoMemory,
  recordReview,
  rememberWords,
} from "../lib/quizMemory";
import {
  formatWordLine,
  koreanMatches,
  meaningQuestionsFromItems,
  normalizeAnswer,
  parseWordList,
  questionsFromItems,
  shuffle,
} from "../lib/vocabParse";
import { prefetchAudio, speakWord, stopQuizSpeech } from "../lib/quizAudio";

export default function QuizView({ onBack }) {
  const [phase, setPhase] = useState("setup");
  const [hint, setHint] = useState(
    "GitHub로 로그인하면 다른 컴퓨터에서도 같은 풀을 씁니다. 저장할 때마다 1, 2, 3번 풀이 생깁니다."
  );
  const [status, setStatus] = useState("저장된 단어 0개");
  const [draftText, setDraftText] = useState("");
  const [loadedText, setLoadedText] = useState("");
  const [pools, setPools] = useState([]);
  const [poolId, setPoolId] = useState(0);
  const [loadedWords, setLoadedWords] = useState([]);
  const [isGitHub, setIsGitHub] = useState(false);

  const [quizType, setQuizType] = useState("ko");
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState([]);
  const [answered, setAnswered] = useState(false);
  const [answer, setAnswer] = useState("");
  const [answerClass, setAnswerClass] = useState("");
  const [feedback, setFeedback] = useState("");
  const [feedbackHtml, setFeedbackHtml] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [progressLabel, setProgressLabel] = useState("목록 입력");
  const [progressRatio, setProgressRatio] = useState(0);
  const answerInputRef = useRef(null);

  const refreshStatus = useCallback(async (selectedPool) => {
    let count = localWordCount();
    if (echoCloud.isReady()) {
      const remote = await echoCloud.countWords();
      if (typeof remote === "number") count = Math.max(count, remote);
    }
    const poolText = selectedPool ? ` · 풀 ${selectedPool}` : "";
    setStatus(`저장된 단어 ${count}개${poolText} · ${echoCloud.statusText()}`);
    setIsGitHub(echoCloud.isGitHub());
  }, []);

  const refreshPools = useCallback(async () => {
    let ids = [];
    if (echoCloud.isReady()) ids = await echoCloud.listPools();
    if (!ids.length) ids = localPoolIds();
    setPools(ids);
    return ids;
  }, []);

  const loadPool = useCallback(
    async (id, announce) => {
      const pool = Number(id) || 0;
      if (!pool) {
        setPoolId(0);
        setLoadedWords([]);
        setLoadedText("");
        await refreshPools();
        await refreshStatus(0);
        return;
      }

      let words = [];
      let source = "local";
      if (echoCloud.isReady()) {
        const remote = await echoCloud.pullPool(pool);
        if (!remote.error && remote.words.length) {
          mergeRemoteIntoMemory(remote.words, pool);
          words = remote.words;
          source = "cloud";
        }
      }
      if (!words.length) words = localPoolWords(pool);

      setPoolId(pool);
      setLoadedWords(words);
      setLoadedText(words.map(formatWordLine).join("\n"));
      await refreshPools();
      await refreshStatus(pool);
      if (words.length) prefetchAudio(words);
      if (announce) {
        if (!words.length) {
          setHint(`${pool}번 풀에 단어가 없습니다.`);
          return;
        }
        const where = source === "cloud" ? "클라우드" : "이 기기";
        setHint(`${where} ${pool}번 풀 단어 ${words.length}개를 열었습니다.`);
      }
    },
    [refreshPools, refreshStatus]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await echoCloud.init();
      if (cancelled) return;
      const ids = await refreshPools();
      await refreshStatus(0);
      if (ids.length) await loadPool(lastPoolId(ids), false);
    })();
    return () => {
      cancelled = true;
      stopQuizSpeech();
    };
  }, [loadPool, refreshPools, refreshStatus]);

  async function handleSave() {
    const raw = draftText.trim();
    if (!raw) {
      setHint("저장할 단어를 먼저 입력해 주세요.");
      return;
    }
    const items = parseWordList(raw);
    if (!items.length) {
      setHint("목록을 읽지 못했습니다. 영어 단어를 한 줄에 하나씩 적어 주세요.");
      return;
    }

    const cloudOk = echoCloud.isReady() || (await echoCloud.init());
    if (!cloudOk) {
      const localId = (localPoolIds().pop() || 0) + 1;
      rememberWords(items, localId);
      setHint(`${localId}번 풀에 이 기기에만 저장했습니다. 연결 후 다시 저장해 주세요.`);
      await refreshPools();
      await loadPool(localId, false);
      return;
    }

    const nextId = await echoCloud.nextPoolId();
    const pooled = rememberWords(items, nextId);
    const ok = await echoCloud.upsertWords(pooled, nextId);
    if (!ok) {
      setHint(echoCloud.lastError() || echoCloud.statusText() || "클라우드 저장에 실패했습니다.");
      await refreshStatus(poolId);
      return;
    }

    setDraftText("");
    localStorage.removeItem("echo-quiz-list-v1");
    prefetchAudio(items);
    await loadPool(nextId, false);
    setHint(`${items.length}개 단어를 ${nextId}번 풀에 저장했습니다.`);
  }

  async function handleDelete() {
    const raw = draftText.trim();
    if (!raw) {
      setHint("삭제할 단어를 입력해 주세요.");
      return;
    }
    const items = parseWordList(raw);
    if (!items.length) {
      setHint("목록을 읽지 못했습니다. 영어 단어를 한 줄에 하나씩 적어 주세요.");
      return;
    }
    if (!window.confirm(`입력한 ${items.length}개 단어를 삭제할까요?`)) return;

    forgetWords(items, poolId);
    if (echoCloud.isReady() || (await echoCloud.init())) {
      const ok = await echoCloud.deleteWords(items, poolId);
      if (!ok) {
        setHint("클라우드 삭제에 실패했습니다. 이 기기에서는 지웠습니다.");
        await refreshStatus(poolId);
        return;
      }
    }

    setDraftText("");
    const ids = await refreshPools();
    if (poolId && ids.includes(poolId)) await loadPool(poolId, false);
    else if (ids.length) await loadPool(lastPoolId(ids), false);
    else {
      setPoolId(0);
      setLoadedWords([]);
      setLoadedText("");
      await refreshStatus(0);
    }
    setHint(`${items.length}개 단어를 삭제했습니다.`);
  }

  function startQuiz(type) {
    const typedItems = parseWordList(draftText.trim());
    const items = loadedWords.length ? loadedWords : typedItems;
    if (!items.length) {
      setHint("풀 번호를 누르거나 아래에 단어를 입력해 주세요.");
      return;
    }
    const mode = type === "en" ? "en" : "ko";
    const built = mode === "en" ? meaningQuestionsFromItems(items) : questionsFromItems(items);
    if (!built.length) {
      setHint(
        mode === "en"
          ? "한국어 뜻이 있는 단어가 없습니다. 뜻을 같이 저장해 주세요."
          : "목록을 읽지 못했습니다. 영어 단어를 한 줄에 하나씩 적어 주세요."
      );
      return;
    }

    const saved = rememberWords(items, poolId || 1);
    if (echoCloud.isReady() && poolId) echoCloud.upsertWords(saved, poolId);
    prefetchAudio(items);

    const shuffled = shuffle(built);
    setQuizType(mode);
    setQuestions(shuffled);
    setIndex(0);
    setScore(0);
    setMisses([]);
    setAnswered(false);
    setAnswer("");
    setAnswerClass("");
    setFeedback("");
    setFeedbackHtml("");
    setShowResult(false);
    setPhase("play");
    setProgressLabel(`1 / ${shuffled.length}`);
    setProgressRatio(1 / shuffled.length);
  }

  useEffect(() => {
    if (phase !== "play" || showResult || !questions[index]) return;
    setAnswered(false);
    setAnswer("");
    setAnswerClass("");
    setFeedback("");
    setFeedbackHtml("");
    setProgressLabel(`${index + 1} / ${questions.length}`);
    setProgressRatio((index + 1) / questions.length);
    const word = questions[index].answerEn || questions[index].answer;
    if (word) speakWord(word);
    requestAnimationFrame(() => answerInputRef.current?.focus());
  }, [phase, index, questions, showResult]);

  function checkAnswer(event) {
    event.preventDefault();
    if (answered || showResult) return;
    const item = questions[index];
    if (!item) return;
    const typed = answer.trim();
    if (!typed) {
      setFeedback(item.type === "meaning" ? "한국어 뜻을 입력해 주세요." : "스펠링을 입력해 주세요.");
      return;
    }

    const correct =
      item.type === "meaning"
        ? koreanMatches(typed, item.answer)
        : normalizeAnswer(typed) === normalizeAnswer(item.answer);

    setAnswered(true);
    setAnswerClass(correct ? "correct" : "wrong");
    if (correct) {
      setScore((value) => value + 1);
      setFeedbackHtml(`정답입니다. (<strong>${item.answer}</strong>)`);
    } else {
      setMisses((list) => [...list, { prompt: item.prompt, answer: item.answer, typed }]);
      setFeedbackHtml(
        `오답입니다. 입력: <span class="quiz-wrong-spell">${typed}</span> · 정답: <strong>${item.answer}</strong>`
      );
    }

    recordReview(item.answerEn || item.answer, correct, poolId, (word) => {
      if (echoCloud.isReady()) echoCloud.upsertWord(word);
    });
  }

  function goNext() {
    if (showResult) {
      setPhase("setup");
      setShowResult(false);
      setProgressLabel("목록 입력");
      setProgressRatio(0);
      stopQuizSpeech();
      return;
    }
    if (index >= questions.length - 1) {
      setShowResult(true);
      setProgressLabel("완료");
      setProgressRatio(1);
      stopQuizSpeech();
      return;
    }
    setIndex((value) => value + 1);
  }

  function retryQuiz() {
    if (!questions.length) return;
    const again = shuffle(questions);
    setQuestions(again);
    setIndex(0);
    setScore(0);
    setMisses([]);
    setAnswered(false);
    setAnswer("");
    setAnswerClass("");
    setFeedback("");
    setFeedbackHtml("");
    setShowResult(false);
    setProgressLabel(`1 / ${again.length}`);
    setProgressRatio(1 / again.length);
  }

  const current = questions[index];
  const promptText =
    showResult
      ? "퀴즈 완료"
      : current?.type === "meaning"
        ? "다음 영어의 한국어 뜻을 쓰세요"
        : current?.translated
          ? "다음 뜻의 영어 스펠링을 쓰세요"
          : "다음 영어의 스펠링을 쓰세요";

  return (
    <section className="quiz">
      <div className="practice-bar">
        <button
          className="btn text"
          type="button"
          onClick={() => {
            if (phase === "play") {
              stopQuizSpeech();
              setPhase("setup");
              setShowResult(false);
              setProgressLabel("목록 입력");
              setProgressRatio(0);
              return;
            }
            onBack();
          }}
        >
          ← 퀴즈
        </button>
        <div className="progress-wrap">
          <div className="progress-meta">
            <span>스펠링 퀴즈</span>
            <span>{progressLabel}</span>
          </div>
          <div className="progress-track" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${progressRatio * 100}%` }}></div>
          </div>
        </div>
      </div>

      {phase === "setup" ? (
        <div id="quiz-setup-panel">
          <article className="card-stage quiz-card">
            <h2 className="quiz-title">단어 스펠링 퀴즈</h2>
            <p className="hint">{hint}</p>
            <p className="voice-note">{status}</p>
            <div className="cta-row quiz-auth-row">
              {!isGitHub ? (
                <button
                  className="btn ghost small"
                  type="button"
                  onClick={async () => {
                    const ok = await echoCloud.signInWithGitHub();
                    if (!ok) setHint(echoCloud.statusText());
                    else await refreshStatus(poolId);
                  }}
                >
                  GitHub로 로그인
                </button>
              ) : (
                <button
                  className="btn text small"
                  type="button"
                  onClick={async () => {
                    await echoCloud.signOut();
                    await refreshStatus(poolId);
                    const ids = await refreshPools();
                    if (ids.length) await loadPool(lastPoolId(ids), false);
                  }}
                >
                  로그아웃
                </button>
              )}
            </div>

            <div className="quiz-stack">
              <section className="quiz-pane quiz-pane-load">
                <div className="quiz-pool-btns">
                  {pools.length ? (
                    pools.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={`quiz-pool-num${Number(id) === Number(poolId) ? " selected" : ""}`}
                        onClick={() => loadPool(id, true)}
                      >
                        {id}
                      </button>
                    ))
                  ) : (
                    <span className="quiz-pool-empty">아직 없음</span>
                  )}
                </div>
                <textarea
                  id="quiz-loaded-text"
                  rows="8"
                  readOnly
                  aria-label="선택한 풀의 단어"
                  placeholder="풀 번호를 누르면 여기에 표시됩니다."
                  value={loadedText}
                ></textarea>
              </section>

              <div className="cta-row quiz-start-row">
                <button className="btn primary" type="button" onClick={() => startQuiz("ko")}>
                  한국어 예문
                </button>
                <button className="btn ghost" type="button" onClick={() => startQuiz("en")}>
                  영어 예문
                </button>
              </div>

              <section className="quiz-pane quiz-pane-save">
                <h3 className="quiz-pane-title">단어 저장 · 삭제</h3>
                <textarea
                  id="quiz-text"
                  rows="3"
                  aria-label="새 단어"
                  placeholder={"apart\nbreak up\ncontinent"}
                  value={draftText}
                  onChange={(event) => setDraftText(event.target.value)}
                ></textarea>
                <div className="cta-row quiz-pane-actions">
                  <button className="btn ghost small" type="button" onClick={handleSave}>
                    단어 저장
                  </button>
                  <button className="btn ghost small danger" type="button" onClick={handleDelete}>
                    단어 삭제
                  </button>
                </div>
              </section>
            </div>
          </article>
        </div>
      ) : (
        <article className="card-stage quiz-card">
          <div className="quiz-play-top">
            <p className="ko">{promptText}</p>
            <button className="btn ghost small quiz-retry-btn" type="button" onClick={retryQuiz}>
              다시 도전
            </button>
          </div>

          <p className="en">
            {showResult ? `${score} / ${questions.length}` : current?.prompt || ""}
          </p>

          {!showResult ? (
            <button
              className="btn ghost small quiz-listen"
              type="button"
              onClick={() => speakWord(current?.answerEn || current?.answer)}
            >
              ▶ 원어민 발음 듣기
            </button>
          ) : null}

          {!showResult ? (
            <form className="quiz-form" onSubmit={checkAnswer}>
              <input
                ref={answerInputRef}
                className={`quiz-answer ${answerClass}`}
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={current?.type === "meaning" ? "한국어 뜻 입력" : "영어 스펠링 입력"}
                value={answer}
                disabled={answered}
                onChange={(event) => setAnswer(event.target.value)}
              />
              <button className="btn primary" type="submit" disabled={answered}>
                확인
              </button>
            </form>
          ) : null}

          {feedback ? <p className="transcript">{feedback}</p> : null}
          {feedbackHtml ? (
            <p className="transcript" dangerouslySetInnerHTML={{ __html: feedbackHtml }}></p>
          ) : null}

          {showResult && misses.length ? (
            <>
              <p className="transcript">{`틀린 단어 ${misses.length}개입니다.`}</p>
              <ul className="quiz-miss-list">
                {misses.map((miss, i) => (
                  <li key={`${miss.answer}-${i}`}>
                    <span className="quiz-miss-ko">{miss.prompt}</span> · 입력{" "}
                    <span className="quiz-wrong-spell">{miss.typed}</span> → 정답 <strong>{miss.answer}</strong>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {showResult && !misses.length ? <p className="transcript">전부 맞았습니다.</p> : null}

          {(answered || showResult) && (
            <div className="cta-row quiz-next-row">
              <button className="btn ghost" type="button" onClick={goNext}>
                {showResult ? "목록으로" : index >= questions.length - 1 ? "결과 보기" : "다음"}
              </button>
            </div>
          )}
        </article>
      )}
    </section>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildPlaylist, getTopic } from "../lib/topics";
import { loadVoice, saveProgress, saveVoice } from "../lib/progress";
import { similarity } from "../lib/speech";
import { useLineAudio, useSpeechRecognition } from "../hooks/useAudio";

const VOICES = [
  { value: "en-US-AvaNeural", label: "Ava (미국 · 여성)" },
  { value: "en-US-EmmaNeural", label: "Emma (미국 · 여성)" },
  { value: "en-US-AndrewNeural", label: "Andrew (미국 · 남성)" },
];

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function PracticeSession({
  mode,
  topicId,
  startIndex = 0,
  onBack,
  onComplete,
}) {
  const playlist = useMemo(() => (mode === "all" ? buildPlaylist() : []), [mode]);
  const topic = mode === "all" ? null : getTopic(topicId);

  const [index, setIndex] = useState(startIndex);
  const [hideEnglish, setHideEnglish] = useState(false);
  const [phase, setPhase] = useState("READY");
  const [hint, setHint] = useState("먼저 듣고, 같은 리듬으로 따라 말하세요.");
  const [voice, setVoice] = useState(loadVoice);
  const [speed, setSpeed] = useState("1");
  const [allListenPlaying, setAllListenPlaying] = useState(false);

  const playTokenRef = useRef(0);
  const indexRef = useRef(index);
  const { speaking, voiceNote, speakLine, stopSpeech } = useLineAudio();
  const {
    micVisible,
    micLabel,
    setMicLabel,
    transcript,
    transcriptVisible,
    startListening,
    stopRecognition,
    resetMicUi,
  } = useSpeechRecognition();

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const lines = mode === "all" ? playlist : topic?.lines || [];
  const line = lines[index] || null;
  const title = mode === "all" ? "전체 듣기" : topic?.title || "";
  const audioTopicId = mode === "all" ? line?.topicId : topicId;
  const audioIndex = mode === "all" ? line?.audioIndex ?? index : index;
  const voiceLabel = VOICES.find((item) => item.value === voice)?.label || "미국 음성";

  const stopAllListen = useCallback(() => {
    playTokenRef.current += 1;
    setAllListenPlaying(false);
  }, []);

  const persistLine = useCallback(
    (nextIndex) => {
      saveProgress({
        topicId: mode === "all" ? "all" : topicId,
        index: nextIndex,
      });
    },
    [mode, topicId]
  );

  useEffect(() => {
    if (!line) return;
    setPhase("READY");
    resetMicUi();
    setHint(
      mode === "all"
        ? `${line.topicTitle} · 일상부터 스몰톡까지 이어서 들려줍니다`
        : "먼저 듣고, 같은 리듬으로 따라 말하세요."
    );
    persistLine(index);
  }, [line, index, mode, persistLine, resetMicUi]);

  const playCurrent = useCallback(async () => {
    if (!line) return;
    await speakLine({
      voice,
      topicId: audioTopicId,
      index: audioIndex,
      speed,
      voiceLabel,
    });
  }, [line, speakLine, voice, audioTopicId, audioIndex, speed, voiceLabel]);

  const runAllListen = useCallback(
    async (fromIndex) => {
      const token = (playTokenRef.current += 1);
      setAllListenPlaying(true);
      setPhase("LISTEN");

      for (let i = fromIndex; i < playlist.length; i += 1) {
        if (token !== playTokenRef.current) return;
        setIndex(i);
        const current = playlist[i];
        setPhase("LISTEN");
        setHint(`${current.topicTitle} · 전체 듣기 재생 중`);
        try {
          await speakLine({
            voice,
            topicId: current.topicId,
            index: current.audioIndex,
            speed,
            voiceLabel,
          });
        } catch {
          if (token === playTokenRef.current) {
            stopAllListen();
            setPhase("READY");
          }
          return;
        }
        if (token !== playTokenRef.current) return;
        await delay(700);
      }

      if (token !== playTokenRef.current) return;
      stopAllListen();
      saveProgress({ topicId: "all", index: 0, completedAt: Date.now() });
      onComplete(`일상 대화부터 스몰톡까지 ${playlist.length}문장 듣기를 마쳤습니다.`);
    },
    [playlist, speakLine, voice, speed, voiceLabel, stopAllListen, onComplete]
  );

  useEffect(() => {
    if (mode !== "all") return undefined;
    runAllListen(startIndex);
    return () => {
      stopAllListen();
      stopSpeech();
      stopRecognition();
    };
    // mount-only for all-listen start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      stopAllListen();
      stopSpeech();
      stopRecognition();
    },
    [stopAllListen, stopSpeech, stopRecognition]
  );

  async function handleListen() {
    if (!line || speaking) return;
    if (mode === "all") stopAllListen();
    stopRecognition();
    setPhase("LISTEN");
    setHint("귀로만 집중해서 들어보세요.");
    try {
      await playCurrent();
    } catch {
      setPhase("READY");
      return;
    }
    setPhase("READY");
    setHint(
      mode === "all"
        ? "이어 듣기를 누르면 다음 문장부터 다시 재생됩니다."
        : "이제 ‘따라하기’를 눌러 같은 문장을 말해 보세요."
    );
  }

  async function handleEcho() {
    if (!line || speaking) return;
    if (mode === "all") stopAllListen();
    stopRecognition();
    setPhase("LISTEN");
    setHint("듣고…");
    try {
      await playCurrent();
    } catch {
      setPhase("READY");
      return;
    }
    setPhase("ECHO");
    setHint("지금! 바로 따라 말하세요.");
    startListening(line.en, (spoken, expected) => {
      const score = similarity(expected, spoken);
      setMicLabel(
        score >= 0.55
          ? `좋아요! 유사도 ${Math.round(score * 100)}%`
          : `다시 한 번? 유사도 ${Math.round(score * 100)}%`
      );
    });
  }

  function handleNext() {
    if (!lines.length) return;
    if (mode === "all") {
      stopAllListen();
      stopSpeech();
      stopRecognition();
      if (index >= playlist.length - 1) {
        saveProgress({ topicId: "all", index: 0, completedAt: Date.now() });
        onComplete(`일상 대화부터 스몰톡까지 ${playlist.length}문장 듣기를 마쳤습니다.`);
        return;
      }
      const next = index + 1;
      setIndex(next);
      runAllListen(next);
      return;
    }

    stopSpeech();
    stopRecognition();
    if (index >= lines.length - 1) {
      saveProgress({ topicId, index: 0, completedAt: Date.now() });
      onComplete(
        `「${title}」 ${lines.length}문장 완료. 같은 세트를 반복할수록 입이 편해집니다.`
      );
      return;
    }
    setIndex((value) => value + 1);
  }

  function handlePauseAll() {
    if (mode !== "all") return;
    if (allListenPlaying) {
      stopAllListen();
      stopSpeech();
      setPhase("READY");
      setHint("일시정지됨. 이어 듣기를 누르면 이어서 재생됩니다.");
      return;
    }
    runAllListen(indexRef.current);
  }

  if (!line) {
    return (
      <section className="practice">
        <p className="hint">문장을 불러오지 못했습니다.</p>
        <button className="btn text" type="button" onClick={onBack}>
          ← 주제
        </button>
      </section>
    );
  }

  return (
    <section className="practice">
      <div className="practice-bar">
        <button className="btn text" type="button" onClick={onBack}>
          ← 주제
        </button>
        <div className="progress-wrap">
          <div className="progress-meta">
            <span>{title}</span>
            <span>
              {index + 1} / {lines.length}
            </span>
          </div>
          <div className="progress-track" aria-hidden="true">
            <div
              className="progress-fill"
              style={{ width: `${((index + 1) / lines.length) * 100}%` }}
            ></div>
          </div>
        </div>
        <div className="voice-tools">
          <div className="speed-wrap">
            <label htmlFor="voice">미국 음성</label>
            <select
              id="voice"
              value={voice}
              onChange={(event) => {
                setVoice(event.target.value);
                saveVoice(event.target.value);
              }}
            >
              {VOICES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="speed-wrap">
            <label htmlFor="speed">속도</label>
            <select id="speed" value={speed} onChange={(event) => setSpeed(event.target.value)}>
              <option value="0.85">느리게</option>
              <option value="1">보통</option>
              <option value="1.1">빠르게</option>
            </select>
          </div>
        </div>
      </div>

      <article className="card-stage">
        <p className="ko">{line.ko}</p>
        <p className={`en${hideEnglish ? " hidden-en" : ""}`}>{line.en}</p>
        <p className="hint">{hint}</p>
        <div className={`phase ${phase.toLowerCase()}`}>{phase}</div>
        <p className="voice-note">{voiceNote}</p>

        <div className="controls">
          <button className="ctrl" type="button" title="듣기" onClick={handleListen}>
            <span className="ctrl-icon">▶</span>
            <span>듣기</span>
          </button>
          <button className="ctrl main" type="button" title="따라하기" onClick={handleEcho}>
            <span className="ctrl-icon">◎</span>
            <span>따라하기</span>
          </button>
          <button className="ctrl" type="button" title="다음" onClick={handleNext}>
            <span className="ctrl-icon">→</span>
            <span>다음</span>
          </button>
        </div>

        {micVisible ? (
          <div className="mic-status">
            <span className="pulse"></span>
            <span>{micLabel}</span>
          </div>
        ) : null}
        {transcriptVisible ? <p className="transcript">{transcript}</p> : null}
      </article>

      <div className="tips">
        <button
          className="btn ghost small"
          type="button"
          onClick={() => setHideEnglish((value) => !value)}
        >
          {hideEnglish ? "영어 보기" : "영어 가리기/보기"}
        </button>
        <button
          className="btn ghost small"
          type="button"
          onClick={() => {
            setIndex(0);
            if (mode === "all") runAllListen(0);
          }}
        >
          이 세트 다시
        </button>
        {mode === "all" ? (
          <button className="btn ghost small" type="button" onClick={handlePauseAll}>
            {allListenPlaying ? "일시정지" : "이어 듣기"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

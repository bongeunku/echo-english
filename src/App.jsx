import { useMemo, useState } from "react";
import Home from "./components/Home.jsx";
import TopicPicker from "./components/TopicPicker.jsx";
import PracticeSession from "./components/PracticeSession.jsx";
import DoneView from "./components/DoneView.jsx";
import QuizView from "./components/QuizView.jsx";
import { getTopic } from "./lib/topics";
import { loadProgress } from "./lib/progress";
import "./styles.css";

export default function App() {
  const [view, setView] = useState("home");
  const [session, setSession] = useState(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [doneSummary, setDoneSummary] = useState("");
  const [progressTick, setProgressTick] = useState(0);

  const progress = useMemo(() => loadProgress(), [progressTick, view]);

  const continueInfo = useMemo(() => {
    if (progress.topicId === "all") {
      return { canContinue: true, label: "이어서: 전체 듣기" };
    }
    const topic = getTopic(progress.topicId);
    if (!topic) return { canContinue: false, label: "이어서 하기" };
    return { canContinue: true, label: `이어서: ${topic.title}` };
  }, [progress]);

  function beginSession(next) {
    setSession(next);
    setSessionKey((value) => value + 1);
    setView("practice");
  }

  function goTopics() {
    setProgressTick((value) => value + 1);
    setView("pick");
  }

  function openTopic(topicId, index = 0) {
    beginSession({ mode: "topic", topicId, startIndex: index });
  }

  function openAllListen(index = 0) {
    beginSession({ mode: "all", topicId: "all", startIndex: index });
  }

  function handleContinue() {
    const saved = loadProgress();
    if (saved.topicId === "all") {
      openAllListen(saved.index || 0);
      return;
    }
    if (saved.topicId) openTopic(saved.topicId, saved.index || 0);
  }

  return (
    <>
      <div className="noise" aria-hidden="true"></div>
      <div className="aurora" aria-hidden="true"></div>

      <header className="top">
        <button className="brand" type="button" aria-label="주제 화면으로" onClick={goTopics}>
          <span className="brand-mark" aria-hidden="true"></span>
          <span className="brand-name">ECHO</span>
        </button>
        <p className="tagline">듣고 → 따라하고 → 입이 열립니다</p>
      </header>

      <main>
        {view === "home" ? (
          <Home
            onStart={goTopics}
            onContinue={handleContinue}
            canContinue={continueInfo.canContinue}
            continueLabel={continueInfo.label}
          />
        ) : null}

        {view === "pick" ? (
          <TopicPicker
            onSelectTopic={(id) => openTopic(id, 0)}
            onAllListen={() => openAllListen(0)}
            onOpenQuiz={() => setView("quiz")}
          />
        ) : null}

        {view === "practice" && session ? (
          <PracticeSession
            key={sessionKey}
            mode={session.mode}
            topicId={session.topicId}
            startIndex={session.startIndex}
            onBack={goTopics}
            onComplete={(summary) => {
              setDoneSummary(summary);
              setView("done");
            }}
          />
        ) : null}

        {view === "quiz" ? <QuizView onBack={goTopics} /> : null}

        {view === "done" ? (
          <DoneView
            summary={doneSummary}
            onAgain={() => {
              if (session?.mode === "all") openAllListen(0);
              else if (session?.topicId) openTopic(session.topicId, 0);
            }}
            onTopics={goTopics}
          />
        ) : null}
      </main>

      <footer className="foot">
        <p>마이크 권한을 허용하면 따라 말한 내용도 확인할 수 있어요. (Chrome 권장)</p>
      </footer>
    </>
  );
}

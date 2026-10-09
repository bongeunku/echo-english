import { TOPICS, totalLineCount } from "../lib/topics";

export default function TopicPicker({ onSelectTopic, onAllListen, onOpenQuiz }) {
  return (
    <section className="pick">
      <div className="section-head">
        <h2>연습할 주제</h2>
        <p>하루 한 세트면 충분합니다. 따라 말하는 데만 집중하세요.</p>
      </div>
      <div className="topic-grid">
        {TOPICS.map((topic) => (
          <button
            key={topic.id}
            type="button"
            className="topic"
            onClick={() => onSelectTopic(topic.id)}
          >
            <span className="emoji" aria-hidden="true">
              {topic.emoji}
            </span>
            <h3>{topic.title}</h3>
            <p>{topic.desc}222</p>
            <div className="meta">{topic.lines.length}문장 · 따라하기</div>
          </button>
        ))}
        <button type="button" className="topic listen-all" onClick={onAllListen}>
          <span className="emoji" aria-hidden="true">
            🎧
          </span>
          <h3>전체 듣기</h3>
          <p>일상 대화부터 스몰톡까지 이어서 듣기</p>
          <div className="meta">{totalLineCount()}문장 · 자동 재생</div>
        </button>
        <button type="button" className="topic quiz-card-btn" onClick={onOpenQuiz}>
          <span className="emoji" aria-hidden="true">
            📷
          </span>
          <h3>스펠링 퀴즈</h3>
          <p>한국어 뜻 → 영어 스펠링, 영어 스펠링 → 한국어 뜻</p>
          <div className="meta">한국어 예문 · 영어 예문</div>
        </button>
      </div>
    </section>
  );
}

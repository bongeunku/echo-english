export default function DoneView({ summary, onAgain, onTopics }) {
  return (
    <section className="done">
      <h2>오늘 세트 완료</h2>
      <p>{summary}</p>
      <div className="cta-row">
        <button className="btn primary" type="button" onClick={onAgain}>
          같은 세트 한 번 더
        </button>
        <button className="btn ghost" type="button" onClick={onTopics}>
          다른 주제
        </button>
      </div>
    </section>
  );
}

export default function Home({ onStart, onContinue, continueLabel, canContinue }) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <h1>
          따라하기만 하면
          <br />
          영어가 열립니다
        </h1>
        <p className="hero-sub">
          문장을 듣고, 바로 따라 말하세요. 문법 공부 없이 <em>입과 귀가 먼저</em> 익숙해지는
          연습입니다.
        </p>
        <div className="cta-row">
          <button className="btn primary" type="button" onClick={onStart}>
            오늘 연습 시작
          </button>
          {canContinue ? (
            <button className="btn ghost" type="button" onClick={onContinue}>
              {continueLabel}
            </button>
          ) : null}
        </div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <div className="wave-ring r1"></div>
        <div className="wave-ring r2"></div>
        <div className="wave-ring r3"></div>
        <div className="mic-core">
          <span>ECHO</span>
        </div>
      </div>
    </section>
  );
}

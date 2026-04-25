const days = [3, 4, 2, 5, 4, 4, 3];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero card">
        <p className="eyebrow">today</p>
        <h1>How are you feeling?</h1>
        <div className="moodRow">
          {[1,2,3,4,5].map((n) => (
            <button key={n} className={n === 4 ? 'mood active' : 'mood'}>{n}</button>
          ))}
        </div>
      </section>

      <section className="card chartCard">
        <p className="eyebrow">last 7 days</p>
        <div className="bars">
          {days.map((d, i) => (
            <div key={i} className="barWrap">
              <div className="bar" style={{ height: `${d * 18}%` }} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

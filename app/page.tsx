'use client';

import { useEffect, useMemo, useState } from 'react';

type MoodEntry = {
  date: string;
  mood: number;
  interventions: {
    noScrollMorning: boolean;
    dailyWalk: boolean;
    postWorkDecompression: boolean;
  };
};

const MOOD_LABELS: Record<number, string> = {
  1: 'Rough',
  2: 'Low',
  3: 'Okay',
  4: 'Good',
  5: 'Great'
};

const EMPTY_INTERVENTIONS = {
  noScrollMorning: false,
  dailyWalk: false,
  postWorkDecompression: false
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadEntries(): MoodEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem('mood-tracker-entries');
    return raw ? (JSON.parse(raw) as MoodEntry[]) : [];
  } catch {
    return [];
  }
}

export default function HomePage() {
  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [todayInterventions, setTodayInterventions] = useState(EMPTY_INTERVENTIONS);

  useEffect(() => {
    const loaded = loadEntries().sort((a, b) => a.date.localeCompare(b.date));
    setEntries(loaded);
    const today = loaded.find((entry) => entry.date === todayKey());
    setSelectedMood(today?.mood ?? null);
    setTodayInterventions(today?.interventions ?? EMPTY_INTERVENTIONS);
  }, []);

  const recentEntries = useMemo(() => entries.slice(-14), [entries]);
  const latest = entries[entries.length - 1] ?? null;
  const averageMood = entries.length
    ? (entries.reduce((sum, entry) => sum + entry.mood, 0) / entries.length).toFixed(1)
    : null;
  const interventionAverage = entries.length
    ? (entries.reduce((sum, entry) => {
        const completed = Object.values(entry.interventions).filter(Boolean).length;
        return sum + completed;
      }, 0) / entries.length).toFixed(1)
    : null;

  function persist(nextEntries: MoodEntry[]) {
    const sorted = [...nextEntries].sort((a, b) => a.date.localeCompare(b.date));
    setEntries(sorted);
    window.localStorage.setItem('mood-tracker-entries', JSON.stringify(sorted));
  }

  function upsertToday(partial: Partial<MoodEntry>) {
    const today = todayKey();
    const existingIndex = entries.findIndex((entry) => entry.date === today);

    if (existingIndex >= 0) {
      const next = entries.map((entry, index) =>
        index === existingIndex
          ? {
              ...entry,
              ...partial,
              interventions: partial.interventions ?? entry.interventions
            }
          : entry
      );
      persist(next);
      return;
    }

    persist([
      ...entries,
      {
        date: today,
        mood: partial.mood ?? 3,
        interventions: partial.interventions ?? EMPTY_INTERVENTIONS
      }
    ]);
  }

  function saveMood(mood: number) {
    setSelectedMood(mood);
    upsertToday({ mood, interventions: todayInterventions });
  }

  function toggleIntervention(key: keyof typeof EMPTY_INTERVENTIONS) {
    const next = {
      ...todayInterventions,
      [key]: !todayInterventions[key]
    };
    setTodayInterventions(next);
    upsertToday({ mood: selectedMood ?? 3, interventions: next });
  }

  return (
    <main className="shell">
      <section className="hero card">
        <p className="eyebrow">today</p>
        <h1>How are you feeling?</h1>
        <p className="sub">One quick check-in. No overthinking.</p>
        <div className="moodRow">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={n === selectedMood ? 'mood active' : 'mood'} onClick={() => saveMood(n)}>
              <span>{n}</span>
              <small>{MOOD_LABELS[n]}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="card interventionsCard">
        <div className="cardHeader">
          <div>
            <p className="eyebrow">mental baseline</p>
            <h2>Daily interventions</h2>
          </div>
        </div>
        <div className="interventionList">
          <button className={todayInterventions.noScrollMorning ? 'intervention active' : 'intervention'} onClick={() => toggleIntervention('noScrollMorning')}>
            <strong>No-scroll morning</strong>
            <span>Protect your first attention window</span>
          </button>
          <button className={todayInterventions.dailyWalk ? 'intervention active' : 'intervention'} onClick={() => toggleIntervention('dailyWalk')}>
            <strong>Daily walk</strong>
            <span>Get your body and head unstuck</span>
          </button>
          <button className={todayInterventions.postWorkDecompression ? 'intervention active' : 'intervention'} onClick={() => toggleIntervention('postWorkDecompression')}>
            <strong>Post-work decompression</strong>
            <span>Actually come down after the day</span>
          </button>
        </div>
      </section>

      <section className="grid">
        <article className="card statCard">
          <span>Latest</span>
          <strong>{latest ? MOOD_LABELS[latest.mood] : '—'}</strong>
        </article>
        <article className="card statCard">
          <span>Average</span>
          <strong>{averageMood ?? '—'}</strong>
        </article>
        <article className="card statCard full">
          <span>Avg interventions/day</span>
          <strong>{interventionAverage ?? '—'}</strong>
        </article>
      </section>

      <section className="card chartCard">
        <div className="cardHeader">
          <div>
            <p className="eyebrow">last 14 days</p>
            <h2>Mood trend</h2>
          </div>
        </div>

        <div className="bars">
          {recentEntries.length ? (
            recentEntries.map((entry) => (
              <div key={entry.date} className="barWrap">
                <div className="barValue">{entry.mood}</div>
                <div className="bar" style={{ height: `${entry.mood * 18}%` }} />
                <div className="barLabel">{entry.date.slice(5)}</div>
              </div>
            ))
          ) : (
            <p className="emptyState">Log a few days and I’ll start drawing the line of your life.</p>
          )}
        </div>
      </section>

      <section className="card historyCard">
        <div className="cardHeader">
          <div>
            <p className="eyebrow">history</p>
            <h2>Recent entries</h2>
          </div>
        </div>

        <div className="historyList">
          {entries.length ? (
            [...entries].reverse().slice(0, 10).map((entry) => {
              const completed = Object.values(entry.interventions).filter(Boolean).length;
              return (
                <div className="historyRow" key={entry.date}>
                  <div>
                    <span>{entry.date}</span>
                    <small>{completed}/3 interventions</small>
                  </div>
                  <strong>{entry.mood} · {MOOD_LABELS[entry.mood]}</strong>
                </div>
              );
            })
          ) : (
            <p className="emptyState">No entries yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}

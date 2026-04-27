'use client';

import { useEffect, useMemo, useState } from 'react';

type Interventions = {
  noScrollMorning: boolean;
  dailyWalk: boolean;
  postWorkDecompression: boolean;
};

type MetricKey = 'mood' | 'anxiety' | 'energy' | 'sleep';

type MoodEntry = {
  date: string;
  mood: number;
  anxiety: number;
  energy: number;
  sleep: number;
  note?: string;
  interventions: Interventions;
};

const SCORE_LABELS: Record<MetricKey, Record<number, string>> = {
  mood: {
    1: 'Rough',
    2: 'Low',
    3: 'Okay',
    4: 'Good',
    5: 'Great'
  },
  anxiety: {
    1: 'Calm',
    2: 'Light',
    3: 'Noticeable',
    4: 'High',
    5: 'Spiky'
  },
  energy: {
    1: 'Drained',
    2: 'Low',
    3: 'Steady',
    4: 'Strong',
    5: 'Charged'
  },
  sleep: {
    1: 'Awful',
    2: 'Rough',
    3: 'Okay',
    4: 'Solid',
    5: 'Great'
  }
};

const METRIC_META: Array<{
  key: MetricKey;
  title: string;
  eyebrow: string;
  description: string;
  positiveDirection: 'higher' | 'lower';
}> = [
  {
    key: 'mood',
    title: 'Mood',
    eyebrow: 'overall',
    description: 'How the day feels in the big picture.',
    positiveDirection: 'higher'
  },
  {
    key: 'anxiety',
    title: 'Anxiety',
    eyebrow: 'nervous system',
    description: 'How activated or unsettled you feel right now.',
    positiveDirection: 'lower'
  },
  {
    key: 'energy',
    title: 'Energy',
    eyebrow: 'capacity',
    description: 'How much fuel you have for the day.',
    positiveDirection: 'higher'
  },
  {
    key: 'sleep',
    title: 'Sleep',
    eyebrow: 'recovery',
    description: 'How restorative last night felt.',
    positiveDirection: 'higher'
  }
];

const EMPTY_INTERVENTIONS: Interventions = {
  noScrollMorning: false,
  dailyWalk: false,
  postWorkDecompression: false
};

const DEFAULT_SCORES: Record<MetricKey, number> = {
  mood: 3,
  anxiety: 3,
  energy: 3,
  sleep: 3
};

const INTERVENTION_META = [
  {
    key: 'noScrollMorning' as const,
    title: 'No-scroll morning',
    description: 'Protect your first attention window'
  },
  {
    key: 'dailyWalk' as const,
    title: 'Daily walk',
    description: 'Get your body and head unstuck'
  },
  {
    key: 'postWorkDecompression' as const,
    title: 'Post-work decompression',
    description: 'Actually come down after the day'
  }
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeEntry(raw: Partial<MoodEntry> & { date: string }): MoodEntry {
  return {
    date: raw.date,
    mood: raw.mood ?? DEFAULT_SCORES.mood,
    anxiety: raw.anxiety ?? DEFAULT_SCORES.anxiety,
    energy: raw.energy ?? DEFAULT_SCORES.energy,
    sleep: raw.sleep ?? DEFAULT_SCORES.sleep,
    note: raw.note ?? '',
    interventions: {
      ...EMPTY_INTERVENTIONS,
      ...(raw.interventions ?? {})
    }
  };
}

function loadEntries(): MoodEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem('mood-tracker-entries');
    const parsed = raw ? (JSON.parse(raw) as Array<Partial<MoodEntry> & { date: string }>) : [];
    return parsed.map(normalizeEntry);
  } catch {
    return [];
  }
}

function averageMetric(entries: MoodEntry[], key: MetricKey) {
  return entries.length ? entries.reduce((sum, entry) => sum + entry[key], 0) / entries.length : null;
}

function formatMetricAverage(entries: MoodEntry[], key: MetricKey) {
  const average = averageMetric(entries, key);
  return average === null ? null : average.toFixed(1);
}

function metricSignalLabel(key: MetricKey, value: number) {
  return SCORE_LABELS[key][value];
}

function describeDelta(delta: number, direction: 'higher' | 'lower') {
  const absolute = Math.abs(delta).toFixed(1);

  if (direction === 'lower') {
    if (delta < -0.3) return `about ${absolute} points lower`;
    if (delta > 0.3) return `about ${absolute} points higher`;
    return 'basically flat';
  }

  if (delta > 0.3) return `about ${absolute} points higher`;
  if (delta < -0.3) return `about ${absolute} points lower`;
  return 'basically flat';
}

export default function HomePage() {
  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [todayScores, setTodayScores] = useState<Record<MetricKey, number>>(DEFAULT_SCORES);
  const [todayInterventions, setTodayInterventions] = useState(EMPTY_INTERVENTIONS);
  const [todayNote, setTodayNote] = useState('');

  useEffect(() => {
    const loaded = loadEntries().sort((a, b) => a.date.localeCompare(b.date));
    setEntries(loaded);
    const today = loaded.find((entry) => entry.date === todayKey());
    setTodayScores({
      mood: today?.mood ?? DEFAULT_SCORES.mood,
      anxiety: today?.anxiety ?? DEFAULT_SCORES.anxiety,
      energy: today?.energy ?? DEFAULT_SCORES.energy,
      sleep: today?.sleep ?? DEFAULT_SCORES.sleep
    });
    setTodayInterventions(today?.interventions ?? EMPTY_INTERVENTIONS);
    setTodayNote(today?.note ?? '');
  }, []);

  const recentEntries = useMemo(() => entries.slice(-14), [entries]);
  const latest = entries[entries.length - 1] ?? null;
  const interventionAverage = entries.length
    ? (
        entries.reduce((sum, entry) => {
          const completed = Object.values(entry.interventions).filter(Boolean).length;
          return sum + completed;
        }, 0) / entries.length
      ).toFixed(1)
    : null;

  const trendSummary = useMemo(() => {
    if (recentEntries.length < 2) {
      return 'Log a few days and I’ll start spotting patterns across mood, anxiety, energy, and sleep instead of just storing numbers.';
    }

    const firstHalf = recentEntries.slice(0, Math.ceil(recentEntries.length / 2));
    const secondHalf = recentEntries.slice(Math.floor(recentEntries.length / 2));
    const moodDelta = (averageMetric(secondHalf, 'mood') ?? 0) - (averageMetric(firstHalf, 'mood') ?? 0);
    const anxietyDelta = (averageMetric(secondHalf, 'anxiety') ?? 0) - (averageMetric(firstHalf, 'anxiety') ?? 0);
    const energyDelta = (averageMetric(secondHalf, 'energy') ?? 0) - (averageMetric(firstHalf, 'energy') ?? 0);
    const sleepDelta = (averageMetric(secondHalf, 'sleep') ?? 0) - (averageMetric(firstHalf, 'sleep') ?? 0);

    const bestIntervention = [...INTERVENTION_META]
      .map((item) => {
        const withIntervention = entries.filter((entry) => entry.interventions[item.key]);
        const withoutIntervention = entries.filter((entry) => !entry.interventions[item.key]);

        if (!withIntervention.length || !withoutIntervention.length) {
          return { title: item.title, lift: null as number | null };
        }

        const withAverage = averageMetric(withIntervention, 'mood') ?? 0;
        const withoutAverage = averageMetric(withoutIntervention, 'mood') ?? 0;

        return {
          title: item.title,
          lift: withAverage - withoutAverage
        };
      })
      .filter((item) => item.lift !== null)
      .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))[0];

    const interventionLine = bestIntervention && (bestIntervention.lift ?? 0) > 0.15
      ? `${bestIntervention.title} currently has the strongest positive mood signal.`
      : 'No intervention is clearly separating from the pack yet.';

    const moodLine = moodDelta > 0.35
      ? `Mood is ${describeDelta(moodDelta, 'higher')} lately.`
      : moodDelta < -0.35
        ? `Mood is ${describeDelta(moodDelta, 'higher')} lately.`
        : 'Mood is mostly holding steady.';

    return `${moodLine} Anxiety is ${describeDelta(anxietyDelta, 'lower')}, energy is ${describeDelta(energyDelta, 'higher')}, and sleep is ${describeDelta(sleepDelta, 'higher')} versus the earlier half of your recent entries. ${interventionLine}`;
  }, [entries, recentEntries]);

  const experimentStats = useMemo(() => {
    return INTERVENTION_META.map(({ key, title, description }) => {
      const withIntervention = entries.filter((entry) => entry.interventions[key]);
      const withoutIntervention = entries.filter((entry) => !entry.interventions[key]);

      const withAverage = withIntervention.length ? averageMetric(withIntervention, 'mood') : null;
      const withoutAverage = withoutIntervention.length ? averageMetric(withoutIntervention, 'mood') : null;
      const withAnxiety = withIntervention.length ? averageMetric(withIntervention, 'anxiety') : null;
      const withoutAnxiety = withoutIntervention.length ? averageMetric(withoutIntervention, 'anxiety') : null;
      const completionRate = entries.length ? (withIntervention.length / entries.length) * 100 : 0;

      return {
        key,
        title,
        description,
        withAverage,
        withoutAverage,
        withAnxiety,
        withoutAnxiety,
        completionRate
      };
    });
  }, [entries]);

  function persist(nextEntries: MoodEntry[]) {
    const sorted = [...nextEntries].map(normalizeEntry).sort((a, b) => a.date.localeCompare(b.date));
    setEntries(sorted);
    window.localStorage.setItem('mood-tracker-entries', JSON.stringify(sorted));
  }

  function upsertToday(partial: Partial<MoodEntry>) {
    const today = todayKey();
    const existingIndex = entries.findIndex((entry) => entry.date === today);

    if (existingIndex >= 0) {
      const next = entries.map((entry, index) =>
        index === existingIndex
          ? normalizeEntry({
              ...entry,
              ...partial,
              date: today,
              interventions: partial.interventions ?? entry.interventions
            })
          : entry
      );
      persist(next);
      return;
    }

    persist([
      ...entries,
      normalizeEntry({
        date: today,
        mood: partial.mood,
        anxiety: partial.anxiety,
        energy: partial.energy,
        sleep: partial.sleep,
        note: partial.note ?? '',
        interventions: partial.interventions ?? EMPTY_INTERVENTIONS
      })
    ]);
  }

  function saveMetric(key: MetricKey, value: number) {
    const nextScores = {
      ...todayScores,
      [key]: value
    };
    setTodayScores(nextScores);
    upsertToday({ ...nextScores, note: todayNote, interventions: todayInterventions });
  }

  function toggleIntervention(key: keyof typeof EMPTY_INTERVENTIONS) {
    const next = {
      ...todayInterventions,
      [key]: !todayInterventions[key]
    };
    setTodayInterventions(next);
    upsertToday({ ...todayScores, note: todayNote, interventions: next });
  }

  function saveNote(note: string) {
    setTodayNote(note);
    upsertToday({ ...todayScores, note, interventions: todayInterventions });
  }

  return (
    <main className="shell">
      <section className="hero card">
        <p className="eyebrow">today</p>
        <h1>How are you feeling?</h1>
        <p className="sub">Still fast to log — but now a little richer, so patterns have a fighting chance to show up.</p>
      </section>

      <section className="metricsGrid">
        {METRIC_META.map((metric) => (
          <article className="card metricCard" key={metric.key}>
            <div className="cardHeader compact">
              <div>
                <p className="eyebrow">{metric.eyebrow}</p>
                <h2>{metric.title}</h2>
              </div>
              <strong className="metricReadout">{metricSignalLabel(metric.key, todayScores[metric.key])}</strong>
            </div>
            <p className="metricDescription">{metric.description}</p>
            <div className="moodRow scoreRow">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={n === todayScores[metric.key] ? 'mood active' : 'mood'}
                  onClick={() => saveMetric(metric.key, n)}
                >
                  <span>{n}</span>
                  <small>{SCORE_LABELS[metric.key][n]}</small>
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="card interventionsCard">
        <div className="cardHeader">
          <div>
            <p className="eyebrow">mental baseline</p>
            <h2>Daily interventions</h2>
          </div>
        </div>
        <div className="interventionList">
          {INTERVENTION_META.map((item) => (
            <button key={item.key} className={todayInterventions[item.key] ? 'intervention active' : 'intervention'} onClick={() => toggleIntervention(item.key)}>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card noteCard">
        <div className="cardHeader">
          <div>
            <p className="eyebrow">context</p>
            <h2>What was going on?</h2>
          </div>
        </div>
        <textarea
          className="noteInput"
          placeholder="Optional: sleep weird, stressful meeting, great workout, sunshine, anything worth remembering later..."
          value={todayNote}
          onChange={(event) => saveNote(event.target.value)}
          rows={4}
        />
      </section>

      <section className="grid statsGrid">
        <article className="card statCard">
          <span>Latest mood</span>
          <strong>{latest ? SCORE_LABELS.mood[latest.mood] : '—'}</strong>
        </article>
        <article className="card statCard">
          <span>Average mood</span>
          <strong>{formatMetricAverage(entries, 'mood') ?? '—'}</strong>
        </article>
        <article className="card statCard">
          <span>Average anxiety</span>
          <strong>{formatMetricAverage(entries, 'anxiety') ?? '—'}</strong>
        </article>
        <article className="card statCard">
          <span>Average energy</span>
          <strong>{formatMetricAverage(entries, 'energy') ?? '—'}</strong>
        </article>
        <article className="card statCard">
          <span>Average sleep</span>
          <strong>{formatMetricAverage(entries, 'sleep') ?? '—'}</strong>
        </article>
        <article className="card statCard">
          <span>Avg interventions/day</span>
          <strong>{interventionAverage ?? '—'}</strong>
        </article>
      </section>

      <section className="card trendCard">
        <div className="cardHeader">
          <div>
            <p className="eyebrow">readout</p>
            <h2>Plain-English trend</h2>
          </div>
        </div>
        <p className="trendCopy">{trendSummary}</p>
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

      <section className="card experimentCard">
        <div className="cardHeader">
          <div>
            <p className="eyebrow">experiment view</p>
            <h2>What seems to help?</h2>
          </div>
        </div>
        <div className="experimentList">
          {experimentStats.map((item) => (
            <article className="experimentRow" key={item.key}>
              <div className="experimentHead">
                <strong>{item.title}</strong>
                <span>{Math.round(item.completionRate)}% completion</span>
              </div>
              <p>{item.description}</p>
              <div className="experimentStats triple">
                <div>
                  <span>Mood when done</span>
                  <strong>{item.withAverage ? item.withAverage.toFixed(1) : '—'}</strong>
                </div>
                <div>
                  <span>Mood when missed</span>
                  <strong>{item.withoutAverage ? item.withoutAverage.toFixed(1) : '—'}</strong>
                </div>
                <div>
                  <span>Anxiety when done</span>
                  <strong>{item.withAnxiety ? item.withAnxiety.toFixed(1) : '—'}</strong>
                </div>
              </div>
            </article>
          ))}
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
                <div className="historyRow detailed" key={entry.date}>
                  <div>
                    <span>{entry.date}</span>
                    <small>{completed}/3 interventions</small>
                    <div className="historyMetrics">
                      <small>Mood {entry.mood}</small>
                      <small>Anxiety {entry.anxiety}</small>
                      <small>Energy {entry.energy}</small>
                      <small>Sleep {entry.sleep}</small>
                    </div>
                    {entry.note ? <p className="historyNote">{entry.note}</p> : null}
                  </div>
                  <strong>
                    {entry.mood} · {SCORE_LABELS.mood[entry.mood]}
                  </strong>
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PUSH_API_BASE,
  cancelPush,
  enableBackgroundPush,
  loadPushSetup,
  nextEveningReminderDate,
  persistPushSetup as persistPushSetupRaw,
  schedulePush,
  type PushSetup
} from '../lib/push';

type Interventions = {
  eveningJournal: boolean;
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
  archivedInterventions?: Record<string, boolean>;
  savedAt?: number;
};

type Tab = 'today' | 'insights' | 'settings';

const SCORE_LABELS: Record<MetricKey, Record<number, string>> = {
  mood: { 1: 'Rough', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' },
  anxiety: { 1: 'Calm', 2: 'Light', 3: 'Noticeable', 4: 'High', 5: 'Spiky' },
  energy: { 1: 'Drained', 2: 'Low', 3: 'Steady', 4: 'Strong', 5: 'Charged' },
  sleep: { 1: 'Awful', 2: 'Rough', 3: 'Okay', 4: 'Solid', 5: 'Great' }
};

const METRICS: Array<{
  key: MetricKey;
  title: string;
  positive: 'higher' | 'lower';
}> = [
  { key: 'mood', title: 'Mood', positive: 'higher' },
  { key: 'anxiety', title: 'Anxiety', positive: 'lower' },
  { key: 'energy', title: 'Energy', positive: 'higher' },
  { key: 'sleep', title: 'Sleep', positive: 'higher' }
];

const EMPTY_INTERVENTIONS: Interventions = {
  eveningJournal: false,
  dailyWalk: false,
  postWorkDecompression: false
};

const INTERVENTION_META = [
  { key: 'eveningJournal' as const, title: 'Evening journaling', desc: '5 min brain-dump before bed' },
  { key: 'dailyWalk' as const, title: 'Short walk', desc: 'Any length, even 5 min counts' },
  { key: 'postWorkDecompression' as const, title: 'Post-work decompression', desc: 'Actually come down after work' }
];

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayKey() { return localDateKey(new Date()); }

const ACTIVE_INTERVENTION_KEYS = new Set<string>(Object.keys(EMPTY_INTERVENTIONS));

function normalize(raw: Partial<MoodEntry> & { date: string }): MoodEntry {
  const rawInterventions = (raw.interventions ?? {}) as Record<string, boolean>;
  const active: Interventions = { ...EMPTY_INTERVENTIONS };
  const archived: Record<string, boolean> = { ...(raw.archivedInterventions ?? {}) };
  for (const [k, v] of Object.entries(rawInterventions)) {
    if (ACTIVE_INTERVENTION_KEYS.has(k)) {
      active[k as keyof Interventions] = !!v;
    } else {
      archived[k] = !!v;
    }
  }
  return {
    date: raw.date,
    mood: raw.mood ?? 0,
    anxiety: raw.anxiety ?? 0,
    energy: raw.energy ?? 0,
    sleep: raw.sleep ?? 0,
    note: raw.note ?? '',
    interventions: active,
    archivedInterventions: Object.keys(archived).length ? archived : undefined,
    savedAt: raw.savedAt
  };
}

function loadEntries(): MoodEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem('mood-tracker-entries');
    const parsed = raw ? (JSON.parse(raw) as Array<Partial<MoodEntry> & { date: string }>) : [];
    return parsed.map(normalize);
  } catch {
    return [];
  }
}

function avg(entries: MoodEntry[], key: MetricKey) {
  const filtered = entries.filter((e) => e[key] > 0);
  return filtered.length ? filtered.reduce((s, e) => s + e[key], 0) / filtered.length : null;
}

function describeDelta(d: number, dir: 'higher' | 'lower') {
  const abs = Math.abs(d).toFixed(1);
  if (dir === 'lower') {
    if (d < -0.3) return `${abs} pts lower`;
    if (d > 0.3) return `${abs} pts higher`;
    return 'flat';
  }
  if (d > 0.3) return `${abs} pts higher`;
  if (d < -0.3) return `${abs} pts lower`;
  return 'flat';
}

function lastNDays(n: number) {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(localDateKey(d));
  }
  return days;
}

function dayName(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })[0];
}

/* ---------- Icon ---------- */

const CheckIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [tab, setTab] = useState<Tab>('today');
  const [todayScores, setTodayScores] = useState<Record<MetricKey, number>>({ mood: 0, anxiety: 0, energy: 0, sleep: 0 });
  const [todayInterventions, setTodayInterventions] = useState<Interventions>(EMPTY_INTERVENTIONS);
  const [todayNote, setTodayNote] = useState('');
  const [pushSetup, setPushSetup] = useState<PushSetup>({ appSecret: '', apiBase: DEFAULT_PUSH_API_BASE, endpoint: null, enabled: false });
  const [pushStatus, setPushStatus] = useState('');

  useEffect(() => {
    const loaded = loadEntries().sort((a, b) => a.date.localeCompare(b.date));
    setEntries(loaded);
    const today = loaded.find((e) => e.date === todayKey());
    setTodayScores({
      mood: today?.mood ?? 0,
      anxiety: today?.anxiety ?? 0,
      energy: today?.energy ?? 0,
      sleep: today?.sleep ?? 0
    });
    setTodayInterventions(today?.interventions ?? EMPTY_INTERVENTIONS);
    setTodayNote(today?.note ?? '');
    const loadedPush = loadPushSetup();
    setPushSetup(loadedPush);
    if (loadedPush.enabled) {
      void schedulePush(loadedPush, {
        title: 'Daily check-in',
        body: "How was today? Log your mood.",
        sendAt: nextEveningReminderDate()
      });
    }
    setMounted(true);
  }, []);

  const todayDateStr = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
    []
  );

  function persist(next: MoodEntry[]) {
    const sorted = [...next].map(normalize).sort((a, b) => a.date.localeCompare(b.date));
    setEntries(sorted);
    window.localStorage.setItem('mood-tracker-entries', JSON.stringify(sorted));
    if (pushSetup.enabled) {
      void schedulePush(pushSetup, {
        title: 'Daily check-in',
        body: "How was today? Log your mood.",
        sendAt: nextEveningReminderDate()
      });
    }
  }

  function persistPush(next: PushSetup) {
    setPushSetup(next);
    persistPushSetupRaw(next);
  }

  async function handleEnablePush() {
    setPushStatus('Setting up…');
    try {
      const result = await enableBackgroundPush(pushSetup);
      if (!result.ok) {
        setPushStatus(`Push setup failed: ${result.reason}`);
        return;
      }
      setPushSetup(result.setup);
      const sendAt = nextEveningReminderDate();
      const scheduled = await schedulePush(result.setup, {
        title: 'Daily check-in',
        body: "How was today? Log your mood.",
        sendAt
      });
      setPushStatus(scheduled
        ? `Push enabled. Next reminder ${sendAt.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.`
        : 'Push enabled, but scheduling the reminder failed.'
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      setPushStatus(`Push setup failed: ${reason}`);
    }
  }

  async function handleDisablePush() {
    await cancelPush(pushSetup);
    persistPush({ ...pushSetup, enabled: false });
    setPushStatus('Push disabled. Reminder cancelled.');
  }

  const savedToday = useMemo(() => entries.find((e) => e.date === todayKey()) ?? null, [entries]);

  const draftHasContent =
    todayScores.mood > 0 ||
    todayScores.anxiety > 0 ||
    todayScores.energy > 0 ||
    todayScores.sleep > 0 ||
    todayNote.trim().length > 0 ||
    Object.values(todayInterventions).some(Boolean);

  const isDirty = useMemo(() => {
    if (!savedToday) return draftHasContent;
    return (
      savedToday.mood !== todayScores.mood ||
      savedToday.anxiety !== todayScores.anxiety ||
      savedToday.energy !== todayScores.energy ||
      savedToday.sleep !== todayScores.sleep ||
      (savedToday.note ?? '') !== todayNote ||
      savedToday.interventions.eveningJournal !== todayInterventions.eveningJournal ||
      savedToday.interventions.dailyWalk !== todayInterventions.dailyWalk ||
      savedToday.interventions.postWorkDecompression !== todayInterventions.postWorkDecompression
    );
  }, [savedToday, todayScores, todayInterventions, todayNote, draftHasContent]);

  function setMetric(k: MetricKey, v: number) {
    setTodayScores((prev) => ({ ...prev, [k]: prev[k] === v ? 0 : v }));
  }

  function toggleI(k: keyof Interventions) {
    setTodayInterventions((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  function setNote(n: string) {
    setTodayNote(n);
  }

  function saveToday() {
    const t = todayKey();
    const idx = entries.findIndex((e) => e.date === t);
    const entry = normalize({
      date: t,
      mood: todayScores.mood,
      anxiety: todayScores.anxiety,
      energy: todayScores.energy,
      sleep: todayScores.sleep,
      note: todayNote,
      interventions: todayInterventions,
      archivedInterventions: savedToday?.archivedInterventions,
      savedAt: Date.now()
    });
    if (idx >= 0) {
      persist(entries.map((e, i) => (i === idx ? entry : e)));
    } else {
      persist([...entries, entry]);
    }
  }

  function discardChanges() {
    if (savedToday) {
      setTodayScores({
        mood: savedToday.mood,
        anxiety: savedToday.anxiety,
        energy: savedToday.energy,
        sleep: savedToday.sleep
      });
      setTodayInterventions(savedToday.interventions);
      setTodayNote(savedToday.note ?? '');
    } else {
      setTodayScores({ mood: 0, anxiety: 0, energy: 0, sleep: 0 });
      setTodayInterventions(EMPTY_INTERVENTIONS);
      setTodayNote('');
    }
  }

  const recentEntries = useMemo(() => entries.slice(-14), [entries]);

  const week = useMemo(() => {
    const days = lastNDays(7);
    return days.map((iso) => ({ iso, entry: entries.find((e) => e.date === iso) ?? null }));
  }, [entries]);

  const trendSummary = useMemo(() => {
    if (recentEntries.length < 3) {
      return 'Log a few days and patterns across mood, anxiety, energy, and sleep will start to surface.';
    }
    const half = Math.ceil(recentEntries.length / 2);
    const first = recentEntries.slice(0, half);
    const second = recentEntries.slice(half);
    const dMood = (avg(second, 'mood') ?? 0) - (avg(first, 'mood') ?? 0);
    const dAnx = (avg(second, 'anxiety') ?? 0) - (avg(first, 'anxiety') ?? 0);
    const dEn = (avg(second, 'energy') ?? 0) - (avg(first, 'energy') ?? 0);
    const dSl = (avg(second, 'sleep') ?? 0) - (avg(first, 'sleep') ?? 0);

    const best = INTERVENTION_META
      .map((m) => {
        const w = entries.filter((e) => e.interventions[m.key] && e.mood > 0);
        const wo = entries.filter((e) => !e.interventions[m.key] && e.mood > 0);
        if (!w.length || !wo.length) return { title: m.title, lift: null as number | null };
        return { title: m.title, lift: (avg(w, 'mood') ?? 0) - (avg(wo, 'mood') ?? 0) };
      })
      .filter((x) => x.lift !== null)
      .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))[0];

    const moodLine =
      dMood > 0.35 ? `Mood is ${describeDelta(dMood, 'higher')}.`
      : dMood < -0.35 ? `Mood is ${describeDelta(dMood, 'higher')}.`
      : 'Mood is mostly steady.';

    const interventionLine =
      best && (best.lift ?? 0) > 0.15
        ? `${best.title} is showing the strongest mood signal.`
        : 'No intervention is clearly separating yet.';

    return `${moodLine} Anxiety ${describeDelta(dAnx, 'lower')}, energy ${describeDelta(dEn, 'higher')}, sleep ${describeDelta(dSl, 'higher')} versus the earlier half. ${interventionLine}`;
  }, [recentEntries, entries]);

  const stats = useMemo(() => {
    const lastSeven = entries.slice(-7);
    return {
      mood: avg(lastSeven, 'mood'),
      anxiety: avg(lastSeven, 'anxiety'),
      energy: avg(lastSeven, 'energy'),
      sleep: avg(lastSeven, 'sleep'),
      logged: entries.length
    };
  }, [entries]);

  /* ---------- Render ---------- */

  function MetricRow({ k, title }: { k: MetricKey; title: string }) {
    const value = todayScores[k];
    return (
      <div className="metricRow">
        <div className="metricLabel">
          <span className="name">{title}</span>
          <span className={`read ${value > 0 ? 'set' : ''}`}>
            {value > 0 ? SCORE_LABELS[k][value] : 'Tap to log'}
          </span>
        </div>
        <div className="dotRow">
          {[1, 2, 3, 4, 5].map((n) => {
            const isSet = value === n;
            const isDim = value > 0 && !isSet;
            return (
              <button
                key={n}
                className={`dotBtn ${isSet ? 'set' : ''} ${isDim ? 'dim' : ''}`}
                onClick={() => setMetric(k, n)}
                aria-label={`${title} ${n}`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function TodayTab() {
    const completedToday = Object.values(todayInterventions).filter(Boolean).length;
    const savedAtLabel = savedToday?.savedAt
      ? new Date(savedToday.savedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : null;
    const saveLabel = savedToday ? 'Update' : 'Save';
    const statusText = isDirty
      ? savedToday
        ? 'Unsaved changes'
        : 'Not saved yet'
      : savedToday
        ? savedAtLabel ? `Saved at ${savedAtLabel}` : 'Saved'
        : 'Nothing logged yet';
    return (
      <>
        <section className="checkinCard">
          <div className="checkinHero">
            <p className="eyebrow">Today</p>
            <h1>How are you?</h1>
          </div>

          {METRICS.map((m) => <MetricRow key={m.key} k={m.key} title={m.title} />)}

          <div className="divider" />

          <div>
            <div className="metricLabel" style={{ marginBottom: 10 }}>
              <span className="name">Daily interventions</span>
              <span className="read set">{completedToday}/3</span>
            </div>
            <div className="interventionGrid">
              {INTERVENTION_META.map((i) => (
                <button
                  key={i.key}
                  className={`intervention ${todayInterventions[i.key] ? 'on' : ''}`}
                  onClick={() => toggleI(i.key)}
                >
                  <div className="check">{CheckIcon}</div>
                  <div>
                    <span className="ititle">{i.title}</span>
                    <span className="idesc">{i.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="divider" />

          <textarea
            className="note"
            value={todayNote}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth remembering later? (optional)"
            rows={2}
          />

          <div className="saveBar">
            <span className={`saveStatus ${isDirty ? 'dirty' : savedToday ? 'ok' : 'idle'}`}>
              {statusText}
            </span>
            <div className="saveActions">
              {isDirty && (
                <button className="btn ghost" onClick={discardChanges}>
                  {savedToday ? 'Revert' : 'Clear'}
                </button>
              )}
              <button
                className="btn primary"
                onClick={saveToday}
                disabled={!isDirty || !draftHasContent}
              >
                {saveLabel}
              </button>
            </div>
          </div>
        </section>

        <div className="sectionHead">
          <div>
            <p className="eyebrow">This week</p>
            <h2 className="headline">7-day glance</h2>
          </div>
        </div>
        <div className="weekStrip">
          {week.map(({ iso, entry }) => {
            const tone = entry?.mood ?? 0;
            const isToday = iso === todayKey();
            return (
              <div className={`dayCell ${isToday ? 'isToday' : ''}`} key={iso}>
                <div
                  className={`ddot ${tone === 0 ? 'empty' : ''} ${isToday ? 'today' : ''}`}
                  style={tone > 0 ? {
                    background: `color-mix(in srgb, var(--accent) ${tone * 18}%, var(--surface-2))`
                  } : undefined}
                  title={entry ? `${iso}: mood ${tone}` : iso}
                >
                  {tone > 0 ? <span className="ddval">{tone}</span> : null}
                </div>
                <span className="ddl">{dayName(iso)}</span>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  function InsightsTab() {
    if (entries.length === 0) {
      return (
        <section className="empty">
          <h3>No entries yet.</h3>
          <p>Log a few days on the Today tab and patterns will appear here.</p>
        </section>
      );
    }
    return (
      <>
        <section className="panel trendPanel">
          <p className="eyebrow">Plain-English readout</p>
          <p className="read">{trendSummary}</p>
        </section>

        <div className="sectionHead">
          <div>
            <p className="eyebrow">7-day averages</p>
            <h2 className="headline">Where you've been</h2>
          </div>
        </div>
        <div className="statRow">
          <StatCell label="Mood" value={stats.mood} />
          <StatCell label="Anxiety" value={stats.anxiety} />
          <StatCell label="Energy" value={stats.energy} />
          <StatCell label="Sleep" value={stats.sleep} />
        </div>

        <div className="sectionHead">
          <div>
            <p className="eyebrow">Trend (14 days)</p>
            <h2 className="headline">Your line</h2>
          </div>
        </div>
        <Chart entries={recentEntries} />

        <div className="sectionHead">
          <div>
            <p className="eyebrow">Experiment</p>
            <h2 className="headline">What seems to help?</h2>
          </div>
        </div>
        <div className="experimentList">
          {INTERVENTION_META.map((m) => {
            const w = entries.filter((e) => e.interventions[m.key] && e.mood > 0);
            const wo = entries.filter((e) => !e.interventions[m.key] && e.mood > 0);
            const wAvg = w.length ? avg(w, 'mood') : null;
            const woAvg = wo.length ? avg(wo, 'mood') : null;
            const completion = entries.length ? Math.round((entries.filter((e) => e.interventions[m.key]).length / entries.length) * 100) : 0;
            const win = wAvg !== null && woAvg !== null && wAvg - woAvg > 0.15;
            return (
              <article className="experimentRow" key={m.key}>
                <div className="ehead">
                  <span className="etitle">{m.title}</span>
                  <span className="ecomp">{completion}% done</span>
                </div>
                <p className="edesc">{m.desc}</p>
                <div className="ebars">
                  <div className={`ebar ${win ? 'win' : ''}`}>
                    <div className="l">Mood when done</div>
                    <div className="v">{wAvg !== null ? wAvg.toFixed(1) : '—'}</div>
                  </div>
                  <div className="ebar">
                    <div className="l">Mood when missed</div>
                    <div className="v">{woAvg !== null ? woAvg.toFixed(1) : '—'}</div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="sectionHead">
          <div>
            <p className="eyebrow">History</p>
            <h2 className="headline">Recent entries</h2>
          </div>
        </div>
        <div className="historyList">
          {[...entries].reverse().slice(0, 14).map((e) => {
            const completed = Object.values(e.interventions).filter(Boolean).length;
            return (
              <article className="historyRow" key={e.date}>
                <div className="hh">
                  <span className="hd">{e.date}</span>
                  <span className="hMood">{e.mood > 0 ? `${SCORE_LABELS.mood[e.mood]}` : '—'}</span>
                </div>
                <div className="hChips">
                  {e.mood > 0 && <span className="miniChip">M{e.mood}</span>}
                  {e.anxiety > 0 && <span className="miniChip">A{e.anxiety}</span>}
                  {e.energy > 0 && <span className="miniChip">E{e.energy}</span>}
                  {e.sleep > 0 && <span className="miniChip">S{e.sleep}</span>}
                  <span className={`miniChip ${completed === 3 ? 'done' : ''}`}>{completed}/3 done</span>
                </div>
                {e.note ? <p className="historyNote">"{e.note}"</p> : null}
              </article>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <main className="shell">
      <div className="topBar">
        <div className="brand">
          <span className="dot" />
          <span>Mo<em>od</em></span>
        </div>
        <div className="topMeta">{todayDateStr}</div>
      </div>

      {!mounted ? null : (
        <>
          {tab === 'today' && <TodayTab />}
          {tab === 'insights' && <InsightsTab />}
          {tab === 'settings' && (
            <SettingsTab
              pushSetup={pushSetup}
              status={pushStatus}
              onChange={persistPush}
              onEnable={handleEnablePush}
              onDisable={handleDisablePush}
            />
          )}
        </>
      )}

      <nav className="tabBar" aria-label="Sections">
        <button className={`tab ${tab === 'today' ? 'active' : ''}`} onClick={() => setTab('today')}>Today</button>
        <button className={`tab ${tab === 'insights' ? 'active' : ''}`} onClick={() => setTab('insights')}>Insights</button>
        <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Settings</button>
      </nav>
    </main>
  );
}

function SettingsTab({
  pushSetup,
  status,
  onChange,
  onEnable,
  onDisable
}: {
  pushSetup: PushSetup;
  status: string;
  onChange: (s: PushSetup) => void;
  onEnable: () => void;
  onDisable: () => void;
}) {
  return (
    <div className="settingsList">
      <article className="settingsRow">
        <span className="sLabel">Reminders</span>
        <h3>Evening check-in push</h3>
        <p>Sends a push every evening at 10:45 PM. Re-schedules itself each time you log an entry.</p>
        <input
          className="settingsInput"
          value={pushSetup.appSecret}
          onChange={(e) => onChange({ ...pushSetup, appSecret: e.target.value })}
          placeholder="Shared secret"
        />
        {pushSetup.enabled ? (
          <>
            <button className="btn primary" onClick={onEnable}>Re-enable on this device</button>
            <button className="btn ghost" onClick={onDisable}>Disable reminder</button>
          </>
        ) : (
          <button className="btn primary" onClick={onEnable}>Enable evening reminder</button>
        )}
        {status ? <p className={pushSetup.enabled ? 'statusOk' : 'statusInfo'}>{status}</p> : null}
        {pushSetup.enabled && !status ? <p className="statusOk">Background push is enabled on this device.</p> : null}
      </article>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="statCell">
      <div className="l">{label}</div>
      <div className={`v ${value === null ? 'dim' : ''}`}>{value !== null ? value.toFixed(1) : '—'}</div>
    </div>
  );
}

function Chart({ entries }: { entries: MoodEntry[] }) {
  const series: MetricKey[] = ['mood', 'energy'];
  const colors: Record<string, string> = { mood: 'var(--accent)', energy: 'var(--good)' };

  const data = useMemo(() => {
    const valid = entries.filter((e) => e.mood > 0 || e.energy > 0);
    if (valid.length === 0) return null;
    const w = 560, h = 160, pad = { l: 24, r: 12, t: 12, b: 28 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const n = valid.length;

    function x(i: number) {
      if (n === 1) return pad.l + innerW / 2;
      return pad.l + (i / (n - 1)) * innerW;
    }
    function y(v: number) {
      // 1..5 -> bottom..top
      return pad.t + innerH - ((v - 1) / 4) * innerH;
    }

    const seriesPaths = series.map((k) => {
      const points = valid.map((e, i) => ({ x: x(i), y: e[k] > 0 ? y(e[k]) : null }));
      // build smooth path through non-null
      let d = '';
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (p.y === null) continue;
        const prev = points.slice(0, i).reverse().find((q) => q.y !== null);
        if (!prev) {
          d += `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        } else {
          const cx = (prev.x + p.x) / 2;
          d += ` C ${cx.toFixed(1)} ${prev.y!.toFixed(1)}, ${cx.toFixed(1)} ${p.y.toFixed(1)}, ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        }
      }
      // build matching area path (close back at bottom)
      let area = d;
      const lastValid = [...points].reverse().find((q) => q.y !== null);
      const firstValid = points.find((q) => q.y !== null);
      if (firstValid && lastValid) {
        area += ` L ${lastValid.x.toFixed(1)} ${(pad.t + innerH).toFixed(1)} L ${firstValid.x.toFixed(1)} ${(pad.t + innerH).toFixed(1)} Z`;
      }
      return { key: k, d, area, points };
    });

    const xLabels = valid.map((e, i) => ({
      x: x(i),
      label: i === 0 || i === n - 1 || i === Math.floor(n / 2) ? e.date.slice(5) : ''
    }));

    return { w, h, pad, innerW, innerH, seriesPaths, xLabels };
  }, [entries]);

  if (!data) {
    return (
      <section className="empty">
        <h3>Nothing to chart yet.</h3>
        <p>Log a few days and the curve fills in.</p>
      </section>
    );
  }

  const { w, h, pad, innerW, innerH, seriesPaths, xLabels } = data;

  return (
    <div className="chartWrap">
      <div className="chartHead">
        <h3>Mood & energy</h3>
        <div className="chartLegend">
          <span><i className="swatch" style={{ background: colors.mood }} /> mood</span>
          <span><i className="swatch" style={{ background: colors.energy }} /> energy</span>
        </div>
      </div>
      <div className="chartHost">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="mood-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="energy-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--good)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--good)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* gridlines at 1, 3, 5 */}
          {[1, 3, 5].map((n) => {
            const yy = pad.t + innerH - ((n - 1) / 4) * innerH;
            return (
              <g key={n}>
                <line className="gridline" x1={pad.l} y1={yy} x2={pad.l + innerW} y2={yy} />
                <text className="gridLabel" x={pad.l - 4} y={yy + 3} textAnchor="end">{n}</text>
              </g>
            );
          })}

          {seriesPaths.map((s) => (
            <g key={s.key}>
              <path d={s.area} fill={`url(#${s.key}-fill)`} />
              <path d={s.d} fill="none" stroke={colors[s.key]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {s.points.map((p, i) =>
                p.y !== null ? (
                  <circle key={i} cx={p.x} cy={p.y} r={2.6} fill={colors[s.key]} />
                ) : null
              )}
            </g>
          ))}

          {xLabels.map((l, i) => (
            l.label ? <text key={i} className="axisLabel" x={l.x} y={h - 6} textAnchor="middle">{l.label}</text> : null
          ))}
        </svg>
      </div>
    </div>
  );
}

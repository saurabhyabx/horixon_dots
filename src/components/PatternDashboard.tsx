import { useMemo, useState } from "react";
import { ArrowLeft, Target, TrendingDown, TrendingUp } from "lucide-react";
import { dayLabel, daysAgoHint } from "../lib/dates";
import {
  currentStreak,
  dailyCounts,
  heatmapWeeks,
  movingAverage,
  risingTerms,
  weekOverWeek,
} from "../lib/patterns";

type DashThought = {
  id: string;
  text: string;
  category: string;
  status: string;
  tags: string[];
  createdAt: number;
};

type PatternDashboardProps = {
  deskTitle: string;
  deskEmoji: string;
  thoughts: DashThought[];
  categoryMeta: Record<string, { emoji: string; label: string }>;
  statuses: { key: string; label: string; icon: string }[];
  patterns: [string, { count: number }][];
  spotlight: { keyword: string; text: string; total: number } | null;
  inboxCount: number;
  onAdvanceSpotlight: () => void;
  onFilterWord: (word: string) => void;
  onFilterDay: (dayKey: string) => void;
  onFilterCategory: (category: string) => void;
  onClose: () => void;
};

const RANGES = [14, 30, 90] as const;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const dayTitle = (time: number) =>
  new Date(time).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

export function PatternDashboard({
  deskTitle,
  deskEmoji,
  thoughts,
  categoryMeta,
  statuses,
  patterns,
  spotlight,
  inboxCount,
  onAdvanceSpotlight,
  onFilterWord,
  onFilterDay,
  onFilterCategory,
  onClose,
}: PatternDashboardProps) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);

  const stats = useMemo(() => {
    const days = dailyCounts(thoughts, range);
    const counts = days.map((d) => d.count);
    const week = weekOverWeek(thoughts);
    const last30 = dailyCounts(thoughts, 30);
    const byCategory = new Map<string, number>();
    thoughts.forEach((t) => byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + 1));
    const byStatus = new Map<string, number>();
    thoughts.forEach((t) => byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1));
    const journey = new Map<string, DashThought[]>();
    [...thoughts]
      .sort((a, b) => b.createdAt - a.createdAt)
      .forEach((t) => {
        const key = new Date(t.createdAt).toDateString();
        journey.set(key, [...(journey.get(key) ?? []), t]);
      });
    return {
      days,
      average: movingAverage(counts),
      max: Math.max(3, ...counts),
      week,
      activeDays: last30.filter((d) => d.count > 0).length,
      streak: currentStreak(thoughts),
      heat: heatmapWeeks(thoughts, 12),
      categories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
      byStatus,
      rising: risingTerms(thoughts),
      journey: [...journey.values()].slice(0, 8),
    };
  }, [thoughts, range]);

  if (thoughts.length === 0) {
    return (
      <section className="dash" aria-label="Pattern Radar">
        <DashHeader
          deskTitle={deskTitle}
          deskEmoji={deskEmoji}
          range={range}
          setRange={setRange}
          onClose={onClose}
        />
        <p className="dash-empty">
          No notes in this desk yet. Capture a few thoughts and your patterns will appear here.
        </p>
      </section>
    );
  }

  // ----- notes per day chart geometry
  const W = 720;
  const H = 170;
  const pad = { l: 26, r: 8, t: 10, b: 22 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const slot = plotW / stats.days.length;
  const barW = Math.max(3, slot * 0.66);
  const y = (value: number) => pad.t + plotH - (value / stats.max) * plotH;
  const labelEvery = range === 14 ? 2 : range === 30 ? 5 : 15;
  const avgLine = stats.average
    .map((v, i) => `${(pad.l + slot * i + slot / 2).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  const totalStatus = [...stats.byStatus.values()].reduce((a, b) => a + b, 0) || 1;
  const maxCategory = stats.categories[0]?.[1] ?? 1;
  const maxPattern = patterns[0]?.[1].count ?? 1;
  const delta = stats.week.delta;

  return (
    <section className="dash" aria-label="Pattern Radar">
      <DashHeader
        deskTitle={deskTitle}
        deskEmoji={deskEmoji}
        range={range}
        setRange={setRange}
        onClose={onClose}
      />

      {spotlight && (
        <div className="dash-signal">
          <span className="dash-signal-tag">
            <TrendingUp size={11} /> Top signal
          </span>
          <p>
            You keep circling <strong>&ldquo;{spotlight.keyword}&rdquo;</strong> (
            {plural(spotlight.total, "note")}). Next move:{" "}
            <em>
              &ldquo;{spotlight.text.slice(0, 110)}
              {spotlight.text.length > 110 ? "…" : ""}&rdquo;
            </em>
          </p>
          <button className="dash-signal-btn" onClick={onAdvanceSpotlight}>
            <Target size={12} /> Set In Action
          </button>
        </div>
      )}

      <div className="dash-kpis">
        <div className="dash-kpi">
          <span className="dash-kpi-label">Notes</span>
          <strong>{thoughts.length}</strong>
          <small>in this desk</small>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">This week</span>
          <strong>{stats.week.thisWeek}</strong>
          <small className={delta > 0 ? "up" : delta < 0 ? "down" : ""}>
            {delta > 0 ? <TrendingUp size={11} /> : delta < 0 ? <TrendingDown size={11} /> : null}{" "}
            {delta === 0 ? "same as last week" : `${delta > 0 ? "+" : ""}${delta} vs last week`}
          </small>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Active days</span>
          <strong>
            {stats.activeDays}
            <em>/30</em>
          </strong>
          <small>days with a note</small>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Streak</span>
          <strong>
            {stats.streak}
            <em> {stats.streak === 1 ? "day" : "days"}</em>
          </strong>
          <small>in a row</small>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Inbox</span>
          <strong>{inboxCount}</strong>
          <small>not sorted yet</small>
        </div>
      </div>

      <div className="dash-grid">
        <section className="dash-card wide">
          <h3>
            Notes per day <small>last {range} days · line is the 7-day average</small>
          </h3>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="dash-chart"
            role="img"
            aria-label={`Notes per day for the last ${range} days`}
          >
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line
                  x1={pad.l}
                  x2={W - pad.r}
                  y1={y(stats.max * f)}
                  y2={y(stats.max * f)}
                  className="dash-grid-line"
                />
                <text x={pad.l - 6} y={y(stats.max * f) + 3} textAnchor="end" className="dash-axis">
                  {Math.round(stats.max * f)}
                </text>
              </g>
            ))}
            {stats.days.map((d, i) => {
              const x = pad.l + slot * i + (slot - barW) / 2;
              const isToday = i === stats.days.length - 1;
              return (
                <g key={d.key}>
                  <rect
                    x={x}
                    y={d.count ? y(d.count) : H - pad.b - 2}
                    width={barW}
                    height={d.count ? H - pad.b - y(d.count) : 2}
                    rx={2}
                    className={`dash-bar ${isToday ? "today" : ""} ${d.count ? "has" : ""}`}
                    onClick={() => d.count && onFilterDay(d.key)}
                  >
                    <title>{`${dayTitle(d.time)} · ${plural(d.count, "note")}`}</title>
                  </rect>
                  {(stats.days.length - 1 - i) % labelEvery === 0 && (
                    <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="dash-axis">
                      {new Date(d.time).getDate()}
                    </text>
                  )}
                </g>
              );
            })}
            <polyline points={avgLine} className="dash-avg" />
          </svg>
        </section>

        <section className="dash-card">
          <h3>
            Activity dots <small>last 12 weeks</small>
          </h3>
          <svg
            viewBox="0 0 252 150"
            className="dash-chart dots"
            role="img"
            aria-label="Activity by day for the last 12 weeks"
          >
            {["M", "W", "F"].map((label, i) => (
              <text key={label} x={0} y={14 + i * 2 * 20 + 4} className="dash-axis">
                {label}
              </text>
            ))}
            {stats.heat.map((week, w) =>
              week.map((cell, d) =>
                cell ? (
                  <circle
                    key={cell.key}
                    cx={26 + w * 19}
                    cy={14 + d * 20}
                    r={cell.count === 0 ? 2.6 : 4 + Math.min(cell.count, 5) * 0.9}
                    className={`dash-dot ${cell.count ? "has" : ""}`}
                    style={
                      cell.count ? { opacity: 0.35 + Math.min(cell.count, 4) * 0.16 } : undefined
                    }
                    onClick={() => cell.count && onFilterDay(cell.key)}
                  >
                    <title>{`${dayTitle(cell.time)} · ${plural(cell.count, "note")}`}</title>
                  </circle>
                ) : null,
              ),
            )}
          </svg>
        </section>

        <section className="dash-card">
          <h3>By type</h3>
          <ul className="dash-bars">
            {stats.categories.map(([category, count]) => (
              <li key={category}>
                <button
                  onClick={() => onFilterCategory(category)}
                  title={`Show ${categoryMeta[category]?.label ?? category} notes`}
                >
                  <span className="dash-bar-label">
                    {categoryMeta[category]?.emoji ?? "✨"}{" "}
                    {categoryMeta[category]?.label ?? category}
                  </span>
                  <span className="dash-track">
                    <i style={{ width: `${(count / maxCategory) * 100}%` }} />
                  </span>
                  <span className="dash-bar-count">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="dash-card">
          <h3>Status flow</h3>
          <div className="dash-stack" role="img" aria-label="Notes by status">
            {statuses.map((s) => {
              const n = stats.byStatus.get(s.key) ?? 0;
              return n ? (
                <i
                  key={s.key}
                  className={`seg status-${s.key}`}
                  style={{ width: `${(n / totalStatus) * 100}%` }}
                  title={`${s.label}: ${n}`}
                />
              ) : null;
            })}
          </div>
          <ul className="dash-legend">
            {statuses.map((s) => (
              <li key={s.key}>
                <i className={`swatch status-${s.key}`} /> {s.icon} {s.label}{" "}
                <b>{stats.byStatus.get(s.key) ?? 0}</b>
              </li>
            ))}
          </ul>
        </section>

        <section className="dash-card wide">
          <h3>
            Word patterns <small>what you keep coming back to</small>
          </h3>
          {patterns.length === 0 ? (
            <p className="dash-muted">
              Patterns appear once a word or tag shows up in more than one note.
            </p>
          ) : (
            <div className="dash-cloud">
              {patterns.map(([word, data]) => (
                <button
                  key={word}
                  onClick={() => onFilterWord(word)}
                  style={{ fontSize: `${11 + Math.round((data.count / maxPattern) * 7)}px` }}
                  title={`Show notes mentioning "${word}"`}
                >
                  {word} <sup>{data.count}</sup>
                </button>
              ))}
            </div>
          )}
          {stats.rising.length > 0 && (
            <div className="dash-rising">
              <span className="dash-kpi-label">Rising this week</span>
              <ul>
                {stats.rising.map((r) => (
                  <li key={r.term}>
                    <button onClick={() => onFilterWord(r.term)}>
                      <TrendingUp size={11} /> {r.term}
                      <small>
                        {r.now} now · {r.before} before
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="dash-card wide">
          <h3>
            Timeline <small>your latest active days</small>
          </h3>
          <ol className="dash-timeline">
            {stats.journey.map((day) => {
              const first = day[0]!;
              const icons = [
                ...new Set(day.map((t) => categoryMeta[t.category]?.emoji ?? "✨")),
              ].slice(0, 4);
              const key = new Date(first.createdAt);
              const dayKeyValue = `${key.getFullYear()}-${String(key.getMonth() + 1).padStart(2, "0")}-${String(key.getDate()).padStart(2, "0")}`;
              return (
                <li key={dayKeyValue}>
                  <button onClick={() => onFilterDay(dayKeyValue)}>
                    <span className="tl-dot" />
                    <span className="tl-when">
                      <b>{dayLabel(first.createdAt)}</b>
                      <small>{daysAgoHint(first.createdAt) || dayTitle(first.createdAt)}</small>
                    </span>
                    <span className="tl-body">
                      {day.slice(0, 2).map((t) => (
                        <span key={t.id} className="tl-note">
                          {t.text.trim().slice(0, 90) || "(no text)"}
                        </span>
                      ))}
                      {day.length > 2 && <small>+{day.length - 2} more</small>}
                    </span>
                    <span className="tl-meta">
                      <span>{icons.join(" ")}</span>
                      <b>{plural(day.length, "note")}</b>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </section>
  );
}

function DashHeader({
  deskTitle,
  deskEmoji,
  range,
  setRange,
  onClose,
}: {
  deskTitle: string;
  deskEmoji: string;
  range: number;
  setRange: (range: (typeof RANGES)[number]) => void;
  onClose: () => void;
}) {
  return (
    <header className="dash-head">
      <button className="dash-back" onClick={onClose} aria-label="Back to notes">
        <ArrowLeft size={14} /> Notes
      </button>
      <div className="dash-title">
        <h2>Pattern Radar</h2>
        <p>
          A notebook with dots · {deskEmoji} {deskTitle}
        </p>
      </div>
      <div className="dash-range" role="group" aria-label="Chart range">
        {RANGES.map((r) => (
          <button
            key={r}
            className={range === r ? "on" : ""}
            aria-pressed={range === r}
            onClick={() => setRange(r)}
          >
            {r}d
          </button>
        ))}
      </div>
    </header>
  );
}

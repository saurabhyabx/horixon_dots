// Pattern Radar analytics. Pure functions over ONE desk's thoughts: nothing is shared between desks.
import { dayKey, daysAgoStart, startOfDay } from "./dates";

export const stopWords = new Set(
  "the and that with from into this your about based should user users they them than will have what when without every instead these those over under around onto through been being their would could there where which while since until because after before high raw system systems thought thoughts mind brain local first feel give more less most much very just also how why who one two all for not are you but its our can has had was were each some other only even then does did get way use via".split(
    " ",
  ),
);

export type PatternThought = {
  text: string;
  tags: string[];
  createdAt: number;
};

/** Words and tags a note contributes to pattern counts: tags weigh 2, plain words weigh 1. */
export function termsOf(thought: Pick<PatternThought, "text" | "tags">): [string, number][] {
  const terms: [string, number][] = [];
  for (const tag of thought.tags) {
    const clean = tag.replace(/^#/, "").toLowerCase();
    if (clean.length > 2) terms.push([clean, 2]);
  }
  for (const word of thought.text.toLowerCase().match(/[a-z0-9-]{4,}/g) ?? []) {
    if (!stopWords.has(word)) terms.push([word, 1]);
  }
  return terms;
}

export function termCounts(thoughts: PatternThought[]) {
  const counts = new Map<string, number>();
  for (const thought of thoughts) {
    for (const [term, weight] of termsOf(thought))
      counts.set(term, (counts.get(term) ?? 0) + weight);
  }
  return counts;
}

/** Terms that showed up more in the last 7 days than in the 7 days before. */
export function risingTerms(thoughts: PatternThought[]) {
  const weekStart = daysAgoStart(6);
  const prevStart = daysAgoStart(13);
  const now = termCounts(thoughts.filter((t) => t.createdAt >= weekStart));
  const before = termCounts(
    thoughts.filter((t) => t.createdAt >= prevStart && t.createdAt < weekStart),
  );
  return [...now.entries()]
    .map(([term, count]) => ({ term, now: count, before: before.get(term) ?? 0 }))
    .filter((entry) => entry.now >= 2 && entry.now > entry.before)
    .sort((a, b) => b.now - b.before - (a.now - a.before) || b.now - a.now)
    .slice(0, 6);
}

export type DayCount = { key: string; time: number; count: number };

/** One entry per calendar day for the last `days` days, oldest first, today last. */
export function dailyCounts(thoughts: PatternThought[], days: number): DayCount[] {
  const counts = new Map<string, number>();
  for (const thought of thoughts) {
    const key = dayKey(thought.createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, i) => {
    const time = daysAgoStart(days - 1 - i);
    const key = dayKey(time);
    return { key, time, count: counts.get(key) ?? 0 };
  });
}

export function movingAverage(values: number[], window = 7) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

/** Consecutive days with at least one note, counting back from today (or yesterday if today is empty). */
export function currentStreak(thoughts: PatternThought[]) {
  const days = new Set(thoughts.map((t) => dayKey(t.createdAt)));
  let offset = days.has(dayKey(Date.now())) ? 0 : 1;
  let streak = 0;
  while (days.has(dayKey(daysAgoStart(offset)))) {
    streak++;
    offset++;
  }
  return streak;
}

export function weekOverWeek(thoughts: PatternThought[]) {
  const weekStart = daysAgoStart(6);
  const prevStart = daysAgoStart(13);
  const thisWeek = thoughts.filter((t) => t.createdAt >= weekStart).length;
  const lastWeek = thoughts.filter(
    (t) => t.createdAt >= prevStart && t.createdAt < weekStart,
  ).length;
  return { thisWeek, lastWeek, delta: thisWeek - lastWeek };
}

export type HeatDay = { key: string; time: number; count: number } | null;

/** Week columns (Monday first, current week last) of day cells; future days are null. */
export function heatmapWeeks(thoughts: PatternThought[], weeks = 12): HeatDay[][] {
  const counts = new Map<string, number>();
  for (const thought of thoughts) {
    const key = dayKey(thought.createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = startOfDay(Date.now());
  const sinceMonday = (new Date(today).getDay() + 6) % 7;
  const lastMonday = daysAgoStart(sinceMonday);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(lastMonday);
      date.setDate(date.getDate() - (weeks - 1 - w) * 7 + d);
      const time = date.getTime();
      if (time > today) return null;
      const key = dayKey(time);
      return { key, time, count: counts.get(key) ?? 0 };
    }),
  );
}

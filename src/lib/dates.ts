// Local-day helpers for grouping and filtering cards by creation date.

export const startOfDay = (time: number) => {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** Start of the local day `days` days before `now` (0 = today). */
export const daysAgoStart = (days: number, now = Date.now()) => {
  const date = new Date(startOfDay(now));
  date.setDate(date.getDate() - days);
  return date.getTime();
};

export const dayKey = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export function dayLabel(time: number, now = Date.now()) {
  const diff = Math.round((startOfDay(now) - startOfDay(time)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export const fullDate = (time: number) =>
  new Date(time).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

export type DayGroup<T> = { key: string; label: string; time: number; items: T[] };

/** Groups items by local day, keeping the incoming order (callers pass newest first). */
export function groupByDay<T extends { createdAt: number }>(items: T[]): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const key = dayKey(item.createdAt);
    const group = groups.get(key) ?? {
      key,
      label: dayLabel(item.createdAt),
      time: item.createdAt,
      items: [],
    };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** "2 days ago" style hint for days older than yesterday; empty for today and yesterday. */
export function daysAgoHint(time: number, now = Date.now()) {
  const diff = Math.round((startOfDay(now) - startOfDay(time)) / 86400000);
  return diff >= 2 ? `${diff} days ago` : "";
}

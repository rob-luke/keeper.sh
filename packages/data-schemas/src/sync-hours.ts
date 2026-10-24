import { type } from "arktype";
import { normalizeTimeZone } from "./time-zone";

/*
 * A calendar's sync hours are a string of 168 flags, one per hour of the week, written "1" when events
 * in that hour may sync and "0" when they may not. Index = day * 24 + hour, with day 0 = Monday and
 * day 6 = Sunday, in the user's home time zone. A null value means the calendar syncs at any hour.
 */
const SYNC_HOURS_DAYS = 7;
const SYNC_HOURS_PER_DAY = 24;
const SYNC_HOURS_LENGTH = SYNC_HOURS_DAYS * SYNC_HOURS_PER_DAY;
const DEFAULT_SYNC_HOURS_TIME_ZONE = "UTC";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MS_PER_HOUR = 3_600_000;
const MAX_HOUR_STEPS = SYNC_HOURS_LENGTH + 2;

const SYNC_HOURS_PATTERN = new RegExp(`^[01]{${SYNC_HOURS_LENGTH}}$`);

const syncHoursSchema = type("string").narrow((value) => SYNC_HOURS_PATTERN.test(value));
const syncHoursOrNullSchema = type("null").or(syncHoursSchema);

const SYNC_HOURS_ALL_ON = "1".repeat(SYNC_HOURS_LENGTH);
const SYNC_HOURS_ALL_OFF = "0".repeat(SYNC_HOURS_LENGTH);

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const isSyncHours = (value: unknown): value is string =>
  typeof value === "string" && syncHoursSchema.allows(value);

/** A calendar with every hour on has no restriction, so it is stored as null. */
const normalizeSyncHours = (value: string | null | undefined): string | null => {
  if (typeof value !== "string" || !isSyncHours(value)) {
    return null;
  }
  if (value === SYNC_HOURS_ALL_ON) {
    return null;
  }
  return value;
};

// `Array.prototype.at` is newer than the web app's ES2020 lib.
const lastOf = <Item>(items: readonly Item[]): Item | null => {
  const [last] = items.slice(-1);
  return last ?? null;
};

const syncHourIndex = (day: number, hour: number): number => day * SYNC_HOURS_PER_DAY + hour;

const isSyncHourOn = (syncHours: string, day: number, hour: number): boolean =>
  syncHours.charAt(syncHourIndex(day, hour)) === "1";

const toFlag = (enabled: boolean): string => {
  if (enabled) {
    return "1";
  }
  return "0";
};

const setSyncHours = (
  syncHours: string,
  indexes: readonly number[],
  enabled: boolean,
): string => {
  const flags = [...syncHours];
  const flag = toFlag(enabled);
  for (const index of indexes) {
    flags[index] = flag;
  }
  return flags.join("");
};

const countSyncHours = (syncHours: string | null): number => {
  if (syncHours === null) {
    return SYNC_HOURS_LENGTH;
  }
  return [...syncHours].filter((flag) => flag === "1").length;
};

const createSyncHoursFromRanges = (
  days: readonly number[],
  startHour: number,
  endHour: number,
): string => {
  const flags = [...SYNC_HOURS_ALL_OFF];
  for (const day of days) {
    for (let hour = startHour; hour < endHour; hour += 1) {
      flags[syncHourIndex(day, hour)] = "1";
    }
  }
  return flags.join("");
};

const NOON_HOUR = 12;

const formatHour = (hour: number): string => {
  const normalized = hour % SYNC_HOURS_PER_DAY;
  let suffix = "AM";
  if (normalized >= NOON_HOUR) {
    suffix = "PM";
  }
  let twelveHour = normalized % NOON_HOUR;
  if (twelveHour === 0) {
    twelveHour = NOON_HOUR;
  }
  return `${twelveHour} ${suffix}`;
};

const readDayRanges = (syncHours: string, day: number): [number, number][] => {
  const ranges: [number, number][] = [];
  let start: number | null = null;
  for (let hour = 0; hour <= SYNC_HOURS_PER_DAY; hour += 1) {
    const on = hour < SYNC_HOURS_PER_DAY && isSyncHourOn(syncHours, day, hour);
    if (on && start === null) {
      start = hour;
    }
    if (!on && start !== null) {
      ranges.push([start, hour]);
      start = null;
    }
  }
  return ranges;
};

const MAX_SUMMARY_GROUPS = 3;

/** A short description of the schedule, such as "Mon–Fri 9 AM–5 PM". */
const formatSyncHoursSummary = (syncHours: string | null): string => {
  if (syncHours === null || syncHours === SYNC_HOURS_ALL_ON) {
    return "Always";
  }
  if (syncHours === SYNC_HOURS_ALL_OFF) {
    return "Never";
  }

  const groups: { days: number[]; label: string }[] = [];
  for (let day = 0; day < SYNC_HOURS_DAYS; day += 1) {
    const ranges = readDayRanges(syncHours, day);
    if (ranges.length === 0) {
      continue;
    }
    const label = ranges
      .map(([start, end]) => `${formatHour(start)}–${formatHour(end)}`)
      .join(", ");
    const previous = lastOf(groups);
    if (previous && previous.label === label && lastOf(previous.days) === day - 1) {
      previous.days.push(day);
    } else {
      groups.push({ days: [day], label });
    }
  }

  if (groups.length > MAX_SUMMARY_GROUPS) {
    return `${countSyncHours(syncHours)} hours a week`;
  }

  return groups
    .map(({ days, label }) => {
      const first = DAY_LABELS[days[0] ?? 0];
      const last = DAY_LABELS[lastOf(days) ?? 0];
      if (days.length === 1) {
        return `${first} ${label}`;
      }
      return `${first}–${last} ${label}`;
    })
    .join(" · ");
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = formatterCache.get(timeZone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    minute: "numeric",
    second: "numeric",
    timeZone,
    weekday: "short",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
};

interface LocalHourPosition {
  index: number;
  msIntoHour: number;
}

const readLocalHourPosition = (instantMs: number, formatter: Intl.DateTimeFormat): LocalHourPosition => {
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  for (const part of formatter.formatToParts(new Date(instantMs))) {
    if (part.type === "weekday") {
      day = WEEKDAY_INDEX[part.value] ?? 0;
    } else if (part.type === "hour") {
      hour = Number(part.value) % SYNC_HOURS_PER_DAY;
    } else if (part.type === "minute") {
      minute = Number(part.value);
    } else if (part.type === "second") {
      second = Number(part.value);
    }
  }

  const msIntoSecond = ((instantMs % MS_PER_SECOND) + MS_PER_SECOND) % MS_PER_SECOND;
  return {
    index: syncHourIndex(day, hour),
    msIntoHour: (minute * SECONDS_PER_MINUTE + second) * MS_PER_SECOND + msIntoSecond,
  };
};

interface SyncHoursEvent {
  endTime: Date;
  startTime: Date;
}

/**
 * Whether any part of an event falls in an hour the schedule allows. An event that only touches the
 * edge of an allowed hour does not count. A null schedule allows every event.
 */
const eventOverlapsSyncHours = (
  event: SyncHoursEvent,
  syncHours: string | null,
  timeZone: string | null,
): boolean => {
  if (syncHours === null || syncHours === SYNC_HOURS_ALL_ON) {
    return true;
  }
  if (syncHours === SYNC_HOURS_ALL_OFF) {
    return false;
  }

  const formatter = getFormatter(normalizeTimeZone(timeZone ?? "") ?? DEFAULT_SYNC_HOURS_TIME_ZONE);
  const startMs = event.startTime.getTime();
  const endMs = Math.max(event.endTime.getTime(), startMs + 1);

  let cursor = startMs;
  for (let step = 0; step < MAX_HOUR_STEPS && cursor < endMs; step += 1) {
    const { index, msIntoHour } = readLocalHourPosition(cursor, formatter);
    if (syncHours.charAt(index) === "1") {
      return true;
    }
    cursor += MS_PER_HOUR - msIntoHour;
  }

  // An event this long touches every hour of the week, and at least one hour is on.
  return cursor < endMs;
};

export {
  DAY_LABELS,
  DEFAULT_SYNC_HOURS_TIME_ZONE,
  SYNC_HOURS_ALL_OFF,
  SYNC_HOURS_ALL_ON,
  SYNC_HOURS_DAYS,
  SYNC_HOURS_LENGTH,
  SYNC_HOURS_PER_DAY,
  countSyncHours,
  createSyncHoursFromRanges,
  eventOverlapsSyncHours,
  formatHour,
  formatSyncHoursSummary,
  isSyncHourOn,
  isSyncHours,
  normalizeSyncHours,
  setSyncHours,
  syncHourIndex,
  syncHoursOrNullSchema,
  syncHoursSchema,
};
export type { SyncHoursEvent };

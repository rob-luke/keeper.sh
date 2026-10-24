import { describe, expect, it } from "vitest";
import {
  SYNC_HOURS_ALL_OFF,
  SYNC_HOURS_ALL_ON,
  SYNC_HOURS_LENGTH,
  countSyncHours,
  createSyncHoursFromRanges,
  eventOverlapsSyncHours,
  formatSyncHoursSummary,
  isSyncHourOn,
  isSyncHours,
  normalizeSyncHours,
  setSyncHours,
  syncHourIndex,
  syncHoursOrNullSchema,
} from "../src/index";

const WEEKDAYS = [0, 1, 2, 3, 4];
const NINE_TO_FIVE = createSyncHoursFromRanges(WEEKDAYS, 9, 17);

const at = (iso: string): Date => new Date(iso);

describe("syncHoursSchema and normalizeSyncHours", () => {
  it("accepts exactly 168 flags and null", () => {
    expect(isSyncHours(SYNC_HOURS_ALL_ON)).toBe(true);
    expect(isSyncHours(SYNC_HOURS_ALL_OFF)).toBe(true);
    expect(isSyncHours("1".repeat(SYNC_HOURS_LENGTH - 1))).toBe(false);
    expect(isSyncHours(`${"1".repeat(SYNC_HOURS_LENGTH - 1)}2`)).toBe(false);
    expect(syncHoursOrNullSchema.allows(null)).toBe(true);
    expect(syncHoursOrNullSchema.allows(NINE_TO_FIVE)).toBe(true);
    expect(syncHoursOrNullSchema.allows("101")).toBe(false);
  });

  it("stores a fully open week as null", () => {
    expect(normalizeSyncHours(SYNC_HOURS_ALL_ON)).toBeNull();
    expect(normalizeSyncHours(null)).toBeNull();
    expect(normalizeSyncHours("nonsense")).toBeNull();
    expect(normalizeSyncHours(NINE_TO_FIVE)).toBe(NINE_TO_FIVE);
  });
});

describe("building a schedule", () => {
  it("turns on the requested hours of the requested days", () => {
    expect(isSyncHourOn(NINE_TO_FIVE, 0, 9)).toBe(true);
    expect(isSyncHourOn(NINE_TO_FIVE, 0, 16)).toBe(true);
    expect(isSyncHourOn(NINE_TO_FIVE, 0, 17)).toBe(false);
    expect(isSyncHourOn(NINE_TO_FIVE, 5, 10)).toBe(false);
    expect(countSyncHours(NINE_TO_FIVE)).toBe(5 * 8);
  });

  it("sets and clears individual hours", () => {
    const index = syncHourIndex(6, 20);
    const on = setSyncHours(SYNC_HOURS_ALL_OFF, [index], true);

    expect(isSyncHourOn(on, 6, 20)).toBe(true);
    expect(countSyncHours(on)).toBe(1);
    expect(countSyncHours(setSyncHours(on, [index], false))).toBe(0);
  });
});

describe("formatSyncHoursSummary", () => {
  it("names the open and closed extremes", () => {
    expect(formatSyncHoursSummary(null)).toBe("Always");
    expect(formatSyncHoursSummary(SYNC_HOURS_ALL_ON)).toBe("Always");
    expect(formatSyncHoursSummary(SYNC_HOURS_ALL_OFF)).toBe("Never");
  });

  it("groups consecutive days with the same hours", () => {
    expect(formatSyncHoursSummary(NINE_TO_FIVE)).toBe("Mon–Fri 9 AM–5 PM");
  });

  it("lists split days and different hours on other days", () => {
    const monday = createSyncHoursFromRanges([0], 14, 17);
    const mondayEvening = setSyncHours(monday, [syncHourIndex(0, 19), syncHourIndex(0, 20), syncHourIndex(0, 21)], true);
    const withSaturday = setSyncHours(mondayEvening, [syncHourIndex(5, 10)], true);

    expect(formatSyncHoursSummary(withSaturday)).toBe("Mon 2 PM–5 PM, 7 PM–10 PM · Sat 10 AM–11 AM");
  });

  it("falls back to a count when the schedule is too varied to describe", () => {
    let varied = SYNC_HOURS_ALL_OFF;
    for (let day = 0; day < 7; day += 1) {
      varied = setSyncHours(varied, [syncHourIndex(day, day)], true);
    }

    expect(formatSyncHoursSummary(varied)).toBe("7 hours a week");
  });

  it("writes midnight and noon as 12 AM and 12 PM", () => {
    const night = createSyncHoursFromRanges([0], 0, 12);

    expect(formatSyncHoursSummary(night)).toBe("Mon 12 AM–12 PM");
  });
});

describe("eventOverlapsSyncHours", () => {
  // 2026-10-19 is a Monday. Melbourne is UTC+11 in October (daylight saving), Los Angeles UTC-7.
  const melbourne = "Australia/Melbourne";

  it("allows every event when there is no schedule", () => {
    expect(
      eventOverlapsSyncHours({ endTime: at("2026-10-24T20:00:00Z"), startTime: at("2026-10-24T19:00:00Z") }, null, melbourne),
    ).toBe(true);
  });

  it("allows an event inside the hours, read in the home time zone", () => {
    // Monday 10:00-11:00 in Melbourne is Sunday 23:00-00:00 UTC.
    const event = { endTime: at("2026-10-19T00:00:00Z"), startTime: at("2026-10-18T23:00:00Z") };

    expect(eventOverlapsSyncHours(event, NINE_TO_FIVE, melbourne)).toBe(true);
    expect(eventOverlapsSyncHours(event, NINE_TO_FIVE, "UTC")).toBe(false);
  });

  it("rejects an event outside the hours", () => {
    // Monday 19:00-20:00 in Melbourne.
    const event = { endTime: at("2026-10-19T09:00:00Z"), startTime: at("2026-10-19T08:00:00Z") };

    expect(eventOverlapsSyncHours(event, NINE_TO_FIVE, melbourne)).toBe(false);
  });

  it("allows an event that starts before the hours and runs into them", () => {
    // Monday 08:30-09:30 in Melbourne.
    const event = { endTime: at("2026-10-18T22:30:00Z"), startTime: at("2026-10-18T21:30:00Z") };

    expect(eventOverlapsSyncHours(event, NINE_TO_FIVE, melbourne)).toBe(true);
  });

  it("allows an event that starts inside the hours and runs past them", () => {
    // Monday 16:30-17:30 in Melbourne.
    const event = { endTime: at("2026-10-19T06:30:00Z"), startTime: at("2026-10-19T05:30:00Z") };

    expect(eventOverlapsSyncHours(event, NINE_TO_FIVE, melbourne)).toBe(true);
  });

  it("does not count an event that only touches the edge of the hours", () => {
    // Monday 17:00-18:00 and 08:00-09:00 in Melbourne.
    const after = { endTime: at("2026-10-19T07:00:00Z"), startTime: at("2026-10-19T06:00:00Z") };
    const before = { endTime: at("2026-10-18T22:00:00Z"), startTime: at("2026-10-18T21:00:00Z") };

    expect(eventOverlapsSyncHours(after, NINE_TO_FIVE, melbourne)).toBe(false);
    expect(eventOverlapsSyncHours(before, NINE_TO_FIVE, melbourne)).toBe(false);
  });

  it("checks the instant of a zero-length event", () => {
    const inside = at("2026-10-19T01:00:00Z");
    const outside = at("2026-10-19T09:00:00Z");

    expect(eventOverlapsSyncHours({ endTime: inside, startTime: inside }, NINE_TO_FIVE, melbourne)).toBe(true);
    expect(eventOverlapsSyncHours({ endTime: outside, startTime: outside }, NINE_TO_FIVE, melbourne)).toBe(false);
  });

  it("follows the home time zone across a daylight saving change", () => {
    // Melbourne moves to daylight saving on Sunday 2026-10-04. Monday 2026-10-05 10:00 is UTC+11.
    const monday = { endTime: at("2026-10-05T00:00:00Z"), startTime: at("2026-10-04T23:00:00Z") };
    // Monday 2026-09-28 10:00 is still UTC+10, so the same wall-clock hour is one hour later in UTC.
    const before = { endTime: at("2026-09-28T01:00:00Z"), startTime: at("2026-09-28T00:00:00Z") };

    expect(eventOverlapsSyncHours(monday, NINE_TO_FIVE, melbourne)).toBe(true);
    expect(eventOverlapsSyncHours(before, NINE_TO_FIVE, melbourne)).toBe(true);
  });

  it("handles time zones whose offset is not a whole hour", () => {
    // Monday 09:30-10:30 in India (UTC+5:30) is 04:00-05:00 UTC.
    const event = { endTime: at("2026-10-19T05:00:00Z"), startTime: at("2026-10-19T04:00:00Z") };

    expect(eventOverlapsSyncHours(event, NINE_TO_FIVE, "Asia/Kolkata")).toBe(true);
    expect(eventOverlapsSyncHours(event, createSyncHoursFromRanges([0], 11, 17), "Asia/Kolkata")).toBe(false);
  });

  it("allows an event that spans more than a week when any hour is on", () => {
    const event = { endTime: at("2026-11-10T00:00:00Z"), startTime: at("2026-10-19T00:00:00Z") };

    expect(eventOverlapsSyncHours(event, NINE_TO_FIVE, melbourne)).toBe(true);
    expect(eventOverlapsSyncHours(event, SYNC_HOURS_ALL_OFF, melbourne)).toBe(false);
  });

  it("falls back to UTC when the time zone is missing or unknown", () => {
    // Monday 10:00-11:00 UTC.
    const event = { endTime: at("2026-10-19T11:00:00Z"), startTime: at("2026-10-19T10:00:00Z") };

    expect(eventOverlapsSyncHours(event, NINE_TO_FIVE, null)).toBe(true);
    expect(eventOverlapsSyncHours(event, NINE_TO_FIVE, "Mars/Olympus_Mons")).toBe(true);
  });
});

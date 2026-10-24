import { describe, expect, it } from "vitest";
import { createSyncHoursFromRanges } from "@keeper.sh/data-schemas";
import type { BunSQLClient } from "../../../src/core/database-client";
import {
  getEventsForCalendarsWithDiagnostics,
  isOutsideSyncHours,
} from "../../../src/core/events/events";

const NINE_TO_FIVE = createSyncHoursFromRanges([0, 1, 2, 3, 4], 9, 17);
const MELBOURNE = "Australia/Melbourne";

// 2026-10-19 is a Monday and Melbourne is UTC+11 then. 10:00-11:00 is inside; 19:00-20:00 is outside.
const INSIDE = {
  endTime: new Date("2026-10-19T00:00:00Z"),
  startTime: new Date("2026-10-18T23:00:00Z"),
};
const OUTSIDE = {
  endTime: new Date("2026-10-19T09:00:00Z"),
  startTime: new Date("2026-10-19T08:00:00Z"),
};

const createInput = (overrides: Partial<Parameters<typeof isOutsideSyncHours>[0]> = {}) => ({
  ...INSIDE,
  homeTimeZone: MELBOURNE,
  isAllDay: false,
  recurrenceId: null,
  recurrenceRule: null,
  syncHours: NINE_TO_FIVE,
  ...overrides,
});

describe("isOutsideSyncHours", () => {
  it("never excludes anything when the calendar has no sync hours", () => {
    expect(isOutsideSyncHours(createInput({ ...OUTSIDE, syncHours: null }))).toBe(false);
  });

  it("keeps an event inside the hours and excludes one outside them", () => {
    expect(isOutsideSyncHours(createInput())).toBe(false);
    expect(isOutsideSyncHours(createInput(OUTSIDE))).toBe(true);
  });

  it("reads the hours in the home time zone, falling back to UTC when none is set", () => {
    expect(isOutsideSyncHours(createInput({ homeTimeZone: "UTC" }))).toBe(true);
    expect(isOutsideSyncHours(createInput({ homeTimeZone: null }))).toBe(true);
  });

  it("leaves whole-day events to the all-day exclusion", () => {
    expect(isOutsideSyncHours(createInput({ ...OUTSIDE, isAllDay: true }))).toBe(false);
  });

  it("leaves a recurring series stored as a single row alone", () => {
    expect(
      isOutsideSyncHours(createInput({ ...OUTSIDE, recurrenceRule: "FREQ=DAILY" })),
    ).toBe(false);
  });

  it("still judges an override of a recurring series by its own time", () => {
    expect(
      isOutsideSyncHours(
        createInput({ ...OUTSIDE, recurrenceId: new Date("2026-10-19T08:00:00Z"), recurrenceRule: "FREQ=DAILY" }),
      ),
    ).toBe(true);
  });
});

const createRow = (overrides: Record<string, unknown>) => ({
  availability: "busy",
  calendarId: "calendar-1",
  calendarName: "Personal",
  calendarUrl: null,
  customEventName: "{{calendar_name}}",
  description: null,
  endTime: INSIDE.endTime,
  excludeAllDayEvents: false,
  excludeAvailabilities: [],
  excludeEventDescription: true,
  excludeEventLocation: true,
  excludeEventName: true,
  excludeFocusTime: false,
  excludeOutOfOffice: false,
  excludeTitleKeywords: [],
  exceptionDates: null,
  homeTimeZone: MELBOURNE,
  id: "state-1",
  isAllDay: false,
  location: null,
  markEventsAsPrivate: false,
  recurrenceId: null,
  recurrenceRule: null,
  sourceEventType: "default",
  sourceEventUid: "uid-1",
  startTime: INSIDE.startTime,
  startTimeZone: null,
  syncHours: NINE_TO_FIVE,
  title: "Event",
  ...overrides,
});

const createFakeDatabase = (rows: Record<string, unknown>[]): BunSQLClient => {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "from", "innerJoin", "leftJoin", "where"]) {
    chain[method] = () => chain;
  }
  chain.orderBy = () => Promise.resolve(rows);
  return chain as unknown as BunSQLClient;
};

const SYNC_WINDOW = {
  timeMax: new Date("2027-01-01T00:00:00Z"),
  timeMin: new Date("2026-01-01T00:00:00Z"),
};

describe("getEventsForCalendarsWithDiagnostics with sync hours", () => {
  it("drops events outside a calendar's sync hours and counts them as excluded by policy", async () => {
    const database = createFakeDatabase([
      createRow({ id: "inside", sourceEventUid: "uid-inside" }),
      createRow({ ...OUTSIDE, id: "outside", sourceEventUid: "uid-outside" }),
    ]);

    const { diagnostics, events } = await getEventsForCalendarsWithDiagnostics(
      database,
      ["calendar-1"],
      SYNC_WINDOW,
    );

    expect(events.map((event) => event.sourceEventUid)).toEqual(["uid-inside"]);
    expect(diagnostics.excludedBySyncPolicyCount).toBe(1);
  });

  it("syncs every event of a calendar without sync hours", async () => {
    const database = createFakeDatabase([
      createRow({ id: "inside", sourceEventUid: "uid-inside", syncHours: null }),
      createRow({ ...OUTSIDE, id: "outside", sourceEventUid: "uid-outside", syncHours: null }),
    ]);

    const { diagnostics, events } = await getEventsForCalendarsWithDiagnostics(
      database,
      ["calendar-1"],
      SYNC_WINDOW,
    );

    expect(events).toHaveLength(2);
    expect(diagnostics.excludedBySyncPolicyCount).toBe(0);
  });

  it("applies each calendar's own hours when several feed one destination", async () => {
    const database = createFakeDatabase([
      createRow({ ...OUTSIDE, calendarId: "calendar-1", id: "a", sourceEventUid: "uid-a" }),
      createRow({
        ...OUTSIDE,
        calendarId: "calendar-2",
        id: "b",
        sourceEventUid: "uid-b",
        syncHours: createSyncHoursFromRanges([0], 18, 22),
      }),
    ]);

    const { events } = await getEventsForCalendarsWithDiagnostics(
      database,
      ["calendar-1", "calendar-2"],
      SYNC_WINDOW,
    );

    expect(events.map((event) => event.sourceEventUid)).toEqual(["uid-b"]);
  });
});

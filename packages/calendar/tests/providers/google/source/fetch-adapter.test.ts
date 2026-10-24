import { afterEach, describe, expect, it } from "vitest";
import { getOAuthSyncTokenVersion } from "../../../../src/core/oauth/sync-window";
import {
  encodeStoredSyncToken,
  resolveSyncTokenForWindow,
} from "../../../../src/core/oauth/sync-token";
import { createGoogleSourceFetcher } from "../../../../src/providers/google/source/fetch-adapter";
import { createSourceIngestionPlan } from "../../../../src/core/sync/sync-range";

const CALENDAR_ID = "calendar-id";
const SYNC_TOKEN_VERSION = getOAuthSyncTokenVersion(0, new Date(), CALENDAR_ID);
const TEST_PLAN = createSourceIngestionPlan("1_week", "2_years");

const originalFetch = globalThis.fetch;

const fetchOutOfWindowGoogleDelta = (): Promise<Response> => Promise.resolve(Response.json({
  items: [{
    end: { dateTime: "2098-03-08T15:00:00.000Z", timeZone: "UTC" },
    iCalUID: "external-uid-1",
    id: "google-event-id-1",
    start: { dateTime: "2098-03-08T14:00:00.000Z", timeZone: "UTC" },
    status: "confirmed",
  }],
  nextSyncToken: "next-google-token",
}));
fetchOutOfWindowGoogleDelta.preconnect = originalFetch.preconnect;
const fetchGoogleDeltaWithoutSuccessor = (): Promise<Response> => Promise.resolve(Response.json({
  items: [{
    end: { dateTime: "2026-03-08T15:00:00.000Z", timeZone: "UTC" },
    iCalUID: "external-uid-1",
    id: "google-event-id-1",
    start: { dateTime: "2026-03-08T14:00:00.000Z", timeZone: "UTC" },
    status: "confirmed",
  }],
}));
fetchGoogleDeltaWithoutSuccessor.preconnect = originalFetch.preconnect;
const fetchGoogleDeltaWithoutUid = (): Promise<Response> => Promise.resolve(Response.json({
  items: [{
    end: { dateTime: "2026-03-08T15:00:00.000Z", timeZone: "UTC" },
    id: "google-event-id-1",
    start: { dateTime: "2026-03-08T14:00:00.000Z", timeZone: "UTC" },
    status: "confirmed",
  }],
  nextSyncToken: "next-google-token",
}));
fetchGoogleDeltaWithoutUid.preconnect = originalFetch.preconnect;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("createGoogleSourceFetcher", () => {
  it("returns a versioned token that the next cron run accepts", async () => {
    const rawSyncToken = "google-sync-token";
    const queuedFetch = (): Promise<Response> => Promise.resolve(Response.json({
      items: [],
      nextSyncToken: rawSyncToken,
    }));
    queuedFetch.preconnect = originalFetch.preconnect;
    globalThis.fetch = queuedFetch;
    const fetcher = createGoogleSourceFetcher({
      accessToken: "test-token",
      calendarId: CALENDAR_ID,
      plan: TEST_PLAN,
      externalCalendarId: "primary",
      syncToken: null,
    });

    const result = await fetcher.fetchEvents();

    expect(result.nextSyncToken).not.toBe(rawSyncToken);
    expect(resolveSyncTokenForWindow(
      result.nextSyncToken ?? null,
      SYNC_TOKEN_VERSION,
    )).toEqual({
      requiresBackfill: false,
      syncToken: rawSyncToken,
    });
  });

  it("reports changed provider IDs without storing delta events outside the sync window", async () => {
    globalThis.fetch = fetchOutOfWindowGoogleDelta;
    const fetcher = createGoogleSourceFetcher({
      accessToken: "test-token",
      calendarId: CALENDAR_ID,
      plan: TEST_PLAN,
      externalCalendarId: "primary",
      syncToken: encodeStoredSyncToken("current-google-token", SYNC_TOKEN_VERSION),
    });

    const result = await fetcher.fetchEvents();

    expect(result.events).toEqual([]);
    expect(result.changedEventIds).toEqual(["google-event-id-1"]);
  });

  it("requests a full sync instead of replaying a delta with no successor token", async () => {
    globalThis.fetch = fetchGoogleDeltaWithoutSuccessor;

    const result = await createGoogleSourceFetcher({
      accessToken: "test-token",
      calendarId: CALENDAR_ID,
      plan: TEST_PLAN,
      externalCalendarId: "primary",
      syncToken: encodeStoredSyncToken("current-google-token", SYNC_TOKEN_VERSION),
    }).fetchEvents();

    expect(result).toEqual({
      events: [],
      fullSyncRequired: true,
      syncWindow: TEST_PLAN.window,
    });
  });

  it("counts the delta events it drops for falling outside the sync window", async () => {
    globalThis.fetch = fetchOutOfWindowGoogleDelta;

    const result = await createGoogleSourceFetcher({
      accessToken: "test-token",
      calendarId: CALENDAR_ID,
      plan: TEST_PLAN,
      externalCalendarId: "primary",
      syncToken: encodeStoredSyncToken("current-google-token", SYNC_TOKEN_VERSION),
    }).fetchEvents();

    expect(result.discardedEventCounts).toEqual({
      outsideSyncWindow: 1,
      unrepresentable: 0,
    });
  });

  it("counts the delta events it drops for carrying no usable identity", async () => {
    globalThis.fetch = fetchGoogleDeltaWithoutUid;

    const result = await createGoogleSourceFetcher({
      accessToken: "test-token",
      calendarId: CALENDAR_ID,
      plan: TEST_PLAN,
      externalCalendarId: "primary",
      syncToken: encodeStoredSyncToken("current-google-token", SYNC_TOKEN_VERSION),
    }).fetchEvents();

    expect(result.events).toEqual([]);
    expect(result.changedEventIds).toEqual(["google-event-id-1"]);
    expect(result.discardedEventCounts).toEqual({
      outsideSyncWindow: 0,
      unrepresentable: 1,
    });
  });
});

const resolveRequestUrl = (input: Parameters<typeof fetch>[0]): string => {
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
};

describe("declined reclassification", () => {
  const CURRENT_SYNC_TOKEN = "current-google-token";
  const NEXT_SYNC_TOKEN = "next-google-token";
  const PRE_DECLINED_SYNC_TOKEN_VERSION = getOAuthSyncTokenVersion(0, new Date(), CALENDAR_ID);
  const DECLINED_AWARE_SYNC_TOKEN_VERSION = getOAuthSyncTokenVersion(1, new Date(), CALENDAR_ID);

  const recordRequestedUrls = (): string[] => {
    const requestedUrls: string[] = [];
    const recordingFetch = (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      requestedUrls.push(resolveRequestUrl(input));
      return Promise.resolve(Response.json({ items: [], nextSyncToken: NEXT_SYNC_TOKEN }));
    };
    recordingFetch.preconnect = originalFetch.preconnect;
    globalThis.fetch = recordingFetch;
    return requestedUrls;
  };

  const fetchWith = (syncToken: string | null, excludesDeclined: boolean) =>
    createGoogleSourceFetcher({
      accessToken: "test-token",
      calendarId: CALENDAR_ID,
      excludesDeclined,
      externalCalendarId: "primary",
      plan: TEST_PLAN,
      syncToken,
    }).fetchEvents();

  const usesStoredToken = (url: string): boolean => url.includes(`syncToken=${CURRENT_SYNC_TOKEN}`);

  it("refetches the window once when a calendar excludes declined on a pre-declined token", async () => {
    const requestedUrls = recordRequestedUrls();

    const result = await fetchWith(
      encodeStoredSyncToken(CURRENT_SYNC_TOKEN, PRE_DECLINED_SYNC_TOKEN_VERSION),
      true,
    );

    expect(requestedUrls.some((url) => usesStoredToken(url))).toBe(false);
    expect(result.isDeltaSync).toBe(false);
    expect(resolveSyncTokenForWindow(
      result.nextSyncToken ?? null,
      DECLINED_AWARE_SYNC_TOKEN_VERSION,
    ).syncToken).toBe(NEXT_SYNC_TOKEN);
  });

  it("keeps delta syncing on a declined-aware token however often declined is toggled", async () => {
    const requestedUrls = recordRequestedUrls();
    const awareToken = encodeStoredSyncToken(CURRENT_SYNC_TOKEN, DECLINED_AWARE_SYNC_TOKEN_VERSION);

    await fetchWith(awareToken, true);
    await fetchWith(awareToken, false);
    await fetchWith(awareToken, true);

    expect(requestedUrls).toHaveLength(3);
    expect(requestedUrls.every((url) => usesStoredToken(url))).toBe(true);
  });

  it("keeps delta syncing on a pre-declined token when declined is not excluded", async () => {
    const requestedUrls = recordRequestedUrls();

    await fetchWith(encodeStoredSyncToken(CURRENT_SYNC_TOKEN, PRE_DECLINED_SYNC_TOKEN_VERSION), false);

    expect(requestedUrls).toHaveLength(1);
    expect(usesStoredToken(requestedUrls[0] ?? "")).toBe(true);
  });

  it("does not let a delta sync promote a pre-declined token", async () => {
    recordRequestedUrls();

    const result = await fetchWith(
      encodeStoredSyncToken(CURRENT_SYNC_TOKEN, PRE_DECLINED_SYNC_TOKEN_VERSION),
      false,
    );

    expect(resolveSyncTokenForWindow(
      result.nextSyncToken ?? null,
      DECLINED_AWARE_SYNC_TOKEN_VERSION,
    ).requiresBackfill).toBe(true);
  });

  it("stamps a full sync as declined-aware", async () => {
    recordRequestedUrls();

    const result = await fetchWith(null, false);

    expect(resolveSyncTokenForWindow(
      result.nextSyncToken ?? null,
      DECLINED_AWARE_SYNC_TOKEN_VERSION,
    ).syncToken).toBe(NEXT_SYNC_TOKEN);
  });
});

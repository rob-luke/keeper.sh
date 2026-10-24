import type { FetchEventsResult } from "../../../core/sync-engine/ingest";
import type { RedisRateLimiter } from "../../../core/utils/redis-rate-limiter";
import type { SourceIngestionPlan } from "../../../core/sync/sync-range";
import {
  decodeStoredSyncToken,
  encodeStoredSyncToken,
  resolveSyncTokenForWindow,
} from "../../../core/oauth/sync-token";
import {
  getOAuthSyncTokenAdapterVersion,
  getOAuthSyncTokenVersion,
} from "../../../core/oauth/sync-window";
import { filterSourceEventsToSyncWindow } from "../../../core/source/sync-diagnostics";
import { fetchCalendarEvents, parseGoogleEventsWithDiagnostics } from "./utils/fetch-events";
import { measureSyncSegment } from "../../../core/telemetry/segments";

/*
 * Version 1 stores whether the calendar owner declined an event. Calendars that exclude declined events need
 * it, so their older sync tokens are refetched in full once; without the exclusion nothing changes.
 */
const GOOGLE_ADAPTER_VERSION = 1;
const GOOGLE_PRE_DECLINED_ADAPTER_VERSION = 0;

const resolveRequiredAdapterVersion = (excludesDeclined: boolean): number => {
  if (excludesDeclined) {
    return GOOGLE_ADAPTER_VERSION;
  }
  return GOOGLE_PRE_DECLINED_ADAPTER_VERSION;
};

interface GoogleSourceFetcherConfig {
  accessToken: string;
  calendarId: string;
  externalCalendarId: string;
  syncToken: string | null;
  excludesDeclined?: boolean;
  rateLimiter?: RedisRateLimiter;
  signal?: AbortSignal;
  plan: SourceIngestionPlan;
}

interface GoogleSourceFetcher {
  fetchEvents: () => Promise<FetchEventsResult>;
}

const createGoogleSourceFetcher = (config: GoogleSourceFetcherConfig): GoogleSourceFetcher => {
  const fetchEvents = async (): Promise<FetchEventsResult> => {
    const fetchOptions: Parameters<typeof fetchCalendarEvents>[0] = {
      accessToken: config.accessToken,
      calendarId: config.externalCalendarId,
      rateLimiter: config.rateLimiter,
      signal: config.signal,
    };
    const { futureRange, historicRange, window: syncWindow } = config.plan;
    const now = new Date();
    const requiredSyncTokenVersion = getOAuthSyncTokenVersion(
      resolveRequiredAdapterVersion(config.excludesDeclined ?? false),
      now,
      config.calendarId,
    );

    const syncTokenResolution = resolveSyncTokenForWindow(
      config.syncToken,
      requiredSyncTokenVersion,
    );

    let nextAdapterVersion = GOOGLE_ADAPTER_VERSION;
    if (syncTokenResolution.syncToken === null || config.syncToken === null) {
      fetchOptions.timeMin = syncWindow.timeMin;
      fetchOptions.timeMax = syncWindow.timeMax;
    } else {
      fetchOptions.syncToken = syncTokenResolution.syncToken;
      /*
       * A delta sync only adds to what the stored token already covers, so it must not claim a newer adapter
       * generation: events stored before that generation carry no declined flag until a full sync rereads them.
       */
      nextAdapterVersion = getOAuthSyncTokenAdapterVersion(
        decodeStoredSyncToken(config.syncToken).syncWindowVersion,
      );
    }
    const syncTokenVersion = getOAuthSyncTokenVersion(nextAdapterVersion, now, config.calendarId);

    const result = await fetchCalendarEvents(fetchOptions);

    if (result.fullSyncRequired) {
      return { events: [], fullSyncRequired: true, syncWindow };
    }
    if (!result.nextSyncToken) {
      return { events: [], fullSyncRequired: true, syncWindow };
    }

    const { events, filteredCount, parsed } = measureSyncSegment("work.transform_ms", () => {
      const diagnosed = parseGoogleEventsWithDiagnostics(result.events);
      return {
        parsed: diagnosed,
        ...filterSourceEventsToSyncWindow(diagnosed.events, syncWindow),
      };
    });

    return {
      events,
      discardedEventCounts: {
        outsideSyncWindow: filteredCount,
        unrepresentable: parsed.unrepresentableCount,
      },
      selfAuthoredEventCount: parsed.selfAuthoredCount,
      changedEventIds: result.changedEventIds,
      cancelledEventIds: result.cancelledEventIds,
      isDeltaSync: result.isDeltaSync,
      nextSyncToken: encodeStoredSyncToken(
        result.nextSyncToken,
        syncTokenVersion,
      ),
      syncWindow,
      ...(!result.isDeltaSync && {
        coverage: {
          futureRange,
          historicRange,
          window: syncWindow,
        },
      }),
    };
  };

  return { fetchEvents };
};

export { createGoogleSourceFetcher };
export type { GoogleSourceFetcherConfig, GoogleSourceFetcher };

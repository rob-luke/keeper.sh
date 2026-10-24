import useSWR from "swr";
import { eventOverlapsSyncHours } from "@keeper.sh/data-schemas";
import { fetcher } from "@/lib/fetcher";
import { usePreferences } from "@/hooks/use-preferences";
import type { CalendarEvent } from "@/hooks/use-events";
import type { CalendarSource } from "@/types/api";

/** True when the event's own calendar has sync hours and the event sits entirely outside them. */
export const useIsOutsideSyncHours = (
  event: Pick<CalendarEvent, "calendarId" | "startTime" | "endTime" | "isAllDay">,
): boolean => {
  const { data: sources } = useSWR<CalendarSource[]>("/api/sources", fetcher);
  const { data: preferences } = usePreferences();

  if (event.isAllDay) {
    return false;
  }
  const syncHours = sources?.find((source) => source.id === event.calendarId)?.syncHours ?? null;
  if (syncHours === null) {
    return false;
  }
  return !eventOverlapsSyncHours(
    { startTime: event.startTime, endTime: event.endTime },
    syncHours,
    preferences?.homeTimeZone ?? null,
  );
};

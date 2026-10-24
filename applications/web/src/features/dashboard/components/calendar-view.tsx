import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useStore } from "jotai";
import { calendarJumpAtom } from "@/state/event-graph-hover";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import { cn } from "@/utils/cn";
import { Text } from "@/components/ui/primitives/text";
import { useEventsInRange } from "@/hooks/use-events";
import { MonthGrid } from "./month-grid";
import { WeekGrid } from "./week-grid";
import { bucketEventsByDay } from "./event-layout";
import {
  addDays,
  addMonthsClamped,
  formatMonthTitle,
  formatWeekTitle,
  getMonthFetchRange,
  getWeekFetchRange,
  ONE_DAY_VIEW_DAYS,
  THREE_DAY_VIEW_DAYS,
  WEEK_VIEW_DAYS,
} from "./calendar-helpers";

export type CalendarViewMode = "1day" | "3days" | "week" | "month";

const ALL_VIEWS: CalendarViewMode[] = ["1day", "3days", "week", "month"];

const VIEW_LABELS: Record<CalendarViewMode, string> = {
  "1day": "1 day",
  "3days": "3 days",
  week: "Week",
  month: "Month",
};

const dayViewColumns = (view: CalendarViewMode): number => {
  if (view === "1day") return ONE_DAY_VIEW_DAYS;
  if (view === "3days") return THREE_DAY_VIEW_DAYS;
  return WEEK_VIEW_DAYS;
};

const resolveFetchRange = (view: CalendarViewMode, anchor: Date) => {
  if (view === "month") return getMonthFetchRange(anchor);
  return getWeekFetchRange(anchor, dayViewColumns(view));
};

const navButton =
  "flex size-8 items-center justify-center rounded-lg text-foreground-muted hover:bg-background-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface CalendarViewProps {
  /** Views the switcher offers; a phone has no room for a seven-day strip. */
  views?: CalendarViewMode[];
  initialView?: CalendarViewMode;
}

export function CalendarView({ views = ALL_VIEWS, initialView = "week" }: CalendarViewProps) {
  const [view, setView] = useState<CalendarViewMode>(initialView);
  const [anchor, setAnchor] = useState(() => new Date());

  const store = useStore();
  useEffect(
    () =>
      store.sub(calendarJumpAtom, () => {
        const jump = store.get(calendarJumpAtom);
        if (!jump) return;
        if (views.includes("week")) setView("week");
        setAnchor(new Date(jump.dayMs));
      }),
    [store, views],
  );

  const columns = dayViewColumns(view);
  const fetchRange = resolveFetchRange(view, anchor);
  const { events } = useEventsInRange(fetchRange.start, fetchRange.end);
  // Keyed on the window's instants, not `anchor`: the anchor moves on every scroll step, the window doesn't.
  const fetchStartMs = fetchRange.start.getTime();
  const fetchEndMs = fetchRange.end.getTime();
  const eventsByDay = useMemo(
    () => bucketEventsByDay(events, new Date(fetchStartMs), new Date(fetchEndMs)),
    [events, fetchStartMs, fetchEndMs],
  );

  const title = view === "month" ? formatMonthTitle(anchor) : formatWeekTitle(anchor, columns);

  const switchView = (mode: CalendarViewMode) => {
    if (mode === view) return;
    const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || typeof document.startViewTransition !== "function") {
      setView(mode);
      return;
    }
    document.startViewTransition(() => {
      flushSync(() => setView(mode));
    });
  };

  const step = (direction: 1 | -1) => {
    setAnchor((current) => {
      if (view === "month") return addMonthsClamped(current, direction);
      if (view === "1day" || view === "3days") return addDays(current, direction);
      return addDays(current, direction * 7);
    });
  };

  const toolbar = (
    <>
      <Text as="span" size="base" tone="default" className="font-medium">
        {title}
      </Text>
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-lg bg-background-hover p-0.5">
          {views.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => switchView(mode)}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === view
                  ? "bg-background-elevated text-foreground shadow-xs"
                  : "text-foreground-muted hover:text-foreground",
              )}
            >
              {VIEW_LABELS[mode]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-foreground-muted hover:bg-background-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setAnchor(new Date())}
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Previous"
            className={navButton}
            onClick={() => step(-1)}
          >
            <ChevronLeft size={16} />
          </button>
          <button type="button" aria-label="Next" className={navButton} onClick={() => step(1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </>
  );

  return view === "month" ? (
    <MonthGrid
      anchor={anchor}
      eventsByDay={eventsByDay}
      onAnchorChange={setAnchor}
      toolbar={toolbar}
    />
  ) : (
    <WeekGrid
      key={columns}
      days={columns}
      anchor={anchor}
      eventsByDay={eventsByDay}
      onCenterDayChange={setAnchor}
      toolbar={toolbar}
    />
  );
}

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { CalendarReauthStrip } from "./reauth/calendar-reauth-notice";

interface CalendarFrameProps {
  toolbar: ReactNode;
  columnHeader: ReactNode;
  gridMaxHeight?: CSSProperties["maxHeight"];
  /** Edge to edge with no border, corners or shadow, for a phone where every pixel counts. */
  bare?: boolean;
  children: ReactNode;
}

export function CalendarFrame({
  toolbar,
  columnHeader,
  gridMaxHeight,
  bare = false,
  children,
}: CalendarFrameProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden",
        !bare && "rounded-2xl border border-border-elevated shadow-xs",
      )}
    >
      <header className="shrink-0 [view-transition-name:calendar-header]">
        {/* View transitions lift named elements into a flat overlay where the frame no longer clips them, so the filled ones round their own corners to the frame's radius less its border. */}
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-background-elevated [view-transition-name:calendar-toolbar]",
            bare && "px-2 py-2",
            !bare && "rounded-t-[calc(var(--radius-2xl)-1px)] px-4 py-3",
          )}
        >
          {toolbar}
        </div>
        <CalendarReauthStrip />
        <div className="relative [view-transition-name:calendar-column-header]">
          {/* Scoped to the column header rather than the whole header, so the fill starts dissolving right below the toolbar in both views. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-background-elevated mask-b-from-0%"
          />
          <div className="relative">{columnHeader}</div>
        </div>
      </header>
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden [view-transition-name:calendar-grid]",
          !bare && "rounded-b-[calc(var(--radius-2xl)-1px)]",
        )}
        style={{ maxHeight: gridMaxHeight }}
      >
        {children}
      </div>
    </div>
  );
}

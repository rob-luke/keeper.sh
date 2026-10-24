import { createFileRoute, Navigate } from "@tanstack/react-router";
import { CalendarView } from "@/features/dashboard/components/calendar-view";
import type { CalendarViewMode } from "@/features/dashboard/components/calendar-view";
import { useMediaQuery } from "@/hooks/use-media-query";

export const Route = createFileRoute("/(dashboard)/dashboard/calendar/")({
  component: CalendarPage,
});

const DESKTOP_QUERY = "(min-width: 64rem)";
const PHONE_VIEWS: CalendarViewMode[] = ["1day", "3days", "month"];

function CalendarPage() {
  const desktop = useMediaQuery(DESKTOP_QUERY);

  // From lg up the calendar already sits beside the menu.
  if (desktop) return <Navigate to="/dashboard" replace />;

  return (
    <div className="h-dvh pt-[env(safe-area-inset-top)]">
      <CalendarView views={PHONE_VIEWS} initialView="3days" compact />
    </div>
  );
}

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { BackButton } from "@/components/ui/primitives/back-button";
import { DashboardHeading1 } from "@/components/ui/primitives/dashboard-heading";
import { StickyPageHeader } from "@/components/ui/primitives/sticky-page-header";
import { Text } from "@/components/ui/primitives/text";
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
    <div className="flex flex-col gap-3">
      <StickyPageHeader className="gap-3">
        <BackButton />
        <div className="flex flex-col">
          <DashboardHeading1>Calendar</DashboardHeading1>
          <Text size="sm">Your events across all of your calendars.</Text>
        </div>
      </StickyPageHeader>
      <div className="h-[calc(100dvh-14rem)] min-h-96">
        <CalendarView views={PHONE_VIEWS} initialView="3days" compact />
      </div>
    </div>
  );
}

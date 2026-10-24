import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { AnimatePresence, LazyMotion } from "motion/react";
import { loadMotionFeatures } from "@/lib/motion-features";
import * as m from "motion/react-m";
import { popoverOverlayAtom } from "@/state/popover-overlay";
import { SyncProvider } from "@/providers/sync-provider";
import { resolveDashboardRedirect } from "@/lib/route-access-guards";
import { CalendarView } from "@/features/dashboard/components/calendar-view";
import { cn } from "@/utils/cn";
import { useMediaQuery } from "@/hooks/use-media-query";
import { SidebarPageTransition } from "@/features/dashboard/components/sidebar-page-transition";

const PHONE_CALENDAR_PATH = "/dashboard/calendar";
const DESKTOP_QUERY = "(min-width: 64rem)";

export const Route = createFileRoute("/(dashboard)")({
  beforeLoad: ({ context }) => {
    const redirectTarget = resolveDashboardRedirect(context.auth.hasSession());
    if (redirectTarget) {
      throw redirect({ to: redirectTarget });
    }
  },
  component: DashboardLayout,
  head: () => ({
    meta: [{ content: "noindex, nofollow", name: "robots" }],
    links: [
      {
        rel: "preload",
        href: "/assets/fonts/GeistMono-variable.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
});

function DashboardLayout() {
  const overlayActive = useAtomValue(popoverOverlayAtom);
  // Only one calendar may be mounted: the phone has its own page, and two would share one event popover.
  const desktop = useMediaQuery(DESKTOP_QUERY);
  // The phone calendar runs edge to edge, so the menu column drops its width cap and padding.
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const fullBleed = pathname.startsWith(PHONE_CALENDAR_PATH);

  return (
    <div className="relative flex min-h-dvh justify-center lg:justify-start lg:gap-4 lg:p-4">
      <div
        className={cn(
          "relative flex w-full max-w-sm shrink-0 flex-col gap-3 px-4 pb-(--sidebar-pad-b) pt-4 [--sidebar-pad-b:3rem] [--sidebar-pad-t:1.5rem] [--sidebar-pad-x:0.25rem] xs:pt-[min(6rem,25vh)] lg:h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:px-(--sidebar-pad-x) lg:pt-(--sidebar-pad-t)",
          fullBleed && "max-w-none gap-0 px-0 pt-0 pb-0 xs:pt-0",
        )}
      >
        <LazyMotion features={loadMotionFeatures}>
          <AnimatePresence>
            {overlayActive && (
              <m.div
                className="fixed inset-0 z-10 backdrop-blur-[2px] bg-black/5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            )}
          </AnimatePresence>
        </LazyMotion>
        <SyncProvider />
        <SidebarPageTransition>
          <Outlet />
        </SidebarPageTransition>
      </div>
      {/* `isolate` keeps the calendar's sticky z-indices under the popover blur overlay (z-10). */}
      <div className="hidden lg:flex lg:h-[calc(100dvh-2rem)] lg:min-w-0 lg:flex-1 lg:isolate">
        {desktop && <CalendarView />}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useAtomValue, useStore } from "jotai";
import { useSWRConfig } from "swr";
import {
  SYNC_HOURS_ALL_ON,
  SYNC_HOURS_ALL_OFF,
  createSyncHoursFromRanges,
  formatSyncHoursSummary,
  normalizeSyncHours,
  setSyncHours,
  syncHourIndex,
} from "@keeper.sh/data-schemas";
import { Button, ButtonText } from "@/components/ui/primitives/button";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalTitle,
} from "@/components/ui/primitives/modal";
import {
  NavigationMenuButtonItem,
  NavigationMenuItemLabel,
  NavigationMenuItemTrailing,
} from "@/components/ui/composites/navigation-menu/navigation-menu-items";
import { Text } from "@/components/ui/primitives/text";
import { TextLink } from "@/components/ui/primitives/text-link";
import { usePreferences } from "@/hooks/use-preferences";
import { apiFetch } from "@/lib/fetcher";
import { calendarDetailAtom, syncHoursAtom } from "@/state/calendar-detail";
import { resolveErrorMessage } from "@/utils/errors";
import { SyncHoursGrid } from "./sync-hours-grid";

const WEEKDAYS = [0, 1, 2, 3, 4];
const WORK_DAY_START = 9;
const WORK_DAY_END = 17;
const HOURS_PER_DAY = 24;
const DAY_OFFSETS = [0, 1, 2, 3, 4, 5, 6];

const copyMondayTo = (value: string, days: number[]): string => {
  let result = value;
  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    const enabled = value.charAt(syncHourIndex(0, hour)) === "1";
    const indexes = days.map((day) => syncHourIndex(day, hour));
    result = setSyncHours(result, indexes, enabled);
  }
  return result;
};

interface SyncHoursItemProps {
  calendarId: string;
  locked: boolean;
}

export function SyncHoursItem({ calendarId, locked }: SyncHoursItemProps) {
  const store = useStore();
  const { mutate } = useSWRConfig();
  const { data: preferences } = usePreferences();
  const saved = useAtomValue(syncHoursAtom);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(SYNC_HOURS_ALL_ON);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const homeTimeZone = preferences?.homeTimeZone ?? null;

  const openEditor = () => {
    setDraft(saved ?? SYNC_HOURS_ALL_ON);
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    const syncHours = normalizeSyncHours(draft);
    setIsSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/sources/${calendarId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncHours }),
      });
      store.set(calendarDetailAtom, (previous) => {
        if (!previous) {
          return previous;
        }
        return { ...previous, syncHours };
      });
      await mutate("/api/sources");
      setOpen(false);
    } catch (err) {
      setError(resolveErrorMessage(err, "Failed to save the sync hours."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <NavigationMenuButtonItem onClick={openEditor} disabled={locked}>
        <NavigationMenuItemLabel>Sync Hours</NavigationMenuItemLabel>
        <NavigationMenuItemTrailing>
          <Text size="sm" tone="muted" className="truncate">
            {formatSyncHoursSummary(saved)}
          </Text>
        </NavigationMenuItemTrailing>
      </NavigationMenuButtonItem>
      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent>
          <ModalTitle>Sync Hours</ModalTitle>
          <ModalDescription>
            Only events that overlap the highlighted hours are copied. Click or drag to turn hours on and off; click a day or an hour to toggle the whole row.
          </ModalDescription>
          <div className="flex flex-wrap gap-2">
            <Button variant="elevated" onClick={() => setDraft(SYNC_HOURS_ALL_ON)}>
              <ButtonText>Always</ButtonText>
            </Button>
            <Button
              variant="elevated"
              onClick={() => setDraft(createSyncHoursFromRanges(WEEKDAYS, WORK_DAY_START, WORK_DAY_END))}
            >
              <ButtonText>Weekdays 9–5</ButtonText>
            </Button>
            <Button variant="elevated" onClick={() => setDraft(SYNC_HOURS_ALL_OFF)}>
              <ButtonText>Clear</ButtonText>
            </Button>
            <Button variant="elevated" onClick={() => setDraft((previous) => copyMondayTo(previous, WEEKDAYS))}>
              <ButtonText>Copy Monday to weekdays</ButtonText>
            </Button>
            <Button variant="elevated" onClick={() => setDraft((previous) => copyMondayTo(previous, DAY_OFFSETS))}>
              <ButtonText>Copy Monday to every day</ButtonText>
            </Button>
          </div>
          <SyncHoursGrid value={draft} onChange={setDraft} />
          <Text size="xs" tone="muted">
            Hours are read in your home time zone ({homeTimeZone ?? "UTC, because none is set"}).{" "}
            <TextLink to="/dashboard/settings" size="xs">Change it in Settings</TextLink>.
          </Text>
          {error && <Text size="sm" tone="danger">{error}</Text>}
          <ModalFooter>
            <Button variant="elevated" className="w-full justify-center" onClick={save} disabled={isSaving}>
              <ButtonText>Save</ButtonText>
            </Button>
            <Button variant="elevated" className="w-full justify-center" onClick={() => setOpen(false)}>
              <ButtonText>Cancel</ButtonText>
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

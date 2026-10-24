import { useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import { Button, ButtonText } from "@/components/ui/primitives/button";
import { Input } from "@/components/ui/primitives/input";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalTitle,
} from "@/components/ui/primitives/modal";
import {
  NavigationMenu,
  NavigationMenuButtonItem,
  NavigationMenuItemLabel,
  NavigationMenuItemTrailing,
} from "@/components/ui/composites/navigation-menu/navigation-menu-items";
import { Text } from "@/components/ui/primitives/text";
import { PREFERENCES_KEY, updateHomeTimeZone, usePreferences } from "@/hooks/use-preferences";
import { filterTimeZones, listTimeZones, resolveBrowserTimeZone } from "@/lib/time-zones";
import { resolveErrorMessage } from "@/utils/errors";

const MAX_RESULTS = 40;

export function HomeTimeZoneItem() {
  const { data: preferences } = usePreferences();
  const { mutate: globalMutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const zones = useMemo(() => listTimeZones(), []);
  const browserTimeZone = useMemo(() => resolveBrowserTimeZone(), []);
  const homeTimeZone = preferences?.homeTimeZone ?? null;
  const matches = filterTimeZones(zones, query, MAX_RESULTS);

  const openPicker = () => {
    setQuery("");
    setError(null);
    setOpen(true);
  };

  const save = async (next: string | null) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateHomeTimeZone(next);
      await globalMutate(PREFERENCES_KEY, updated, { revalidate: false });
      setOpen(false);
    } catch (err) {
      setError(resolveErrorMessage(err, "Failed to save the time zone."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <NavigationMenuButtonItem onClick={openPicker}>
        <NavigationMenuItemLabel>Home Timezone</NavigationMenuItemLabel>
        <NavigationMenuItemTrailing>
          <Text size="sm" tone="muted" className="truncate">
            {homeTimeZone ?? "Not set"}
          </Text>
        </NavigationMenuItemTrailing>
      </NavigationMenuButtonItem>
      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent>
          <ModalTitle>Home Timezone</ModalTitle>
          <ModalDescription>
            Settings that use hours of the day, such as a calendar&apos;s sync hours, are read in this time zone wherever you are.
          </ModalDescription>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search, for example Melbourne"
          />
          <div className="max-h-64 overflow-y-auto">
            <NavigationMenu>
              {matches.map((zone) => (
                <NavigationMenuButtonItem
                  key={zone}
                  onClick={() => save(zone)}
                  disabled={isSaving}
                >
                  <NavigationMenuItemLabel>{zone}</NavigationMenuItemLabel>
                  <NavigationMenuItemTrailing>
                    {zone === homeTimeZone && <Text size="sm" tone="muted">Current</Text>}
                  </NavigationMenuItemTrailing>
                </NavigationMenuButtonItem>
              ))}
            </NavigationMenu>
            {matches.length === 0 && <Text size="sm" tone="muted">No matching time zones.</Text>}
          </div>
          {error && <Text size="sm" tone="danger">{error}</Text>}
          <ModalFooter>
            {browserTimeZone && browserTimeZone !== homeTimeZone && (
              <Button
                variant="elevated"
                className="w-full justify-center"
                onClick={() => save(browserTimeZone)}
                disabled={isSaving}
              >
                <ButtonText>{`Use this device's time zone (${browserTimeZone})`}</ButtonText>
              </Button>
            )}
            <Button variant="elevated" className="w-full justify-center" onClick={() => setOpen(false)}>
              <ButtonText>Cancel</ButtonText>
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

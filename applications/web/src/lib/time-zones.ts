const FALLBACK_TIME_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

interface IntlWithSupportedValues {
  supportedValuesOf?: (key: "timeZone") => string[];
}

const listTimeZones = (): string[] => {
  const { supportedValuesOf } = Intl as unknown as IntlWithSupportedValues;
  if (typeof supportedValuesOf !== "function") {
    return FALLBACK_TIME_ZONES;
  }

  const zones = supportedValuesOf.call(Intl, "timeZone");
  if (zones.includes("UTC")) {
    return zones;
  }
  return ["UTC", ...zones];
};

const filterTimeZones = (zones: readonly string[], query: string, limit: number): string[] => {
  const needle = query.trim().toLowerCase().split(/\s+/).join("_");
  if (needle.length === 0) {
    return zones.slice(0, limit);
  }

  return zones.filter((zone) => zone.toLowerCase().includes(needle)).slice(0, limit);
};

const resolveBrowserTimeZone = (): string | null => {
  try {
    const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
    if (timeZone.length === 0) {
      return null;
    }
    return timeZone;
  } catch {
    return null;
  }
};

export { filterTimeZones, listTimeZones, resolveBrowserTimeZone };

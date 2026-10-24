import { describe, expect, it } from "vitest";
import {
  filterTimeZones,
  listTimeZones,
  resolveBrowserTimeZone,
} from "../../src/lib/time-zones";

const ZONES = ["UTC", "Australia/Melbourne", "Australia/Sydney", "America/Los_Angeles", "Europe/London"];

describe("filterTimeZones", () => {
  it("returns the first zones when there is no query", () => {
    expect(filterTimeZones(ZONES, "", 3)).toEqual(["UTC", "Australia/Melbourne", "Australia/Sydney"]);
  });

  it("matches any part of the name, ignoring case", () => {
    expect(filterTimeZones(ZONES, "melb", 10)).toEqual(["Australia/Melbourne"]);
    expect(filterTimeZones(ZONES, "AUSTRALIA", 10)).toEqual(["Australia/Melbourne", "Australia/Sydney"]);
  });

  it("treats spaces as the underscores zone names use", () => {
    expect(filterTimeZones(ZONES, "los angeles", 10)).toEqual(["America/Los_Angeles"]);
  });

  it("caps the number of results", () => {
    expect(filterTimeZones(ZONES, "a", 2)).toHaveLength(2);
  });

  it("returns nothing when no zone matches", () => {
    expect(filterTimeZones(ZONES, "atlantis", 10)).toEqual([]);
  });
});

describe("listTimeZones", () => {
  it("always offers UTC and a spread of zones", () => {
    const zones = listTimeZones();

    expect(zones).toContain("UTC");
    expect(zones.length).toBeGreaterThan(10);
  });
});

describe("resolveBrowserTimeZone", () => {
  it("returns a name or null, never throws", () => {
    const zone = resolveBrowserTimeZone();

    expect(zone === null || zone.length > 0).toBe(true);
  });
});

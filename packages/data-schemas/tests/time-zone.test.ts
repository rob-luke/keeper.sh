import { describe, expect, it } from "vitest";
import { isValidTimeZone, normalizeTimeZone } from "../src/index";

describe("normalizeTimeZone", () => {
  it("returns the canonical name of a valid IANA time zone", () => {
    expect(normalizeTimeZone("Australia/Melbourne")).toBe("Australia/Melbourne");
    expect(normalizeTimeZone("America/Los_Angeles")).toBe("America/Los_Angeles");
  });

  it("fixes the casing and trims whitespace", () => {
    expect(normalizeTimeZone("  australia/melbourne ")).toBe("Australia/Melbourne");
  });

  it("accepts UTC", () => {
    expect(normalizeTimeZone("UTC")).toBe("UTC");
  });

  it("rejects names that are not time zones", () => {
    expect(normalizeTimeZone("Mars/Olympus_Mons")).toBeNull();
    expect(normalizeTimeZone("not a zone")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(normalizeTimeZone("")).toBeNull();
    expect(normalizeTimeZone("   ")).toBeNull();
  });
});

describe("isValidTimeZone", () => {
  it("is true for a real zone and false otherwise", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Europe/Atlantis")).toBe(false);
  });
});

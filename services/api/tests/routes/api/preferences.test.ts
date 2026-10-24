import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  handleGetPreferences as handleGetPreferencesFn,
  handlePatchPreferences as handlePatchPreferencesFn,
} from "../../../src/routes/api/preferences";

let handleGetPreferences: typeof handleGetPreferencesFn = () =>
  Promise.reject(new Error("Module not loaded"));
let handlePatchPreferences: typeof handlePatchPreferencesFn = () =>
  Promise.reject(new Error("Module not loaded"));

const makeDependencies = (homeTimeZone: string | null = null) => {
  const writes: (string | null)[] = [];
  return {
    dependencies: {
      readHomeTimeZone: () => Promise.resolve(homeTimeZone),
      writeHomeTimeZone: (_userId: string, value: string | null) => {
        writes.push(value);
        return Promise.resolve();
      },
    },
    writes,
  };
};

const readJson = (response: Response): Promise<Record<string, unknown>> =>
  response.json() as Promise<Record<string, unknown>>;

vi.mock("../../../src/utils/middleware", () => ({
  withAuth: (handler: unknown) => handler,
  withWideEvent: (handler: unknown) => handler,
}));
vi.mock("../../../src/context", () => ({
  database: {},
}));

beforeAll(async () => {
  ({ handleGetPreferences, handlePatchPreferences } = await import(
    "../../../src/routes/api/preferences"
  ));
});

describe("handleGetPreferences", () => {
  it("reports no home time zone until one is chosen", async () => {
    const { dependencies } = makeDependencies();

    const response = await handleGetPreferences({ userId: "user-1" }, dependencies);

    expect(await readJson(response)).toEqual({ homeTimeZone: null });
  });

  it("reports the stored home time zone", async () => {
    const { dependencies } = makeDependencies("Australia/Melbourne");

    const response = await handleGetPreferences({ userId: "user-1" }, dependencies);

    expect(await readJson(response)).toEqual({ homeTimeZone: "Australia/Melbourne" });
  });
});

describe("handlePatchPreferences", () => {
  it("stores a valid time zone under its canonical name", async () => {
    const { dependencies, writes } = makeDependencies();

    const response = await handlePatchPreferences(
      { userId: "user-1" },
      { homeTimeZone: " australia/melbourne " },
      dependencies,
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ homeTimeZone: "Australia/Melbourne" });
    expect(writes).toEqual(["Australia/Melbourne"]);
  });

  it("clears the home time zone when given null", async () => {
    const { dependencies, writes } = makeDependencies("Australia/Melbourne");

    const response = await handlePatchPreferences(
      { userId: "user-1" },
      { homeTimeZone: null },
      dependencies,
    );

    expect(await readJson(response)).toEqual({ homeTimeZone: null });
    expect(writes).toEqual([null]);
  });

  it("rejects a name that is not a time zone and writes nothing", async () => {
    const { dependencies, writes } = makeDependencies();

    const response = await handlePatchPreferences(
      { userId: "user-1" },
      { homeTimeZone: "Mars/Olympus_Mons" },
      dependencies,
    );

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("rejects unknown fields and bodies that are not objects", async () => {
    const { dependencies, writes } = makeDependencies();

    const unknownField = await handlePatchPreferences(
      { userId: "user-1" },
      { homeTimeZone: "UTC", extra: true },
      dependencies,
    );
    const notAnObject = await handlePatchPreferences({ userId: "user-1" }, null, dependencies);

    expect(unknownField.status).toBe(400);
    expect(notAnObject.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("leaves the stored value alone when the body has no home time zone", async () => {
    const { dependencies, writes } = makeDependencies("Europe/Berlin");

    const response = await handlePatchPreferences({ userId: "user-1" }, {}, dependencies);

    expect(await readJson(response)).toEqual({ homeTimeZone: "Europe/Berlin" });
    expect(writes).toEqual([]);
  });
});

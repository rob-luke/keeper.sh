import { normalizeTimeZone } from "@keeper.sh/data-schemas";
import { userPreferencesTable } from "@keeper.sh/database/schema";
import { eq } from "drizzle-orm";
import { database } from "@/context";
import { withAuth, withWideEvent } from "@/utils/middleware";
import { preferencesPatchBodySchema } from "@/utils/request-body";
import type { PreferencesPatchBody } from "@/utils/request-body";
import { ErrorResponse } from "@/utils/responses";

const FIRST_RESULT_LIMIT = 1;

interface PreferencesRouteContext {
  userId: string;
}

interface PreferencesDependencies {
  readHomeTimeZone: (userId: string) => Promise<string | null>;
  writeHomeTimeZone: (userId: string, homeTimeZone: string | null) => Promise<void>;
}

const parsePatchBody = (body: unknown): PreferencesPatchBody | null => {
  try {
    return preferencesPatchBodySchema.assert(body);
  } catch {
    return null;
  }
};

const handleGetPreferences = async (
  context: PreferencesRouteContext,
  dependencies: PreferencesDependencies,
): Promise<Response> => {
  const homeTimeZone = await dependencies.readHomeTimeZone(context.userId);
  return Response.json({ homeTimeZone });
};

const handlePatchPreferences = async (
  context: PreferencesRouteContext,
  body: unknown,
  dependencies: PreferencesDependencies,
): Promise<Response> => {
  const patch = parsePatchBody(body);
  if (!patch) {
    return ErrorResponse.badRequest("Invalid request body.").toResponse();
  }

  const requested = patch.homeTimeZone;
  if (requested === null) {
    await dependencies.writeHomeTimeZone(context.userId, null);
    return Response.json({ homeTimeZone: null });
  }

  if (typeof requested !== "string") {
    return handleGetPreferences(context, dependencies);
  }

  const homeTimeZone = normalizeTimeZone(requested);
  if (homeTimeZone === null) {
    return ErrorResponse.badRequest("Unknown time zone.").toResponse();
  }

  await dependencies.writeHomeTimeZone(context.userId, homeTimeZone);
  return Response.json({ homeTimeZone });
};

const databaseDependencies: PreferencesDependencies = {
  readHomeTimeZone: async (userId) => {
    const [preferences] = await database
      .select({ homeTimeZone: userPreferencesTable.homeTimeZone })
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, userId))
      .limit(FIRST_RESULT_LIMIT);

    return preferences?.homeTimeZone ?? null;
  },
  writeHomeTimeZone: async (userId, homeTimeZone) => {
    await database
      .insert(userPreferencesTable)
      .values({ homeTimeZone, userId })
      .onConflictDoUpdate({ set: { homeTimeZone }, target: userPreferencesTable.userId });
  },
};

const GET = withWideEvent(
  withAuth(({ userId }) => handleGetPreferences({ userId }, databaseDependencies)),
);

const PATCH = withWideEvent(
  withAuth(async ({ request, userId }) => {
    const body: unknown = await request.json().catch(() => null);
    return handlePatchPreferences({ userId }, body, databaseDependencies);
  }),
);

export { GET, PATCH, handleGetPreferences, handlePatchPreferences };
export type { PreferencesDependencies, PreferencesRouteContext };

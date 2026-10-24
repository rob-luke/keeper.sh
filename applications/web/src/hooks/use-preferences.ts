import useSWR from "swr";
import { fetcher, apiFetch } from "@/lib/fetcher";

export interface Preferences {
  homeTimeZone: string | null;
}

export const PREFERENCES_KEY = "/api/preferences";

export const usePreferences = () => {
  return useSWR<Preferences>(PREFERENCES_KEY, fetcher);
};

export const updateHomeTimeZone = async (homeTimeZone: string | null): Promise<Preferences> => {
  const response = await apiFetch(PREFERENCES_KEY, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ homeTimeZone }),
  });
  return response.json();
};

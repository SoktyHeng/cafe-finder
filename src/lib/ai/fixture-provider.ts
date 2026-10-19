import type { IntentProvider } from "./provider";
import { intentSchema, type SearchIntent } from "./schemas";

export const EMPTY_INTENT: SearchIntent = {
  action: "search", locationMode: "unchanged", areaId: null, purpose: null,
  radiusMeters: null, minRating: null, clearMinRating: false, openNowOnly: null,
  budget: null, preferQuiet: null, preferWifi: null, unsupportedFilters: false,
};

/** Scripted demo cases only, never presented as OpenAI or used with live Places. */
export const FIXTURE_INTENTS: Record<string, Partial<SearchIntent>> = {
  "Find a quiet cafe with Wi-Fi under $5 near me.": { locationMode: "current", preferQuiet: true, preferWifi: true, budget: "under_5" },
  "Find a quiet cafe with Wi-Fi under $5 in BKK1.": { locationMode: "area", areaId: "bkk1", preferQuiet: true, preferWifi: true, budget: "under_5" },
  "Show cafes in BKK1.": { locationMode: "area", areaId: "bkk1" },
  "Only open now, within 2 km.": { openNowOnly: true, radiusMeters: 2000 },
  "Actually, make it 5 km and forget the Wi-Fi preference.": { radiusMeters: 5000, preferWifi: false },
  "Use any budget and remove the minimum rating.": { budget: "any", clearMinRating: true },
  "Find a cafe in Paris.": { locationMode: "unsupported" },
  "Explain these matches.": {},
};

export class FixtureIntentProvider implements IntentProvider {
  readonly source = "fixture" as const;
  async parse({ message }: { message: string }) {
    return intentSchema.parse({ ...EMPTY_INTENT, ...(FIXTURE_INTENTS[message] ?? { action: "clarify" }) });
  }
}

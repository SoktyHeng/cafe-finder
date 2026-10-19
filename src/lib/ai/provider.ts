import type { Preferences } from "@/lib/user-data/schemas";
import type { SearchIntent } from "./schemas";

export type IntentInput = { message: string; history: string[]; preferences: Preferences };
export interface IntentProvider {
  readonly source: "openai" | "nvidia" | "fixture";
  parse(input: IntentInput): Promise<SearchIntent>;
}
export class AIUnavailableError extends Error {
  constructor(readonly reason: "timeout" | "quota" | "auth" | "invalid_response" | "refused" | "network" | "budget") {
    super("AI search is temporarily unavailable.");
    this.name = "AIUnavailableError";
  }
}

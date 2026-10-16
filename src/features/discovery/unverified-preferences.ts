import type { DiscoveryRequest } from "@/lib/discovery/request-schema";

import { budgetLabel, purposeOption } from "./options";

/**
 * Preferences that no current data source can confirm for a cafe. They are
 * shown as "not verified" and never filter or reorder results.
 */
export function unverifiedPreferences(request: DiscoveryRequest): string[] {
  const items = [purposeOption(request.purpose).atmosphere];
  if (request.budget !== undefined && request.budget !== "any") {
    items.push(`Budget ${budgetLabel(request.budget)}`);
  }
  if (request.preferWifi) items.push("Wi-Fi");
  if (request.preferQuiet) items.push("Quiet");
  return items;
}

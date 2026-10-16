import type { Budget, Purpose } from "@/lib/discovery/request-schema";

export const PURPOSE_OPTIONS: readonly {
  value: Purpose;
  label: string;
  atmosphere: string;
}[] = [
  { value: "work", label: "Work / Study", atmosphere: "Good for work or study" },
  { value: "relax", label: "Relax / Read", atmosphere: "Relaxed atmosphere" },
  { value: "friends", label: "Friends", atmosphere: "Good for groups" },
  { value: "date", label: "Date", atmosphere: "Good for a date" },
];

export const BUDGET_OPTIONS: readonly { value: Budget; label: string }[] = [
  { value: "any", label: "Any budget" },
  { value: "under_5", label: "Under $5" },
  { value: "5_to_10", label: "$5–$10" },
  { value: "over_10", label: "Over $10" },
];

/** `undefined` = no minimum. */
export const MIN_RATING_OPTIONS: readonly {
  value: number | undefined;
  label: string;
}[] = [
  { value: undefined, label: "Any rating" },
  { value: 3.5, label: "3.5 and up" },
  { value: 4, label: "4.0 and up" },
  { value: 4.5, label: "4.5 and up" },
];

export function purposeOption(purpose: Purpose) {
  const option = PURPOSE_OPTIONS.find((candidate) => candidate.value === purpose);
  if (!option) {
    throw new Error(`Unknown purpose: ${purpose}`);
  }
  return option;
}

export function budgetLabel(budget: Budget): string {
  return BUDGET_OPTIONS.find((option) => option.value === budget)?.label ?? budget;
}

import type { CafePlace, DataSource, PriceLevel } from "@/lib/places/schemas";

const SOURCE_NAME: Record<DataSource, string> = {
  google: "Google",
  fixture: "demo data",
};

export function sourceName(source: DataSource): string {
  return SOURCE_NAME[source];
}

/** "850 m" below 1 km, otherwise one decimal in km. */
export function formatDistance(meters: number): string {
  const roundedMeters = Math.round(meters / 10) * 10;
  if (roundedMeters < 1_000) {
    return `${roundedMeters} m`;
  }
  return `${(meters / 1_000).toFixed(1)} km`;
}

export function formatRadius(meters: number): string {
  return `${meters / 1_000} km`;
}

export function ratingText(cafe: Pick<CafePlace, "rating" | "ratingCount" | "dataSource">): string {
  if (cafe.rating === undefined) {
    return "No rating yet";
  }
  const source = cafe.dataSource === "google" ? "Google rating" : "Demo rating";
  const count =
    cafe.ratingCount === undefined
      ? ""
      : ` from ${cafe.ratingCount.toLocaleString("en-US")} ${cafe.ratingCount === 1 ? "review" : "reviews"}`;
  return `${cafe.rating.toFixed(1)} ${source}${count}`;
}

export type OpenStatus = { label: string; tone: "open" | "closed" | "unknown" };

export function openStatus(cafe: Pick<CafePlace, "openNow" | "dataSource">): OpenStatus {
  const source = sourceName(cafe.dataSource);
  if (cafe.openNow === true) {
    return { label: `Open now (according to ${source})`, tone: "open" };
  }
  if (cafe.openNow === false) {
    return { label: `Closed now (according to ${source})`, tone: "closed" };
  }
  return { label: "Opening hours unknown", tone: "unknown" };
}

const PRICE_LEVEL_LABEL: Record<PriceLevel, string> = {
  free: "Free",
  inexpensive: "Inexpensive",
  moderate: "Moderate",
  expensive: "Expensive",
  very_expensive: "Very expensive",
};

export function priceLevelText(priceLevel: PriceLevel): string {
  return `Price level: ${PRICE_LEVEL_LABEL[priceLevel]}`;
}

import { AMENITY_KEYS, type Amenities, type AmenityKey } from "@/lib/places/schemas";

export const AMENITY_LABELS: Record<AmenityKey, string> = {
  dineIn: "Dine-in",
  takeout: "Takeaway",
  delivery: "Delivery",
  outdoorSeating: "Outdoor seating",
  goodForGroups: "Good for groups",
  goodForChildren: "Good for children",
  reservable: "Takes reservations",
  restroom: "Restroom",
  servesBreakfast: "Serves breakfast",
  servesCoffee: "Serves coffee",
  servesDessert: "Serves dessert",
  servesVegetarianFood: "Vegetarian options",
  allowsDogs: "Dogs allowed",
  liveMusic: "Live music",
  wheelchairAccessibleEntrance: "Wheelchair-accessible entrance",
  wheelchairAccessibleSeating: "Wheelchair-accessible seating",
  acceptsCreditCards: "Accepts credit cards",
  acceptsNfc: "Accepts contactless payment",
  acceptsCashOnly: "Cash only",
};

export type AmenityGroups = { yes: AmenityKey[]; no: AmenityKey[]; unknown: AmenityKey[] };

/** Splits Google's answers into Yes / No / not listed, in a stable order. */
export function groupAmenities(amenities: Amenities): AmenityGroups {
  const groups: AmenityGroups = { yes: [], no: [], unknown: [] };
  for (const key of AMENITY_KEYS) {
    const value = amenities[key];
    if (value === true) groups.yes.push(key);
    else if (value === false) groups.no.push(key);
    else groups.unknown.push(key);
  }
  return groups;
}

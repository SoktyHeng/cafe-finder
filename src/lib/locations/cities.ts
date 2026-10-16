import type { Coordinates } from "@/lib/geo/distance";

/**
 * Manually selectable search areas. Coordinates are approximate area centres
 * used only as a search origin. They are not cafe data and not the user's
 * position. New cities are added as new entries in `CITIES`.
 */

export type SearchArea = Coordinates & {
  id: string;
  name: string;
  /** Extra search terms, e.g. landmark or local names. */
  aliases: readonly string[];
};

export type City = {
  id: string;
  name: string;
  country: string;
  defaultAreaId: string;
  areas: readonly SearchArea[];
};

export const PHNOM_PENH: City = {
  id: "phnom-penh",
  name: "Phnom Penh",
  country: "Cambodia",
  defaultAreaId: "independence-monument",
  areas: [
    {
      id: "independence-monument",
      name: "City centre (Independence Monument)",
      aliases: ["centre", "center", "vimean ekareach"],
      latitude: 11.5564,
      longitude: 104.9282,
    },
    {
      id: "bkk1",
      name: "Boeung Keng Kang 1 (BKK1)",
      aliases: ["bkk", "boeung keng kang"],
      latitude: 11.553,
      longitude: 104.925,
    },
    {
      id: "riverside",
      name: "Riverside (Sisowath Quay)",
      aliases: ["daun penh", "sisowath", "royal palace"],
      latitude: 11.5715,
      longitude: 104.929,
    },
    {
      id: "central-market",
      name: "Central Market (Phsar Thmei)",
      aliases: ["phsar thmei", "psar thmei", "daun penh"],
      latitude: 11.5697,
      longitude: 104.921,
    },
    {
      id: "wat-phnom",
      name: "Wat Phnom",
      aliases: ["daun penh"],
      latitude: 11.5765,
      longitude: 104.923,
    },
    {
      id: "tuol-tom-poung",
      name: "Tuol Tom Poung (Russian Market)",
      aliases: ["russian market", "ttp", "phsar toul tom poung"],
      latitude: 11.539,
      longitude: 104.918,
    },
    {
      id: "toul-kork",
      name: "Toul Kork",
      aliases: ["tuol kouk", "tk"],
      latitude: 11.58,
      longitude: 104.9,
    },
    {
      id: "olympic-stadium",
      name: "Olympic Stadium (Veal Vong)",
      aliases: ["veal vong", "7 makara"],
      latitude: 11.559,
      longitude: 104.911,
    },
    {
      id: "koh-pich",
      name: "Koh Pich (Diamond Island)",
      aliases: ["diamond island"],
      latitude: 11.547,
      longitude: 104.94,
    },
    {
      id: "chroy-changvar",
      name: "Chroy Changvar",
      aliases: ["chroy changva", "japanese bridge"],
      latitude: 11.59,
      longitude: 104.937,
    },
  ],
};

export const CITIES: readonly City[] = [PHNOM_PENH];

export const DEFAULT_CITY = PHNOM_PENH;

export function findAreaById(areaId: string): SearchArea | undefined {
  for (const city of CITIES) {
    const area = city.areas.find((candidate) => candidate.id === areaId);
    if (area) {
      return area;
    }
  }
  return undefined;
}

const normalize = (text: string) => text.trim().toLocaleLowerCase("en");

/** Case-insensitive match on area name and aliases. Empty query returns all. */
export function searchAreas(city: City, query: string): SearchArea[] {
  const needle = normalize(query);
  if (needle === "") {
    return [...city.areas];
  }
  return city.areas.filter(
    (area) =>
      normalize(area.name).includes(needle) ||
      area.aliases.some((alias) => normalize(alias).includes(needle)),
  );
}

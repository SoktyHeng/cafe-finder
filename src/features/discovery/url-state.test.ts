import { describe, expect, it } from "vitest";

import { findAreaById } from "@/lib/locations/cities";

import {
  DEFAULT_FORM_VALUES,
  areaLocation,
  deviceLocation,
  type ReadyFormValues,
} from "./form-state";
import { formValuesToSearchParams, searchParamsToFormValues } from "./url-state";

const bkk1 = findAreaById("bkk1");
if (!bkk1) throw new Error("bkk1 fixture area missing");

const parse = (query: string) => searchParamsToFormValues(new URLSearchParams(query));

describe("formValuesToSearchParams", () => {
  it("stores manual areas by ID only, omitting defaults", () => {
    const values: ReadyFormValues = { ...DEFAULT_FORM_VALUES, location: areaLocation(bkk1) };
    expect(formValuesToSearchParams(values).toString()).toBe(
      "area=bkk1&purpose=work&radius=3000",
    );
  });

  it("stores device positions rounded to three decimals", () => {
    const values: ReadyFormValues = {
      ...DEFAULT_FORM_VALUES,
      location: deviceLocation({ latitude: 11.5564321, longitude: 104.9281987 }),
    };
    const params = formValuesToSearchParams(values);
    expect(params.get("lat")).toBe("11.556");
    expect(params.get("lng")).toBe("104.928");
  });

  it("round-trips every field", () => {
    const values: ReadyFormValues = {
      location: areaLocation(bkk1),
      purpose: "date",
      radiusMeters: 7000,
      minRating: 4.5,
      openNowOnly: true,
      budget: "5_to_10",
      preferQuiet: true,
      preferWifi: true,
    };
    const parsed = searchParamsToFormValues(formValuesToSearchParams(values));
    expect(parsed).toEqual({ status: "ready", values });
  });
});

describe("searchParamsToFormValues", () => {
  it("is empty with no location", () => {
    expect(parse("")).toEqual({ status: "empty", values: DEFAULT_FORM_VALUES });
    expect(parse("purpose=relax").status).toBe("empty");
  });

  it("restores device coordinates", () => {
    const parsed = parse("lat=11.556&lng=104.928&purpose=work&radius=3000");
    expect(parsed.status).toBe("ready");
    if (parsed.status === "ready") {
      expect(parsed.values.location).toMatchObject({
        kind: "device",
        latitude: 11.556,
        longitude: 104.928,
      });
    }
  });

  it.each([
    ["area=atlantis", ["area"]],
    ["lat=200&lng=104.9", ["lat", "lng"]],
    ["lat=11.5", ["lat", "lng"]],
    ["lat=1e2&lng=104", ["lat", "lng"]],
    ["area=bkk1&radius=500", ["radius"]],
    ["area=bkk1&radius=3000.5", ["radius"]],
    ["area=bkk1&radius=99999", ["radius"]],
    ["area=bkk1&rating=6", ["rating"]],
    ["area=bkk1&rating=abc", ["rating"]],
    ["area=bkk1&purpose=party", ["purpose"]],
    ["area=bkk1&budget=free", ["budget"]],
    ["area=bkk1&open=true", ["open"]],
    ["area=bkk1&wifi=yes&quiet=0", ["quiet", "wifi"]],
  ])("flags invalid params in %s", (query, invalid) => {
    const parsed = parse(query);
    expect(parsed.status).toBe("invalid");
    if (parsed.status === "invalid") {
      expect(parsed.invalidParams.sort()).toEqual([...invalid].sort());
    }
  });

  it("keeps the valid parts of a partly invalid link", () => {
    const parsed = parse("area=bkk1&purpose=relax&radius=nope");
    expect(parsed.status).toBe("invalid");
    expect(parsed.values.location).toMatchObject({ kind: "area", areaId: "bkk1" });
    expect(parsed.values.purpose).toBe("relax");
    expect(parsed.values.radiusMeters).toBe(DEFAULT_FORM_VALUES.radiusMeters);
  });

  it("ignores unrelated params", () => {
    expect(parse("area=bkk1&utm_source=x").status).toBe("ready");
  });
});

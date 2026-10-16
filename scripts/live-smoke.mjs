// Manual live verification against a running server started with
// PLACES_PROVIDER=google and a real key (see docs/deployment.md).
// Billable: 1 Nearby Search + 1 Place Details + at most 1 Place Photo.
// The key is never read here: this script only talks to our own API.
//
//   node scripts/live-smoke.mjs [baseUrl]     (default http://localhost:3000)

const baseUrl = process.argv[2] ?? "http://localhost:3000";
// Sample city-centre coordinate (Independence Monument), not a user position.
const SEARCH = { latitude: 11.5564, longitude: 104.9282, radiusMeters: 2000, purpose: "work" };

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const nearby = await fetch(`${baseUrl}/api/places/nearby`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(SEARCH),
});
const nearbyBody = await nearby.json();
if (!nearby.ok) fail(`nearby ${nearby.status} ${JSON.stringify(nearbyBody)}`);
if (nearbyBody.source !== "google") fail(`expected source "google", got "${nearbyBody.source}" (is PLACES_PROVIDER=google?)`);
console.log(`Nearby: ${nearbyBody.results.length} cafes (source=${nearbyBody.source}, providers=${nearbyBody.attributions.length})`);
for (const { cafe, matchPercent, confidence } of nearbyBody.results.slice(0, 5)) {
  console.log(`  - ${matchPercent ?? "—"}% (${confidence}) ${cafe.name ?? "(no name)"} | rating ${cafe.rating ?? "unknown"} (${cafe.ratingCount ?? "?"}) | open ${cafe.openNow ?? "unknown"} | ${cafe.distanceMeters ?? "?"} m`);
}
// Results are ranked recommendations: { cafe, score, matchPercent, ... } (M3).
const first = nearbyBody.results[0]?.cafe;
if (!first) fail("no cafes returned near the city centre");

const details = await fetch(`${baseUrl}/api/places/${encodeURIComponent(first.placeId)}`);
const detailsBody = await details.json();
if (!details.ok) fail(`details ${details.status} ${JSON.stringify(detailsBody)}`);
const place = detailsBody.place;
console.log(`Details: ${place.name} | hours ${place.weekdayDescriptions ? "yes" : "unknown"} | photos ${place.photos.length} | website ${place.websiteUri ? "yes" : "no"}`);
console.log(`  reviews ${place.reviews.length} (with author: ${place.reviews.filter((r) => r.authorName).length}) | amenities ${JSON.stringify(place.amenities)}`);

const photo = place.photos[0];
if (photo) {
  const media = await fetch(
    `${baseUrl}/api/places/photo?name=${encodeURIComponent(photo.name)}&maxWidthPx=400`,
    { redirect: "manual" },
  );
  const location = media.headers.get("location") ?? "";
  if (media.status !== 302 || !new URL(location).hostname.endsWith(".googleusercontent.com")) {
    fail(`photo ${media.status} ${location}`);
  }
  console.log(`Photo: 302 to ${new URL(location).hostname} (credits: ${photo.authorAttributions.map((a) => a.displayName).join(", ") || "none provided"})`);
}
console.log("Live smoke check passed.");

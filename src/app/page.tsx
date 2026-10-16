import { HomeDiscovery } from "@/features/discovery/components/home-discovery";
import { getServerEnv } from "@/lib/config/server-env";

const PROMISES = [
  "Search by what you're going for: work, relaxing, friends or a date.",
  "Every result shows its rating, distance and opening status, and says what is unknown.",
  "No account needed to search.",
] as const;

export default function HomePage() {
  const { MAX_SEARCH_RADIUS_METERS } = getServerEnv();

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] md:py-16">
      <section aria-labelledby="hero-heading" className="flex flex-col gap-4">
        <h1
          id="hero-heading"
          className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl"
        >
          Find the best cafe for you, right now.
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">
          Tell us where you are and what you need. Cafe Finder shows cafes
          nearby and explains each result honestly, including what we
          can&apos;t verify.
        </p>
        <ul className="flex max-w-xl flex-col gap-2 text-sm text-muted-foreground">
          {PROMISES.map((promise) => (
            <li key={promise} className="flex gap-2">
              <span aria-hidden="true" className="text-primary">
                •
              </span>
              {promise}
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-label="Search for cafes"
        className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
      >
        <HomeDiscovery maxRadiusMeters={MAX_SEARCH_RADIUS_METERS} />
      </section>
    </div>
  );
}

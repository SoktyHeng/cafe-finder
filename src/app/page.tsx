import { HomeDiscovery } from "@/features/discovery/components/home-discovery";
import { getServerEnv } from "@/lib/config/server-env";
import { ArrowDown, ArrowUpRight, Check, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import { CoffeeScene } from "@/components/coffee-scene";

const PROMISES = [
  "Search by what you're going for: work, relaxing, friends or a date.",
  "Every result shows its rating, distance and opening status, and says what is unknown.",
  "No account needed to search.",
] as const;

export default function HomePage() {
  const { MAX_SEARCH_RADIUS_METERS, ENABLE_AI } = getServerEnv();

  return (
    <div className="site-container pb-16">
      <div className="grid items-center gap-2 py-10 sm:py-14 md:grid-cols-[1.1fr_1fr] lg:gap-12 lg:py-16">
      <section aria-labelledby="hero-heading" className="flex flex-col items-start gap-5">
        <p className="eyebrow inline-flex items-center gap-2"><MapPin className="size-3.5" aria-hidden="true" /> Phnom Penh, one coffee at a time</p>
        <h1
          id="hero-heading"
          className="max-w-2xl text-4xl leading-[1.08] font-semibold tracking-[-0.045em] text-balance sm:text-5xl lg:text-6xl"
        >
          Find the best cafe for you, right now.
        </h1>
        <p className="max-w-lg text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
          A focused afternoon. A catch-up with friends. A little time for yourself.
          Find a nearby cafe that fits your kind of day.
        </p>
        <a href="#find-a-cafe" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Find your next spot <ArrowDown className="size-4" aria-hidden="true" /></a>
      </section>
      <div className="mx-auto hidden w-full max-w-lg md:block"><CoffeeScene /></div>
      </div>

      <section id="find-a-cafe" aria-label="Search for cafes" className="search-surface scroll-mt-8 rounded-3xl border bg-card p-5 sm:p-8">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b pb-5">
          <div><p className="eyebrow mb-2">Make yourself at home</p><h2 className="text-2xl font-semibold tracking-tight">Where shall we go?</h2></div>
          <span className="rounded-full bg-secondary px-3 py-2 text-xs font-medium">No account needed</span>
        </div>
        <HomeDiscovery maxRadiusMeters={MAX_SEARCH_RADIUS_METERS} />
      </section>

      <section aria-label="Discover your way" className="grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <div><p className="eyebrow mb-3">A better way to choose</p><h2 className="text-2xl font-semibold tracking-tight">Less searching.<br />More settling in.</h2></div>
        <ul className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
          {PROMISES.map((promise) => (
            <li key={promise} className="flex gap-2">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              {promise}
            </li>
          ))}
        </ul>
        <div className="rounded-2xl bg-secondary p-6 sm:col-span-2 lg:col-span-1">
          {ENABLE_AI ? <><Sparkles aria-hidden="true" className="mb-3 size-5 text-primary" /><h3 className="font-semibold">Just tell us your ideal cafe.</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Try a natural-language search, then fine-tune it as you go.</p><Link href="/assistant" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Meet your cafe assistant <ArrowUpRight aria-hidden="true" className="size-4" /></Link></> : <><MapPin aria-hidden="true" className="mb-3 size-5 text-primary" /><h3 className="font-semibold">Your neighborhood, explored.</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Start with BKK1, Riverside or another area. You choose where to look.</p><Link href="/discover" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Explore Phnom Penh <ArrowUpRight aria-hidden="true" className="size-4" /></Link></>}
        </div>
      </section>
    </div>
  );
}

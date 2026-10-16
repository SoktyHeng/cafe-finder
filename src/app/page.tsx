import { Compass, ListChecks, MapPin } from "lucide-react";

const HOW_IT_WORKS = [
  {
    icon: MapPin,
    title: "Share or choose a location",
    body: "Use your current location with permission, or pick a spot manually. Search never requires an account.",
  },
  {
    icon: Compass,
    title: "Tell us what you need",
    body: "Work, relax, meet friends or a date — plus radius, rating and open-now preferences.",
  },
  {
    icon: ListChecks,
    title: "Get explained recommendations",
    body: "Every match shows why it ranked, and what we could not verify, such as Wi-Fi or quietness.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12 sm:px-6 sm:py-16">
      <section aria-labelledby="hero-heading" className="flex flex-col gap-4">
        <h1
          id="hero-heading"
          className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl"
        >
          Find the best cafe for you, right now.
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
          Cafe Finder ranks nearby cafes by what matters to you and explains
          each match honestly — including what is unknown.
        </p>
        <p
          role="status"
          className="w-fit rounded-md border bg-secondary px-3 py-2 text-sm text-secondary-foreground"
        >
          Cafe search is under construction and not available yet.
        </p>
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-6">
        <h2 id="how-heading" className="text-xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {HOW_IT_WORKS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex flex-col gap-2 rounded-xl border bg-card p-5">
              <Icon aria-hidden="true" className="size-6 text-primary" />
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

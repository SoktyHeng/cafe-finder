import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";

export const metadata: Metadata = { title: "Community guidelines" };

/** Rules, moderation and privacy for member contributions (M6). */
export default function CommunityGuidelinesPage() {
  return (
    <article className="page-shell flex max-w-4xl flex-col gap-6 [&>section]:rounded-2xl [&>section]:border [&>section]:bg-card [&>section]:p-5 sm:[&>section]:p-7">
      <PageHeading eyebrow="Better places, together" title="Community guidelines" description="Help others find their place. Share what you know, respect the people behind it." />
      <p className="text-muted-foreground">
        Members can share what they found at a cafe (Wi-Fi, power outlets, noise, seating, whether
        it suits a laptop) and write short reviews. This content comes from Cafe Finder members,
        not Google, and is always labelled that way.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">What to share</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Only what you noticed yourself, on the date you visited.</li>
          <li>Honest, specific reviews. At least 20 characters, at most 1,000.</li>
          <li>Mark a cafe as visited on its page: reports from confirmed visits count more.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Not allowed</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Advertising, links, or contact details (email addresses, phone numbers).</li>
          <li>Abuse, harassment, or discrimination.</li>
          <li>Personal information about staff or other customers.</li>
          <li>Reports about places you haven&apos;t visited, or deliberately false information.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">How moderation works</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Reviews containing links, email addresses or phone numbers wait for a moderator before they appear.</li>
          <li>Any member can report a review. After three reports from different members it&apos;s hidden until a moderator decides.</li>
          <li>Moderators can approve or reject content. Editing rejected or hidden content sends it back to moderation.</li>
          <li>Each member has one report per amenity and one review per cafe, plus daily limits, so no single account can dominate.</li>
          <li>Only approved reports affect recommendations, and only once there are enough recent reports.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Privacy</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Contributions are shown as &ldquo;Cafe Finder member&rdquo;, never with your name or email.</li>
          <li>Other members can&apos;t see who reported or voted on anything.</li>
          <li>Your votes and reports are private to you; only totals are shown.</li>
          <li>
            Deleting your account in <Link href="/account" className="underline underline-offset-2">Account</Link>{" "}
            immediately removes all your reports, reviews, votes and flags.
          </li>
        </ul>
      </section>
    </article>
  );
}

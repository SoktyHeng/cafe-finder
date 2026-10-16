import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Shown on account-only pages when Supabase isn't configured (guest-only mode). */
export function AuthUnavailable({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-start gap-3" data-testid="auth-unavailable">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">
        Accounts aren&apos;t set up on this site yet, so there&apos;s nothing to save. You can still
        search for cafes as a guest.
      </p>
      <Button asChild size="lg" className="min-h-11 px-4">
        <Link href="/">Search for cafes</Link>
      </Button>
    </div>
  );
}

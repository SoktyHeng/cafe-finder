import { Coffee } from "lucide-react";
import Link from "next/link";

import { AuthNav } from "@/features/auth/components/auth-nav";

export function AppHeader() {
  return (
    <header className="border-b bg-background/95">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Coffee aria-hidden="true" className="size-5 text-primary" />
          <span>Cafe Finder</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          <Link
            href="/discover"
            className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Discover
          </Link>
          <AuthNav />
        </nav>
      </div>
    </header>
  );
}

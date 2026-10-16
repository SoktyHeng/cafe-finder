import { Coffee } from "lucide-react";
import Link from "next/link";

export function AppHeader() {
  return (
    <header className="border-b bg-background/95">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Coffee aria-hidden="true" className="size-5 text-primary" />
          <span>Cafe Finder</span>
        </Link>
      </div>
    </header>
  );
}

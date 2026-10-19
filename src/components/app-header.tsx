import { Coffee } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { NavigationLink } from "./navigation-link";

import { AuthNav } from "@/features/auth/components/auth-nav";

export function AppHeader({ enableAI = false }: { enableAI?: boolean }) {
  return (
    <header className="border-b bg-card">
      <div className="site-container flex min-h-20 flex-col items-start justify-between gap-x-4 gap-y-1 py-3 sm:flex-row sm:items-center sm:py-2">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Coffee aria-hidden="true" className="size-5" /></span>
          <span className="text-lg">Cafe Finder<span className="ml-1 text-primary">.</span></span>
        </Link>
        <nav aria-label="Main" className="site-nav -ml-3 flex max-w-full flex-wrap items-center gap-1 sm:ml-0">
          <Suspense fallback={<Link href="/discover" className="inline-flex min-h-11 items-center">Discover</Link>}><NavigationLink
            href="/discover"
            className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Discover
          </NavigationLink></Suspense>
          <AuthNav />
          {enableAI && <Suspense fallback={<Link href="/assistant" className="inline-flex min-h-11 items-center">Assistant</Link>}><NavigationLink href="/assistant" className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium underline-offset-4 hover:underline">Assistant</NavigationLink></Suspense>}
        </nav>
      </div>
    </header>
  );
}

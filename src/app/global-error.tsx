"use client";

import { ErrorFallback } from "@/components/error-fallback";

import "./globals.css";

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-full bg-background font-sans text-foreground">
        <title>Something went wrong · Cafe Finder</title>
        <main>
          <ErrorFallback onRetry={retry} />
        </main>
      </body>
    </html>
  );
}

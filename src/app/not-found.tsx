import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">
        We could not find the page you were looking for.
      </p>
      <Button asChild size="lg" className="min-h-11 px-4">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}

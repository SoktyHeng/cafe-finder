import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="page-shell flex max-w-2xl flex-col items-start gap-5 py-16 sm:py-24">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-secondary"><Compass aria-hidden="true" className="size-7 text-primary" /></span><p className="eyebrow">A small detour</p>
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

import type { ReactNode } from "react";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-heading flex flex-wrap items-end justify-between gap-5">
    <div className="max-w-2xl">
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
      {description && <p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p>}
    </div>
    {action}
  </header>;
}

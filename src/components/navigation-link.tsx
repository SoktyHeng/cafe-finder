"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

export function NavigationLink({ href, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  return <Link href={href} aria-current={typeof href === "string" && (pathname === href || pathname.startsWith(`${href}/`)) ? "page" : undefined} {...props} />;
}

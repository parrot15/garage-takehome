import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { safeLinkUrl } from "@/lib/research/urls";
import { INTERACTIVE } from "./classes";

/** Opens HTTP(S) URLs without credentials in a new tab, or falls back to plain text. */
export function ExternalLink({
  href,
  children,
  className,
  ...props
}: {
  href: string | null | undefined;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  title?: string;
}) {
  const safeHref = href ? safeLinkUrl(href) : null;
  return safeHref ? (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(INTERACTIVE, className)}
      {...props}
    >
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
}

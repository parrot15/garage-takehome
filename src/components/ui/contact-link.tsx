import { cn } from "@/lib/cn";
import { INTERACTIVE } from "./classes";

/** Builds a mail link for an address or a dial link retaining only digits and plus signs. */
function contactHref(value: string): string {
  return value.includes("@")
    ? `mailto:${value}`
    : `tel:${value.replace(/[^+\d]/g, "")}`;
}

/** Links a listed phone number or email address without changing its displayed text. */
export function ContactLink({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <a href={contactHref(value)} className={cn(INTERACTIVE, className)}>
      {value}
    </a>
  );
}

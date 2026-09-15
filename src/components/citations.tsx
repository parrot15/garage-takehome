"use client";

import {
  autoUpdate,
  FloatingFocusManager,
  FloatingPortal,
  flip,
  offset,
  safePolygon,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { ArrowUpRight } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import type { Source } from "@/lib/brief/schema";
import { cn } from "@/lib/cn";
import { formatDate } from "./brief-utils";
import { EYEBROW, INTERACTIVE, TEXT_LINK } from "./ui/classes";
import { ExternalLink } from "./ui/external-link";

export type RenderCitations = (references: string[]) => ReactNode;

/** Previews a source on hover, focus, or click, with Escape returning focus to its citation. */
function SourceCard({ source, number }: { source: Source; number: number }) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange(next, _event, reason) {
      setOpen(next);
      // Escape returns to the citation even when the card opened by hover.
      if (
        reason === "escape-key" &&
        refs.domReference.current instanceof HTMLElement
      )
        refs.domReference.current.focus({ preventScroll: true });
    },
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 12, crossAxis: true })],
  });
  const hover = useHover(context, {
    mouseOnly: true,
    delay: { open: 120 },
    handleClose: safePolygon(),
  });
  const focus = useFocus(context);
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    click,
    dismiss,
    role,
  ]);

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        className={cn(
          INTERACTIVE,
          "min-w-5.5 cursor-pointer rounded-sm border border-brand/20 bg-brand/8 px-1 py-0.75 text-2xs leading-tight text-muted-foreground hover:bg-brand/20 hover:text-foreground focus-visible:-outline-offset-2",
        )}
        {...getReferenceProps({
          "aria-label": `Source ${number}: ${source.title}`,
        })}
      >
        {number}
      </button>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager
            context={context}
            modal={false}
            initialFocus={-1}
          >
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className="z-50 w-80 max-w-[calc(100vw_-_--spacing(6))] max-h-[calc(100dvh_-_--spacing(6))] overflow-y-auto rounded-lg border border-border bg-popover p-4 text-left text-popover-foreground shadow-lg outline-none"
              {...getFloatingProps({ "aria-labelledby": labelId })}
            >
              <div className={cn(EYEBROW, "mb-2 text-2xs wrap-anywhere")}>
                Source {number} · {source.publisher}
              </div>
              <h3
                id={labelId}
                className="text-base leading-normal font-semibold wrap-anywhere"
              >
                <span className="sr-only">Source {number}:</span> {source.title}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {source.publishedAt
                  ? `Published ${formatDate(source.publishedAt)}${source.dateOrigin === "estimated" ? " (estimated)" : ""}`
                  : "Publication date not provided"}
              </p>
              {source.retrieval === "unknown" && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Freshness unconfirmed
                </p>
              )}
              <ExternalLink
                href={source.url}
                className={cn(TEXT_LINK, "mt-3 text-xs")}
              >
                Open source
                <ArrowUpRight
                  size={14}
                  className="text-brand"
                  aria-hidden="true"
                />
              </ExternalLink>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}

/** Numbers cited sources by their positions in the brief's source list. */
export function Citations({
  references,
  sources,
}: {
  references: string[];
  sources: Source[];
}) {
  const ids = new Set(references);
  return (
    <span className="ml-1.25 inline-flex flex-wrap gap-1 align-middle text-2xs leading-none font-medium tracking-normal">
      {sources.map((source, index) =>
        ids.has(source.id) ? (
          <SourceCard key={source.id} source={source} number={index + 1} />
        ) : null,
      )}
    </span>
  );
}

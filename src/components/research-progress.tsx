import { Check, LoaderCircle, Search } from "lucide-react";
import type { Place, ResearchStage } from "@/lib/brief/schema";
import { cn } from "@/lib/cn";
import { placeLine } from "./brief-utils";
import { Card } from "./ui/card";
import { EYEBROW } from "./ui/classes";
import { ExternalLink } from "./ui/external-link";

const STAGE_COPY: Record<
  ResearchStage,
  { title: string; detail: string; step: number }
> = {
  resolving: {
    title: "Finding the right department",
    detail: "Resolving the Place ID and its listed contact details.",
    step: 0,
  },
  searching: {
    title: "Looking for a reason to call",
    detail:
      "Searching the department’s own site, local news, grant awards, surplus listings, and council records.",
    step: 1,
  },
  reading: {
    title: "Reading the source material",
    detail:
      "Reviewing department pages, public records, and relevant reporting.",
    step: 2,
  },
  synthesizing: {
    title: "Preparing your call brief",
    detail: "Ranking supported findings into reasons to call.",
    step: 3,
  },
  validating: {
    title: "Checking the evidence links",
    detail: "Validating references and the facts behind each reason to call.",
    step: 3,
  },
};

const STEP =
  "flex flex-1 items-center gap-1.5 text-xs last:flex-none not-last:after:mr-2.25 not-last:after:ml-1 not-last:after:h-px not-last:after:w-full not-last:after:bg-border not-last:after:content-[''] phone:gap-1 phone:text-2xs phone:not-last:after:mr-1.75 phone:not-last:after:ml-0.75";
const STEP_STATE = {
  pending: "text-muted-foreground",
  active: "font-semibold text-foreground",
  complete: "text-success",
};

/** Announces the current research stage and shows the resolved department when available. */
export function ResearchProgress({
  stage,
  identity,
}: {
  stage: ResearchStage;
  identity: Place | null;
}) {
  const current = STAGE_COPY[stage];
  return (
    <Card
      render={<section aria-label="Research progress" />}
      className="mx-auto mt-9 max-w-panel animate-enter px-6.25 py-7.5 text-center motion-reduce:animate-none phone:mt-6 phone:px-4 phone:py-5.75"
    >
      <div className="relative mx-auto mb-4.25 flex size-12 items-center justify-center rounded-xl bg-brand/8 text-brand">
        <Search size={24} aria-hidden="true" />
        <span className="absolute right-1.25 bottom-1.25 size-1.75 animate-breathe rounded-full bg-brand ring-4 ring-card motion-reduce:animate-none" />
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        <p className={cn(EYEBROW, "text-xs")}>Research in progress</p>
        <h2 className="mt-1.75 mb-2 text-3xl leading-snug font-semibold tracking-tight phone:text-2xl">
          {current.title}
        </h2>
        <p className="mx-auto max-w-97.5 text-sm text-muted-foreground phone:text-xs">
          {current.detail}
        </p>
      </div>
      {identity && (
        <div className="inline-block max-w-full">
          <p className="mt-4 flex flex-wrap items-center justify-center gap-1.25 text-xs text-success">
            <Check size={14} aria-hidden="true" />
            <ExternalLink href={identity.mapsUrl}>{identity.name}</ExternalLink>
            <span className="text-muted-foreground">{placeLine(identity)}</span>
          </p>
        </div>
      )}
      <ol
        className="mx-auto mt-7.25 mb-5.25 flex max-w-95 phone:max-w-82.5"
        aria-label="Research stages"
      >
        {["Identify", "Discover", "Read", "Prepare"].map((label, index) => {
          const state =
            index < current.step
              ? "complete"
              : index === current.step
                ? "active"
                : "pending";
          return (
            <li
              key={label}
              className={cn(STEP, STEP_STATE[state])}
              aria-current={state === "active" ? "step" : undefined}
            >
              <span
                className={cn(
                  "inline-flex items-center",
                  state === "active" && "text-brand",
                )}
              >
                {state === "complete" ? (
                  <Check size={12} aria-hidden="true" />
                ) : state === "active" ? (
                  <LoaderCircle
                    size={13}
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <span className="size-1.25 rounded-full border border-border-strong" />
                )}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground phone:text-2xs">
        We read the sources before writing your brief. This can take a few
        minutes.
      </p>
    </Card>
  );
}

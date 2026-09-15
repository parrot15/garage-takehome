"use client";

import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CircleAlert,
  FileText,
  Fingerprint,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useResearch } from "@/hooks/use-research";
import type { RequestBrief } from "@/lib/brief/client";
import { parseBriefRequest } from "@/lib/brief/schema";
import { cn } from "@/lib/cn";
import { SAMPLE_BRIEF, SAMPLE_PLACE_IDS } from "@/lib/sample";
import { BriefView } from "./brief-view";
import { ResearchProgress } from "./research-progress";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { INTERACTIVE, TEXT_LINK } from "./ui/classes";
import { ExternalLink } from "./ui/external-link";
import { Field, FieldDescription, FieldError, FieldLabel } from "./ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group";

const BENEFIT_ICON =
  "mb-3.75 flex size-9.5 items-center justify-center rounded-lg border border-brand/20 bg-brand/5 text-brand phone:absolute phone:top-px phone:left-0";
const BENEFIT_TITLE = "mb-1.25 text-base font-semibold phone:text-sm";
const BENEFIT_TEXT =
  "text-sm leading-loose text-muted-foreground phone:text-xs";
/** A suggested Place ID: an outline chip that warms to the brand on hover. */
const SAMPLE_CHIP =
  "border-border font-normal text-muted-foreground hover:not-disabled:border-brand/30 hover:not-disabled:bg-brand/5 disabled:opacity-55";

/**
 * Coordinates Place ID entry, research progress, results, and retries.
 * Uses the default API requester unless a request function is supplied.
 */
export function ResearchWorkspace({ request }: { request?: RequestBrief }) {
  const [placeId, setPlaceId] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const { status, stage, identity, brief, error, research, showSample } =
    useResearch(request);
  const busy = status === "researching";
  const hasBrief = status === "success" && brief !== null;

  useEffect(() => {
    if (hasBrief) {
      result.current
        ?.querySelector<HTMLElement>("#brief-heading")
        ?.focus({ preventScroll: true });
      result.current?.scrollIntoView?.({ behavior: "instant", block: "start" });
    }
  }, [hasBrief]);

  /**
   * Validates the Place ID before research and focuses invalid input.
   * The server independently validates the request.
   */
  function start() {
    const request = parseBriefRequest({ placeId });
    if (!request.ok) {
      setInputError(request.message);
      input.current?.focus();
      return;
    }
    setInputError(null);
    void research(request.placeId);
  }

  /** Starts validated research without navigating away from the form. */
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        className={cn(
          INTERACTIVE,
          "fixed -top-25 left-3.75 z-100 rounded-md bg-primary px-4.5 py-2.5 text-primary-foreground focus:top-2.5",
        )}
        href="#main-content"
      >
        Skip to main content
      </a>
      <main
        id="main-content"
        className="mx-auto w-full max-w-page flex-1 px-8 pb-14.5 phone:px-5 phone:pb-9.5"
      >
        {!hasBrief && !busy && (
          <section
            className="mx-auto mt-10 max-w-intro animate-enter motion-reduce:animate-none phone:mt-7"
            aria-label="About your brief"
          >
            <div className="flex items-center gap-4.5 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border before:content-[''] after:h-px after:flex-1 after:bg-border after:content-[''] phone:gap-3.25 phone:text-2xs">
              <span>Go into the call prepared</span>
            </div>
            <div className="mt-6.75 grid grid-cols-3 gap-8.5 phone:mt-6.25 phone:grid-cols-1 phone:gap-6">
              <div className="phone:relative phone:pl-13.25">
                <span className={BENEFIT_ICON}>
                  <Fingerprint size={20} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h2 className={BENEFIT_TITLE}>Who runs it, what they run</h2>
                <p className={BENEFIT_TEXT}>
                  The chief and decision makers, with listed contacts, and the
                  fleet by unit, year, and make.
                </p>
              </div>
              <div className="phone:relative phone:pl-13.25">
                <span className={BENEFIT_ICON}>
                  <Sparkles size={20} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h2 className={BENEFIT_TITLE}>Reason to call</h2>
                <p className={BENEFIT_TEXT}>
                  Surplus notices, replacements, grants, and news, ranked into a
                  cited reason to call today.
                </p>
              </div>
              <div className="phone:relative phone:pl-13.25">
                <span className={BENEFIT_ICON}>
                  <BookOpen size={20} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h2 className={BENEFIT_TITLE}>“Where’d you hear that?”</h2>
                <p className={BENEFIT_TEXT}>
                  Every line cites its source. Preview source details and open
                  the original from any citation.
                </p>
              </div>
            </div>
            <div className="mt-8.75 flex flex-wrap items-center justify-center gap-2.25 border-t border-border pt-6 text-xs text-muted-foreground phone:mt-6.25 phone:justify-start phone:gap-x-2.25 phone:gap-y-1.5">
              <FileText size={16} aria-hidden="true" />
              <p>See what a finished brief looks like.</p>
              <button
                type="button"
                className={cn(INTERACTIVE, TEXT_LINK, "cursor-pointer")}
                onClick={() => {
                  setInputError(null);
                  showSample(SAMPLE_BRIEF);
                }}
              >
                View example brief{" "}
                <ArrowRight
                  size={14}
                  className="text-brand"
                  aria-hidden="true"
                />
              </button>
              <Badge className="phone:hidden">Historical example</Badge>
            </div>
          </section>
        )}

        <section
          className={cn(
            "mx-auto",
            hasBrief ? "max-w-none pt-6.75" : "max-w-form pt-10 phone:pt-7",
          )}
          aria-label="Research a fire department"
        >
          <form onSubmit={submit} noValidate>
            <Field>
              <FieldLabel
                htmlFor="place-id"
                className={hasBrief ? "text-xs" : "text-sm phone:text-xs"}
              >
                {hasBrief
                  ? "Research another department"
                  : "Start with a Google Place ID"}
              </FieldLabel>
              <InputGroup className={cn(hasBrief && "max-w-form")}>
                <InputGroupAddon className="pl-3.25 phone:pl-2.25">
                  <Search size={18} aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  ref={input}
                  id="place-id"
                  name="placeId"
                  placeholder="Paste a Google Place ID"
                  value={placeId}
                  onChange={(event) => {
                    setPlaceId(event.target.value);
                    setInputError(null);
                  }}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={300}
                  disabled={busy}
                  aria-invalid={Boolean(inputError)}
                  aria-describedby={
                    inputError ? "place-id-error" : "place-id-help"
                  }
                />
                <InputGroupAddon
                  align="inline-end"
                  className="phone:col-span-full phone:mt-0.75"
                >
                  <Button
                    type="submit"
                    disabled={busy}
                    className="phone:w-full"
                  >
                    {busy ? "Researching…" : "Generate brief"}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                </InputGroupAddon>
              </InputGroup>
              <FieldError id="place-id-error">{inputError}</FieldError>
              <div
                className={cn(
                  "mt-0.5 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs text-muted-foreground phone:flex-col phone:items-start phone:gap-2.25 phone:text-2xs",
                  hasBrief && "max-w-form",
                )}
              >
                <FieldDescription
                  id="place-id-help"
                  className="flex flex-wrap items-center gap-0.75 phone:block phone:text-2xs"
                >
                  A Place ID identifies a specific location.{" "}
                  <ExternalLink
                    href="https://developers.google.com/maps/documentation/places/web-service/place-id"
                    className={TEXT_LINK}
                  >
                    Find an ID{" "}
                    <ArrowUpRight
                      size={11}
                      className="text-brand"
                      aria-hidden="true"
                    />
                  </ExternalLink>
                </FieldDescription>
                <div className="flex items-center gap-1.75">
                  <span>Try an ID:</span>
                  {SAMPLE_PLACE_IDS.map((id, index) => (
                    <Button
                      key={id}
                      variant="outline"
                      size="xs"
                      className={SAMPLE_CHIP}
                      disabled={busy}
                      onClick={() => {
                        setPlaceId(id);
                        setInputError(null);
                        input.current?.focus();
                      }}
                    >
                      Sample {index + 1}
                    </Button>
                  ))}
                </div>
              </div>
            </Field>
          </form>
        </section>

        {busy && (
          <ResearchProgress stage={stage ?? "resolving"} identity={identity} />
        )}
        {status === "error" && error && (
          <Alert
            variant="destructive"
            className="mx-auto mt-6.25 max-w-form animate-enter motion-reduce:animate-none"
          >
            <CircleAlert
              size={22}
              className="mt-0.5 text-destructive"
              aria-hidden="true"
            />
            <AlertTitle render={(props) => <h2 {...props} />}>
              Your brief couldn’t be completed
            </AlertTitle>
            <AlertDescription>
              <p>{error.message}</p>
              {error.retryable && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={start}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Try again
                </Button>
              )}
              {error.requestId && (
                <p className="mt-2.5 wrap-anywhere text-2xs">
                  Reference: {error.requestId}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}
        {hasBrief && (
          <div ref={result} className="scroll-mt-5">
            <BriefView key={brief.runId} brief={brief} />
          </div>
        )}
      </main>
    </div>
  );
}

import { Sparkles } from "lucide-react";
import type { Brief } from "@/lib/brief/schema";
import { cn } from "@/lib/cn";
import { Section } from "./brief-sections";
import { ANGLE_KIND_LABELS } from "./brief-utils";
import type { RenderCitations } from "./citations";

type FactCitations = {
  cite: RenderCitations;
  angleReferences: (ids: string[]) => string[];
};

const CALL_CARD =
  "rounded-lg border border-brand/20 border-t-3 border-t-brand bg-linear-120 from-brand/6 to-brand/2 px-6.25 py-6 tablet:p-5 phone:px-4.5 phone:py-5";
const ANGLE_KIND =
  "inline-flex items-center gap-1.5 text-2xs font-bold tracking-widest uppercase text-brand";
const REASON = "mt-1.5 leading-loose text-foreground";
const LEAD_REASON = "text-xl font-medium phone:text-lg";

/** Displays supported reasons to call, or explains when no timely signal was found. */
export function CallApproach({
  angles,
  cite,
  angleReferences,
}: { angles: Brief["callAngles"] } & FactCitations) {
  return (
    <section className={CALL_CARD} aria-labelledby="call-heading">
      <div className="flex items-center gap-1.75 text-foreground">
        <Sparkles size={14} className="text-brand" aria-hidden="true" />
        <h2
          id="call-heading"
          className="text-xs leading-snug font-bold tracking-widest uppercase"
        >
          Reason to call
        </h2>
      </div>
      {angles.length > 0 ? (
        angles.map((angle, index) => (
          <div
            className={
              index > 0 ? "mt-5 border-t border-brand/15 pt-4.25" : undefined
            }
            key={`${angle.kind}:${angle.factIds.join(",")}`}
          >
            <span className={cn(ANGLE_KIND, index === 0 && "mt-3.5")}>
              {ANGLE_KIND_LABELS[angle.kind]}
            </span>
            <p
              className={cn(
                REASON,
                index > 0 ? "text-lg font-normal" : LEAD_REASON,
              )}
            >
              {angle.reason}
              {cite(angleReferences(angle.factIds))}
            </p>
          </div>
        ))
      ) : (
        <div>
          <span className={cn(ANGLE_KIND, "mt-3.5")}>No timely signal</span>
          <p className={cn(REASON, LEAD_REASON)}>
            The sources reviewed did not establish a timely reason to call.
          </p>
        </div>
      )}
    </section>
  );
}

/** Lists qualification questions with citations for the facts behind their premises. */
export function QualificationQuestions({
  questions,
  cite,
  angleReferences,
}: { questions: Brief["questions"] } & FactCitations) {
  if (questions.length === 0) return null;
  return (
    <Section
      id="ask-heading"
      title="Ask on the call"
      kicker="Qualify the account"
    >
      <ol className="grid gap-2.5">
        {questions.map((question, index) => (
          <li key={question.text} className="flex items-baseline gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="text-sm leading-loose text-foreground">
              {question.text}
              {cite(angleReferences(question.factIds))}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

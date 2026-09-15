import type { ReactNode } from "react";
import type { Fact, Vehicle } from "@/lib/brief/schema";
import {
  ageFlag,
  factDateLabel,
  moneyLabel,
  personContacts,
  STATUS_LABELS,
  vehicleAge,
  vehicleLabel,
} from "./brief-utils";
import type { RenderCitations } from "./citations";
import { Badge, type BadgeVariant } from "./ui/badge";
import { UNDERLINED } from "./ui/classes";
import { ContactLink } from "./ui/contact-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

const ROW = "border-b border-dashed border-rule py-2 last:border-b-0";
const ROW_TITLE =
  "flex flex-wrap items-baseline gap-x-2 gap-y-1 text-base font-semibold";
const ROW_TEXT = "mt-0.5 text-sm leading-loose text-muted-foreground";
const ROW_META =
  "mt-0.75 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground";
const ROW_DATE = "mt-0.75 block text-xs text-muted-foreground";
const EMPTY = "py-1 text-xs leading-relaxed text-muted-foreground";
/** How a status reads at a glance: still open, concluded, or simply recorded. */
type Tone = "pending" | "settled" | "neutral";
/** Maps each fact status to a visual tone; null suppresses the tag. */
const STATUS_TONE: Record<Fact["status"], Tone | null> = {
  reported: null,
  proposed: "pending",
  approved: "neutral",
  ordered: "neutral",
  delivered: "neutral",
  in_service: "neutral",
  retained: "settled",
  retired: "neutral",
  planned_surplus: "pending",
  listed: "neutral",
  sold: "settled",
  donated: "settled",
  cancelled: "settled",
  unknown: "neutral",
};
const TONE_VARIANT: Record<Tone, BadgeVariant> = {
  pending: "tint",
  settled: "success",
  neutral: "secondary",
};
/** The tag an apparatus age wears once it passes the NFPA reserve and replacement guidance. */
const AGE_VARIANT: Record<
  NonNullable<ReturnType<typeof ageFlag>>,
  BadgeVariant
> = {
  watch: "tint",
  replace: "brand",
};

/** Groups brief content under an accessible heading and descriptive label. */
export function Section({
  id,
  title,
  kicker,
  children,
}: {
  id: string;
  title: string;
  kicker: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <h2 id={id} className="text-base font-bold tracking-tight">
          {title}
        </h2>
        <span className="text-2xs text-muted-foreground phone:hidden">
          {kicker}
        </span>
      </div>
      {children}
    </section>
  );
}

/** Shows the cited status while omitting the generic "Reported" badge. */
function StatusTag({ fact }: { fact: Fact }) {
  const tone = STATUS_TONE[fact.status];
  if (!tone) return null;
  return (
    <Badge
      variant={TONE_VARIANT[tone]}
      title="Status described by the cited source"
    >
      {STATUS_LABELS[fact.status]}
    </Badge>
  );
}

/** Displays documented event and as-of dates when present. */
function DateLine({ fact }: { fact: Fact }) {
  const label = factDateLabel(fact);
  return label ? <span className={ROW_DATE}>{label}</span> : null;
}

/** Renders complete fact statements with optional contact, funding, vehicle, and date details. */
function FactRows({
  facts,
  cite,
  empty,
  showPerson,
  showMoney,
  showVehicle,
  dateFirst,
}: {
  facts: Fact[];
  cite: RenderCitations;
  /** Text shown when no facts exist; omit to render nothing. */
  empty?: string;
  /** Lead with the person's name and role, followed by their listed contacts. */
  showPerson?: boolean;
  showMoney?: boolean;
  showVehicle?: boolean;
  /** Put the event date before the title and keep it out of the date line. */
  dateFirst?: boolean;
}) {
  if (facts.length === 0)
    return empty ? <p className={EMPTY}>{empty}</p> : null;
  return (
    <ul>
      {facts.map((fact) => {
        const person = showPerson ? fact.person : null;
        const contacts = person ? personContacts(person) : [];
        const money = showMoney && fact.money ? moneyLabel(fact.money) : null;
        const vehicle = showVehicle ? fact.vehicle : null;
        return (
          <li key={fact.id} className={ROW}>
            <div className={ROW_TITLE}>
              {dateFirst && fact.eventDate && (
                <span className="font-medium text-muted-foreground tabular-nums">
                  {factDateLabel({ ...fact, asOf: null })}
                </span>
              )}
              <span>{person?.name ?? fact.title}</span>
              {person && (
                <span className="font-normal text-muted-foreground">
                  {person.role}
                </span>
              )}
              <StatusTag fact={fact} />
              {cite(fact.references)}
            </div>
            {contacts.length > 0 && (
              <div className={ROW_META}>
                {contacts.map((value) => (
                  <ContactLink
                    key={value}
                    value={value}
                    className={UNDERLINED}
                  />
                ))}
              </div>
            )}
            {money && (
              <div className={ROW_META}>
                <strong className="font-semibold text-foreground">
                  {money}
                </strong>
              </div>
            )}
            {vehicle && (
              <div className={ROW_META}>
                <strong className="font-semibold text-foreground">
                  {[vehicle.unit, vehicleLabel(vehicle)]
                    .filter(Boolean)
                    .join(" · ")}
                </strong>
                {vehicle.replacementRelationship && (
                  <span>{vehicle.replacementRelationship}</span>
                )}
              </div>
            )}
            <p className={ROW_TEXT}>{fact.statement}</p>
            <DateLine fact={dateFirst ? { ...fact, eventDate: null } : fact} />
          </li>
        );
      })}
    </ul>
  );
}

/** Displays documented leaders and office contacts with their roles and evidence. */
export function PeopleSection({
  facts,
  cite,
}: {
  facts: Fact[];
  cite: RenderCitations;
}) {
  return (
    <Section id="people-heading" title="People" kicker="Who runs it">
      <FactRows
        facts={facts}
        cite={cite}
        empty="No named leadership was found in the sources reviewed."
        showPerson
      />
    </Section>
  );
}

/** Narrows a fact to one with structured vehicle details. */
function hasVehicle(fact: Fact): fact is Fact & { vehicle: Vehicle } {
  return fact.vehicle !== null;
}

/** Displays individual apparatus with model-year ages and separate fleet-wide findings. */
export function FleetSection({
  facts,
  researchedAt,
  cite,
}: {
  facts: Fact[];
  researchedAt: string;
  cite: RenderCitations;
}) {
  const vehicles = facts.filter(hasVehicle);
  const others = facts.filter((fact) => !hasVehicle(fact));
  return (
    <Section id="fleet-heading" title="Fleet" kicker="What they run">
      {facts.length === 0 && (
        <p className={EMPTY}>
          No apparatus roster was found in the sources reviewed.
        </p>
      )}
      {vehicles.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Unit</TableHead>
              <TableHead scope="col">Year</TableHead>
              <TableHead scope="col">Apparatus</TableHead>
              <TableHead scope="col">Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.map((fact) => {
              const { vehicle } = fact;
              const age = vehicleAge(vehicle, researchedAt);
              const flag = ageFlag(age);
              return (
                <TableRow key={fact.id}>
                  <TableCell className="font-semibold whitespace-nowrap">
                    {vehicle.unit ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {vehicle.modelYear ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {[vehicle.make, vehicle.description]
                        .filter(Boolean)
                        .join(" ")}
                    </span>{" "}
                    <StatusTag fact={fact} />
                    {cite(fact.references)}
                    {vehicle.replacementRelationship && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {vehicle.replacementRelationship}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {fact.statement}
                    </span>
                    <DateLine fact={fact} />
                  </TableCell>
                  <TableCell className="text-right">
                    {age !== null && (
                      <Badge
                        variant={flag ? AGE_VARIANT[flag] : "outline"}
                        className="tabular-nums"
                        title={
                          flag === "replace"
                            ? "Past the 25-year replacement guidance in NFPA 1911"
                            : flag === "watch"
                              ? "Past the 15-year reserve guidance in NFPA 1911"
                              : undefined
                        }
                      >
                        {age} yrs
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <FactRows facts={others} cite={cite} />
    </Section>
  );
}

/** Displays funding claims with their amounts, purposes, and related vehicles. */
export function MoneySection({
  facts,
  cite,
}: {
  facts: Fact[];
  cite: RenderCitations;
}) {
  return (
    <Section
      id="money-heading"
      title="Budget & grants"
      kicker="Money in motion"
    >
      <FactRows
        facts={facts}
        cite={cite}
        empty="No apparatus funding or grant activity was found in the sources reviewed."
        showMoney
        showVehicle
      />
    </Section>
  );
}

/** Displays news with event dates before titles and as-of dates below. */
export function NewsSection({
  facts,
  cite,
}: {
  facts: Fact[];
  cite: RenderCitations;
}) {
  return (
    <Section id="news-heading" title="News" kicker="Recent developments">
      <FactRows
        facts={facts}
        cite={cite}
        empty="No recent department news was found in the sources reviewed."
        dateFirst
      />
    </Section>
  );
}

/** Displays replacement and disposition findings with vehicle details and conditions. */
export function ReplacementSection({
  facts,
  cite,
}: {
  facts: Fact[];
  cite: RenderCitations;
}) {
  return (
    <Section
      id="replacement-heading"
      title="Replacement & surplus"
      kicker="What is changing"
    >
      <FactRows
        facts={facts}
        cite={cite}
        empty="No separate replacement or surplus findings in this section."
        showVehicle
      />
    </Section>
  );
}

import {
  ArrowUpRight,
  ChevronDown,
  FileText,
  Globe,
  MapPin,
  Phone,
  TriangleAlert,
} from "lucide-react";
import type { Brief } from "@/lib/brief/schema";
import { cn } from "@/lib/cn";
import { safeLinkUrl, siteHost } from "@/lib/research/urls";
import { CallApproach, QualificationQuestions } from "./brief-call-plan";
import {
  FleetSection,
  MoneySection,
  NewsSection,
  PeopleSection,
  ReplacementSection,
} from "./brief-sections";
import {
  DEPARTMENT_KIND_LABELS,
  formatDate,
  placeLine,
  referencesForFacts,
  sectionFacts,
} from "./brief-utils";
import { Citations } from "./citations";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { EYEBROW, FOCUS_RING } from "./ui/classes";
import { ContactLink } from "./ui/contact-link";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { ExternalLink } from "./ui/external-link";

const CONTACT_LINE = "flex min-w-0 items-center gap-1.5 text-xs";
const CONTACT_ANCHOR =
  "inline-flex items-center gap-0.75 wrap-anywhere text-foreground hover:underline hover:decoration-brand hover:underline-offset-3";
const CONTACT_PHONE =
  "text-3xl font-semibold tracking-tight hover:text-foreground hover:underline hover:decoration-brand hover:underline-offset-3 phone:text-2xl";
const SOURCE_LINK =
  "inline-flex items-baseline gap-1 font-medium text-muted-foreground hover:text-foreground hover:underline hover:decoration-brand hover:underline-offset-3";
/** Each column stacks its sections. */
const COLUMN = "flex flex-col gap-6.5";

interface Presentation {
  /** Explains the brief above its header, when its mode needs explaining. */
  notice: { title: string; text: string } | null;
  /** What the brief's date is a date of. */
  dateLabel: string;
  /** Stands in for a phone number the listing does not have. */
  noPhone: string;
  /** Whether the address opens the location in Google Maps. */
  addressLinks: boolean;
}
/**
 * The historical example must not read as a lead: it announces itself, dates
 * itself as context rather than research, explains its withheld contacts, and
 * keeps its address off the map.
 */
const PRESENTATION: Record<Brief["mode"], Presentation> = {
  live: {
    notice: null,
    dateLabel: "Researched",
    noPhone: "No phone number was listed for this location.",
    addressLinks: true,
  },
  sample: {
    notice: {
      title: "Historical example brief",
      text: "Illustrates the experience using historical public sources. This is not live research or a current sales lead.",
    },
    dateLabel: "Historical context",
    noPhone: "Contact details are omitted in this historical example.",
    addressLinks: false,
  },
};

/** Presents cited findings and contact details while clearly labeling historical examples. */
export function BriefView({ brief }: { brief: Brief }) {
  const cite = (references: string[]) => (
    <Citations references={references} sources={brief.sources} />
  );
  const angleReferences = (ids: string[]) =>
    referencesForFacts(brief.facts, ids);
  const mode = PRESENTATION[brief.mode];
  const sections = sectionFacts(brief.facts);
  const kind = DEPARTMENT_KIND_LABELS[brief.department.kind];
  const website = brief.place.websiteUrl && safeLinkUrl(brief.place.websiteUrl);
  const location = placeLine(brief.place);

  return (
    <article
      className="mt-8.25 animate-enter motion-reduce:animate-none phone:mt-6"
      aria-label="Department brief"
    >
      {mode.notice && (
        <Alert className="mb-6 phone:mb-4.5">
          <FileText size={17} className="mt-px text-brand" aria-hidden="true" />
          <AlertTitle>{mode.notice.title}</AlertTitle>
          <AlertDescription>{mode.notice.text}</AlertDescription>
        </Alert>
      )}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-8 border-b border-border pb-6 phone:grid-cols-1 phone:gap-4.5 phone:pb-5">
        <div>
          <div className={cn(EYEBROW, "mb-3 text-2xs")}>
            <span className="inline-block size-1.5 shrink-0 rounded-xs bg-brand" />{" "}
            Pre-call brief
          </div>
          <h1
            tabIndex={-1}
            id="brief-heading"
            className="mb-1.5 text-3xl leading-tight font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-foreground"
          >
            {brief.scope.name}
            {brief.scope.references.length > 0 && cite(brief.scope.references)}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted-foreground">
            {location && <span>{location}</span>}
            {kind && <Badge className="uppercase tracking-wider">{kind}</Badge>}
            {brief.scope.relationship === "parent_department" && (
              <span>Selected location: {brief.place.name}</span>
            )}
          </div>
          {brief.department.summary && (
            <p className="mt-2 max-w-160 text-sm leading-loose text-muted-foreground">
              {brief.department.summary}
              {cite(brief.department.references)}
            </p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-1.75 text-xs text-muted-foreground phone:text-2xs">
            {mode.dateLabel} {formatDate(brief.researchedAt)}{" "}
            <span aria-hidden="true">·</span> {brief.sources.length}{" "}
            {brief.sources.length === 1 ? "source" : "sources"}{" "}
          </p>
        </div>
        <Card className="grid min-w-62.5 max-w-80 gap-1.5 px-4.5 pt-4 pb-3.5 tablet:min-w-55 phone:min-w-0 phone:max-w-none">
          <span className={cn(EYEBROW, "text-2xs")}>
            <Phone size={12} aria-hidden="true" /> Contact
          </span>
          {brief.place.phone ? (
            <ContactLink value={brief.place.phone} className={CONTACT_PHONE} />
          ) : (
            <span className="text-xs leading-normal text-muted-foreground">
              {mode.noPhone}
            </span>
          )}
          {website && (
            <span className={cn(CONTACT_LINE, "text-muted-foreground")}>
              <Globe size={12} className="shrink-0" aria-hidden="true" />
              <ExternalLink href={website} className={CONTACT_ANCHOR}>
                {siteHost(website)}
                <ArrowUpRight size={11} aria-hidden="true" />
              </ExternalLink>
            </span>
          )}
          <span className={cn(CONTACT_LINE, "text-muted-foreground")}>
            <MapPin size={12} className="shrink-0" aria-hidden="true" />
            {mode.addressLinks ? (
              <ExternalLink
                href={brief.place.mapsUrl}
                className={CONTACT_ANCHOR}
              >
                {brief.place.address}
                <ArrowUpRight size={11} aria-hidden="true" />
              </ExternalLink>
            ) : (
              <span>{brief.place.address}</span>
            )}
          </span>
          {brief.place.businessStatus === "CLOSED_PERMANENTLY" && (
            <span
              className={cn(CONTACT_LINE, "font-semibold text-destructive")}
            >
              <TriangleAlert
                size={12}
                className="shrink-0"
                aria-hidden="true"
              />
              Google lists this location as permanently closed.
            </span>
          )}
        </Card>
      </header>

      {(brief.scope.relationship !== "selected_place" ||
        brief.scope.explanation) && (
        <p className="mb-5.5 rounded-md border border-border bg-muted px-3.75 py-3 text-xs leading-loose text-muted-foreground">
          <strong className="font-semibold">Research scope.</strong>{" "}
          {brief.scope.relationship === "unresolved"
            ? "The relationship between the selected location and the department could not be established. "
            : ""}
          {brief.scope.explanation ??
            (brief.scope.relationship === "unresolved"
              ? "Confirm the account before using this brief."
              : `Research covers ${brief.scope.name}.`)}
          {cite(brief.scope.references)}
        </p>
      )}

      <CallApproach
        angles={brief.callAngles}
        cite={cite}
        angleReferences={angleReferences}
      />

      {brief.facts.length === 0 ? (
        <Empty className="mt-7">
          <EmptyMedia>
            <FileText size={22} aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle render={(props) => <h2 {...props} />}>
            Public information is limited
          </EmptyTitle>
          <EmptyDescription>
            The reviewed sources did not establish enough department-specific
            context. Use the questions below to qualify the account directly.
          </EmptyDescription>
          <EmptyContent>
            <QualificationQuestions
              questions={brief.questions}
              cite={cite}
              angleReferences={angleReferences}
            />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="mt-7.5 grid grid-cols-2 gap-x-10 gap-y-6.5 tablet:gap-x-6.5 tablet:gap-y-5.5 phone:mt-6 phone:grid-cols-1 phone:gap-6">
          <div className={COLUMN}>
            <PeopleSection facts={sections.people} cite={cite} />
            <MoneySection facts={sections.funding} cite={cite} />
            <NewsSection facts={sections.news} cite={cite} />
          </div>
          <div className={COLUMN}>
            <FleetSection
              facts={sections.fleet}
              researchedAt={brief.researchedAt}
              cite={cite}
            />
            <ReplacementSection facts={sections.disposition} cite={cite} />
            <QualificationQuestions
              questions={brief.questions}
              cite={cite}
              angleReferences={angleReferences}
            />
          </div>
        </div>
      )}

      <section
        className="mt-8.25 border-y border-border"
        aria-label="Source index"
      >
        <details className="group">
          <summary
            className={cn(
              FOCUS_RING,
              "flex cursor-pointer list-none items-center justify-between py-3.5 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden",
            )}
          >
            <span className="flex items-center gap-1.75">
              <FileText size={15} aria-hidden="true" /> All sources{" "}
              <Badge variant="tint">{brief.sources.length}</Badge>
            </span>
            <ChevronDown
              size={15}
              className="group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <ol className="mb-4.5 list-decimal pl-4.75">
            {brief.sources.map((source) => (
              <li
                key={source.id}
                className="pl-0.5 text-xs text-muted-foreground not-first:mt-2.5"
              >
                <ExternalLink href={source.url} className={SOURCE_LINK}>
                  {source.title}
                  <ArrowUpRight size={12} aria-hidden="true" />
                </ExternalLink>
                <span className="block text-2xs">
                  {source.publisher}
                  {source.publishedAt
                    ? ` · ${source.dateOrigin === "estimated" ? "Estimated " : ""}${formatDate(source.publishedAt)}`
                    : ""}
                </span>
              </li>
            ))}
          </ol>
        </details>
      </section>
      <p className="mt-3.5 text-center text-2xs text-muted-foreground">
        Confirm current availability, timing, and decision authority directly
        with the department.
      </p>
    </article>
  );
}

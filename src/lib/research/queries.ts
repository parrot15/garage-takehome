import type { Place } from "@/lib/brief/schema";
import type { Candidate, SearchQuery } from "./contracts";
import { canonicalUrl, siteHost } from "./urls";

/** Public surplus and used-apparatus marketplaces where a department's own vehicles appear. */
const MARKETPLACE_DOMAINS = [
  "shopgarage.com",
  "govdeals.com",
  "municibid.com",
  "publicsurplus.com",
  "govplanet.com",
  "brindleemountain.com",
  "fentonfire.com",
  "commandfireapparatus.com",
];
/**
 * Hosts that discovery kept finding and selection kept reading, and that
 * briefs almost never cited across seventy-four saved runs. Their pages name
 * the town, so nothing else keeps them out of the read budget. Facebook,
 * govserv.org, causeiq.com, and hobbyist roster sites are cited and stay.
 */
const EXCLUDED_DOMAINS = [
  // Profile aggregators, and the person pages Exa substitutes for them.
  "linkedin.com",
  "exa.ai",
  "rocketreach.co",
  "zoominfo.com",
  "signalhire.com",
  // Department directories.
  "responserack.com",
  "usfiredept.com",
  "countyoffice.org",
  "mapquest.com",
  "neris.fsri.org",
  // Nonprofit and corporate registries.
  "nonprofitlight.com",
  "nonprofitfacts.com",
  "charitynavigator.org",
  "guidestar.org",
  "eintaxid.com",
  "opencorpdata.com",
  "opencorporates.com",
  "bizapedia.com",
  // Generated meeting summaries and procurement scrapers.
  "starbridge.ai",
  "civiciq.com",
  "pursuit.us",
  "procurementexpress.com",
];
const NEWS_WINDOW_MONTHS = 18;

/** Combines the department name and available location fields for discovery. */
function identityTerms(place: Place): string {
  return [place.name, place.locality, place.region, place.country]
    .filter((value) => value !== null)
    .join(" ");
}

/** Combines the town and region for queries that omit the formal department name. */
function localityTerms(place: Place): string {
  return [place.locality, place.region]
    .filter((value) => value !== null)
    .join(" ");
}

/** Returns the listed website's host for searches within the department's site. */
export function officialHost(place: Place): string | null {
  const url = place.websiteUrl && canonicalUrl(place.websiteUrl);
  return url ? siteHost(url) : null;
}

/** Includes the listed website as a candidate for leadership, fleet, and news. */
export function homepageCandidate(place: Place): Candidate[] {
  const url = place.websiteUrl && canonicalUrl(place.websiteUrl);
  return url
    ? [
        {
          url,
          title: place.name,
          excerpt: "Website listed for the selected location",
          publishedAt: null,
          tracks: ["leadership", "fleet", "news"],
          rank: 0,
        },
      ]
    : [];
}

/** Builds topic searches with location context, recent-news windows, and targeted domain filters. */
export function buildQueries(place: Place, now: Date): SearchQuery[] {
  const identity = identityTerms(place);
  const locality = localityTerms(place) || identity;
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - NEWS_WINDOW_MONTHS);
  const recent = since.toISOString();
  const openWeb: SearchQuery[] = [
    {
      id: "leadership-chief",
      track: "leadership",
      query: `${identity} fire chief`,
    },
    {
      id: "leadership-officers",
      track: "leadership",
      query: `${identity} fire department officers leadership staff directory contact`,
    },
    {
      id: "leadership-change",
      track: "leadership",
      // A change of chief is announced once and ranks low in a general leadership search.
      query: `${identity} new fire chief appointed named interim acting retiring`,
      startPublishedDate: recent,
    },
    {
      id: "fleet-roster",
      track: "fleet",
      query: `${identity} fire apparatus fleet engine ladder tanker rescue`,
    },
    {
      id: "fleet-deliveries",
      track: "fleet",
      query: `${identity} new fire engine pumper ladder truck delivered placed in service`,
    },
    {
      id: "disposition-surplus",
      track: "disposition",
      query: `${identity} fire apparatus surplus sale sealed bids auction retired replaced`,
    },
    {
      id: "disposition-marketplace",
      track: "disposition",
      query: `${locality} fire department engine pumper tanker ladder for sale`,
      includeDomains: MARKETPLACE_DOMAINS,
    },
    {
      id: "funding-grants",
      track: "funding",
      query: `${identity} fire apparatus grant award FEMA AFG SAFER state grant`,
    },
    {
      id: "funding-budget",
      track: "funding",
      query: `${identity} fire department budget capital plan apparatus purchase council approved`,
    },
    {
      id: "news-department",
      track: "news",
      query: `${identity} fire department`,
      category: "news",
      startPublishedDate: recent,
      numResults: 8,
    },
    {
      id: "news-locality",
      track: "news",
      query: `${locality} fire department chief apparatus station budget announcement`,
      startPublishedDate: recent,
      numResults: 8,
    },
  ];
  // A host-restricted query already says where to look; every other query keeps the aggregators out.
  const queries = openWeb.map((query) =>
    query.includeDomains
      ? query
      : { ...query, excludeDomains: EXCLUDED_DOMAINS },
  );
  const host = officialHost(place);
  if (host) {
    const includeDomains = [host, `*.${host}`];
    queries.push(
      {
        id: "site-leadership",
        track: "leadership",
        query: "fire department officers chief leadership staff contact",
        includeDomains,
      },
      {
        id: "site-fleet",
        track: "fleet",
        query: "apparatus fleet engine ladder tanker rescue trucks",
        includeDomains,
      },
      {
        id: "site-news",
        track: "news",
        query: "fire department news announcements updates",
        includeDomains,
      },
    );
  }
  return queries;
}

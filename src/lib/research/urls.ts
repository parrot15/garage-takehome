/**
 * Accepts credential-free HTTP(S) links for display or retrieval through Exa.
 * This server does not fetch these URLs directly.
 */
export function safeLinkUrl(input: string): string | null {
  if (input.length > 2048) return null;
  try {
    const url = new URL(input);
    const web = url.protocol === "https:" || url.protocol === "http:";
    return web && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** Query parameters that identify the click, not the document. */
const TRACKING_PARAMETERS = new Set(["fbclid", "gclid", "msclkid"]);

/** Removes fragments and tracking parameters while preserving document identifiers. */
export function canonicalUrl(input: string): string | null {
  const safe = safeLinkUrl(input);
  if (!safe) return null;
  const url = new URL(safe);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    const name = key.toLowerCase();
    if (name.startsWith("utm_") || TRACKING_PARAMETERS.has(name))
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
}

/** Returns the hostname without www for publisher labels and site matching. */
export function siteHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

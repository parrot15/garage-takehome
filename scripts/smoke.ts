import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import {
  PublicErrorSchema,
  ResearchEventSchema,
  SourceSchema,
} from "@/lib/brief/schema";
import { SAMPLE_PLACE_IDS } from "@/lib/sample";

const HELP = `Verify the public deployment without login or bypass credentials

  npm run smoke -- --url https://YOUR-PRODUCTION-DOMAIN
  npm run smoke -- --url https://YOUR-PRODUCTION-DOMAIN --live

The default checks public access, static assets, and request validation without
calling providers. --live also generates both supplied Place IDs sequentially;
provider charges apply. A passing response still needs a source/content review.
`;

/** Checks public access, client assets, and API validation, with optional paid live research. */
async function run() {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      live: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.info(HELP);
    return;
  }
  assert(values.url, "Provide the public origin with --url. See --help.");
  const base = new URL(values.url);
  assert(
    base.protocol === "https:" ||
      (base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)),
    "Use HTTPS for a public deployment, or HTTP for localhost.",
  );
  assert(
    !base.username &&
      !base.password &&
      !base.search &&
      !base.hash &&
      base.pathname === "/",
    "Provide only the public origin, without credentials, a path, or bypass parameters.",
  );
  const get = (path: string) =>
    fetch(new URL(path, base), {
      credentials: "omit",
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });

  const home = await get("/");
  assert.equal(
    home.status,
    200,
    "Home page must be public, with no login or redirect.",
  );
  assert.match(home.headers.get("content-type") ?? "", /text\/html/);
  const html = await home.text();
  assert.match(
    html,
    /id="place-id"/,
    "The public URL did not render the research form.",
  );
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path): path is string => Boolean(path?.startsWith("/_next/")));
  assert(scripts.length > 0, "No Next.js client assets found.");
  for (const path of new Set(scripts)) {
    const asset = await get(path);
    assert.equal(asset.status, 200, `Client asset unavailable: ${path}`);
    assert.match(asset.headers.get("content-type") ?? "", /javascript/);
    await asset.body?.cancel();
  }
  console.info(
    `PASS public page and ${new Set(scripts).size} client assets: ${base.origin}`,
  );

  const invalid = await fetch(new URL("/api/brief", base), {
    method: "POST",
    credentials: "omit",
    redirect: "manual",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ placeId: "https://invalid.example/" }),
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(
    invalid.status,
    400,
    "Invalid input should reach the API and return HTTP 400.",
  );
  const error = PublicErrorSchema.parse((await invalid.json()).error);
  assert.equal(error.retryable, false);
  console.info("PASS public API validation (no provider calls)");

  if (!values.live) {
    console.info(
      "Live research not tested. Run with --live to verify production credentials and providers.",
    );
    return;
  }
  for (const placeId of SAMPLE_PLACE_IDS) await checkResearch(base, placeId);
  console.info(
    "PASS both live research requests. Review the briefs and source links in a signed-out browser before submission.",
  );
}

/** Verifies one live research stream reaches a sourced brief for the requested Place ID. */
async function checkResearch(base: URL, placeId: string) {
  const started = performance.now();
  const elapsed = () => Math.round((performance.now() - started) / 1000);
  const response = await fetch(new URL("/api/brief", base), {
    method: "POST",
    credentials: "omit",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify({ placeId }),
    signal: AbortSignal.timeout(250_000),
  });
  assert.equal(
    response.status,
    200,
    `Live research returned HTTP ${response.status}. Check protection, credentials, and rate limits.`,
  );
  assert.match(
    response.headers.get("content-type") ?? "",
    /application\/x-ndjson/,
  );
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert(response.body, "Missing research stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let completed = false;
  let identityReceived = false;
  let stages = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (!line.trim()) continue;
        const raw = JSON.parse(line);
        const event = ResearchEventSchema.parse(raw);
        assert(!completed, "Received data after the terminal brief.");
        if (event.type === "error")
          throw new Error(`Research failed: ${event.error.message}`);
        if (event.type === "stage") {
          stages++;
          console.info(`${placeId} ${elapsed()}s: ${event.stage}`);
        } else if (event.type === "identity") {
          assert.equal(event.place.id, placeId, "Resolved the wrong Place ID.");
          identityReceived = true;
        } else if (event.type === "complete") {
          const brief = event.brief;
          assert.equal(
            brief.mode,
            "live",
            "Received the historical sample instead of live research.",
          );
          assert.equal(brief.place.id, placeId);
          assert(
            identityReceived && stages > 0,
            "Missing identity or progress events.",
          );
          assert(
            brief.facts.length > 0 && brief.sources.length > 0,
            "No sourced facts for this assignment Place ID.",
          );
          for (const source of raw.brief.sources)
            SourceSchema.strict().parse(source);
          for (const source of brief.sources) {
            assert(["http:", "https:"].includes(new URL(source.url).protocol));
            console.info(`  ${source.id}: ${source.url}`);
          }
          console.info(
            `PASS ${brief.scope.name}: ${brief.facts.length} facts, ${brief.sources.length} sources in ${elapsed()}s`,
          );
          completed = true;
        }
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  assert(completed, "Research connection ended without a completed brief.");
}

run().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Deployment verification failed.",
  );
  process.exitCode = 1;
});

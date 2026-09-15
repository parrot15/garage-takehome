import { randomUUID } from "node:crypto";
import { parseBriefRequest, type ResearchEvent } from "@/lib/brief/schema";
import type { Log, ResearchProviders } from "@/lib/research/contracts";
import { researchDepartment } from "@/lib/research/orchestrator";
import type { ServerConfig } from "./env";
import { publicError, ResearchError } from "./errors";

interface HandlerDependencies {
  getConfig: () => ServerConfig;
  createProviders: (config: ServerConfig) => ResearchProviders;
  log?: Log;
}

/** Reads and validates the request's Place ID, rejecting malformed input with HTTP 400. */
async function readPlaceId(request: Request): Promise<string> {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = parseBriefRequest(body);
  if (!parsed.ok)
    throw new ResearchError(parsed.message, { status: 400, retryable: false });
  return parsed.placeId;
}

/** Streams progress events as newline-delimited JSON, ending with the brief or a safe error. */
function streamResearch(run: {
  requestId: string;
  placeId: string;
  config: ServerConfig;
  providers: ResearchProviders;
  log: Log;
}): Response {
  const { requestId, config, log } = run;
  let closed = false;
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Blank NDJSON lines keep idle intermediaries active during synthesis.
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode("\n"));
      }, 15_000);
      const emit = (event: ResearchEvent) => {
        if (!closed)
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const brief = await researchDepartment({
          placeId: run.placeId,
          providers: run.providers,
          runId: requestId,
          emit,
          limits: {
            totalMs: config.researchTimeoutMs,
            synthesisReserveMs: config.modelTimeoutMs,
          },
          log,
        });
        emit({ type: "complete", brief });
      } catch (error) {
        const safe = publicError(error, requestId);
        log({
          event: "request_failed",
          runId: requestId,
          message: safe.message,
        });
        emit({ type: "error", error: safe });
      } finally {
        clearInterval(heartbeat);
        if (!closed) controller.close();
      }
    },
    cancel() {
      // A disconnected reader must not receive further writes.
      closed = true;
      clearInterval(heartbeat);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
    },
  });
}

/** Creates a POST handler that validates requests before starting a streamed research run. */
export function createBriefHandler(dependencies: HandlerDependencies) {
  const log = dependencies.log ?? (() => {});
  return async function POST(request: Request): Promise<Response> {
    const requestId = randomUUID();
    try {
      const placeId = await readPlaceId(request);
      const config = dependencies.getConfig();
      const providers = dependencies.createProviders(config);
      return streamResearch({
        requestId,
        placeId,
        config,
        providers,
        log,
      });
    } catch (error) {
      const safe = publicError(error, requestId);
      log({
        event: "request_rejected",
        runId: requestId,
        message: safe.message,
      });
      return Response.json(
        { error: safe },
        {
          status: error instanceof ResearchError ? error.status : 500,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  };
}

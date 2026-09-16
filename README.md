# Department Brief

A pre-call research brief for Garage account executives. Enter a fire department's Google Place ID to find its leadership, apparatus, funding, recent changes, and supported reasons to call, with source citations beside the findings.

**Live app:** [garage-takehome-pearl.vercel.app](https://garage-takehome-pearl.vercel.app)

## Run locally

Requires Node.js 22.12 or newer within 22.x and npm.

```sh
npm ci
cp -n .env.example .env.local
```

Set `GOOGLE_PLACES_API_KEY`, `EXA_API_KEY`, and `OPENAI_API_KEY` in `.env.local`. Google requires Places API (New) and billing enabled. Optional model and timeout settings are documented in `.env.example`. Keep existing credentials when updating the repo.

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). The historical example works without API keys; live research requires all three providers.

## Architecture

Next.js App Router, React, and TypeScript provide the UI and server endpoint in one app. Tailwind CSS and shadcn/ui on Base UI provide the interface.

1. The client submits a Place ID to `POST /api/brief` and receives streamed progress events.
2. Google Places resolves the department's identity. Exa searches public sources and reads relevant pages, with bounded recovery for failed reads.
3. The server turns extracted text into identified evidence passages. OpenAI produces a structured draft from those passages.
4. Validation checks references, scope, and vehicle rules before the UI renders the cited brief. These checks establish traceability, not factual truth.

UI code lives in `src/components` and `src/hooks`; research orchestration in `src/lib/research`; provider adapters in `src/lib/providers`; schemas and validation in `src/lib/brief`. Credentials stay server-side. The app has no database and does not persist generated briefs.

## Checks

```sh
npm run check           # lint, types, tests, and production build
npm run test:coverage
```

Offline tests use controlled provider responses.

## Gold evaluation

The gold suite made iteration fast by checking changes against a consistent set of expected results. `evaluation/gold.json` records dated, source-backed expectations for 12 Place IDs: leaders, contacts, vehicles, useful signals, and claims that must not appear. The cases cover different department sizes, ambiguous names, and a non-department that must be rejected.

```sh
npm run eval -- --case gold
npm run score -- artifacts/evaluations/<new-run> --baseline artifacts/evaluations/<previous-run>
```

The gold run exercises the real provider pipeline and saves briefs, retrieved evidence, failures, and timings. The local scorer reports missing facts, incorrect labels, and run times; `--baseline` highlights changes in coverage and critical failures. This makes gains and regressions easy to spot after changing retrieval or prompts.

For focused prompt or model comparisons, `npm run eval -- --replay <saved-report.json>` reuses the same evidence without repeating retrieval. Live runs and synthesis replays incur provider charges. The suite checks known expectations; review claims against cited passages before accepting quality improvements.

Keep `evaluation/gold.json` versioned as the shared test dataset. Generated reports and scorecards stay local in ignored `artifacts/` or `evaluation/reference/`.

# Repository guidance

## Purpose and structure

Build a concise, cited fire-department research brief for Garage account executives. Prioritize accurate identity, useful contacts and apparatus details, and supported reasons to call. Prefer simple changes with demonstrated quality gains.

- `src/components` and `src/hooks`: the research form, progress, brief, and citations.
- `src/lib/research`: queries, source selection, evidence passages, and orchestration.
- `src/lib/providers`: Google Places, Exa, and OpenAI adapters.
- `src/lib/brief`: shared schemas, validation, and the streaming client.
- `src/lib/server`: configuration, request handling, and public errors.
- `scripts` and `evaluation/gold.json`: live evaluation, saved-run replay, and offline scoring.

<!-- BEGIN:nextjs-agent-rules -->

## Next.js

Read the relevant guide in `node_modules/next/dist/docs/` before writing code. This installed version has breaking changes, so use its bundled documentation and heed deprecations rather than relying on older Next.js conventions.

<!-- END:nextjs-agent-rules -->

## Coding conventions

- Use TypeScript, `@/` imports for shared source modules, and relative imports for nearby modules. Validate external data with Zod.
- Keep provider calls and credentials on the server. Read configuration through `src/lib/server/env.ts`; never expose keys, raw provider errors, or extracted source bodies to the browser or logs.
- Keep research bounded: one discovery pass, at most one recovery read batch, and one synthesis step. Preserve deadlines and partial successes.
- Treat search snippets as discovery hints, not evidence. Preserve dates, uncertainty, vehicle status, and department scope. Valid citations alone do not prove a claim.
- Reuse components in `src/components/ui` and theme tokens in `src/app/globals.css`. Import `cn` from `@/lib/cn` so class merging respects the theme's line-height rules.
- Use concise JSDoc for major functions and meaningful behavior. Avoid comments that repeat types or obvious code. Do not use em dashes.
- Follow Biome formatting: two-space indentation and double quotes. Pin dependency versions and use npm with the committed lockfile.

## Verification and collaboration

- Run `npm run check` for lint, types, tests, and the production build. Use focused checks for comment-only changes.
- Put tests in `__test__` beside the module they cover; shared factories and setup belong in `src/__test__`. Mock providers in unit tests.
- Use live evaluations when assessing research quality. They incur provider charges. Review claims against cited passages as well as gold-set scores; automated scoring does not establish truth.
- Other agents may edit this tree concurrently. Inspect the diff before editing or staging, and preserve unrelated changes. Do not overwrite `.env.local` or stop another agent's dev server.
- Keep durable documentation in `README.md`, `AGENTS.md`, and the `CLAUDE.md` pointer. Keep temporary reports in ignored `artifacts/` or `tmp/`.

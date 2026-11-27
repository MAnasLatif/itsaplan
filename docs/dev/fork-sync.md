# Syncing the fork with upstream

This repository is our fork of `croffasia/itsaplan`, deployed on Cloudflare Workers at
`plan.anaslatif.dev` (`docs/cloudflare.md`). A sync brings in upstream's fixes and features and
keeps every change listed below. Nothing goes back to upstream.

## Steps

1. Start from an up-to-date `main` and a branch of its own:

   ```bash
   git switch main && git pull --ff-only origin main
   git fetch upstream
   git switch -c sync/upstream-$(date +%Y-%m-%d)
   git merge upstream/main
   ```

2. Resolve each conflict by keeping the fork's change and adding upstream's on top of it. When
   upstream code uses something this fork replaced (the table below), port it to the replacement
   instead of bringing the old dependency back.
3. Check upstream's new code against the Workers rules in the root `AGENTS.md`: no Bun APIs in the
   api, the worker and the packages they import, and no I/O, timer or `db` query at module scope.
   A supplied URL is fetched through `@repo/net`.
4. Run `bun install`, `bun run typecheck`, `bun run lint`, `bun run format:check` and
   `bun run test`.
5. Check that each Worker still deploys:
   - `cd apps/api && bunx wrangler deploy --dry-run` stays under 10 MB compressed. A real deploy
     also fails when startup takes too much CPU: a heavy new dependency at module scope is the
     usual cause.
   - `bun --filter='web' run build:vinext` builds. A new client-only viewer loaded with
     `next/dynamic` and `ssr: false` needs its entry in `CLIENT_ONLY` in `apps/web/vite.config.ts`.
6. Apply upstream's new migrations to the production database before deploying, as in
   `docs/cloudflare.md`, then deploy the api, the worker and the web.
7. Push as the root `AGENTS.md` says: a PR on `MAnasLatif/itsaplan`, squash-merged.

## What this fork added

| Change | Files |
| --- | --- |
| Cloudflare Workers deploy of api, worker and web | `apps/api/src/worker.ts`, `apps/api/wrangler.jsonc`, `apps/worker/src/cloudflare.ts`, `apps/worker/wrangler.jsonc`, `apps/web/cloudflare.config.ts`, `apps/web/vite.config.ts`, `apps/web/wrangler.deploy.jsonc`, `docs/cloudflare.md` |
| One database client per request on Workers | `packages/db/src/client.ts` (`runWithDb`) |
| SSRF guard path for Workers | `packages/net/src/index.ts` (`workersFetch`) |
| Cloudflare Email Service as a mail provider | `packages/mailer/src/index.ts`, `packages/db/src/domains/instance-email.ts` |
| Cron passes for the api jobs and the worker loops | `apps/api/src/background.ts` (`runScheduledJobs`), `apps/worker/src/poll-loop.ts` (`runPollLoopUntil`) |
| better-auth gets an unread copy of the request | `apps/api/src/shared/unread-request.ts`, the `/api/auth/*` route in `apps/api/src/app.ts` |
| Redirect refusal for the web's server-side reads | `apps/web/src/utils/fetchWithoutRedirect.ts` |
| OpenAPI document workaround | `prepareRoutesForOpenApi` in `apps/api/src/openapi.ts` |
| Fork rules | the "This fork" section of the root `AGENTS.md`, this file |

## What this fork replaced or removed

| Upstream has | This fork has | Why |
| --- | --- | --- |
| `@firecrawl/pdf-inspector` | `unpdf` through `extractPdfText` in `packages/agent-tools`, PDFs stored as `.txt` | a native binary does not run on Workers |
| `jsdom` in the api | `linkedom` in `apps/api/src/modules/documents/collaboration.ts` | jsdom reads files at load |
| `@elysiajs/swagger` | `@elysiajs/openapi` | swagger builds a `Response` at load |
| Elysia code generation everywhere | `aot: false` on Workers (`apps/api/src/app.ts`) | the startup CPU limit |
| Mastra in every build | `apps/api/src/cloudflare/mastra.ts` in the Worker build (`alias` in `apps/api/wrangler.jsonc`) | the startup CPU limit; internal agents do not run on Workers yet |
| `Bun.file` for MIME types in the worker | `mime-types` | no Bun on Workers |
| telemetry from every worker | no telemetry from Workers (`apps/worker/src/telemetry.ts`) | the collector refuses a Workers runtime |
| Telegram bot | not deployed; its code stays | we do not use it |
| "Upgrade to Pro" button at the bottom of the app sidebar | `apps/web/src/ce/SidebarFooterAction.tsx` renders nothing | we do not want it |
| Pro previews of agent workflows and forms in the project sections | `apps/web/src/ce/useProjectSettingsSections.ts` returns the core sections only; the preview components stay unused | they cannot be turned on here |
| The product name "It's a Plan" | "It's Anas Plan" in every string people see: the web (`APP_NAME`, messages in every language, manifest, `public/sw.js`, the sidebar footer), the email texts in `packages/mailer`, the API docs title, the MCP title and instructions, the passkey name. Identifiers keep `itsaplan`: package and Worker names, cookies, `X-Itsaplan-*` headers, the `itp_` key prefix, the MCP `name`. After a sync, search for `It's a Plan` and replace new strings too | our own instance |

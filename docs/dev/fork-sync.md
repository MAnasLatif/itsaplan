# Syncing the fork with upstream

This repository is our fork of `croffasia/itsaplan`, run as our own instance. A sync brings in
upstream's fixes and features and keeps every change listed below. Nothing goes back to upstream.

## Steps

1. Start from an up-to-date `main` and a branch of its own:

   ```bash
   git switch main && git pull --ff-only origin main
   git fetch upstream
   git switch -c sync/upstream-$(date +%Y-%m-%d)
   git merge upstream/main
   ```

2. Resolve each conflict by keeping the fork's change and adding upstream's on top of it. A
   removed feature stays removed, also when upstream changes it.
3. Search for `It's a Plan` and rename every new string people see (below).
4. Run `bun install`, `bun run typecheck`, `bun run lint`, `bun run format:check` and
   `bun run test`.
5. Apply upstream's new migrations as `docs/dev/deploy-stack.md` describes.
6. Push as the root `AGENTS.md` says: a PR on `MAnasLatif/itsaplan`, squash-merged.

## What this fork changed

| Change | Where |
| --- | --- |
| The product is named "It's Anas Plan" in every string people see | the web (`APP_NAME` in `apps/web/src/utils/app.ts`, messages in every language, `apps/web/src/app/manifest.ts`, `apps/web/public/sw.js`, `apps/web/src/components/brand/SidebarBrandFooter.tsx`), the email texts in `packages/mailer`, the API docs title, the MCP title and instructions, the passkey name. Identifiers keep `itsaplan`: package names, cookies, `X-Itsaplan-*` headers, the `itp_` key prefix, the MCP `name` |
| No "Upgrade to Pro" button at the bottom of the app sidebar | `apps/web/src/ce/SidebarFooterAction.tsx` renders nothing |
| No Pro previews of agent workflows and forms in the project sections | `apps/web/src/ce/useProjectSettingsSections.ts` returns the core sections only; the preview components stay unused |
| Fork rules | the "This fork" section of the root `AGENTS.md`, this file |

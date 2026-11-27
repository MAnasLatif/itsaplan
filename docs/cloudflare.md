# Deploy on Cloudflare Workers

The api, the web and the worker run as three Workers on one hostname. Postgres stays your own
database, reached through Hyperdrive. Mail goes out through Cloudflare Email Service. The
Telegram bot does not run on Workers: it uses long polling, which needs a process that stays up.

| Part      | Worker            | Started by                                 |
| --------- | ----------------- | ------------------------------------------ |
| web       | `itsaplan-web`    | the route `<host>/*`                       |
| api       | `itsaplan-api`    | the routes `<host>/api/*` and three `/.well-known/` paths, plus a Cron Trigger every minute for the sweeps and the agent invocations |
| worker    | `itsaplan-worker` | a Cron Trigger every minute                |

The api has `API_URL=https://<host>/api`. Cloudflare sends `/api/*` to it with the prefix on, and
`apps/api/src/worker.ts` removes the prefix, as the reverse proxy of
[self-hosting](self-hosting.md#where-the-api-lives) does. The session cookie stays on the one host.

The worker's Cron Trigger fires once a minute, and each of its loops (webhook and notification
delivery, agent schedules, imports) ticks at its interval from the job settings for 55 seconds.
Postgres stays the queue: claims hold a lease, so a pass that overlaps the next one takes other
rows.

## What you need

- The **Workers Paid** plan. The api Worker is about 5 MB compressed; the free plan allows 3 MB.
- A domain on Cloudflare, in the same account as the Workers.
- A Postgres 15 or newer that accepts TLS connections from the internet.
- Wrangler logged in to that account: `cd apps/api && bunx wrangler login`, then
  `bunx wrangler whoami` lists it.

## 1. Point the config at your account and host

Three files carry the values of one instance. Replace the account id, the host and the zone:

- `apps/api/wrangler.jsonc`: `account_id`, `routes`, `vars`
- `apps/worker/wrangler.jsonc`: `account_id`, `vars`
- `apps/web/wrangler.deploy.jsonc`: `account_id`, `routes`, `vars`

`EMAIL_FROM` must be an address on a domain that has Email Sending (step 3).
`CLIENT_IP_HEADER` stays `cf-connecting-ip`: Cloudflare sets it at its edge, so a client cannot
forge the address the sign-in rate limit counts.

## 2. Create the database link

Apply the migrations to the empty database from your machine. On an empty database there is
nothing to back up first:

```bash
SKIP_PRE_MIGRATION_BACKUP=1 DATABASE_URL='postgres://…' bun packages/db/src/migrate.ts
```

Create the Hyperdrive config with its query cache off. The cache would answer a read up to a
minute old, so a change would not show on the next refetch:

```bash
cd apps/api
bunx wrangler hyperdrive create itsaplan --connection-string='postgres://…' --caching-disabled
```

Put the id it prints into the `hyperdrive` block of `apps/api/wrangler.jsonc` and
`apps/worker/wrangler.jsonc`. Run the migrations the same way before each upgrade.

## 3. Turn on Email Sending and DNS

In the dashboard, **Email** > **Email Sending**, add the host (or another domain of the zone).
Cloudflare adds the MX, SPF, DKIM and DMARC records. Then add a DNS record for the host so the
routes can serve it: `AAAA <host> 100::`, proxied.

With the `send_email` binding present, mail goes out through Email Service whenever god mode has
no SMTP or Resend provider saved. A team's own SMTP or Resend still sends that team's mail.

## 4. Set the secrets

Generate both once and keep a copy: without `APP_ENCRYPTION_KEY` the stored credentials cannot be
decrypted. The api and the worker need the same values.

```bash
printf 'BETTER_AUTH_SECRET=%s\nAPP_ENCRYPTION_KEY=%s\n' \
  "$(openssl rand -base64 32)" "$(openssl rand -base64 32)" > .env.cloudflare.local
(cd apps/api && bunx wrangler secret bulk ../../.env.cloudflare.local)
(cd apps/worker && bunx wrangler secret bulk ../../.env.cloudflare.local)
```

`.env.cloudflare.local` is ignored by git.

## 5. Deploy

```bash
bun --filter='api' run deploy:cloudflare
bun --filter='worker' run deploy:cloudflare
bun --filter='web' run deploy:cloudflare
```

The web builds with vinext (`apps/web/vite.config.ts`) and deploys with Wrangler. `next build`
and the Docker image are unchanged. The web reads the api through its `workers.dev` address
(`SERVICE_URL_API` in `apps/web/wrangler.deploy.jsonc`): a Worker's fetch to another Worker's
route on the same zone does not reach that Worker.

A new Cron Trigger can take up to 15 minutes to fire for the first time.

## 6. Sign up

The first account to sign up becomes the instance owner. Open `https://<host>`, sign up, and send
a test mail from god mode (**Email**).

## Known limits

- **Attachments, avatars and document images** need object storage. Turn on R2, create a bucket
  and an R2 API token, and set `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION=auto`, `S3_ACCESS_KEY_ID`
  and `S3_SECRET_ACCESS_KEY` on the api and the worker. Until then uploads fail.
- **Internal AI agents** run with Mastra, whose Postgres store keeps a pool of its own. That pool
  is not made per request yet, so their runs are not drained on Workers. External agents with an
  invocation URL are sent their work by the api's Cron Trigger.
- **Telemetry** is not sent from Workers: the snapshot describes a Bun runtime
  ([TELEMETRY.md](../TELEMETRY.md)).
- **Web push** needs a VAPID key pair (`bun run web-push:keys`) set on the worker.
- **PDF attachments** are read with `unpdf` as plain text. Headings and tables are not kept.
- The api runs Elysia without code generation (`aot: false`), because Workers allow it only while
  the script loads, and compiling every route then would pass the startup CPU limit.

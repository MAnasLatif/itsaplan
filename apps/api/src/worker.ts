import { runWithDb } from '@repo/db';
import { setCloudflareEmail, type CloudflareEmailBinding } from '@repo/mailer';
import { app } from './app';
import { runScheduledJobs } from './background';
import { keepUnreadCopy } from './shared/unread-request';

// The api on Cloudflare Workers. index.ts stays the entry for Bun and Docker.
interface Env {
  HYPERDRIVE: { connectionString: string };
  EMAIL?: CloudflareEmailBinding;
}

// With API_URL on a path of the web's host (https://plan.example.com/api), the Worker
// route sends that path here with the prefix still on. The api serves its routes from
// the root, as behind the reverse proxy of docs/self-hosting.md, so the prefix comes off.
// A request through workers.dev or the OAuth discovery routes carries no prefix.
const prefix = new URL(process.env.API_URL ?? 'http://localhost').pathname.replace(/\/+$/, '');

function withoutPrefix(request: Request): Request {
  if (!prefix) return request;
  const url = new URL(request.url);
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return request;
  url.pathname = url.pathname.slice(prefix.length) || '/';
  return new Request(url, request);
}

// better-auth reads the body itself; see shared/unread-request.ts.
function forApp(request: Request): Request {
  const stripped = withoutPrefix(request);
  return new URL(stripped.url).pathname.startsWith('/api/auth/')
    ? keepUnreadCopy(stripped)
    : stripped;
}

export default {
  fetch(request: Request, env: Env) {
    setCloudflareEmail(env.EMAIL);
    return runWithDb(env.HYPERDRIVE.connectionString, () => app.fetch(forApp(request)));
  },
  scheduled(
    controller: { scheduledTime: number },
    env: Env,
    ctx: { waitUntil(p: Promise<unknown>): void },
  ) {
    setCloudflareEmail(env.EMAIL);
    ctx.waitUntil(
      runWithDb(env.HYPERDRIVE.connectionString, () => runScheduledJobs(controller.scheduledTime)),
    );
  },
};

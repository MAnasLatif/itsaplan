import { runWithDb } from '@repo/db';
import { setCloudflareEmail, type CloudflareEmailBinding } from '@repo/mailer';
import { scheduleLoop } from './agent-worker';
import { importLoop } from './import-worker';
import { runPollLoopUntil } from './poll-loop';
import { deliveryLoop } from './worker';

// The worker on Cloudflare Workers. A Cron Trigger fires once a minute and each loop
// ticks until shortly before the next trigger. index.ts stays the entry for Bun and Docker.
interface Env {
  HYPERDRIVE: { connectionString: string };
  EMAIL?: CloudflareEmailBinding;
}

// Leaves a few seconds before the next trigger, so two passes of a loop rarely overlap.
const PASS_MS = 55_000;

export default {
  scheduled(
    controller: { scheduledTime: number },
    env: Env,
    ctx: { waitUntil(p: Promise<unknown>): void },
  ) {
    setCloudflareEmail(env.EMAIL);
    const until = controller.scheduledTime + PASS_MS;
    ctx.waitUntil(
      runWithDb(env.HYPERDRIVE.connectionString, () =>
        Promise.all(
          [deliveryLoop, scheduleLoop, importLoop].map((loop) => runPollLoopUntil(loop, until)),
        ),
      ),
    );
  },
};

import { getJobSettings, type JobSettings } from '@repo/db';
import { processAgentRuns } from '#modules/agents/core/run-poller';
import { dispatchInvocations } from '#modules/agents/invocation/service';
import { pruneAgentTraces } from '#modules/agents/core/runtime/trace-retention';
import { sweepStaleIssues } from '#modules/issues/auto-archive';
import { sweepExpiredShares } from '#modules/share/service';

// The api's background jobs, started by index.ts rather than assembled into the app,
// so importing the app in a test starts nothing. Several api replicas run them without
// overlapping: the queue is claimed with FOR UPDATE SKIP LOCKED, the archive sweep only
// touches rows it has not archived yet, and the trace sweep deletes whatever is still
// past the window.

// Each job gets a loop of its own. A run is an LLM call of minutes and a first sweep
// can carry thousands of issues, so sharing one loop would let either hold the other
// back for that long.
export function startBackgroundJobs(): void {
  startLoop('agent-runs', runAgents, (jobs) => jobs.agentRuns.pollIntervalMs);
  // An external agent with an invocation URL is sent its work from a loop of its own, so
  // a slow endpoint holds back neither the runs of internal agents nor the other way.
  startLoop('agent-invocations', sendInvocations, (jobs) => jobs.agentInvocations.pollIntervalMs);
  // Archiving is not time-sensitive, so the sweep runs far less often than the queue
  // is drained.
  startLoop('auto-archive', autoArchive, (jobs) => minutes(jobs.sweeps.autoArchiveMinutes));
  // An expired link already reads as revoked everywhere, so the sweep only tidies the
  // token away; once a minute keeps the stored state close to what users see.
  startLoop('share-expiry', expireShares, (jobs) => minutes(jobs.sweeps.shareExpiryMinutes));
  startLoop('agent-traces', pruneTraces, (jobs) => minutes(jobs.sweeps.tracePruneMinutes));
}

// The jobs on Cloudflare Workers, where a Cron Trigger fires once a minute in place of the
// loops. A sweep runs on each minute that is a multiple of its interval, so a change in god
// mode applies from the next minute without any stored state. Agent invocations are sent at
// their interval for most of the minute. Agent runs are not drained here: internal agents do
// not run on Workers yet (docs/cloudflare.md).
export async function runScheduledJobs(scheduledTime: number): Promise<void> {
  await Promise.all([
    runScheduledSweeps(scheduledTime),
    sendInvocationsUntil(scheduledTime + PASS_MS),
  ]);
}

// Leaves a few seconds before the next trigger, so two passes rarely overlap.
const PASS_MS = 55_000;

async function runScheduledSweeps(scheduledTime: number): Promise<void> {
  const { sweeps } = await getJobSettings();
  const minute = Math.floor(scheduledTime / 60_000);
  const jobs: [string, () => Promise<void>, number][] = [
    ['auto-archive', autoArchive, sweeps.autoArchiveMinutes],
    ['share-expiry', expireShares, sweeps.shareExpiryMinutes],
    ['agent-traces', pruneTraces, sweeps.tracePruneMinutes],
  ];
  await Promise.all(
    jobs
      .filter(([, , every]) => minute % every === 0)
      .map(([name, job]) =>
        job().catch((error: unknown) => console.error(`[background] ${name} failed:`, error)),
      ),
  );
}

// Awaited, unlike sendInvocations: the pass has to outlast its sends. An agent still being
// sent its work is skipped by the next dispatch, so a slow endpoint holds back no other.
async function sendInvocationsUntil(until: number): Promise<void> {
  while (Date.now() < until) {
    await dispatchInvocations().catch((error: unknown) =>
      console.error('[background] agent-invocations failed:', error),
    );
    const delay = await nextDelay(
      'agent-invocations',
      (jobs) => jobs.agentInvocations.pollIntervalMs,
    );
    const wait = Math.min(delay, until - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

function minutes(value: number): number {
  return value * 60_000;
}

async function autoArchive(): Promise<void> {
  const archived = await sweepStaleIssues();
  if (archived > 0) console.log(`[background] auto-archived ${archived} stale issues`);
}

async function expireShares(): Promise<void> {
  const revoked = await sweepExpiredShares();
  if (revoked > 0) console.log(`[background] revoked ${revoked} expired share links`);
}

// Not awaited: a slot that frees is filled on the next tick, not once the slowest run
// claimed beside it ends. The claim counts the runs still in flight.
async function runAgents(): Promise<void> {
  void processAgentRuns().catch((error: unknown) =>
    console.error('[background] agent-runs failed:', error),
  );
}

// Not awaited: the next tick does not wait for a slow endpoint, so the other agents are
// sent their work meanwhile.
async function sendInvocations(): Promise<void> {
  void dispatchInvocations().catch((error: unknown) =>
    console.error('[background] agent-invocations failed:', error),
  );
}

async function pruneTraces(): Promise<void> {
  const deleted = await pruneAgentTraces();
  if (deleted > 0) console.log(`[background] pruned ${deleted} agent trace spans`);
}

// How soon a loop tries again when the job settings could not be read.
const SETTINGS_RETRY_MS = 5000;

// The interval is read from the job settings after every pass, so a change in god mode
// applies from the next one.
function startLoop(
  name: string,
  job: () => Promise<void>,
  intervalMs: (jobs: JobSettings) => number,
): void {
  const tick = async () => {
    try {
      await job();
    } catch (error) {
      console.error(`[background] ${name} failed:`, error);
    }
    setTimeout(tick, await nextDelay(name, intervalMs)).unref();
  };
  void tick();
}

async function nextDelay(name: string, intervalMs: (jobs: JobSettings) => number): Promise<number> {
  try {
    return intervalMs(await getJobSettings());
  } catch (error) {
    console.error(`[background] ${name} could not read the job settings:`, error);
    return SETTINGS_RETRY_MS;
  }
}

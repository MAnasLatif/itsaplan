import { getJobSettings, type JobSettings } from '@repo/db';

// How soon a loop tries again when the job settings could not be read.
const SETTINGS_RETRY_MS = 5000;

export interface WorkerHandle {
  stop: () => void;
}

// One of the worker's loops: a tick and the job setting that spaces the ticks.
export interface PollLoop {
  name: string;
  tick: () => Promise<void>;
  intervalMs: (jobs: JobSettings) => number;
}

// Runs one tick and returns how long to wait before the next. The interval is read from
// the job settings after each tick, so a change in god mode applies from the next one.
async function step(loop: PollLoop): Promise<number> {
  try {
    await loop.tick();
  } catch (error) {
    console.error(`[${loop.name}] tick failed:`, error);
  }
  return getJobSettings().then(loop.intervalMs, (error: unknown) => {
    console.error(`[${loop.name}] could not read the job settings:`, error);
    return SETTINGS_RETRY_MS;
  });
}

// Runs the loop and returns a handle to stop it. The loop reschedules itself after each
// tick (recursive setTimeout, not setInterval) so ticks never overlap when one runs long.
export function startPollLoop(loop: PollLoop): WorkerHandle {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function next(): Promise<void> {
    if (stopped) return;
    const delay = await step(loop);
    if (stopped) return;
    timer = setTimeout(next, delay);
  }

  void next();

  return {
    stop(): void {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

// The same loop on Cloudflare Workers, where a Cron Trigger starts it once a minute: it
// ticks until `until` (a timestamp) and returns, and the next trigger carries on. A tick
// still running at the deadline finishes first; claims hold a lease, so a tick of the
// next trigger that overlaps it takes other rows.
export async function runPollLoopUntil(loop: PollLoop, until: number): Promise<void> {
  while (Date.now() < until) {
    const delay = await step(loop);
    const wait = Math.min(delay, until - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

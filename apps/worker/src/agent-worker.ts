import { enqueueDueSchedules } from './schedules';
import { startPollLoop, type PollLoop, type WorkerHandle } from './poll-loop';

// Queues the runs of due agent schedules. Running them is the api's: the agent runtime
// and the model credentials live there, and it drains the queue itself.
export const scheduleLoop: PollLoop = {
  name: 'agent-worker',
  tick: enqueueDueSchedules,
  intervalMs: (jobs) => jobs.agentRuns.pollIntervalMs,
};

export function startAgentWorker(): WorkerHandle {
  return startPollLoop(scheduleLoop);
}

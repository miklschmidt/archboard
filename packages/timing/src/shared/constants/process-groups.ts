// The cadence every owner of a killed process group observes it at until it is gone.

import { durations } from "#shared/constants/durations.ts";

/** Observing a process group until it is gone. */
const PROCESS_GROUP_MS = durations({
	/** Observation cadence while proving a killed process group is absent. */
	poll: 10,
});

/**
 * How often an owner of a killed process group looks again to see whether it is gone.
 * @returns The cadence, in milliseconds.
 */
function processGroupPollMs(): number {
	return PROCESS_GROUP_MS.poll;
}

export { processGroupPollMs, PROCESS_GROUP_MS };

// The cadence every owner of a killed process group observes it at until it is gone.

import { durations } from "#shared/constants/durations.ts";

/** Observing a process group until it is gone. */
const PROCESS_GROUP_MS = durations({
	/** Observation cadence while proving a killed process group is absent. */
	poll: 10,
});

export { PROCESS_GROUP_MS };

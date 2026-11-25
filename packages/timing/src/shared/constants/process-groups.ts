// The cadence every owner of a killed process group observes it at until it is gone.

/** Observation cadence while proving a killed process group is absent. */
const PROCESS_GROUP_OBSERVATION_POLL_MS = 10;

/**
 * How often an owner of a killed process group looks again to see whether it is gone.
 * @returns The cadence, in milliseconds.
 */
function processGroupPollMs(): number {
	return PROCESS_GROUP_OBSERVATION_POLL_MS;
}

export { processGroupPollMs };

type LinuxProcessState = "live" | "stopped" | "zombie";

interface LinuxProcessObservation {
	readonly pid: number;
	readonly parentPid: number;
	readonly pgid: number;
	readonly state: LinuxProcessState;
	readonly startTime: string;
}

/**
 * Validate the related process identifiers in an observation.
 * @param parentPid The parent id, where zero names no parent.
 * @param pgid The process group id, where Linux kernel threads can report zero.
 * @returns True when both values can have come from the kernel.
 */
function validParentAndGroup(parentPid: number, pgid: number): boolean {
	return (
		Number.isSafeInteger(parentPid) && parentPid >= 0 && Number.isSafeInteger(pgid) && pgid >= 0
	);
}

/**
 * Normalize the Linux one-letter state used by ownership callers.
 * @param state The procfs state letter.
 * @returns Whether the process is live, stopped, or dead.
 */
function normalizedLinuxState(state: string): LinuxProcessState {
	if (state === "Z" || state === "X") return "zombie";
	if (state === "T" || state === "t") return "stopped";
	return "live";
}

/**
 * Whether a record describes a dead task the kernel has already detached from
 * its parent, group and session. release_task prints such a task in state X
 * with group -1, and its /proc entry is gone a moment later: it is a process
 * that has vanished, not a malformed record.
 * @param rawState The procfs state letter.
 * @param pgid The decoded process group field.
 * @returns True when the task is being released.
 */
function beingReleased(rawState: string | undefined, pgid: number): boolean {
	return rawState === "X" && pgid === -1;
}

/**
 * Parse one Linux procfs stat record into the shared process shape.
 * @param pid The process the record describes.
 * @param text The raw procfs stat record.
 * @returns The normalized process observation, or undefined for a task the kernel is releasing.
 */
function parseLinuxProcessStat(pid: number, text: string): LinuxProcessObservation | undefined {
	const closingName = text.lastIndexOf(")");
	if (closingName < 0) {
		throw new Error(`Malformed process stat for pid ${pid}.`);
	}
	const fields = text
		.slice(closingName + 2)
		.trim()
		.split(/\s+/u);
	const rawState = fields[0];
	const parentPid = Number(fields[1]);
	const pgid = Number(fields[2]);
	const startTime = fields[19];
	if (beingReleased(rawState, pgid)) return undefined;
	if (!rawState || !validParentAndGroup(parentPid, pgid) || !startTime) {
		throw new Error(`Incomplete process stat for pid ${pid}.`);
	}
	return Object.freeze({
		pid,
		parentPid,
		pgid,
		state: normalizedLinuxState(rawState),
		startTime: `linux:${startTime}`,
	});
}

export { parseLinuxProcessStat };

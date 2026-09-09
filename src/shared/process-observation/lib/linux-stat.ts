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
 * Parse one Linux procfs stat record into the shared process shape.
 * @param pid The process the record describes.
 * @param text The raw procfs stat record.
 * @returns The normalized process observation.
 */
function parseLinuxProcessStat(pid: number, text: string): LinuxProcessObservation {
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

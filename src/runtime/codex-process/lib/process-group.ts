import { errnoCode } from "@/runtime/codex-process/lib/errno-code";
import {
	listProcessGroupObservations,
	readProcessObservation,
	type ProcessObservation,
} from "@/shared/process-observation";

type CodexProcessGroupSignal = "SIGTERM" | "SIGKILL";
type CodexProcessGroupInspection = "quiescent" | "owned" | "reused" | "unproven";

interface CodexProcessGroupIdentity {
	readonly leaderPid: number;
	readonly pgid: number;
	readonly leaderStartTime: string;
}

interface CodexProcessGroupOperations {
	readonly capture: (leaderPid: number) => CodexProcessGroupIdentity;
	readonly inspect: (identity: CodexProcessGroupIdentity) => CodexProcessGroupInspection;
	readonly signal: (identity: CodexProcessGroupIdentity, signal: CodexProcessGroupSignal) => void;
}

type CodexProcessGroupFailureCode = "capture_failed" | "unproven" | "reused" | "signal_failed";

class CodexProcessGroupError extends Error {
	readonly code: CodexProcessGroupFailureCode;

	/**
	 * Name why the process group could not be captured, proved or signalled.
	 * @param code - The failure classification.
	 * @param message - The human-readable reason.
	 */
	constructor(code: CodexProcessGroupFailureCode, message: string) {
		super(message);
		this.name = "CodexProcessGroupError";
		this.code = code;
	}
}

/**
 * Decide whether a number can name a live process.
 * @param pid - The candidate process id.
 * @returns True for a positive safe integer.
 */
function positivePid(pid: number): boolean {
	return Number.isSafeInteger(pid) && pid > 0;
}

/**
 * Prove that a freshly spawned child leads its own process group and record
 * the identity that later inspections compare against.
 * @param leaderPid - The spawned child's pid.
 * @returns The frozen group identity.
 */
function capture(leaderPid: number): CodexProcessGroupIdentity {
	if (!positivePid(leaderPid)) {
		throw new CodexProcessGroupError(
			"capture_failed",
			"Could not prove a dedicated Codex process group on this platform.",
		);
	}
	let stat: ProcessObservation | undefined;
	try {
		stat = readProcessObservation(leaderPid);
	} catch {
		throw new CodexProcessGroupError(
			"capture_failed",
			"Could not inspect the Codex child process group after spawn.",
		);
	}
	if (!stat || stat.pgid !== leaderPid) {
		throw new CodexProcessGroupError(
			"capture_failed",
			"The Codex child is not the leader of its own dedicated process group.",
		);
	}
	return Object.freeze({
		leaderPid,
		pgid: stat.pgid,
		leaderStartTime: stat.startTime,
	});
}

/**
 * Decide whether an identity is well-formed enough to be inspected at all.
 * @param identity - The captured identity.
 * @returns True when every field could describe an owned POSIX group.
 */
function isInspectable(identity: CodexProcessGroupIdentity): boolean {
	return (
		positivePid(identity.leaderPid) &&
		positivePid(identity.pgid) &&
		identity.pgid === identity.leaderPid &&
		identity.leaderStartTime.length > 0
	);
}

/**
 * Decide whether the leader pid now names a different process than the one
 * captured, in which case the group must never be signalled.
 * @param identity - The captured identity.
 * @param leader - The process currently using the leader pid, when any.
 * @returns "reused" when the leader was replaced, "unproven" when it cannot be read, otherwise undefined.
 */
function leaderVerdict(
	identity: CodexProcessGroupIdentity,
	leader: ProcessObservation | undefined,
): "reused" | undefined {
	if (leader && (leader.startTime !== identity.leaderStartTime || leader.pgid !== identity.pgid)) {
		return "reused";
	}
	return undefined;
}

/**
 * Decide whether a process counts as a live member of the group.
 * @param stat - The process stat.
 * @param pgid - The owned group id.
 * @returns True when the process is in the group and not a zombie or dead.
 */
function isLiveMember(stat: ProcessObservation, pgid: number): boolean {
	return stat.pgid === pgid && stat.state !== "zombie";
}

/**
 * What one scanned process contributes to the member count: one when it is a live member of
 * the owned group, zero when it is not, or the verdict that stops the whole scan.
 * @param identity - The captured identity.
 * @param stat - The process to inspect.
 * @returns The contribution, or a verdict that ends the scan.
 */
function memberVerdict(
	identity: CodexProcessGroupIdentity,
	stat: ProcessObservation,
): 0 | 1 | "reused" {
	const pid = stat.pid;
	if (pid === identity.leaderPid && stat.startTime !== identity.leaderStartTime) return "reused";
	return isLiveMember(stat, identity.pgid) ? 1 : 0;
}

/**
 * Count live members of the owned group by scanning every process, refusing
 * as soon as the leader identity is seen to have been reused.
 * @param identity - The captured identity.
 * @param processes - The processes to scan.
 * @returns The live member count, or a verdict that stops the scan.
 */
function countMembers(
	identity: CodexProcessGroupIdentity,
	processes: readonly ProcessObservation[],
): number | "reused" {
	let memberCount = 0;
	for (const process of processes) {
		const verdict = memberVerdict(identity, process);
		if (typeof verdict === "string") return verdict;
		memberCount += verdict;
	}
	return memberCount;
}

/**
 * Classify the owned process group: quiescent, still owned, reused by an
 * unrelated process, or impossible to prove.
 * @param identity - The identity captured at spawn.
 * @returns The inspection verdict.
 */
function inspect(identity: CodexProcessGroupIdentity): CodexProcessGroupInspection {
	if (!isInspectable(identity)) return "unproven";
	let processes: readonly ProcessObservation[];
	let leader: ProcessObservation | undefined;
	try {
		leader = readProcessObservation(identity.leaderPid);
		processes = listProcessGroupObservations(identity.pgid);
	} catch {
		return "unproven";
	}
	const verdict = leaderVerdict(identity, leader);
	if (verdict !== undefined) return verdict;
	const members = countMembers(identity, processes);
	if (typeof members !== "number") return members;
	return members === 0 ? "quiescent" : "owned";
}

/**
 * Refuse to signal a group unless it is proven owned; quiescent groups need
 * no signal at all.
 * @param status - The current inspection verdict.
 * @param reusedMessage - The message for a reused leader.
 * @param unprovenMessage - The message for an unprovable group.
 * @returns True when the signal must be sent, false when nothing remains to signal.
 */
function requireOwned(
	status: CodexProcessGroupInspection,
	reusedMessage: string,
	unprovenMessage: string,
): boolean {
	if (status === "quiescent") return false;
	if (status === "reused") throw new CodexProcessGroupError("reused", reusedMessage);
	if (status === "unproven") throw new CodexProcessGroupError("unproven", unprovenMessage);
	return true;
}

/**
 * Send a signal to the whole owned group, re-proving ownership first and
 * again if the kernel reports no such group.
 * @param identity - The identity captured at spawn.
 * @param requested - The signal to deliver.
 */
function signal(identity: CodexProcessGroupIdentity, requested: CodexProcessGroupSignal): void {
	if (
		!requireOwned(
			inspect(identity),
			"Refusing to signal a process group whose leader identity was reused.",
			"Refusing to signal a process group whose ownership could not be proved.",
		)
	)
		return;
	try {
		process.kill(-identity.pgid, requested);
	} catch (cause) {
		if (
			errnoCode(cause) === "ESRCH" &&
			!requireOwned(
				inspect(identity),
				"The Codex process group changed while it was being signalled.",
				"The Codex process group could not be re-proven after signalling.",
			)
		)
			return;
		throw new CodexProcessGroupError(
			"signal_failed",
			`Could not send ${requested} to the owned Codex process group.`,
		);
	}
}

/**
 * Bind the supported POSIX process-observation operations for the process owner.
 * @returns The frozen capture, inspect and signal operations.
 */
function createCodexProcessGroupOperations(): CodexProcessGroupOperations {
	return Object.freeze({ capture, inspect, signal });
}

export {
	type CodexProcessGroupSignal,
	type CodexProcessGroupInspection,
	type CodexProcessGroupIdentity,
	type CodexProcessGroupOperations,
	type CodexProcessGroupFailureCode,
	CodexProcessGroupError,
	createCodexProcessGroupOperations,
};

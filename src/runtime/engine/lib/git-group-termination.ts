import type { Subprocess } from "bun";

import {
	ownedProcessGroupMembers,
	signalOwnedProcessGroup,
	type ProcessGroupIdentity,
} from "@/runtime/engine/process-group";
import { readProcessObservation, type ProcessObservation } from "@/shared/process-observation";
import { GIT_PROCESS_GROUP_CLEANUP_MS, GIT_PROCESS_GROUP_POLL_MS } from "@/shared/timing/timing";

type KillableProcess = Pick<Subprocess, "kill">;
type CapturedMembers = Map<number, ProcessObservation>;

/** Injectable process operations for deterministic cleanup-failure coverage. */
interface GitGroupTerminationOperations {
	readonly now: () => number;
	readonly wait: (ms: number) => Promise<void>;
	readonly members: (group: ProcessGroupIdentity) => readonly ProcessObservation[];
	readonly signalGroup: (group: ProcessGroupIdentity, signal: NodeJS.Signals) => boolean;
	readonly readProcess: (pid: number) => ProcessObservation | undefined;
	readonly signalPid: (pid: number, signal: NodeJS.Signals) => void;
}

/** Production process observation, signalling, clock, and wait operations. */
const productionOperations: GitGroupTerminationOperations = {
	now: Date.now,
	/**
	 * Wait for the next bounded group observation.
	 * @param ms The polling interval.
	 * @returns A promise settled after the interval.
	 */
	wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	members: ownedProcessGroupMembers,
	signalGroup: signalOwnedProcessGroup,
	readProcess: readProcessObservation,
	/**
	 * Signal one exact process during recovery.
	 * @param pid The exact process id.
	 * @param signal The recovery signal.
	 */
	signalPid: (pid, signal) => {
		process.kill(pid, signal);
	},
};

/**
 * Retain the latest exact identity observed for every member we stop.
 * @param captured The identities retained for recovery.
 * @param members The latest complete group census.
 */
function rememberMembers(captured: CapturedMembers, members: readonly ProcessObservation[]): void {
	for (const member of members) {
		captured.set(member.pid, member);
	}
}

/**
 * Whether a current process is the captured stopped group member.
 * @param current The process currently using the pid, if any.
 * @param member The exact process captured before or during the barrier.
 * @param group The group it must still occupy.
 * @returns True only while pid birth, group, and stopped state all match.
 */
function isMatchingStoppedMember(
	current: ProcessObservation | undefined,
	member: ProcessObservation,
	group: ProcessGroupIdentity,
): current is ProcessObservation {
	return (
		current?.startTime === member.startTime &&
		current.pgid === group.group &&
		current.state === "stopped"
	);
}

/**
 * Resume every captured member whose exact pid birth and group still match.
 * @param group The group whose members were stopped.
 * @param captured The exact identities observed across the stop barrier.
 * @param operations The process observation and signalling seam.
 */
function resumeMatchingMembers(
	group: ProcessGroupIdentity,
	captured: CapturedMembers,
	operations: GitGroupTerminationOperations,
): void {
	for (const member of captured.values()) {
		try {
			const current = operations.readProcess(member.pid);
			if (isMatchingStoppedMember(current, member, group)) {
				operations.signalPid(current.pid, "SIGCONT");
			}
		} catch {
			// Recovery never signals a pid whose current exact identity cannot be read.
		}
	}
}

/**
 * Send an owned signal during best-effort recovery.
 * @param group The exact group to signal.
 * @param signal The recovery signal.
 * @param operations The process signalling seam.
 * @returns Whether the signal reached an existing group.
 */
function tryOwnedSignal(
	group: ProcessGroupIdentity,
	signal: NodeJS.Signals,
	operations: GitGroupTerminationOperations,
): boolean {
	try {
		return operations.signalGroup(group, signal);
	} catch {
		return false;
	}
}

/**
 * Recover a group if the stop barrier itself could not be completed.
 * @param group The exact group that may be stopped.
 * @param child Its exact leader handle.
 * @param captured The member identities observed while stopping it.
 * @param operations The process observation and signalling seam.
 */
function recoverStoppedGroup(
	group: ProcessGroupIdentity,
	child: KillableProcess,
	captured: CapturedMembers,
	operations: GitGroupTerminationOperations,
): void {
	if (tryOwnedSignal(group, "SIGKILL", operations)) {
		return;
	}
	tryOwnedSignal(group, "SIGCONT", operations);
	resumeMatchingMembers(group, captured, operations);
	try {
		child.kill("SIGKILL");
	} catch {
		// The exact child may already have exited while group recovery ran.
	}
	resumeMatchingMembers(group, captured, operations);
}

/**
 * Wait until every non-zombie group member is stopped and unable to fork.
 * @param group The exact group being frozen.
 * @param captured The member identities retained for error recovery.
 * @param operations The process observation, clock, and wait seam.
 */
async function awaitStoppedGroup(
	group: ProcessGroupIdentity,
	captured: CapturedMembers,
	operations: GitGroupTerminationOperations,
): Promise<void> {
	const deadline = operations.now() + GIT_PROCESS_GROUP_CLEANUP_MS;
	for (;;) {
		const members = operations.members(group);
		rememberMembers(captured, members);
		if (members.every((process) => process.state === "stopped")) {
			return;
		}
		if (operations.now() >= deadline) {
			throw new Error(`Process group ${group.group} did not stop within its cleanup grace.`);
		}
		operations.signalGroup(group, "SIGSTOP");
		// oxlint-disable-next-line no-await-in-loop -- a process group is sampled until the bounded barrier
		await operations.wait(GIT_PROCESS_GROUP_POLL_MS);
	}
}

/**
 * Freeze an owned group until no member can fork, then kill the frozen set.
 * @param group The exact leader and process group captured at spawn.
 * @param child The leader handle used as the last-resort direct cleanup target.
 * @param operations The process operations, injectable only for behavioral coverage.
 */
async function stopAndKillOwnedGroup(
	group: ProcessGroupIdentity,
	child: KillableProcess,
	operations: GitGroupTerminationOperations = productionOperations,
): Promise<void> {
	const captured: CapturedMembers = new Map();
	rememberMembers(captured, operations.members(group));
	if (!operations.signalGroup(group, "SIGSTOP")) {
		return;
	}
	try {
		await awaitStoppedGroup(group, captured, operations);
		operations.signalGroup(group, "SIGKILL");
	} catch (cause) {
		recoverStoppedGroup(group, child, captured, operations);
		throw cause;
	}
}

export { type GitGroupTerminationOperations, stopAndKillOwnedGroup };

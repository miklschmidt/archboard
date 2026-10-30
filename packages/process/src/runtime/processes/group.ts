import { errnoCode } from "@archboard/diagnostics/errno";
import {
	listProcessGroupObservations,
	readProcessObservation,
	type ProcessObservation,
} from "#runtime/processes/observation.ts";

interface ProcessIdentity {
	readonly pid: number;
	readonly startTime: string;
}

interface ProcessGroupIdentity {
	readonly group: number;
	readonly leader: ProcessIdentity;
}

/**
 * Capture the group of a process spawned detached, proving it leads its own
 * group rather than having joined ours.
 * @param leaderPid The detached child's pid.
 * @returns The group and its leader's identity.
 */
function captureDetachedProcessGroup(leaderPid: number): ProcessGroupIdentity {
	const observation = readProcessObservation(leaderPid);
	if (observation === undefined) {
		throw new Error(`Detached process ${leaderPid} vanished before its group could be captured.`);
	}
	if (observation.pgid <= 0 || observation.pgid !== leaderPid) {
		throw new Error(
			`Detached process ${leaderPid} joined group ${observation.pgid} instead of owning its group.`,
		);
	}
	return {
		group: observation.pgid,
		leader: { pid: observation.pid, startTime: observation.startTime },
	};
}

/**
 * Ask the kernel whether a group has any member, zombies included. This one
 * system call spares a census of every process in the usual case of no group.
 * @param group The process group id.
 * @returns False only when the group is proven to be empty.
 */
function processGroupMayExist(group: number): boolean {
	try {
		process.kill(-group, 0);
	} catch (cause) {
		return errnoCode(cause) !== "ESRCH";
	}
	return true;
}

/**
 * Whether any process that can still run remains in a group.
 * @param group The process group id.
 * @returns True while the group contains a live or stopped process.
 */
function processGroupExists(group: number): boolean {
	return (
		processGroupMayExist(group) &&
		listProcessGroupObservations(group).some((process) => process.state !== "zombie")
	);
}

/**
 * Read the non-zombie members of a captured group while rejecting an observed
 * identity/group change or leader-pid reuse.
 *
 * A leader that exited does not end ownership. The kernel never gives a pid to
 * a new process while a process group with that number has a member, so the
 * members that remain are the descendants of the recorded leader.
 * @param identity The group and original leader identity.
 * @returns Every member that can still run or is stopped.
 */
function ownedProcessGroupMembers(identity: ProcessGroupIdentity): readonly ProcessObservation[] {
	const members = listProcessGroupObservations(identity.group).filter(
		(process) => process.state !== "zombie",
	);
	if (members.length === 0) {
		return members;
	}
	const leader = readProcessObservation(identity.leader.pid);
	if (
		leader !== undefined &&
		(leader.startTime !== identity.leader.startTime || leader.pgid !== identity.group)
	) {
		throw new Error(
			`Process group ${identity.group} no longer belongs to its recorded leader identity.`,
		);
	}
	const recycledLeader = members.find(
		(process) =>
			process.pid === identity.leader.pid && process.startTime !== identity.leader.startTime,
	);
	if (recycledLeader !== undefined) {
		throw new Error(
			`Process group ${identity.group} contains a process that reused its recorded leader pid.`,
		);
	}
	return members;
}

/**
 * Signal a whole group, but only while its recorded leader still owns it, so
 * a recycled pgid never receives a signal meant for a process that is gone.
 * @param identity The group and the leader that was recorded owning it.
 * @param signal The signal to deliver.
 * @returns False when the group no longer exists; true when it was signalled.
 */
function signalOwnedProcessGroup(identity: ProcessGroupIdentity, signal: NodeJS.Signals): boolean {
	if (!processGroupExists(identity.group)) {
		return false;
	}
	const members = ownedProcessGroupMembers(identity);
	if (members.length === 0) {
		return false;
	}
	try {
		process.kill(-identity.group, signal);
		return true;
	} catch (cause) {
		if (errnoCode(cause) === "ESRCH") {
			return false;
		}
		throw cause;
	}
}

export {
	type ProcessGroupIdentity,
	captureDetachedProcessGroup,
	processGroupExists,
	ownedProcessGroupMembers,
	signalOwnedProcessGroup,
};

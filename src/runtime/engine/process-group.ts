import { errorCode } from "@/runtime/engine/lib/thrown-error";
import {
	listProcessGroupObservations,
	readProcessObservation,
	type ProcessObservation,
} from "@/shared/process-observation";

interface ProcessIdentity {
	readonly pid: number;
	readonly startTime: string;
}

interface ProcessGroupIdentity {
	readonly group: number;
	readonly leader: ProcessIdentity;
}

/**
 * The identity of a live process.
 * @param pid The process to identify.
 * @returns Its pid paired with its kernel start time.
 */
function processIdentity(pid: number): ProcessIdentity {
	const observation = readProcessObservation(pid);
	if (observation === undefined) {
		throw new Error(`Process ${pid} vanished before its identity could be captured.`);
	}
	return { pid: observation.pid, startTime: observation.startTime };
}

/**
 * Whether the process an identity names is still the one running under that pid.
 * @param identity A previously captured identity.
 * @returns False when the pid is gone or has been recycled.
 */
function processIdentityExists(identity: ProcessIdentity): boolean {
	const observation = readProcessObservation(identity.pid);
	return observation !== undefined && observation.startTime === identity.startTime;
}

/**
 * Whether the process an identity names is alive and still leads a group.
 * @param identity The recorded leader.
 * @param group The group it was recorded as owning.
 * @returns False when the pid is gone, recycled, or has changed group.
 */
function processIdentityOwnsGroup(identity: ProcessIdentity, group: number): boolean {
	const observation = readProcessObservation(identity.pid);
	return (
		observation !== undefined &&
		observation.startTime === identity.startTime &&
		observation.pgid === group
	);
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
 * Whether any process that can still run remains in a group.
 * @param group The process group id.
 * @returns True while the group contains a live or stopped process.
 */
function processGroupExists(group: number): boolean {
	return listProcessGroupObservations(group).some((process) => process.state !== "zombie");
}

/**
 * Read the non-zombie members of a captured group while rejecting leader
 * absence, an observed identity/group change, or leader-pid reuse.
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
	if (leader === undefined) {
		throw new Error(
			`Process group ${identity.group} lost its recorded leader before ownership inspection.`,
		);
	}
	if (leader.startTime !== identity.leader.startTime || leader.pgid !== identity.group) {
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
		if (errorCode(cause) === "ESRCH") {
			return false;
		}
		throw cause;
	}
}

/**
 * Whether any process other than the leader is still in the group.
 * @param identity The group and its recorded leader.
 * @returns True when a second member is found.
 */
function processGroupHasOtherMember(identity: ProcessGroupIdentity): boolean {
	if (!processIdentityOwnsGroup(identity.leader, identity.group)) {
		throw new Error(
			`Process group ${identity.group} lost its recorded leader before membership inspection.`,
		);
	}
	for (const process of listProcessGroupObservations(identity.group)) {
		if (
			process.pid !== identity.leader.pid &&
			process.pgid === identity.group &&
			process.state !== "zombie"
		) {
			return true;
		}
	}
	return false;
}

export {
	type ProcessIdentity,
	type ProcessGroupIdentity,
	processIdentity,
	processIdentityExists,
	processIdentityOwnsGroup,
	captureDetachedProcessGroup,
	processGroupExists,
	ownedProcessGroupMembers,
	signalOwnedProcessGroup,
	processGroupHasOtherMember,
};

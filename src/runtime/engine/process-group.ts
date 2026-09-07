import { readFileSync, readdirSync, type Dirent } from "node:fs";
import { errorCode } from "@/runtime/engine/lib/thrown-error";

interface ProcessIdentity {
	readonly pid: number;
	readonly startTime: string;
}

interface ProcessGroupIdentity {
	readonly group: number;
	readonly leader: ProcessIdentity;
}

interface ProcessRecord {
	readonly identity: ProcessIdentity;
	readonly group: number;
}

/**
 * Whether a failure means the process is simply gone, which every caller here
 * treats as an answer rather than an error.
 * @param cause What reading `/proc` or signalling threw.
 * @returns True for a missing `/proc` entry or a vanished pid.
 */
function isMissingProcess(cause: unknown): boolean {
	const code = errorCode(cause);
	return code === "ENOENT" || code === "ESRCH";
}

/**
 * Read a process's group and start time from `/proc/<pid>/stat`. The start
 * time is what makes a pid an identity: a recycled pid has a different one.
 * @param pid The process to read.
 * @returns Its identity and process group.
 */
function processRecord(pid: number): ProcessRecord {
	const raw = readFileSync(`/proc/${pid}/stat`, "utf8");
	const close = raw.lastIndexOf(")");
	const fields = raw
		.slice(close + 2)
		.trim()
		.split(/\s+/);
	const group = Number(fields[2]);
	const startTime = fields[19];
	if (!Number.isSafeInteger(group) || !startTime) {
		throw new Error(`Process ${pid} did not expose a valid group and start time.`);
	}
	return { identity: { pid, startTime }, group };
}

/**
 * The identity of a live process.
 * @param pid The process to identify.
 * @returns Its pid paired with its kernel start time.
 */
function processIdentity(pid: number): ProcessIdentity {
	return processRecord(pid).identity;
}

/**
 * Whether the process an identity names is still the one running under that pid.
 * @param identity A previously captured identity.
 * @returns False when the pid is gone or has been recycled.
 */
function processIdentityExists(identity: ProcessIdentity): boolean {
	try {
		return processIdentity(identity.pid).startTime === identity.startTime;
	} catch (cause) {
		if (isMissingProcess(cause)) {
			return false;
		}
		throw cause;
	}
}

/**
 * Whether the process an identity names is alive and still leads a group.
 * @param identity The recorded leader.
 * @param group The group it was recorded as owning.
 * @returns False when the pid is gone, recycled, or has changed group.
 */
function processIdentityOwnsGroup(identity: ProcessIdentity, group: number): boolean {
	try {
		const record = processRecord(identity.pid);
		return record.identity.startTime === identity.startTime && record.group === group;
	} catch (cause) {
		if (isMissingProcess(cause)) {
			return false;
		}
		throw cause;
	}
}

/**
 * Capture the group of a process spawned detached, proving it leads its own
 * group rather than having joined ours.
 * @param leaderPid The detached child's pid.
 * @returns The group and its leader's identity.
 */
function captureDetachedProcessGroup(leaderPid: number): ProcessGroupIdentity {
	const record = processRecord(leaderPid);
	if (record.group <= 0 || record.group !== leaderPid) {
		throw new Error(
			`Detached process ${leaderPid} joined group ${record.group} instead of owning its group.`,
		);
	}
	return { group: record.group, leader: record.identity };
}

/**
 * Whether any process remains in a group, by the null signal.
 * @param group The process group id.
 * @returns True while the kernel still knows the group.
 */
function processGroupExists(group: number): boolean {
	try {
		process.kill(-group, 0);
		return true;
	} catch (cause) {
		if (errorCode(cause) === "ESRCH") {
			return false;
		}
		throw cause;
	}
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
	if (!processIdentityOwnsGroup(identity.leader, identity.group)) {
		throw new Error(
			`Refusing to signal process group ${identity.group}: its recorded leader no longer owns that group.`,
		);
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
 * Whether a `/proc` entry names a process.
 * @param entry A directory entry under `/proc`.
 * @returns True for a numeric directory.
 */
function isProcessEntry(entry: Dirent): boolean {
	return entry.isDirectory() && /^\d+$/.test(entry.name);
}

/**
 * The group a pid belongs to, or null when the process vanished between the
 * directory listing and the read.
 * @param pid The process to read.
 * @returns Its process group id, or null when it is gone.
 */
function groupOfLiveProcess(pid: number): number | null {
	try {
		return processRecord(pid).group;
	} catch (cause) {
		if (isMissingProcess(cause)) {
			return null;
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
	for (const entry of readdirSync("/proc", { withFileTypes: true })) {
		if (!isProcessEntry(entry)) {
			continue;
		}
		const pid = Number(entry.name);
		if (pid !== identity.leader.pid && groupOfLiveProcess(pid) === identity.group) {
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
	signalOwnedProcessGroup,
	processGroupHasOtherMember,
};

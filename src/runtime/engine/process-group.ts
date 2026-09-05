import { readFileSync, readdirSync } from "node:fs";

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

function isMissingProcess(cause: unknown): boolean {
	const code = (cause as NodeJS.ErrnoException).code;
	return code === "ENOENT" || code === "ESRCH";
}

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

function processIdentity(pid: number): ProcessIdentity {
	return processRecord(pid).identity;
}

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

function captureDetachedProcessGroup(leaderPid: number): ProcessGroupIdentity {
	const record = processRecord(leaderPid);
	if (record.group <= 0 || record.group !== leaderPid) {
		throw new Error(
			`Detached process ${leaderPid} joined group ${record.group} instead of owning its group.`,
		);
	}
	return { group: record.group, leader: record.identity };
}

function processGroupExists(group: number): boolean {
	try {
		process.kill(-group, 0);
		return true;
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === "ESRCH") {
			return false;
		}
		throw cause;
	}
}

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
		if ((cause as NodeJS.ErrnoException).code === "ESRCH") {
			return false;
		}
		throw cause;
	}
}

function processGroupHasOtherMember(identity: ProcessGroupIdentity): boolean {
	if (!processIdentityOwnsGroup(identity.leader, identity.group)) {
		throw new Error(
			`Process group ${identity.group} lost its recorded leader before membership inspection.`,
		);
	}
	for (const entry of readdirSync("/proc", { withFileTypes: true })) {
		if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
			continue;
		}
		const pid = Number(entry.name);
		if (pid === identity.leader.pid) {
			continue;
		}
		try {
			if (processRecord(pid).group === identity.group) {
				return true;
			}
		} catch (cause) {
			if (!isMissingProcess(cause)) {
				throw cause;
			}
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

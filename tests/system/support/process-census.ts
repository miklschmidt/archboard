import { readFileSync, readdirSync } from "node:fs";

interface ProcessIdentity {
	readonly pid: number;
	readonly parentPid: number;
	readonly group: number;
	readonly startTime: string;
}

function processIdentity(pid: number): ProcessIdentity | null {
	try {
		const text = readFileSync(`/proc/${pid}/stat`, "utf8");
		const fields = text
			.slice(text.lastIndexOf(")") + 2)
			.trim()
			.split(/\s+/u);
		if (fields[0] === "Z" || fields[0] === "X") {
			return null;
		}
		const startTime = fields.at(19);
		if (startTime === undefined) {
			return null;
		}
		return { pid, parentPid: Number(fields[1]), group: Number(fields[2]), startTime };
	} catch {
		return null;
	}
}

function exactProcessExists(identity: Readonly<ProcessIdentity>): boolean {
	return processIdentity(identity.pid)?.startTime === identity.startTime;
}

function processGroupMembers(group: number): number[] {
	const members: number[] = [];
	for (const entry of readdirSync("/proc", { withFileTypes: true })) {
		if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) {
			continue;
		}
		const identity = processIdentity(Number(entry.name));
		if (identity?.group === group) {
			members.push(identity.pid);
		}
	}
	return members;
}

function killExactGroup(identity: Readonly<ProcessIdentity>): void {
	if (!exactProcessExists(identity) || !processGroupMembers(identity.group).includes(identity.pid)) {
		return;
	}
	try {
		process.kill(-identity.group, "SIGKILL");
	} catch (error) {
		const code =
			typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
		if (code !== "ESRCH") {
			throw error;
		}
	}
}

export {
	exactProcessExists,
	killExactGroup,
	processGroupMembers,
	processIdentity,
	type ProcessIdentity,
};

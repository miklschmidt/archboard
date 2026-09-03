import { readFileSync, readdirSync } from "node:fs";

export interface ProcessIdentity {
	readonly pid: number;
	readonly parentPid: number;
	readonly group: number;
	readonly startTime: string;
}

export function processIdentity(pid: number): ProcessIdentity | null {
	try {
		const text = readFileSync(`/proc/${pid}/stat`, "utf8");
		const fields = text
			.slice(text.lastIndexOf(")") + 2)
			.trim()
			.split(/\s+/u);
		if (fields[0] === "Z" || fields[0] === "X") return null;
		return { pid, parentPid: Number(fields[1]), group: Number(fields[2]), startTime: fields[19]! };
	} catch {
		return null;
	}
}

export function exactProcessExists(identity: ProcessIdentity): boolean {
	return processIdentity(identity.pid)?.startTime === identity.startTime;
}

export function processGroupMembers(group: number): number[] {
	return readdirSync("/proc", { withFileTypes: true }).flatMap((entry) => {
		if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) return [];
		const identity = processIdentity(Number(entry.name));
		return identity?.group === group ? [identity.pid] : [];
	});
}

export function killExactGroup(identity: ProcessIdentity): void {
	if (!exactProcessExists(identity) || !processGroupMembers(identity.group).includes(identity.pid))
		return;
	try {
		process.kill(-identity.group, "SIGKILL");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
	}
}

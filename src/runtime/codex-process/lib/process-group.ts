import fs from "node:fs";

export type CodexProcessGroupSignal = "SIGTERM" | "SIGKILL";
export type CodexProcessGroupInspection = "quiescent" | "owned" | "reused" | "unproven";

export interface CodexProcessGroupIdentity {
	readonly leaderPid: number;
	readonly pgid: number;
	readonly leaderStartTime: string;
}

export interface CodexProcessGroupOperations {
	readonly capture: (leaderPid: number) => CodexProcessGroupIdentity;
	readonly inspect: (identity: CodexProcessGroupIdentity) => CodexProcessGroupInspection;
	readonly signal: (identity: CodexProcessGroupIdentity, signal: CodexProcessGroupSignal) => void;
}

export type CodexProcessGroupFailureCode =
	| "capture_failed"
	| "unproven"
	| "reused"
	| "signal_failed";

export class CodexProcessGroupError extends Error {
	readonly code: CodexProcessGroupFailureCode;

	constructor(code: CodexProcessGroupFailureCode, message: string) {
		super(message);
		this.name = "CodexProcessGroupError";
		this.code = code;
	}
}

interface ProcStat {
	readonly pid: number;
	readonly state: string;
	readonly pgid: number;
	readonly startTime: string;
}

function positivePid(pid: number): boolean {
	return Number.isSafeInteger(pid) && pid > 0;
}

function readProcStat(pid: number): ProcStat | undefined {
	let text: string;
	try {
		text = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		throw cause;
	}
	const closingName = text.lastIndexOf(")");
	if (closingName < 0) {
		throw new Error(`Malformed process stat for pid ${pid}.`);
	}
	const fields = text
		.slice(closingName + 2)
		.trim()
		.split(/\s+/u);
	const state = fields[0];
	const pgid = Number(fields[2]);
	const startTime = fields[19];
	if (!state || !Number.isSafeInteger(pgid) || pgid < 0 || !startTime) {
		throw new Error(`Incomplete process stat for pid ${pid}.`);
	}
	return Object.freeze({ pid, state, pgid, startTime });
}

function capture(leaderPid: number): CodexProcessGroupIdentity {
	if (process.platform !== "linux" || !positivePid(leaderPid)) {
		throw new CodexProcessGroupError(
			"capture_failed",
			"Could not prove a dedicated Codex process group on this platform.",
		);
	}
	let stat: ProcStat | undefined;
	try {
		stat = readProcStat(leaderPid);
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

function inspect(identity: CodexProcessGroupIdentity): CodexProcessGroupInspection {
	if (
		process.platform !== "linux" ||
		!positivePid(identity.leaderPid) ||
		!positivePid(identity.pgid) ||
		identity.pgid !== identity.leaderPid ||
		identity.leaderStartTime.length === 0
	) {
		return "unproven";
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync("/proc", { withFileTypes: true });
	} catch {
		return "unproven";
	}

	let leader: ProcStat | undefined;
	try {
		leader = readProcStat(identity.leaderPid);
	} catch {
		return "unproven";
	}
	if (leader && (leader.startTime !== identity.leaderStartTime || leader.pgid !== identity.pgid)) {
		return "reused";
	}

	let memberCount = 0;
	for (const entry of entries) {
		if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) {
			continue;
		}
		const pid = Number(entry.name);
		if (!positivePid(pid)) {
			continue;
		}
		let stat: ProcStat | undefined;
		try {
			stat = readProcStat(pid);
		} catch {
			return "unproven";
		}
		if (!stat) {
			continue;
		}
		if (pid === identity.leaderPid && stat.startTime !== identity.leaderStartTime) {
			return "reused";
		}
		if (stat.pgid === identity.pgid && stat.state !== "Z" && stat.state !== "X") {
			memberCount += 1;
		}
	}
	return memberCount === 0 ? "quiescent" : "owned";
}

function signal(identity: CodexProcessGroupIdentity, requested: CodexProcessGroupSignal): void {
	const status = inspect(identity);
	if (status === "quiescent") {
		return;
	}
	if (status === "reused") {
		throw new CodexProcessGroupError(
			"reused",
			"Refusing to signal a process group whose leader identity was reused.",
		);
	}
	if (status === "unproven") {
		throw new CodexProcessGroupError(
			"unproven",
			"Refusing to signal a process group whose ownership could not be proved.",
		);
	}
	try {
		process.kill(-identity.pgid, requested);
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === "ESRCH") {
			const after = inspect(identity);
			if (after === "quiescent") {
				return;
			}
			if (after === "reused") {
				throw new CodexProcessGroupError(
					"reused",
					"The Codex process group changed while it was being signalled.",
				);
			}
			if (after === "unproven") {
				throw new CodexProcessGroupError(
					"unproven",
					"The Codex process group could not be re-proven after signalling.",
				);
			}
		}
		throw new CodexProcessGroupError(
			"signal_failed",
			`Could not send ${requested} to the owned Codex process group.`,
		);
	}
}

export function createCodexProcessGroupOperations(): CodexProcessGroupOperations {
	return Object.freeze({ capture, inspect, signal });
}

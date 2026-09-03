import fs from "node:fs";

const SERVER_ENTRY_ENV = "ARCHBOARD_TEST_SERVER_ENTRY";
const TRACE_FILE_ENV = "ARCHBOARD_TEST_FSYNC_TRACE";

export interface FsyncTraceEvidence {
	readonly calls: readonly string[];
	readonly incomplete: readonly string[];
}

export function readFsyncTrace(traceFile: string): FsyncTraceEvidence {
	if (!fs.existsSync(traceFile)) return { calls: [], incomplete: [] };
	const text = fs.readFileSync(traceFile, "utf8");
	const completeText = text.endsWith("\n") ? text : text.slice(0, text.lastIndexOf("\n") + 1);
	const lines = completeText
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const successfulFsync = /\bfsync\(\d+\)\s+=\s+0$/;
	const lifecycle =
		/^(?:(?:\[pid\s+)?\d+\]?\s+)?(?:\+\+\+ (?:exited with \d+|killed by SIG[A-Z0-9]+) \+\+\+|--- SIG[A-Z0-9]+ .* ---|\?\?\?\( <unfinished \.\.\.>)$/;
	const unfinishedFsync = /^(?:\[pid\s+)?(\d+)\]?\s+fsync\(\d+\s+<unfinished \.\.\.>$/;
	const resumedFsync = /^(?:\[pid\s+)?(\d+)\]?\s+<\.\.\. fsync resumed>\)\s+=\s+(0|\?)$/;
	const calls: string[] = [];
	const incomplete: string[] = [];
	const pending = new Map<string, string[]>();
	for (const line of lines) {
		if (successfulFsync.test(line)) {
			calls.push(line);
			continue;
		}
		const started = unfinishedFsync.exec(line);
		if (started) {
			const pid = started[1]!;
			pending.set(pid, [...(pending.get(pid) ?? []), line]);
			continue;
		}
		const resumed = resumedFsync.exec(line);
		if (resumed) {
			const pid = resumed[1]!;
			const starts = pending.get(pid);
			const start = starts?.shift();
			if (!start) incomplete.push(line);
			else if (resumed[2] === "0") calls.push(`${start} ${line}`);
			if (starts?.length === 0) pending.delete(pid);
			continue;
		}
		if (!lifecycle.test(line)) incomplete.push(line);
	}
	for (const starts of pending.values()) incomplete.push(...starts);
	return {
		incomplete,
		calls,
	};
}

export function tracerPids(processGroup: number): number[] {
	return fs.readdirSync("/proc").flatMap((entry) => {
		if (!/^\d+$/.test(entry)) return [];
		const pid = Number(entry);
		try {
			const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
			const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
			const comm = fs.readFileSync(`/proc/${pid}/comm`, "utf8").trim();
			return Number(fields[2]) === processGroup && comm === "strace" ? [pid] : [];
		} catch {
			return [];
		}
	});
}

function tracedCanvasMain(): void {
	const serverEntry = process.env[SERVER_ENTRY_ENV];
	const traceFile = process.env[TRACE_FILE_ENV];
	if (!serverEntry) throw new Error(`${SERVER_ENTRY_ENV} is required.`);
	if (!traceFile) throw new Error(`${TRACE_FILE_ENV} is required.`);
	if (!process.execve) throw new Error("This runtime does not provide process.execve.");
	const environment = { ...process.env };
	delete environment[SERVER_ENTRY_ENV];
	delete environment[TRACE_FILE_ENV];
	const strace = (environment.PATH ?? "")
		.split(":")
		.map((directory) => `${directory}/strace`)
		.find((candidate) => {
			try {
				fs.accessSync(candidate, fs.constants.X_OK);
				return true;
			} catch {
				return false;
			}
		});
	if (!strace) throw new Error("strace is not executable on PATH.");
	process.execve(
		strace,
		[
			strace,
			"--daemonize=grandchild",
			"-f",
			"-e",
			"trace=fsync",
			"-o",
			traceFile,
			process.execPath,
			serverEntry,
		],
		environment,
	);
}

if (import.meta.main) tracedCanvasMain();

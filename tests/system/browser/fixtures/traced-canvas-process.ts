import fs from "node:fs";

const SERVER_ENTRY_ENV = "ARCHBOARD_TEST_SERVER_ENTRY";
const TRACE_FILE_ENV = "ARCHBOARD_TEST_FSYNC_TRACE";

export interface FsyncTraceEvidence {
	readonly calls: readonly string[];
	readonly incomplete: readonly string[];
}

export function readFsyncTrace(traceFile: string): FsyncTraceEvidence {
	if (!fs.existsSync(traceFile)) return { calls: [], incomplete: [] };
	const lines = fs
		.readFileSync(traceFile, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const successfulFsync = /\bfsync\(\d+\)\s+=\s+0$/;
	const lifecycle =
		/^(?:(?:\[pid\s+)?\d+\]?\s+)?(?:\+\+\+ (?:exited with \d+|killed by SIG[A-Z0-9]+) \+\+\+|--- SIG[A-Z0-9]+ .* ---)$/;
	return {
		calls: lines.filter((line) => successfulFsync.test(line)),
		incomplete: lines.filter((line) => !successfulFsync.test(line) && !lifecycle.test(line)),
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

import fs from "node:fs";

import { dlopen, type Library } from "bun:ffi";

import { parseLinuxProcessStat } from "@/shared/process-observation/lib/linux-stat";

type ProcessState = "live" | "stopped" | "zombie";

interface ProcessObservation {
	readonly pid: number;
	readonly parentPid: number;
	readonly pgid: number;
	readonly state: ProcessState;
	readonly startTime: string;
}

const DARWIN_BSD_INFO_FLAVOR = 3;
const DARWIN_INCLUDE_ZOMBIES = 1;
const DARWIN_BSD_INFO_BYTES = 136;
const DARWIN_STATUS_STOPPED = 4;
const DARWIN_STATUS_ZOMBIE = 5;
const DARWIN_PID_SLACK = 64;
const DARWIN_CENSUS_ATTEMPTS = 4;

const DARWIN_LIBRARY_SYMBOLS = {
	proc_listallpids: { args: ["ptr", "i32"], returns: "i32" },
	proc_listpgrppids: { args: ["i32", "ptr", "i32"], returns: "i32" },
	proc_pidinfo: { args: ["i32", "i32", "u64", "ptr", "i32"], returns: "i32" },
} as const;

type DarwinLibrary = Library<typeof DARWIN_LIBRARY_SYMBOLS>;

/**
 * Validate the process relationships decoded from a Darwin record.
 * @param parentPid The decoded parent process id.
 * @param pgid The decoded process group id.
 * @returns True when both ids have kernel-supported values.
 */
function validDarwinRelationships(parentPid: number, pgid: number): boolean {
	return Number.isSafeInteger(parentPid) && parentPid >= 0 && positivePid(pgid);
}

/**
 * Validate the exact Darwin birth timestamp.
 * @param seconds Whole seconds since the epoch.
 * @param microseconds The subsecond field.
 * @returns True when the timestamp can identify a process birth.
 */
function validDarwinStartTime(seconds: bigint, microseconds: bigint): boolean {
	return seconds > 0n && microseconds < 1_000_000n;
}

/**
 * Validate a Darwin BSD process state.
 * @param status The decoded state number.
 * @returns True when the state is in the supported Darwin range.
 */
function validDarwinStatus(status: number): boolean {
	return status >= 1 && status <= DARWIN_STATUS_ZOMBIE;
}

/**
 * Whether a number can name a kernel process.
 * @param pid The candidate process id.
 * @returns True for a positive safe integer.
 */
function positivePid(pid: number): boolean {
	return Number.isSafeInteger(pid) && pid > 0;
}

/**
 * Read the stable errno-like code from a filesystem failure.
 * @param cause Whatever the filesystem threw.
 * @returns Its code, when present.
 */
function errorCode(cause: unknown): string | undefined {
	return cause !== null && typeof cause === "object" && "code" in cause
		? String((cause as { readonly code?: unknown }).code)
		: undefined;
}

/**
 * Read one Linux process, returning undefined only after it vanished.
 * @param pid The process to inspect.
 * @returns Its observation, or undefined when it vanished.
 */
function readLinuxProcess(pid: number): ProcessObservation | undefined {
	try {
		return parseLinuxProcessStat(pid, fs.readFileSync(`/proc/${pid}/stat`, "utf8"));
	} catch (cause) {
		const code = errorCode(cause);
		if (code === "ENOENT" || code === "ESRCH") return undefined;
		throw cause;
	}
}

/**
 * Read a complete Linux procfs census, tolerating entries that vanish mid-read.
 * @returns The observable processes at this instant.
 */
function listLinuxProcesses(): readonly ProcessObservation[] {
	return Object.freeze(
		fs
			.readdirSync("/proc", { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && /^\d+$/u.test(entry.name))
			.map((entry) => readLinuxProcess(Number(entry.name)))
			.filter((record): record is ProcessObservation => record !== undefined),
	);
}

/**
 * Open libproc only for one synchronous observation so hot reload retains no native handle.
 * @param read The operation to perform with the opened library.
 * @returns The operation result.
 */
function withDarwinLibrary<Result>(read: (library: DarwinLibrary) => Result): Result {
	const library = dlopen("/usr/lib/libproc.dylib", DARWIN_LIBRARY_SYMBOLS);
	try {
		return read(library);
	} finally {
		library.close();
	}
}

/**
 * List every Darwin pid without accepting a census that filled its buffer.
 * @param library The opened libproc library.
 * @returns The complete pid list.
 */
function listDarwinPids(library: DarwinLibrary): readonly number[] {
	const pids = listDarwinPidBuffer(
		(buffer, byteLength) => library.symbols.proc_listallpids(buffer, byteLength),
		"process",
	);
	if (pids.length === 0) throw new Error("Could not read the Darwin process census.");
	return pids;
}

/**
 * List every pid in one Darwin process group without accepting a truncated result.
 * @param library The opened libproc library.
 * @param pgid The process group to list.
 * @returns The complete group pid list.
 */
function listDarwinGroupPids(library: DarwinLibrary, pgid: number): readonly number[] {
	const estimate = library.symbols.proc_listpgrppids(pgid, null, 0);
	if (estimate === 0 && darwinProcessGroupAbsent(pgid)) return Object.freeze([]);
	const pids = listDarwinPidBuffer(
		(buffer, byteLength) => library.symbols.proc_listpgrppids(pgid, buffer, byteLength),
		`process-group ${pgid}`,
		estimate,
	);
	if (pids.length === 0 && !darwinProcessGroupAbsent(pgid)) {
		throw new Error(`Could not read the live Darwin process-group ${pgid} census.`);
	}
	return pids;
}

/**
 * Prove an empty libproc group census means the kernel no longer knows the group.
 * @param pgid The process group to probe without signalling.
 * @returns True only when the kernel reports no such group.
 */
function darwinProcessGroupAbsent(pgid: number): boolean {
	try {
		process.kill(-pgid, 0);
		return false;
	} catch (cause) {
		if (errorCode(cause) === "ESRCH") return true;
		throw cause;
	}
}

/**
 * Read one complete libproc pid vector, retrying whenever it fills the allocation.
 * @param read The native pid-vector reader.
 * @param label What the census contains, for diagnostics.
 * @param initialEstimate A size already read by the caller, when any.
 * @returns The complete positive pid list.
 */
function listDarwinPidBuffer(
	read: (buffer: Int32Array | null, byteLength: number) => number,
	label: string,
	initialEstimate?: number,
): readonly number[] {
	const estimate = initialEstimate ?? read(null, 0);
	if (!Number.isSafeInteger(estimate) || estimate <= 0) {
		throw new Error(`Could not size the Darwin ${label} census.`);
	}
	let capacity = estimate + DARWIN_PID_SLACK;
	for (let attempt = 0; attempt < DARWIN_CENSUS_ATTEMPTS; attempt += 1) {
		const pids = readDarwinPidAttempt(read, capacity, label);
		if (pids !== undefined) return pids;
		capacity *= 2;
	}
	throw new Error(`The Darwin ${label} census changed faster than it could be read completely.`);
}

/**
 * Try one Darwin pid census allocation.
 * @param read The native pid-vector reader.
 * @param capacity The number of pid slots allocated.
 * @param label What the census contains, for diagnostics.
 * @returns The complete list, or undefined when the native call filled the allocation.
 */
function readDarwinPidAttempt(
	read: (buffer: Int32Array | null, byteLength: number) => number,
	capacity: number,
	label: string,
): readonly number[] | undefined {
	const buffer = new Int32Array(capacity);
	const count = read(buffer, buffer.byteLength);
	if (!validDarwinPidCount(count)) {
		throw new Error(`Could not read the Darwin ${label} census.`);
	}
	if (count >= capacity) return undefined;
	return Object.freeze([...new Set(Array.from(buffer.subarray(0, count)).filter(positivePid))]);
}

/**
 * Validate a libproc pid count.
 * @param count The native result.
 * @returns True for a nonnegative safe count.
 */
function validDarwinPidCount(count: number): boolean {
	return Number.isSafeInteger(count) && count >= 0;
}

/**
 * Decode one exact proc_bsdinfo record.
 * @param pid The requested process id.
 * @param bytes The exact native structure bytes.
 * @returns The normalized process observation.
 */
function parseDarwinBsdInfo(pid: number, bytes: Uint8Array): ProcessObservation {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const observedPid = view.getUint32(12, true);
	const status = view.getUint32(4, true);
	const parentPid = view.getUint32(16, true);
	const pgid = view.getUint32(100, true);
	const startSeconds = view.getBigUint64(120, true);
	const startMicroseconds = view.getBigUint64(128, true);
	if (
		!validDarwinBsdInfo({
			observedPid,
			pid,
			parentPid,
			pgid,
			startSeconds,
			startMicroseconds,
			status,
		})
	) {
		throw new Error(`Incomplete Darwin process information for pid ${pid}.`);
	}
	return Object.freeze({
		pid,
		parentPid,
		pgid,
		state:
			status === DARWIN_STATUS_ZOMBIE
				? "zombie"
				: status === DARWIN_STATUS_STOPPED
					? "stopped"
					: "live",
		startTime: `darwin:${startSeconds}:${startMicroseconds}`,
	});
}

/**
 * Validate the kernel fields used from proc_bsdinfo.
 * @param info The decoded native fields.
 * @param info.observedPid The pid the native record contains.
 * @param info.pid The requested pid.
 * @param info.parentPid The native parent pid.
 * @param info.pgid The native process group id.
 * @param info.startSeconds The birth timestamp seconds.
 * @param info.startMicroseconds The birth timestamp microseconds.
 * @param info.status The native process status.
 * @returns True when every field has a supported kernel value.
 */
function validDarwinBsdInfo(info: {
	readonly observedPid: number;
	readonly pid: number;
	readonly parentPid: number;
	readonly pgid: number;
	readonly startSeconds: bigint;
	readonly startMicroseconds: bigint;
	readonly status: number;
}): boolean {
	return (
		info.observedPid === info.pid &&
		validDarwinRelationships(info.parentPid, info.pgid) &&
		validDarwinStartTime(info.startSeconds, info.startMicroseconds) &&
		validDarwinStatus(info.status)
	);
}

/**
 * Read one Darwin process from libproc; zero bytes means it must be re-proven absent.
 * @param library The opened libproc library.
 * @param pid The process to inspect.
 * @returns Its observation, or undefined after a zero-byte native read.
 */
function readDarwinProcessRaw(library: DarwinLibrary, pid: number): ProcessObservation | undefined {
	const buffer = new Uint8Array(DARWIN_BSD_INFO_BYTES);
	const received = library.symbols.proc_pidinfo(
		pid,
		DARWIN_BSD_INFO_FLAVOR,
		DARWIN_INCLUDE_ZOMBIES,
		buffer,
		buffer.byteLength,
	);
	if (received === 0) return undefined;
	if (received !== DARWIN_BSD_INFO_BYTES) {
		throw new Error(
			`Darwin returned ${received} of ${DARWIN_BSD_INFO_BYTES} process-information bytes for pid ${pid}.`,
		);
	}
	return parseDarwinBsdInfo(pid, buffer);
}

/**
 * Read one Darwin process, returning undefined only when a complete census proves it absent.
 * @param pid The process to inspect.
 * @returns Its observation, or undefined when it is absent from the census.
 */
function readDarwinProcess(pid: number): ProcessObservation | undefined {
	return withDarwinLibrary((library) => {
		const record = readDarwinProcessRaw(library, pid);
		if (record !== undefined) return record;
		if (!listDarwinPids(library).includes(pid)) return undefined;
		const retried = readDarwinProcessRaw(library, pid);
		if (retried !== undefined) return retried;
		if (!listDarwinPids(library).includes(pid)) return undefined;
		throw new Error(`Darwin listed pid ${pid} but refused its process information.`);
	});
}

/**
 * Read every observable Darwin process, skipping protected system entries.
 * @returns The observable process census.
 */
function listDarwinProcesses(): readonly ProcessObservation[] {
	return withDarwinLibrary((library) => {
		const { records } = readDarwinRecords(library, listDarwinPids(library));
		// A full system census can contain protected processes whose libproc details are unavailable.
		// Exact ownership decisions use listProcessGroupObservations, which refuses an unreadable member.
		return Object.freeze(records);
	});
}

/**
 * Read the available records for one native pid list.
 * @param library The opened libproc library.
 * @param pids The native pids to read.
 * @param pgid An expected process group, when the list came from one.
 * @returns Read records and the pids whose information was unavailable.
 */
function readDarwinRecords(
	library: DarwinLibrary,
	pids: readonly number[],
	pgid?: number,
): { readonly records: ProcessObservation[]; readonly unreadable: number[] } {
	const records: ProcessObservation[] = [];
	const unreadable: number[] = [];
	for (const pid of pids) {
		const record = readDarwinProcessRaw(library, pid);
		if (record === undefined) unreadable.push(pid);
		else if (pgid === undefined || record.pgid === pgid) records.push(record);
	}
	return { records, unreadable };
}

/**
 * Re-read group members that vanished or were unreadable during the first pass.
 * @param library The opened libproc library.
 * @param pgid The group being observed.
 * @param records The records already read, extended when a retry succeeds.
 * @param unreadable The pids whose first record read failed.
 */
function reconcileDarwinGroupRecords(
	library: DarwinLibrary,
	pgid: number,
	records: ProcessObservation[],
	unreadable: readonly number[],
): void {
	const remaining = new Set(listDarwinGroupPids(library, pgid));
	for (const pid of unreadable) {
		if (!remaining.has(pid)) continue;
		const record = readDarwinProcessRaw(library, pid);
		if (record?.pgid === pgid) {
			records.push(record);
			continue;
		}
		if (!listDarwinGroupPids(library, pgid).includes(pid)) continue;
		throw new Error(
			`Darwin listed pid ${pid} in process group ${pgid} but refused its process information.`,
		);
	}
}

/**
 * Read one Darwin process group completely, refusing an unreadable member that remains in it.
 * @param pgid The process group to observe.
 * @returns Every observable member of the group.
 */
function listDarwinGroupProcesses(pgid: number): readonly ProcessObservation[] {
	return withDarwinLibrary((library) => {
		const { records, unreadable } = readDarwinRecords(
			library,
			listDarwinGroupPids(library, pgid),
			pgid,
		);
		reconcileDarwinGroupRecords(library, pgid, records, unreadable);
		return Object.freeze(records);
	});
}

/**
 * Observe one process with exact kernel birth identity on a supported POSIX host.
 * @param pid The process to observe.
 * @returns Its observation, or undefined when it is proven absent.
 */
function readProcessObservation(pid: number): ProcessObservation | undefined {
	if (!positivePid(pid)) throw new Error(`Invalid process id ${JSON.stringify(pid)}.`);
	if (process.platform === "linux") return readLinuxProcess(pid);
	if (process.platform === "darwin") return readDarwinProcess(pid);
	throw new Error(`Process observation is not supported on ${process.platform}.`);
}

/**
 * Observe the process table with exact kernel birth identities.
 * @returns Every observable process.
 */
function listProcessObservations(): readonly ProcessObservation[] {
	if (process.platform === "linux") return listLinuxProcesses();
	if (process.platform === "darwin") return listDarwinProcesses();
	throw new Error(`Process observation is not supported on ${process.platform}.`);
}

/**
 * Observe every member of one process group, or throw when membership cannot be proved.
 * @param pgid The group to observe.
 * @returns Every member of that group.
 */
function listProcessGroupObservations(pgid: number): readonly ProcessObservation[] {
	if (!positivePid(pgid)) throw new Error(`Invalid process group id ${JSON.stringify(pgid)}.`);
	if (process.platform === "linux") {
		return Object.freeze(listLinuxProcesses().filter((process) => process.pgid === pgid));
	}
	if (process.platform === "darwin") return listDarwinGroupProcesses(pgid);
	throw new Error(`Process observation is not supported on ${process.platform}.`);
}

export {
	type ProcessObservation,
	type ProcessState,
	readProcessObservation,
	listProcessObservations,
	listProcessGroupObservations,
};

import fs from "fs";
import path from "path";
import { logger } from "@archboard/diagnostics/logger";
import { errorMessage } from "@archboard/diagnostics/thrown-error";
import { stateDir } from "@archboard/machine/state-dir";
import {
	ownerRecord,
	recordedOwnerIsGone,
	recordedOwnerPid,
	recordedOwnerStartTime,
} from "@archboard/process/observation";

const PID_FILE_NAME = /^server-\d+\.pid$/u;

/**
 * Where the Archboard server listening on a port records its pid.
 * @param port The port the server binds.
 * @returns The pidfile path under the machine-local state directory.
 */
function pidFilePath(port: number): string {
	return path.join(stateDir(), `server-${port}.pid`);
}

// Written by the Archboard server once it is actually listening, so `stop` and
// stale-process checks work for both auto-spawned and manually started servers.
/**
 * Record the server pid for a port, with its kernel start time so a later
 * sweep can tell it from a process that inherited the pid. Failure is logged
 * rather than thrown: a server that cannot write its pidfile still serves.
 * @param port The port the server binds.
 * @param pid The Archboard server's pid.
 * @returns The bytes written, or null when nothing was written.
 */
function writePidFile(port: number, pid: number): string | null {
	try {
		const file = pidFilePath(port);
		const record = ownerRecord(pid);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, record, "utf-8");
		return record;
	} catch (error) {
		logger().warn("Failed to write server pidfile:", errorMessage(error));
		return null;
	}
}

/**
 * The pidfile this process wrote as a server, and its bytes, until it releases it. Only this
 * process's own record may be removed by it: a server that bound the port after this one closed
 * its socket, or the winner of a concurrent start this one lost, owns the file now.
 */
let recorded: { port: number; record: string } | null = null;

/**
 * The pid recorded for a port, if the pidfile exists and holds a positive integer.
 * @param port The port the server binds.
 * @returns The pid, or null when there is no usable pidfile.
 */
function readPidFile(port: number): number | null {
	try {
		return recordedOwnerPid(fs.readFileSync(pidFilePath(port), "utf-8")) ?? null;
	} catch {
		return null;
	}
}

/**
 * Delete the pidfile for a port when it still holds a record, tolerating one that is gone.
 * @param port The port the server binds.
 * @param owns Whether the record it holds now is one the caller may remove.
 */
function removePidFileWhen(port: number, owns: (record: string) => boolean): void {
	const file = pidFilePath(port);
	try {
		if (owns(fs.readFileSync(file, "utf-8"))) {
			fs.unlinkSync(file);
		}
	} catch {
		/* already gone */
	}
}

/**
 * Delete the pidfile for a port when it records the server the launcher knows, so a launcher
 * never removes the record of a server that started after the one it watched.
 * @param port The port the server binds.
 * @param pid The pid of the server the launcher started or stopped.
 */
function removePidFileOf(port: number, pid: number): void {
	removePidFileWhen(port, (record) => recordedOwnerPid(record) === pid);
}

/**
 * Remove the pidfile of every server that is gone, on any port. A server
 * removes its own on a clean exit; one killed or crashed cannot, and without
 * this the state directory keeps one per port forever. A pidfile whose owner
 * may still run is kept, whatever port it names.
 * @returns How many pidfiles were removed.
 */
function sweepDeadPidFiles(): number {
	let removed = 0;
	let names: string[];
	try {
		names = fs.readdirSync(stateDir());
	} catch {
		return 0;
	}
	for (const name of names.filter((candidate) => PID_FILE_NAME.test(candidate))) {
		if (removeIfOwnerGone(path.join(stateDir(), name))) {
			removed += 1;
		}
	}
	return removed;
}

/**
 * Remove one pidfile when the server it records is gone.
 * @param file The pidfile.
 * @returns True when it was removed.
 */
function removeIfOwnerGone(file: string): boolean {
	try {
		if (!recordedOwnerIsGone(fs.readFileSync(file, "utf-8"))) {
			return false;
		}
		fs.unlinkSync(file);
		return true;
	} catch {
		// Another server swept it first, or it is unreadable; either way, keep going.
		return false;
	}
}

/**
 * Remove the pidfile for a port only when the server it records is gone: its
 * pid no longer runs, or the pid now belongs to a newer process.
 * @param port The port the server binds.
 * @returns True when the pidfile was removed.
 */
function removePidFileIfOwnerGone(port: number): boolean {
	return removeIfOwnerGone(pidFilePath(port));
}

/**
 * Whether the pidfile for a port records the start time of its process, and so
 * can tell that process from one that inherited the pid.
 * @param port The port the server binds.
 * @returns True when the record holds a start time.
 */
function pidFileRecordsStartTime(port: number): boolean {
	try {
		return recordedOwnerStartTime(fs.readFileSync(pidFilePath(port), "utf-8")) !== undefined;
	} catch {
		return false;
	}
}

/**
 * Record this process as the server listening on a port, once it listens, and
 * remove the pidfiles of servers on any port that are gone.
 * @param port The port this server binds.
 */
function recordServerPid(port: number): void {
	const record = writePidFile(port, process.pid);
	recorded = record === null ? null : { port, record };
	const swept = sweepDeadPidFiles();
	if (swept > 0) {
		logger().debug(`Removed ${swept} pidfiles of servers that are gone`);
	}
}

/**
 * Remove the pidfile this process recorded for a port, and only while it still holds the bytes
 * this process wrote. A process that never recorded the port keeps whatever is there: a
 * concurrent-start loser exiting on EADDRINUSE leaves the winner's file. So does a server whose
 * port another server bound once this one closed its socket. Synchronous, so it can run in the
 * process's `exit` handler, and safe at stop, at exit and after a failed start: it never throws
 * and releases once. The read and the removal are two calls, and a server that writes the file
 * between them still loses it; every such interleaving lost the file before this check too.
 * @param port The port this server bound.
 */
function releaseServerPid(port: number): void {
	const own = recorded;
	if (own === null || own.port !== port) {
		return;
	}
	recorded = null;
	removePidFileWhen(port, (record) => record === own.record);
}

export {
	pidFilePath,
	pidFileRecordsStartTime,
	recordServerPid,
	releaseServerPid,
	writePidFile,
	readPidFile,
	removePidFileIfOwnerGone,
	removePidFileOf,
	sweepDeadPidFiles,
};

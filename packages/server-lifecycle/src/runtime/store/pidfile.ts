import fs from "fs";
import path from "path";
import { logger } from "@archboard/diagnostics/logger";
import { errorMessage } from "@archboard/diagnostics/thrown-error";
import { stateDir } from "@archboard/workspace/state-dir";
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
 */
function writePidFile(port: number, pid: number): void {
	try {
		const file = pidFilePath(port);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, ownerRecord(pid), "utf-8");
	} catch (error) {
		logger.warn("Failed to write server pidfile:", errorMessage(error));
	}
}

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
 * Delete the pidfile for a port, tolerating one that is already gone.
 * @param port The port the server binds.
 */
function removePidFile(port: number): void {
	try {
		fs.unlinkSync(pidFilePath(port));
	} catch {
		/* already gone */
	}
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
	writePidFile(port, process.pid);
	const swept = sweepDeadPidFiles();
	if (swept > 0) {
		logger.debug(`Removed ${swept} pidfiles of servers that are gone`);
	}
}

export {
	pidFilePath,
	pidFileRecordsStartTime,
	recordServerPid,
	writePidFile,
	readPidFile,
	removePidFile,
	removePidFileIfOwnerGone,
	sweepDeadPidFiles,
};

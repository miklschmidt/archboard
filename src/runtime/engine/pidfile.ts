import fs from "fs";
import path from "path";
import { logger } from "@/runtime/engine/logger";
import { errorMessage } from "@/runtime/engine/lib/thrown-error";
import { stateDir } from "@/runtime/engine/state-dir";
import { ownerRecord, recordedOwnerIsGone, recordedOwnerPid } from "@/shared/process-observation";

const PID_FILE_NAME = /^server-\d+\.pid$/u;

/**
 * Where the canvas listening on a port records its pid.
 * @param port The port the canvas binds.
 * @returns The pidfile path under the machine-local state directory.
 */
function pidFilePath(port: number): string {
	return path.join(stateDir(), `server-${port}.pid`);
}

// Written by the canvas server once it is actually listening, so `stop` and
// stale-process checks work for both auto-spawned and manually started servers.
/**
 * Record the canvas pid for a port, with its kernel start time so a later
 * sweep can tell it from a process that inherited the pid. Failure is logged
 * rather than thrown: a canvas that cannot write its pidfile still serves.
 * @param port The port the canvas binds.
 * @param pid The canvas server's pid.
 */
function writePidFile(port: number, pid: number): void {
	try {
		const file = pidFilePath(port);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, ownerRecord(pid), "utf-8");
	} catch (error) {
		logger.warn("Failed to write canvas pidfile:", errorMessage(error));
	}
}

/**
 * The pid recorded for a port, if the pidfile exists and holds a positive integer.
 * @param port The port the canvas binds.
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
 * @param port The port the canvas binds.
 */
function removePidFile(port: number): void {
	try {
		fs.unlinkSync(pidFilePath(port));
	} catch {
		/* already gone */
	}
}

/**
 * Remove the pidfile of every canvas that is gone, on any port. A canvas
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
 * Remove one pidfile when the canvas it records is gone.
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
		// Another canvas swept it first, or it is unreadable; either way, keep going.
		return false;
	}
}

export { pidFilePath, writePidFile, readPidFile, removePidFile, sweepDeadPidFiles };

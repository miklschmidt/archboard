import fs from "fs";
import path from "path";
import { logger } from "@/runtime/engine/logger";
import { errorMessage } from "@/runtime/engine/lib/thrown-error";
import { stateDir } from "@/runtime/engine/state-dir";

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
 * Record the canvas pid for a port. Failure is logged rather than thrown: a
 * canvas that cannot write its pidfile still serves.
 * @param port The port the canvas binds.
 * @param pid The canvas server's pid.
 */
function writePidFile(port: number, pid: number): void {
	try {
		const file = pidFilePath(port);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, String(pid), "utf-8");
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
		const raw = fs.readFileSync(pidFilePath(port), "utf-8").trim();
		const pid = parseInt(raw, 10);
		return Number.isInteger(pid) && pid > 0 ? pid : null;
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

export { pidFilePath, writePidFile, readPidFile, removePidFile };

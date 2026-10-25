// Stopping the Archboard server without ever signalling a process that is not it.

import { existsSync } from "node:fs";
import { errorMessage } from "@archboard/diagnostics/thrown-error";
import {
	SERVER_STOP_CONFIRM_MS,
	SERVER_STOP_PIDFILE_POLL_MS,
	SERVER_STOP_PIDFILE_WAIT_MS,
	SERVER_STOP_PROBE_POLL_MS,
} from "@archboard/timing";
import { ARCHBOARD_URL } from "#runtime/services/config.ts";
import { foreignServiceError, type HealthStatus } from "#runtime/clients/server-client.ts";
import {
	pidFilePath,
	pidFileRecordsStartTime,
	readPidFile,
	removePidFile,
	removePidFileIfOwnerGone,
} from "#runtime/store/pidfile.ts";
import {
	healthOrNull,
	isServerHealth,
	serverPort,
} from "#runtime/operations/server-spawn-target.ts";

interface StopResult {
	stopped: boolean;
	pid?: number;
	message: string;
}

/**
 * The error for a recorded process that is alive but does not answer. A
 * pidfile with no start time cannot tell its process from one that inherited
 * the pid, so the message only says the process may be the server.
 * @param port The server port.
 * @param pid The pid the pidfile recorded.
 * @returns The error to throw.
 */
function stuckOwnerError(port: number, pid: number): Error {
	const certain = pidFileRecordsStartTime(port);
	const identity = certain
		? `Process ${pid} is alive and recorded as the Archboard server for port ${port}`
		: `Process ${pid} may be the Archboard server for port ${port}; its pidfile records no start time, so the pid may belong to an unrelated process`;
	const advice = certain
		? `If it is a stuck or older server, end it with \`kill ${pid}\``
		: `Check \`ps -p ${pid}\` before you end it with \`kill ${pid}\`, or delete ${pidFilePath(port)} if it is not the server`;
	return new Error(
		`${identity}, but it does not answer at ${ARCHBOARD_URL}. The pidfile is kept. ${advice}, then run \`archboard stop\` again.`,
	);
}

/**
 * Wait for the pidfile of a server that stopped answering to go away: its
 * owner exits, or the server removes the file itself.
 * @param port The server port.
 * @param pid The pid the pidfile recorded.
 * @returns The stop result once the pidfile is gone, or undefined when the
 * recorded process still runs after the wait.
 */
async function awaitPidFileGone(port: number, pid: number): Promise<StopResult | undefined> {
	const deadline = Date.now() + SERVER_STOP_PIDFILE_WAIT_MS;
	for (;;) {
		if (removePidFileIfOwnerGone(port)) {
			return {
				stopped: false,
				pid,
				message: `Archboard server is not running; stale pidfile removed (pid ${pid}).`,
			};
		}
		if (!existsSync(pidFilePath(port))) {
			return { stopped: false, pid, message: "Archboard server is not running." };
		}
		if (Date.now() >= deadline) return undefined;
		// oxlint-disable-next-line no-await-in-loop -- the poll interval between looks at the pidfile
		await new Promise((resolve) => setTimeout(resolve, SERVER_STOP_PIDFILE_POLL_MS));
	}
}

/**
 * What `stop` answers when nothing answers `/health`: a pidfile whose process
 * is gone is cleaned up, never signalled. A pidfile whose process still runs
 * is kept, because the process may hold the port (an older build, or a server
 * that is starting or stopping) and deleting the file would orphan it. A server
 * that is shutting down stops answering before it removes its pidfile, so the
 * file gets a short wait to go away first.
 * @param port The server port.
 * @param filePid The pid the pidfile recorded, if any.
 * @returns The stop result for an absent server.
 * @throws {Error} When the recorded process is alive but does not answer.
 */
async function absentServerResult(port: number, filePid: number | null): Promise<StopResult> {
	if (filePid === null) {
		return { stopped: false, message: "Archboard server is not running." };
	}
	const gone = await awaitPidFileGone(port, filePid);
	if (gone === undefined) throw stuckOwnerError(port, filePid);
	return gone;
}

/**
 * The pid a live responder reports about itself, accepted only with the
 * identity marker and a sane positive value: pid 0 or a negative value would
 * make process.kill signal our own process group.
 * @param health The responder's health payload.
 * @returns The pid to signal, or null when the responder is not this server.
 */
function verifiedServerPid(health: HealthStatus): number | null {
	const pid = health.pid;
	return isServerHealth(health) && pid !== undefined && Number.isSafeInteger(pid) && pid > 0
		? pid
		: null;
}

/**
 * Wait for a signalled server to stop answering, refusing if it starts holding work.
 * @param port The server port, whose pidfile is removed on success.
 * @param pid The pid that was signalled.
 * @returns The stop result once `/health` stops answering.
 */
async function awaitServerStop(port: number, pid: number): Promise<StopResult> {
	const deadline = Date.now() + SERVER_STOP_CONFIRM_MS;
	while (Date.now() < deadline) {
		// oxlint-disable-next-line no-await-in-loop -- one probe after another until the server is gone
		const postSignalHealth = await healthOrNull();
		if (!postSignalHealth) {
			removePidFile(port);
			return { stopped: true, pid, message: `Archboard server (pid ${pid}) stopped.` };
		}
		// oxlint-disable-next-line no-await-in-loop -- the poll interval between probes
		await new Promise((resolve) => setTimeout(resolve, SERVER_STOP_PROBE_POLL_MS));
	}
	throw new Error(
		`Archboard server (pid ${pid}) did not stop within ${SERVER_STOP_CONFIRM_MS / 1000}s.`,
	);
}

/**
 * Stop the Archboard server. Identity-safe: we only ever signal the pid that a
 * live /health responder reports about ITSELF, and only when it identifies
 * as this Archboard server. A stale pidfile is cleaned up, never killed —
 * recycled pids and unrelated apps squatting on the port are safe.
 * @returns Whether a server was stopped, and which.
 */
async function stopServer(): Promise<StopResult> {
	const port = serverPort();
	const filePid = readPidFile(port);
	const health = await healthOrNull();

	if (!health) {
		return absentServerResult(port, filePid);
	}

	const pid = verifiedServerPid(health);
	if (pid === null) {
		throw foreignServiceError();
	}
	try {
		process.kill(pid, "SIGTERM");
	} catch (error) {
		throw new Error(`Failed to signal Archboard server (pid ${pid}): ${errorMessage(error)}`, {
			cause: error,
		});
	}

	return awaitServerStop(port, pid);
}

export { type StopResult, stopServer };

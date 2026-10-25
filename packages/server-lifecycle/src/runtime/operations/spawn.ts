import { spawn, type ChildProcess } from "child_process";
import { Readable } from "node:stream";
import path from "path";
import { logger } from "@archboard/diagnostics/logger";
import { SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";
import { ARCHBOARD_URL, ARCHBOARD_NO_AUTOSTART } from "#runtime/services/config.ts";
import {
	foreignServiceError,
	markServerIdentityVerified,
	OtherSourceError,
	type HealthStatus,
} from "#runtime/clients/server-client.ts";

import { existsSync } from "node:fs";
import {
	pidFilePath,
	pidFileRecordsStartTime,
	readPidFile,
	removePidFile,
	removePidFileIfOwnerGone,
} from "#runtime/store/pidfile.ts";
import { resolveCodexExecutable } from "@archboard/codex-app-server/process";
import { createCodexProcessGroupOperations } from "@archboard/process/codex-group";
import { SERVER_LIFECYCLE_MS } from "@archboard/timing";
import { SERVER_STARTUP_TERMINAL_FD_ENV } from "#runtime/protocol/server-startup-terminal.ts";
import { readProcessObservation } from "@archboard/process/observation";
import {
	completeFailedServerCleanup,
	createServerStartupProtocolReader,
	failedServerCleanupTiming,
	type ServerStartupProtocolReader,
} from "#runtime/operations/server-startup-cleanup.ts";
import { errnoCode } from "@archboard/diagnostics/errno";
import { errorMessage } from "@archboard/diagnostics/thrown-error";
import {
	serverPort,
	healthOrNull,
	isServerHealth,
	isLoopbackUrl,
	spawnBindHost,
	startupRefusal,
	unreachableError,
} from "#runtime/operations/server-spawn-target.ts";

/**
 * Whether a server's exit message says another server owns the port or its
 * Codex state, which a concurrent start resolves by waiting rather than failing.
 * @param message The terminal message the exiting server left.
 * @returns True when the refusal names a concurrent owner.
 */
function isConcurrentOwnerRefusal(message: string): boolean {
	return (
		message.includes("Another server owns this Codex state") ||
		(message.includes("Refusing to start Archboard server") &&
			message.includes("already listening"))
	);
}

/**
 * Wait for a promise, giving up after a bound.
 * @param pending The promise to wait on.
 * @param timeoutMs How long to wait.
 * @returns The promise's value, or null when the bound passed first.
 */
function waitForPromise<T>(pending: Promise<T>, timeoutMs: number): Promise<T | null> {
	return new Promise((resolve) => {
		let settled = false;
		const timer = setTimeout(() => finish(null), timeoutMs);
		/**
		 * Resolve once, whichever of the timer and the promise comes first.
		 * @param value The promise's value, or null on timeout.
		 */
		const finish = (value: T | null): void => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			resolve(value);
		};
		void pending.then((value) => finish(value));
	});
}

/**
 * Whether a process is gone, frozen, or already a zombie.
 * @param pid The process to inspect.
 * @returns True once the pid is absent or its kernel state cannot run.
 */
function processIsStopped(pid: number): boolean {
	const observation = readProcessObservation(pid);
	return observation?.state !== "live";
}

interface EnsureResult {
	url: string;
	spawned: boolean;
}

/** How long readiness may take, and whether this is an explicit start. */
interface EnsureOptions {
	timeoutMs?: number;
	force?: boolean;
}

/**
 * Refuse an auto-start the operator has switched off. An explicit `start` is
 * user intent and overrides the opt-out.
 * @throws {Error} When auto-start is disabled.
 */
function refuseDisabledAutoStart(): void {
	if (ARCHBOARD_NO_AUTOSTART) {
		throw unreachableError("auto-start disabled by ARCHBOARD_NO_AUTOSTART=1");
	}
}

/**
 * Refuse a start the machine could not carry out.
 *
 * The Archboard server is spawned detached with its stdio thrown away, so a
 * refusal of its own would land nowhere and the caller would wait eight
 * seconds to be told the server "did not become healthy". Ask the questions it
 * would ask here, where somebody is reading. A vault is not one of them: the
 * server serves every vault, and each call names its own (ADR 0049).
 * @throws {Error} When the URL is not loopback, or the package-local Codex
 * runtime cannot be verified.
 */
function refuseUnstartableServer(): void {
	if (!isLoopbackUrl()) {
		throw unreachableError("refusing to auto-start a non-loopback server URL");
	}
	try {
		resolveCodexExecutable({ installedIn: SOURCE_CHECKOUT });
	} catch (cause) {
		throw startupRefusal(
			cause instanceof Error
				? `Codex startup refused. ${cause.message}`
				: "Codex startup refused because the exact package-local runtime could not be verified.",
		);
	}
}

/**
 * Refuse an auto-start that the configuration or the environment rules out,
 * before any process is spawned.
 * @param force True for the explicit `start` command, which overrides the opt-outs.
 * @throws {Error} When this server may not, or could not, be started.
 */
function refuseUnlessAutoStartAllowed(force: boolean): void {
	if (!force) {
		refuseDisabledAutoStart();
	}
	refuseUnstartableServer();
}

interface ChildExit {
	readonly code: number | null;
	readonly signal: NodeJS.Signals | null;
}

/** What the launcher has seen of the spawned server so far, updated by its events. */
interface ObservedChild {
	failure: Error | null;
	exit: ChildExit | null;
}

/** A spawned Archboard server and the launcher's view of it. */
interface SpawnedServer {
	readonly child: ChildProcess;
	readonly pid: number;
	readonly observed: ObservedChild;
	readonly closed: Promise<void>;
	readonly protocol: ServerStartupProtocolReader;
}

/**
 * Spawn the Archboard server detached, with the startup cleanup protocol on fd 3.
 * @returns The child, its pid and the observation handles the readiness wait uses.
 */
function spawnServer(): SpawnedServer {
	// The thin apps/server/src/server.ts process entrypoint of the checkout whose source runs;
	// spawn args must be path strings. process.execPath is the bun that is
	// running us, which is what can read a .ts entry point at all.
	const serverEntry = path.join(SOURCE_CHECKOUT, "apps", "server", "src", "server.ts");
	const child = spawn(process.execPath, [serverEntry], {
		detached: true,
		stdio: ["ignore", "ignore", "ignore", "pipe"],
		env: {
			...process.env,
			PORT: String(serverPort()),
			HOST: spawnBindHost(),
			[SERVER_STARTUP_TERMINAL_FD_ENV]: "3",
		},
	});
	const observed: ObservedChild = { failure: null, exit: null };
	let resolveClosed!: () => void;
	const closed = new Promise<void>((resolve) => void (resolveClosed = resolve));
	const terminalStream = child.stdio[3];
	const protocol = createServerStartupProtocolReader(
		terminalStream instanceof Readable ? terminalStream : null,
	);
	child.once("error", (error) => {
		observed.failure = error;
	});
	child.once("close", (code, signal) => {
		observed.exit = { code, signal };
		resolveClosed();
	});
	if (child.pid === undefined) {
		protocol.destroy();
		throw startupRefusal(
			`Archboard server could not start. ${observed.failure?.message ?? "The process was not created."}`,
		);
	}
	return { child, pid: child.pid, observed, closed, protocol };
}

/**
 * Signal the spawned server unless it has already exited, tolerating a process
 * that vanished in between.
 * @param spawned The spawned server.
 * @param signal The signal to send.
 */
function signalSpawnedServer(spawned: SpawnedServer, signal: NodeJS.Signals): void {
	if (spawned.observed.exit !== null) {
		return;
	}
	try {
		spawned.child.kill(signal);
	} catch (error) {
		if (errnoCode(error) !== "ESRCH") {
			throw error;
		}
	}
}

/**
 * Finish a start that failed: run the bounded cleanup state machine against
 * the exact pid, drop its pidfile, and throw the failure the caller should see.
 * @param spawned The spawned server.
 * @param failure Why the start failed.
 * @returns Never; every path throws.
 */
async function cleanupFailedStart(spawned: SpawnedServer, failure: Error): Promise<never> {
	const { observed, pid, protocol } = spawned;
	const groupOperations = createCodexProcessGroupOperations();
	const cleanup = await completeFailedServerCleanup({
		serverPid: pid,
		protocol,
		timing: failedServerCleanupTiming(),
		operations: {
			now: Date.now,
			/**
			 * Sleep for a slice of the cleanup deadline.
			 * @param ms How long.
			 * @returns Resolves after the wait.
			 */
			wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
			/**
			 * Whether the server's close event has fired.
			 * @returns True once it has exited.
			 */
			serverExited: () => observed.exit !== null,
			/**
			 * Whether the server is gone or frozen.
			 * @returns True once it has exited or is stopped.
			 */
			serverStopped: () => observed.exit !== null || processIsStopped(pid),
			/**
			 * Wait for the close event within a bound.
			 * @param maxWaitMs How long to wait.
			 * @returns True when it closed in time.
			 */
			waitForServerExit: async (maxWaitMs) =>
				(await waitForPromise(
					spawned.closed.then(() => true),
					maxWaitMs,
				)) === true,
			/**
			 * Signal the server unless it already exited.
			 * @param signal The signal to send.
			 */
			signalServer: (signal) => {
				signalSpawnedServer(spawned, signal);
			},
			inspectGroup: groupOperations.inspect,
			signalGroup: groupOperations.signal,
		},
	}).catch((error: unknown) => {
		protocol.destroy();
		throw startupRefusal(
			`${failure.message} The bounded cleanup state machine failed for exact server pid ${String(pid)}: ${errorMessage(error)}. Inspect that attempt before retrying.`,
		);
	});
	protocol.destroy();
	if (readPidFile(serverPort()) === pid) {
		removePidFile(serverPort());
	}
	if (cleanup.cleanup !== "proven") {
		throw startupRefusal(
			`${failure.message} ${cleanup.reason} Inspect server pid ${String(pid)}${cleanup.group === null ? "" : ` and Codex group ${cleanup.group.pgid}`} before retrying.`,
		);
	}
	const terminalMessage = protocol.terminalMessage();
	throw terminalMessage === null ? failure : startupRefusal(terminalMessage);
}

/** Where a concurrent owner's refusal is kept until the deadline. */
interface DeferredFailure {
	failure: Error | null;
}

/**
 * What a server's exit before readiness amounts to.
 *
 * A concurrent owner's refusal is deferred rather than returned, so the wait
 * continues against the server that won.
 * @param spawned The spawned server.
 * @param deferred Where a concurrent-owner refusal is kept for the deadline.
 * @returns The failure to act on now, or null to keep waiting.
 */
function exitFailureOf(spawned: SpawnedServer, deferred: DeferredFailure): Error | null {
	const { observed, protocol } = spawned;
	if (observed.exit === null) {
		return null;
	}
	const detail = protocol.terminalMessage() ?? "";
	if (isConcurrentOwnerRefusal(detail)) {
		deferred.failure ??= startupRefusal(detail);
		return null;
	}
	return startupRefusal(
		detail ||
			`Archboard server exited before readiness with code ${String(observed.exit.code)} and signal ${String(observed.exit.signal)}.`,
	);
}

/**
 * The failure to clean up after when the spawned server has died or the
 * protocol broke, or null while it may still become healthy.
 * @param spawned The spawned server.
 * @param deferred Where a concurrent-owner refusal is kept for the deadline.
 * @returns The failure to act on now, or null to keep waiting.
 */
function startFailureOf(spawned: SpawnedServer, deferred: DeferredFailure): Error | null {
	const failure = spawned.observed.failure ?? spawned.protocol.failure();
	if (failure !== null) {
		return startupRefusal(`Archboard server could not start. ${failure.message}`);
	}
	return exitFailureOf(spawned, deferred);
}

/**
 * Poll `/health` until the spawned server identifies itself, or fail with
 * whatever stopped it.
 * @param spawned The spawned server.
 * @param timeoutMs How long readiness may take.
 * @returns The server URL once it answers as itself.
 */
async function awaitServerReadiness(
	spawned: SpawnedServer,
	timeoutMs: number,
): Promise<EnsureResult> {
	const deadline = Date.now() + timeoutMs;
	const deferred: DeferredFailure = { failure: null };
	while (Date.now() < deadline) {
		// oxlint-disable-next-line no-await-in-loop -- readiness is one probe after another until the deadline
		const health = await healthOrNull().catch((error: unknown) =>
			error instanceof OtherSourceError ? error : null,
		);
		if (health instanceof OtherSourceError) {
			// A server of another checkout's source took the port first, so this one cannot listen.
			return cleanupFailedStart(spawned, health);
		}
		if (isServerHealth(health)) {
			markServerIdentityVerified();
			spawned.protocol.destroy();
			spawned.child.unref();
			process.stderr.write(
				`Archboard server running at ${ARCHBOARD_URL}. Open it in a browser only for live canvas work and capture.\n`,
			);
			return { url: ARCHBOARD_URL, spawned: true };
		}
		const failure = startFailureOf(spawned, deferred);
		if (failure !== null) {
			return cleanupFailedStart(spawned, failure);
		}
		// oxlint-disable-next-line no-await-in-loop -- the poll interval between probes
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	return cleanupFailedStart(
		spawned,
		deferred.failure ??
			unreachableError(`auto-started server did not become healthy within ${timeoutMs}ms`),
	);
}

/**
 * Make sure OUR Archboard server is answering at ARCHBOARD_URL,
 * auto-spawning a detached one on a loopback URL when needed. A healthy
 * responder without the service identity marker is a foreign service —
 * proceeding against it would only produce confusing downstream errors.
 *
 * `force: true` (the explicit `start` command) overrides the auto-start
 * opt-outs — an explicit start is user intent, not auto-start.
 *
 * A concurrent-spawn race is safe: the Archboard server's loopback guard makes
 * the losing process exit, and every caller here only proceeds once /health
 * answers.
 * @param options How long readiness may take, and whether this is an explicit start.
 * @returns The server URL and whether this call started the server.
 * @throws {Error} When another service holds the port, or the server may not
 * be started.
 */
async function ensureServerRunning(options: EnsureOptions = {}): Promise<EnsureResult> {
	const timeoutMs = options.timeoutMs ?? SERVER_LIFECYCLE_MS.startupReadiness;

	const existing = await healthOrNull();
	if (existing) {
		if (!isServerHealth(existing)) {
			throw foreignServiceError();
		}
		markServerIdentityVerified();
		return { url: ARCHBOARD_URL, spawned: false };
	}

	refuseUnlessAutoStartAllowed(options.force === true);
	const spawned = spawnServer();
	logger.info(`Auto-starting Archboard server (pid ${spawned.pid}) at ${ARCHBOARD_URL}`);
	return awaitServerReadiness(spawned, timeoutMs);
}

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
	const deadline = Date.now() + SERVER_LIFECYCLE_MS.stopPidfileWait;
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
		await new Promise((resolve) => setTimeout(resolve, SERVER_LIFECYCLE_MS.stopPidfilePoll));
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
	const deadline = Date.now() + SERVER_LIFECYCLE_MS.stopConfirm;
	while (Date.now() < deadline) {
		// oxlint-disable-next-line no-await-in-loop -- one probe after another until the server is gone
		const postSignalHealth = await healthOrNull();
		if (!postSignalHealth) {
			removePidFile(port);
			return { stopped: true, pid, message: `Archboard server (pid ${pid}) stopped.` };
		}
		// oxlint-disable-next-line no-await-in-loop -- the poll interval between probes
		await new Promise((resolve) => setTimeout(resolve, SERVER_LIFECYCLE_MS.stopProbePoll));
	}
	throw new Error(
		`Archboard server (pid ${pid}) did not stop within ${SERVER_LIFECYCLE_MS.stopConfirm / 1000}s.`,
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

export {
	foreignServiceError,
	serverPort,
	isServerHealth,
	type EnsureResult,
	ensureServerRunning,
	refuseUnstartableServer,
	type StopResult,
	stopServer,
};

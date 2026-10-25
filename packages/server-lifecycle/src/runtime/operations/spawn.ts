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
} from "#runtime/clients/server-client-transport.ts";
import { readPidFile, removePidFile } from "#runtime/store/pidfile.ts";
import {
	resolveProjectCodexExecutable,
	verifyCodexExecutable,
} from "@archboard/codex-app-server/process";
import { createCodexProcessGroupOperations } from "@archboard/process/codex-group";
import { SERVER_STARTUP_READINESS_MS } from "@archboard/timing";
import { SERVER_STARTUP_TERMINAL_FD_ENV } from "#runtime/protocol/server-startup-terminal.ts";
import { readProcessObservation } from "@archboard/process/observation";
import {
	completeFailedServerCleanup,
	createServerStartupProtocolReader,
	failedServerCleanupTiming,
	type ServerStartupProtocolReader,
} from "#runtime/operations/server-startup-cleanup.ts";
import { errorCode, errorMessage } from "@archboard/diagnostics/thrown-error";
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

/** Where the server answers, and whether this call started it. */
interface Reached {
	url: string;
	spawned: boolean;
}

/** A running server: where it answers, whether this call started it, and its pid file's pid. */
interface EnsureResult extends Reached {
	pid: number | undefined;
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
		verifyCodexExecutable(resolveProjectCodexExecutable());
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
		if (errorCode(error) !== "ESRCH") {
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
async function awaitServerReadiness(spawned: SpawnedServer, timeoutMs: number): Promise<Reached> {
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
 * @returns The server URL, whether this call started the server, and the pid its pid file records.
 * @throws {Error} When another service holds the port, or the server may not
 * be started.
 */
async function ensureServerRunning(options: EnsureOptions = {}): Promise<EnsureResult> {
	const reached = await reachOrStartServer(options);
	return { ...reached, pid: readPidFile(serverPort()) ?? undefined };
}

/**
 * Reach the server that answers, or start one and wait for it.
 * @param options How long readiness may take, and whether this is an explicit start.
 * @returns The server URL and whether this call started the server.
 */
async function reachOrStartServer(options: EnsureOptions): Promise<Reached> {
	const timeoutMs = options.timeoutMs ?? SERVER_STARTUP_READINESS_MS;

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

export { type EnsureResult, ensureServerRunning, refuseUnstartableServer };

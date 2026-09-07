import { spawn, type ChildProcess } from "child_process";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "url";
import { logger } from "@/runtime/engine/logger";
import {
	ARCHBOARD_VAULT,
	EXPRESS_SERVER_URL,
	ENABLE_CANVAS_SYNC,
	EXCALIDRAW_NO_AUTOSTART,
	noVaultMessage,
} from "@/runtime/engine/config";
import {
	foreignServiceError,
	markCanvasIdentityVerified,
	type HealthStatus,
} from "@/runtime/engine/canvas-client";

import { readPidFile, removePidFile } from "@/runtime/engine/pidfile";
import {
	resolveProjectCodexExecutable,
	verifyCodexExecutable,
} from "@/runtime/codex-process/executable";
import { createCodexProcessGroupOperations } from "@/runtime/codex-process/process-group";
import { CANVAS_STARTUP_READINESS_MS } from "@/shared/timing/timing";
import { CANVAS_STARTUP_TERMINAL_FD_ENV } from "@/shared/canvas-startup-terminal";
import {
	completeFailedCanvasCleanup,
	createCanvasStartupProtocolReader,
	failedCanvasCleanupTiming,
	type CanvasStartupProtocolReader,
} from "@/runtime/engine/canvas-startup-cleanup";
import { codedError, errorCode, errorMessage } from "@/runtime/engine/lib/thrown-error";
import {
	canvasPort,
	healthOrNull,
	heldCanvasError,
	isCanvasHealth,
	isLoopbackUrl,
	spawnBindHost,
	startupRefusal,
	unreachableError,
} from "@/runtime/engine/lib/canvas-spawn-target";

/**
 * Whether a server's exit message says another canvas owns the port or the
 * Codex roots, which a concurrent start resolves by waiting rather than failing.
 * @param message The terminal message the exiting server left.
 * @returns True when the refusal names a concurrent owner.
 */
function isConcurrentOwnerRefusal(message: string): boolean {
	return (
		message.includes("Dedicated Codex roots are locked or colliding") ||
		(message.includes("Refusing to start canvas server") && message.includes("already listening"))
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
 * Whether a process is frozen or already a zombie, read from `/proc`.
 * @param pid The process to inspect.
 * @returns True for a stopped, traced, zombie or dead state; false when unreadable.
 */
function processIsStopped(pid: number): boolean {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		const state = stat.slice(stat.lastIndexOf(")") + 2).split(" ", 1)[0];
		return state === "T" || state === "t" || state === "Z" || state === "X";
	} catch {
		return false;
	}
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
 * user intent and overrides both opt-outs.
 * @throws {Error} When auto-start is disabled.
 */
function refuseDisabledAutoStart(): void {
	if (EXCALIDRAW_NO_AUTOSTART) {
		throw unreachableError("auto-start disabled by EXCALIDRAW_NO_AUTOSTART=1");
	}
	if (!ENABLE_CANVAS_SYNC) {
		throw unreachableError("auto-start disabled because ENABLE_CANVAS_SYNC=false");
	}
}

/**
 * Refuse a start the machine could not carry out.
 *
 * The canvas refuses to start without a vault (ADR 0015), and it is spawned
 * detached with its stdio thrown away, so its refusal would land nowhere and
 * the caller would wait eight seconds to be told the server "did not become
 * healthy". Ask the same questions here, where somebody is reading.
 * @throws {Error} When the URL is not loopback, there is no vault, or the
 * package-local Codex runtime cannot be verified.
 */
function refuseUnstartableCanvas(): void {
	if (!isLoopbackUrl()) {
		throw unreachableError("refusing to auto-start a non-loopback canvas URL");
	}
	if (!ARCHBOARD_VAULT) {
		throw codedError(noVaultMessage(), "CANVAS_UNREACHABLE");
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
 * @throws {Error} When this canvas may not, or could not, be started.
 */
function refuseUnlessAutoStartAllowed(force: boolean): void {
	if (!force) {
		refuseDisabledAutoStart();
	}
	refuseUnstartableCanvas();
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

/** A spawned canvas server and the launcher's view of it. */
interface SpawnedCanvas {
	readonly child: ChildProcess;
	readonly pid: number;
	readonly observed: ObservedChild;
	readonly closed: Promise<void>;
	readonly protocol: CanvasStartupProtocolReader;
}

/**
 * Spawn the canvas server detached, with the startup cleanup protocol on fd 3.
 * @returns The child, its pid and the observation handles the readiness wait uses.
 */
function spawnCanvasServer(): SpawnedCanvas {
	// This runtime module resolves the thin src/server.ts process entrypoint;
	// spawn args must be path strings. process.execPath is the bun that is
	// running us, which is what can read a .ts entry point at all.
	const serverEntry = fileURLToPath(new URL("../../server.ts", import.meta.url));
	const child = spawn(process.execPath, [serverEntry], {
		detached: true,
		stdio: ["ignore", "ignore", "ignore", "pipe"],
		env: {
			...process.env,
			PORT: String(canvasPort()),
			HOST: spawnBindHost(),
			[CANVAS_STARTUP_TERMINAL_FD_ENV]: "3",
		},
	});
	const observed: ObservedChild = { failure: null, exit: null };
	let resolveClosed!: () => void;
	const closed = new Promise<void>((resolve) => void (resolveClosed = resolve));
	const terminalStream = child.stdio[3];
	const protocol = createCanvasStartupProtocolReader(
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
			`Canvas server could not start. ${observed.failure?.message ?? "The process was not created."}`,
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
function signalSpawnedCanvas(spawned: SpawnedCanvas, signal: NodeJS.Signals): void {
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
async function cleanupFailedStart(spawned: SpawnedCanvas, failure: Error): Promise<never> {
	const { observed, pid, protocol } = spawned;
	const groupOperations = createCodexProcessGroupOperations();
	const cleanup = await completeFailedCanvasCleanup({
		canvasPid: pid,
		protocol,
		timing: failedCanvasCleanupTiming(),
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
			canvasExited: () => observed.exit !== null,
			/**
			 * Whether the server is gone or frozen.
			 * @returns True once it has exited or is stopped.
			 */
			canvasStopped: () => observed.exit !== null || processIsStopped(pid),
			/**
			 * Wait for the close event within a bound.
			 * @param maxWaitMs How long to wait.
			 * @returns True when it closed in time.
			 */
			waitForCanvasExit: async (maxWaitMs) =>
				(await waitForPromise(
					spawned.closed.then(() => true),
					maxWaitMs,
				)) === true,
			/**
			 * Signal the server unless it already exited.
			 * @param signal The signal to send.
			 */
			signalCanvas: (signal) => {
				signalSpawnedCanvas(spawned, signal);
			},
			inspectGroup: groupOperations.inspect,
			signalGroup: groupOperations.signal,
		},
	}).catch((error: unknown) => {
		protocol.destroy();
		throw startupRefusal(
			`${failure.message} The bounded cleanup state machine failed for exact canvas pid ${String(pid)}: ${errorMessage(error)}. Inspect that attempt before retrying.`,
		);
	});
	protocol.destroy();
	if (readPidFile(canvasPort()) === pid) {
		removePidFile(canvasPort());
	}
	if (cleanup.cleanup !== "proven") {
		throw startupRefusal(
			`${failure.message} ${cleanup.reason} Inspect canvas pid ${String(pid)}${cleanup.group === null ? "" : ` and Codex group ${cleanup.group.pgid}`} before retrying.`,
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
 * continues against the canvas that won.
 * @param spawned The spawned server.
 * @param deferred Where a concurrent-owner refusal is kept for the deadline.
 * @returns The failure to act on now, or null to keep waiting.
 */
function exitFailureOf(spawned: SpawnedCanvas, deferred: DeferredFailure): Error | null {
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
			`Canvas server exited before readiness with code ${String(observed.exit.code)} and signal ${String(observed.exit.signal)}.`,
	);
}

/**
 * The failure to clean up after when the spawned server has died or the
 * protocol broke, or null while it may still become healthy.
 * @param spawned The spawned server.
 * @param deferred Where a concurrent-owner refusal is kept for the deadline.
 * @returns The failure to act on now, or null to keep waiting.
 */
function startFailureOf(spawned: SpawnedCanvas, deferred: DeferredFailure): Error | null {
	const failure = spawned.observed.failure ?? spawned.protocol.failure();
	if (failure !== null) {
		return startupRefusal(`Canvas server could not start. ${failure.message}`);
	}
	return exitFailureOf(spawned, deferred);
}

/**
 * Poll `/health` until the spawned server identifies itself, or fail with
 * whatever stopped it.
 * @param spawned The spawned server.
 * @param timeoutMs How long readiness may take.
 * @returns The canvas URL once it answers as itself.
 */
async function awaitCanvasReadiness(
	spawned: SpawnedCanvas,
	timeoutMs: number,
): Promise<EnsureResult> {
	const deadline = Date.now() + timeoutMs;
	const deferred: DeferredFailure = { failure: null };
	while (Date.now() < deadline) {
		// oxlint-disable-next-line no-await-in-loop -- readiness is one probe after another until the deadline
		if (isCanvasHealth(await healthOrNull(400))) {
			markCanvasIdentityVerified();
			spawned.protocol.destroy();
			spawned.child.unref();
			process.stderr.write(
				`Canvas server running at ${EXPRESS_SERVER_URL}. Open it in a browser only for live canvas work and capture.\n`,
			);
			return { url: EXPRESS_SERVER_URL, spawned: true };
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
 * Make sure OUR canvas server is answering at EXPRESS_SERVER_URL,
 * auto-spawning a detached one on a loopback URL when needed. A healthy
 * responder without the service identity marker is a foreign service —
 * proceeding against it would only produce confusing downstream errors.
 *
 * `force: true` (the explicit `start` command) overrides the auto-start
 * opt-outs — an explicit start is user intent, not auto-start.
 *
 * A concurrent-spawn race is safe: the canvas server's loopback guard makes
 * the losing process exit, and every caller here only proceeds once /health
 * answers.
 * @param options How long readiness may take, and whether this is an explicit start.
 * @returns The canvas URL and whether this call started the server.
 * @throws {Error} When another service holds the port, or the canvas may not
 * be started.
 */
async function ensureCanvasRunning(options: EnsureOptions = {}): Promise<EnsureResult> {
	const timeoutMs = options.timeoutMs ?? CANVAS_STARTUP_READINESS_MS;

	const existing = await healthOrNull();
	if (existing) {
		if (!isCanvasHealth(existing)) {
			throw foreignServiceError();
		}
		markCanvasIdentityVerified();
		return { url: EXPRESS_SERVER_URL, spawned: false };
	}

	refuseUnlessAutoStartAllowed(options.force === true);
	const spawned = spawnCanvasServer();
	logger.info(`Auto-starting canvas server (pid ${spawned.pid}) at ${EXPRESS_SERVER_URL}`);
	return awaitCanvasReadiness(spawned, timeoutMs);
}

interface StopResult {
	stopped: boolean;
	pid?: number;
	message: string;
}

/**
 * What `stop` answers when nothing is listening: a stale pidfile is cleaned
 * up, never signalled.
 * @param port The canvas port.
 * @param filePid The pid the pidfile recorded, if any.
 * @returns The stop result for an absent server.
 */
function absentCanvasResult(port: number, filePid: number | null): StopResult {
	if (filePid !== null) {
		removePidFile(port);
		return {
			stopped: false,
			pid: filePid,
			message: `Canvas server is not running; stale pidfile removed (pid ${filePid}).`,
		};
	}
	return { stopped: false, message: "Canvas server is not running." };
}

/**
 * The pid a live responder reports about itself, accepted only with the
 * identity marker and a sane positive value: pid 0 or a negative value would
 * make process.kill signal our own process group.
 * @param health The responder's health payload.
 * @returns The pid to signal, or null when the responder is not this canvas.
 */
function verifiedCanvasPid(health: HealthStatus): number | null {
	const pid = health.pid;
	return isCanvasHealth(health) && pid !== undefined && Number.isSafeInteger(pid) && pid > 0
		? pid
		: null;
}

/**
 * Wait for a signalled canvas to stop answering, refusing if it starts holding work.
 * @param port The canvas port, whose pidfile is removed on success.
 * @param pid The pid that was signalled.
 * @returns The stop result once `/health` stops answering.
 */
async function awaitCanvasStop(port: number, pid: number): Promise<StopResult> {
	const deadline = Date.now() + 5000;
	while (Date.now() < deadline) {
		// oxlint-disable-next-line no-await-in-loop -- one probe after another until the server is gone
		const postSignalHealth = await healthOrNull(300);
		if (!postSignalHealth) {
			removePidFile(port);
			return { stopped: true, pid, message: `Canvas server (pid ${pid}) stopped.` };
		}
		const postSignalHold = heldCanvasError(postSignalHealth);
		if (postSignalHold) {
			throw postSignalHold;
		}
		// oxlint-disable-next-line no-await-in-loop -- the poll interval between probes
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error(`Canvas server (pid ${pid}) did not stop within 5s.`);
}

/**
 * Stop the canvas server. Identity-safe: we only ever signal the pid that a
 * live /health responder reports about ITSELF, and only when it identifies
 * as this canvas service. A stale pidfile is cleaned up, never killed —
 * recycled pids and unrelated apps squatting on the port are safe.
 * @returns Whether a server was stopped, and which.
 */
async function stopCanvas(): Promise<StopResult> {
	const port = canvasPort();
	const filePid = readPidFile(port);
	const health = await healthOrNull(2000);

	if (!health) {
		return absentCanvasResult(port, filePid);
	}

	const pid = verifiedCanvasPid(health);
	if (pid === null) {
		throw foreignServiceError();
	}
	const preflightHold = heldCanvasError(health);
	if (preflightHold) {
		throw preflightHold;
	}

	try {
		process.kill(pid, "SIGTERM");
	} catch (error) {
		throw new Error(`Failed to signal canvas server (pid ${pid}): ${errorMessage(error)}`, {
			cause: error,
		});
	}

	return awaitCanvasStop(port, pid);
}

export {
	foreignServiceError,
	canvasPort,
	isCanvasHealth,
	type EnsureResult,
	ensureCanvasRunning,
	type StopResult,
	stopCanvas,
};

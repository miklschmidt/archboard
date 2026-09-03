import { spawn } from "child_process";
import type { Readable } from "node:stream";
import { fileURLToPath } from "url";
import logger from "./logger.js";
import {
	ARCHBOARD_VAULT,
	EXPRESS_SERVER_URL,
	ENABLE_CANVAS_SYNC,
	EXCALIDRAW_NO_AUTOSTART,
	noVaultMessage,
} from "./config.js";
import {
	getHealth,
	CANVAS_SERVICE_NAME,
	foreignServiceError,
	markCanvasIdentityVerified,
} from "./canvas-client.js";

export { foreignServiceError };
import { readPidFile, removePidFile } from "./pidfile.js";
import {
	resolveProjectCodexExecutable,
	verifyCodexExecutable,
} from "../codex-process/executable.js";
import { CODEX_COMPOSED_SHUTDOWN_MS } from "../../shared/timing/timing.js";
import {
	CANVAS_STARTUP_TERMINAL_FD_ENV,
	parseCanvasStartupTerminalRecord,
	type CanvasStartupTerminalRecord,
} from "../../shared/canvas-startup-terminal/index.js";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function canvasPort(): number {
	try {
		const url = new URL(EXPRESS_SERVER_URL);
		return parseInt(url.port, 10) || (url.protocol === "https:" ? 443 : 80);
	} catch {
		return 3000;
	}
}

function canvasHostname(): string {
	try {
		return new URL(EXPRESS_SERVER_URL).hostname;
	} catch {
		return "127.0.0.1";
	}
}

// The HOST the spawned server must bind so that health probes against
// EXPRESS_SERVER_URL actually reach it (e.g. [::1] URLs need an IPv6 bind).
function spawnBindHost(): string {
	const hostname = canvasHostname();
	if (hostname === "localhost") return "127.0.0.1";
	return hostname.replace(/^\[|\]$/g, "");
}

function isLoopbackUrl(): boolean {
	return LOOPBACK_HOSTS.has(canvasHostname());
}

function unreachableError(reason: string): Error {
	const error = new Error(
		`Canvas server is not reachable at ${EXPRESS_SERVER_URL} (${reason}). ` +
			`Start it with \`archboard start\` (\`./bin/canvas start\` in the repo) or \`bun src/server.ts\`.`,
	);
	(error as Error & { code?: string }).code = "CANVAS_UNREACHABLE";
	return error;
}

function startupRefusal(message: string): Error {
	const error = new Error(message.trim());
	(error as Error & { code?: string }).code = "CANVAS_UNREACHABLE";
	return error;
}

function isConcurrentOwnerRefusal(message: string): boolean {
	return (
		message.includes("Dedicated Codex roots are locked or colliding") ||
		(message.includes("Refusing to start canvas server") && message.includes("already listening"))
	);
}

function waitForPromise<T>(pending: Promise<T>, timeoutMs: number): Promise<T | null> {
	return new Promise((resolve) => {
		let settled = false;
		const timer = setTimeout(() => finish(null), timeoutMs);
		const finish = (value: T | null): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(value);
		};
		void pending.then((value) => finish(value));
	});
}

async function healthOrNull(timeoutMs = 500) {
	try {
		return await getHealth(timeoutMs);
	} catch {
		return null;
	}
}

function heldCanvasError(health: Awaited<ReturnType<typeof healthOrNull>>): Error | null {
	if (!health?.held_boards || health.held_boards.length === 0) return null;
	const boards = health.held_boards.map((hold) => `"${hold.board}"`).join(", ");
	const error = new Error(
		[
			`Canvas shutdown refused because held work exists only in process memory on ${boards}.`,
			...health.held_boards.map((hold) => hold.message),
		].join("\n\n"),
	);
	(error as Error & { code?: string }).code = "CANVAS_HELD";
	return error;
}

// True only for a /health payload from OUR canvas server (v1.1+ identity
// marker). Anything else answering the port is a foreign service.
export function isCanvasHealth(health: { service?: string } | null): boolean {
	return health?.service === CANVAS_SERVICE_NAME;
}

export interface EnsureResult {
	url: string;
	spawned: boolean;
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
 */
export async function ensureCanvasRunning(
	options: { timeoutMs?: number; force?: boolean } = {},
): Promise<EnsureResult> {
	const timeoutMs = options.timeoutMs ?? 8000;

	const existing = await healthOrNull();
	if (existing) {
		if (!isCanvasHealth(existing)) {
			throw foreignServiceError();
		}
		markCanvasIdentityVerified();
		return { url: EXPRESS_SERVER_URL, spawned: false };
	}

	if (!options.force) {
		if (EXCALIDRAW_NO_AUTOSTART) {
			throw unreachableError("auto-start disabled by EXCALIDRAW_NO_AUTOSTART=1");
		}
		if (!ENABLE_CANVAS_SYNC) {
			throw unreachableError("auto-start disabled because ENABLE_CANVAS_SYNC=false");
		}
	}

	if (!isLoopbackUrl()) {
		throw unreachableError("refusing to auto-start a non-loopback canvas URL");
	}

	// The canvas refuses to start without a vault (ADR 0015), and it is spawned
	// detached with its stdio thrown away, so its refusal would land nowhere and
	// the caller would wait eight seconds to be told the server "did not become
	// healthy". Ask the same question here, where somebody is reading.
	if (!ARCHBOARD_VAULT) {
		const error = new Error(noVaultMessage());
		(error as Error & { code?: string }).code = "CANVAS_UNREACHABLE";
		throw error;
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

	// This runtime module resolves the thin src/server.ts process entrypoint;
	// spawn args must be path strings.
	// process.execPath is the bun that is running us, which is what can read a
	// .ts entry point at all.
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
	let childFailure: Error | null = null;
	let deferredChildFailure: Error | null = null;
	let childExit: { readonly code: number | null; readonly signal: NodeJS.Signals | null } | null =
		null;
	let resolveChildClosed!: () => void;
	const childClosed = new Promise<void>((resolve) => void (resolveChildClosed = resolve));
	const terminalStream = child.stdio[3] as Readable | null;
	let terminalBuffer = "";
	let resolveTerminal!: (record: CanvasStartupTerminalRecord | null) => void;
	const terminalRecord = new Promise<CanvasStartupTerminalRecord | null>(
		(resolve) => void (resolveTerminal = resolve),
	);
	terminalStream?.on("data", (chunk: Buffer | string) => {
		terminalBuffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
		const newline = terminalBuffer.indexOf("\n");
		if (newline < 0) return;
		try {
			resolveTerminal(parseCanvasStartupTerminalRecord(terminalBuffer.slice(0, newline)));
		} catch (error) {
			childFailure = error instanceof Error ? error : new Error(String(error));
		}
	});
	terminalStream?.once("close", () => resolveTerminal(null));
	child.once("error", (error) => {
		childFailure = error;
	});
	child.once("close", (code, signal) => {
		childExit = { code, signal };
		resolveChildClosed();
	});
	const cleanupFailedStart = async (failure: Error): Promise<never> => {
		if (childExit === null) {
			try {
				child.kill("SIGTERM");
			} catch {
				/* close observation below remains the authority. */
			}
		}
		const terminal = await terminalRecord;
		if (terminal === null || terminal.canvasPid !== child.pid || terminal.cleanup !== "proven") {
			terminalStream?.destroy();
			throw startupRefusal(
				`${failure.message} The failed canvas child (pid ${String(child.pid)}) did not prove terminal application cleanup; inspect that exact attempt before retrying.`,
			);
		}
		if (childExit === null) {
			try {
				child.kill("SIGKILL");
			} catch {
				/* Terminal cleanup was proven before this outer-owner force. */
			}
			if (
				(await waitForPromise(
					childClosed.then(() => true),
					CODEX_COMPOSED_SHUTDOWN_MS,
				)) === null
			)
				throw startupRefusal(
					`${failure.message} Terminal cleanup was proven, but the failed canvas child (pid ${String(child.pid)}) did not reap within the application shutdown boundary.`,
				);
		}
		terminalStream?.destroy();
		if (readPidFile(canvasPort()) === child.pid) removePidFile(canvasPort());
		throw failure;
	};
	logger.info(`Auto-starting canvas server (pid ${child.pid}) at ${EXPRESS_SERVER_URL}`);

	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (isCanvasHealth(await healthOrNull(400))) {
			markCanvasIdentityVerified();
			terminalStream?.destroy();
			child.unref();
			process.stderr.write(
				`Canvas server running at ${EXPRESS_SERVER_URL} — open it in a browser for screenshots and mermaid conversion.\n`,
			);
			return { url: EXPRESS_SERVER_URL, spawned: true };
		}
		if (childFailure !== null)
			return cleanupFailedStart(
				startupRefusal(`Canvas server could not start. ${childFailure.message}`),
			);
		if (childExit !== null) {
			const detail = (await terminalRecord)?.message ?? "";
			if (isConcurrentOwnerRefusal(detail)) {
				deferredChildFailure ??= startupRefusal(detail);
				await new Promise((resolve) => setTimeout(resolve, 250));
				continue;
			}
			return cleanupFailedStart(
				startupRefusal(
					detail ||
						`Canvas server exited before readiness with code ${String(childExit.code)} and signal ${String(childExit.signal)}.`,
				),
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	return cleanupFailedStart(
		deferredChildFailure ??
			unreachableError(`auto-started server did not become healthy within ${timeoutMs}ms`),
	);
}

export interface StopResult {
	stopped: boolean;
	pid?: number;
	message: string;
}

/**
 * Stop the canvas server. Identity-safe: we only ever signal the pid that a
 * live /health responder reports about ITSELF, and only when it identifies
 * as this canvas service. A stale pidfile is cleaned up, never killed —
 * recycled pids and unrelated apps squatting on the port are safe.
 */
export async function stopCanvas(): Promise<StopResult> {
	const port = canvasPort();
	const filePid = readPidFile(port);
	const health = await healthOrNull(2000);

	if (!health) {
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

	// Require the identity marker AND a sane positive pid: pid 0 / negative
	// values would make process.kill signal our own process group.
	const pid =
		isCanvasHealth(health) && Number.isSafeInteger(health.pid) && (health.pid as number) > 0
			? (health.pid as number)
			: null;
	if (pid === null) {
		throw foreignServiceError();
	}
	const preflightHold = heldCanvasError(health);
	if (preflightHold) throw preflightHold;

	try {
		process.kill(pid, "SIGTERM");
	} catch (error) {
		throw new Error(`Failed to signal canvas server (pid ${pid}): ${(error as Error).message}`, {
			cause: error,
		});
	}

	const deadline = Date.now() + 5000;
	while (Date.now() < deadline) {
		const postSignalHealth = await healthOrNull(300);
		if (!postSignalHealth) {
			removePidFile(port);
			return { stopped: true, pid, message: `Canvas server (pid ${pid}) stopped.` };
		}
		const postSignalHold = heldCanvasError(postSignalHealth);
		if (postSignalHold) throw postSignalHold;
		await new Promise((resolve) => setTimeout(resolve, 200));
	}

	throw new Error(`Canvas server (pid ${pid}) did not stop within 5s.`);
}

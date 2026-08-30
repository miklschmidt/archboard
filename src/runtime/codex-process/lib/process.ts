import {
	spawn as nodeSpawn,
	type ChildProcessByStdio,
	type SpawnOptions,
} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Readable, Writable } from "node:stream";

import {
	CODEX_PROCESS_RESTART_BASE_MS,
	CODEX_PROCESS_RESTART_MAX_MS,
	CODEX_TERM_GRACE_MS,
} from "../../../shared/timing/timing.js";
import {
	buildCodexChildEnvironment,
	type CodexAmbientEnvironment,
	type CodexChildEnvironment,
} from "./environment.js";
import {
	CodexExecutableError,
	verifyCodexExecutable,
	type VerifiedCodexExecutable,
} from "./executable.js";
import { createCodexDiagnosticsBuffer, type BoundedCodexDiagnostics } from "./diagnostics.js";
import {
	CodexStorageError,
	prepareCodexStorage,
	type CodexStorageFileSystem,
	type CodexStorageInput,
	type PreparedCodexStorage,
} from "./storage.js";

export const CODEX_APP_SERVER_ARGUMENTS = Object.freeze([
	"app-server",
	"--stdio",
	"--strict-config",
] as const);
export const CODEX_PROCESS_STDERR_MAX_BYTES = 64 * 1024;

export type CodexProcessState =
	| "stopped"
	| "starting"
	| "running"
	| "backoff"
	| "stopping"
	| "terminal_failure";

export type CodexProcessFailureCode =
	| "binary_invalid"
	| "binary_missing"
	| "binary_wrong_version"
	| "storage_refused"
	| "spawn_failed"
	| "strict_config_rejected"
	| "early_exit"
	| "crash"
	| "shutdown_failed";

export interface CodexProcessFailure {
	readonly code: CodexProcessFailureCode;
	readonly message: string;
	readonly terminal: boolean;
	readonly cause?: unknown;
}

export interface CodexProcessExit {
	readonly code: number | null;
	readonly signal: NodeJS.Signals | null;
	readonly classification: "early_exit" | "crash" | "strict_config" | "requested";
}

export interface CodexProcessSnapshot {
	readonly state: CodexProcessState;
	readonly pid: number | null;
	readonly executablePath: string;
	readonly argv: readonly string[];
	readonly cwd: string | null;
	readonly accountReady: boolean;
	readonly restartAttempt: number;
	readonly nextRestartAtMs: number | null;
	readonly restartDelayMs: number | null;
	readonly stderr: BoundedCodexDiagnostics;
	readonly lastExit: CodexProcessExit | null;
	readonly failure: CodexProcessFailure | null;
}

export interface CodexProcessChild {
	readonly pid: number;
	readonly stdin: Writable;
	readonly stdout: Readable;
	readonly stderr: Readable;
}

type Child = ChildProcessByStdio<Writable, Readable, Readable>;
type Timer = ReturnType<typeof setTimeout>;
type SpawnChild = (file: string, args: readonly string[], options: SpawnOptions) => Child;

export interface CodexProcessDependencies {
	readonly spawn?: SpawnChild;
	readonly verifyExecutable?: (executablePath: string) => VerifiedCodexExecutable;
	readonly prepareStorage?: (
		input: CodexStorageInput,
		options?: { readonly fileSystem?: CodexStorageFileSystem },
	) => PreparedCodexStorage;
	readonly fileSystem?: CodexStorageFileSystem;
	readonly now?: () => number;
	readonly schedule?: (callback: () => void, delayMs: number) => Timer;
	readonly cancel?: (timer: Timer) => void;
}

export interface CodexProcessOptions {
	readonly executablePath: string;
	readonly checkoutRoot?: string;
	readonly cwd?: string;
	readonly storage?: CodexStorageInput;
	readonly rootDirectory?: string;
	readonly codexHome?: string;
	readonly sqliteHome?: string;
	readonly ambientEnvironment?: CodexAmbientEnvironment;
	readonly argv?: readonly string[];
	readonly stderrLimitBytes?: number;
	readonly dependencies?: CodexProcessDependencies;
}

export interface CodexProcess {
	readonly start: () => Promise<CodexProcessSnapshot>;
	readonly stop: () => Promise<CodexProcessSnapshot>;
	readonly markAccountReady: () => void;
	readonly markTerminalFailure: (message: string, cause?: unknown) => void;
	readonly snapshot: () => CodexProcessSnapshot;
	readonly currentChild: () => CodexProcessChild | null;
	readonly onChild: (listener: (child: CodexProcessChild) => void) => () => void;
	readonly subscribe: (listener: (snapshot: CodexProcessSnapshot) => void) => () => void;
}

export class CodexProcessError extends Error {
	readonly code: CodexProcessFailureCode;
	readonly terminal: boolean;

	constructor(init: {
		readonly code: CodexProcessFailureCode;
		readonly message: string;
		readonly terminal: boolean;
		readonly cause?: unknown;
	}) {
		super(init.message, { cause: init.cause });
		this.name = "CodexProcessError";
		this.code = init.code;
		this.terminal = init.terminal;
	}
}

function canonicalCheckout(candidate: string | undefined): string {
	const value = candidate ?? "";
	if (!value || value.includes("\0") || !path.isAbsolute(value))
		throw new CodexProcessError({
			code: "storage_refused",
			terminal: true,
			message: `The Codex checkout cwd must be an existing absolute path, received ${JSON.stringify(value)}.`,
		});
	let canonical: string;
	try {
		canonical = fs.realpathSync(value);
		if (!fs.statSync(canonical).isDirectory()) throw new Error("not a directory");
	} catch (cause) {
		throw new CodexProcessError({
			code: "storage_refused",
			terminal: true,
			message: `The Codex checkout cwd ${value} is missing or not a directory.`,
			cause,
		});
	}
	return canonical;
}

function mapExecutableFailure(error: CodexExecutableError): CodexProcessError {
	const code =
		error.code === "wrong_version"
			? "binary_wrong_version"
			: error.code === "missing" || error.code === "version_unavailable"
				? "binary_missing"
				: "binary_invalid";
	return new CodexProcessError({ code, terminal: true, message: error.message, cause: error });
}

function mapStorageFailure(error: CodexStorageError): CodexProcessError {
	return new CodexProcessError({
		code: "storage_refused",
		terminal: true,
		message: `${error.message} Recovery: use fresh owner-controlled 0700 CODEX_HOME and CODEX_SQLITE_HOME roots, then retry.`,
		cause: error,
	});
}

function failureValue(error: CodexProcessError): CodexProcessFailure {
	return Object.freeze({
		code: error.code,
		message: error.message,
		terminal: error.terminal,
		cause: error.cause,
	});
}

function exactArguments(
	candidate: readonly string[] | undefined,
	executablePath: string,
): readonly string[] {
	const expected = [executablePath, ...CODEX_APP_SERVER_ARGUMENTS];
	if (candidate === undefined) return Object.freeze(expected);
	if (
		candidate.length !== expected.length ||
		candidate.some((value, index) => value !== expected[index])
	)
		throw new CodexProcessError({
			code: "binary_invalid",
			terminal: true,
			message: `The Codex child argv must be exactly ${JSON.stringify(expected)}; received ${JSON.stringify(candidate)}. Daemon, proxy, listen, websocket, analytics-default, code-mode-host, Desktop MCP, and caller-supplied extra arguments are refused.`,
		});
	return Object.freeze([...candidate]);
}

function strictConfigHint(chunk: Uint8Array | string): boolean {
	const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
	return /strict(?:[- ]config)|unknown argument|unrecognized option|invalid config/i.test(text);
}

function exitFailureMessage(
	classification: "early_exit" | "crash" | "strict_config",
	exit: { readonly code: number | null; readonly signal: NodeJS.Signals | null },
	argv: readonly string[],
	stderr: BoundedCodexDiagnostics,
): string {
	const detail = stderr.text ? ` stderr=${JSON.stringify(stderr.text)}` : "";
	return `Codex child ${classification} with code=${String(exit.code)} signal=${String(exit.signal)} argv=${JSON.stringify(argv)}.${detail}`;
}

function signalChild(child: Child, signal: NodeJS.Signals): void {
	const pid = child.pid;
	if (process.platform !== "win32" && pid !== undefined && pid > 0) {
		try {
			process.kill(-pid, signal);
			return;
		} catch {
			/* Fall through when the child is already closing or has no group. */
		}
	}
	try {
		child.kill(signal);
	} catch {
		/* A concurrent close already owns the exit result. */
	}
}

/** Own one dedicated, exact-argv Codex app-server child and its restart/stop policy. */
export function createCodexProcess(options: CodexProcessOptions): CodexProcess {
	const dependencies = options.dependencies ?? {};
	const spawnChild = dependencies.spawn ?? (nodeSpawn as unknown as SpawnChild);
	const verifyExecutable = dependencies.verifyExecutable ?? verifyCodexExecutable;
	const prepareStorage = dependencies.prepareStorage ?? prepareCodexStorage;
	const now = dependencies.now ?? Date.now;
	const schedule = dependencies.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
	const cancel = dependencies.cancel ?? ((timer) => clearTimeout(timer));
	const diagnostics = createCodexDiagnosticsBuffer(
		options.stderrLimitBytes ?? CODEX_PROCESS_STDERR_MAX_BYTES,
	);
	const listeners = new Set<(snapshot: CodexProcessSnapshot) => void>();
	const childListeners = new Set<(child: CodexProcessChild) => void>();
	const cwdInput = options.checkoutRoot ?? options.cwd;
	const storageInput: CodexStorageInput = Object.freeze({
		rootDirectory: options.storage?.rootDirectory ?? options.rootDirectory,
		codexHome: options.storage?.codexHome ?? options.codexHome,
		sqliteHome: options.storage?.sqliteHome ?? options.sqliteHome,
	});

	let state: CodexProcessState = "stopped";
	let executablePath = options.executablePath;
	let argv: readonly string[] = Object.freeze([
		options.executablePath,
		...CODEX_APP_SERVER_ARGUMENTS,
	]);
	let cwd: string | null = null;
	let environment: CodexChildEnvironment | null = null;
	let storage: PreparedCodexStorage | undefined;
	let current: ChildRecord | undefined;
	let restartTimer: Timer | undefined;
	let restartAttempt = 0;
	let nextRestartAtMs: number | null = null;
	let restartDelayMs: number | null = null;
	let accountReady = false;
	let lastExit: CodexProcessExit | null = null;
	let lastFailure: CodexProcessFailure | null = null;
	let terminalError: CodexProcessError | undefined;
	let stopPromise: Promise<CodexProcessSnapshot> | undefined;
	let startPromise: Promise<CodexProcessSnapshot> | undefined;
	let resolveStart: ((snapshot: CodexProcessSnapshot) => void) | undefined;
	let rejectStart: ((error: Error) => void) | undefined;
	let stopping = false;

	interface ChildRecord {
		readonly child: Child;
		readonly closed: Promise<{
			readonly code: number | null;
			readonly signal: NodeJS.Signals | null;
		}>;
		readonly resolveClosed: (exit: {
			readonly code: number | null;
			readonly signal: NodeJS.Signals | null;
		}) => void;
		spawned: boolean;
		closedHandled: boolean;
		strictHint: boolean;
		error?: Error;
	}

	function snapshot(): CodexProcessSnapshot {
		return Object.freeze({
			state,
			pid: current?.child.pid ?? null,
			executablePath,
			argv: Object.freeze([...argv]),
			cwd,
			accountReady,
			restartAttempt,
			nextRestartAtMs,
			restartDelayMs,
			stderr: diagnostics.snapshot(),
			lastExit,
			failure: lastFailure,
		});
	}

	function publish(): void {
		const currentSnapshot = snapshot();
		for (const listener of listeners) listener(currentSnapshot);
	}

	function setState(next: CodexProcessState): void {
		state = next;
		publish();
	}

	function rejectPendingStart(error: Error): void {
		const reject = rejectStart;
		resolveStart = undefined;
		rejectStart = undefined;
		startPromise = undefined;
		if (reject) reject(error);
	}

	function resolvePendingStart(): void {
		const resolve = resolveStart;
		resolveStart = undefined;
		rejectStart = undefined;
		startPromise = undefined;
		if (resolve) resolve(snapshot());
	}

	function releaseStorage(): void {
		const prepared = storage;
		storage = undefined;
		if (!prepared) return;
		try {
			prepared.release();
		} catch (cause) {
			const error = new CodexProcessError({
				code: "shutdown_failed",
				terminal: true,
				message: `Codex child stopped, but dedicated storage cleanup failed: ${cause instanceof Error ? cause.message : String(cause)}.`,
				cause,
			});
			lastFailure = failureValue(error);
			publish();
		}
	}

	function clearRestart(): void {
		if (restartTimer !== undefined) {
			cancel(restartTimer);
			restartTimer = undefined;
		}
		nextRestartAtMs = null;
		restartDelayMs = null;
	}

	function terminalFailure(error: CodexProcessError): void {
		clearRestart();
		terminalError = error;
		lastFailure = failureValue(error);
		accountReady = false;
		setState("terminal_failure");
		rejectPendingStart(error);
		if (!current) releaseStorage();
	}

	function classifyExit(record: ChildRecord): CodexProcessExit["classification"] {
		if (stopping) return "requested";
		if (record.strictHint) return "strict_config";
		return record.spawned ? "crash" : "early_exit";
	}

	function scheduleRestart(
		exit: { readonly code: number | null; readonly signal: NodeJS.Signals | null },
		classification: "early_exit" | "crash",
	): void {
		const delayMs = Math.min(
			CODEX_PROCESS_RESTART_MAX_MS,
			CODEX_PROCESS_RESTART_BASE_MS * 2 ** Math.min(restartAttempt, 30),
		);
		restartAttempt += 1;
		restartDelayMs = delayMs;
		nextRestartAtMs = now() + delayMs;
		lastFailure = Object.freeze({
			code: classification,
			terminal: false,
			message: exitFailureMessage(classification, exit, argv, diagnostics.snapshot()),
		});
		setState("backoff");
		restartTimer = schedule(() => {
			restartTimer = undefined;
			nextRestartAtMs = null;
			restartDelayMs = null;
			if (stopping || state !== "backoff") return;
			try {
				spawnAttempt();
			} catch (cause) {
				const error =
					cause instanceof CodexProcessError
						? cause
						: new CodexProcessError({
								code: "spawn_failed",
								terminal: true,
								message: `Could not restart the Codex child: ${cause instanceof Error ? cause.message : String(cause)}.`,
								cause,
							});
				terminalFailure(error);
			}
		}, delayMs);
	}

	function handleClosed(
		record: ChildRecord,
		exit: { readonly code: number | null; readonly signal: NodeJS.Signals | null },
	): void {
		if (record.closedHandled) return;
		record.closedHandled = true;
		record.resolveClosed(exit);
		if (current === record) current = undefined;
		const classification = classifyExit(record);
		if (classification !== "requested") accountReady = false;
		lastExit = Object.freeze({ ...exit, classification });
		publish();

		if (classification === "requested") {
			publish();
			return;
		}
		if (state === "terminal_failure") {
			releaseStorage();
			return;
		}
		if (classification === "strict_config") {
			const error = new CodexProcessError({
				code: "strict_config_rejected",
				terminal: true,
				message:
					exitFailureMessage("strict_config", exit, argv, diagnostics.snapshot()) +
					" Check config.toml and the exact strict argv.",
			});
			terminalFailure(error);
			return;
		}
		if (!record.spawned) {
			rejectPendingStart(
				new CodexProcessError({
					code: "early_exit",
					terminal: false,
					message: exitFailureMessage("early_exit", exit, argv, diagnostics.snapshot()),
				}),
			);
		}
		scheduleRestart(exit, classification);
	}

	function spawnAttempt(): void {
		if (stopping) return;
		setState("starting");
		let verified: VerifiedCodexExecutable;
		try {
			verified = verifyExecutable(options.executablePath);
		} catch (cause) {
			const error =
				cause instanceof CodexExecutableError
					? mapExecutableFailure(cause)
					: new CodexProcessError({
							code: "binary_invalid",
							terminal: true,
							message: `Could not verify the configured Codex executable: ${cause instanceof Error ? cause.message : String(cause)}.`,
							cause,
						});
			terminalFailure(error);
			throw error;
		}
		executablePath = verified.executablePath;
		try {
			argv = exactArguments(options.argv, executablePath);
		} catch (cause) {
			const error =
				cause instanceof CodexProcessError
					? cause
					: new CodexProcessError({
							code: "binary_invalid",
							terminal: true,
							message: `The configured Codex child argv is invalid: ${cause instanceof Error ? cause.message : String(cause)}.`,
							cause,
						});
			terminalFailure(error);
			throw error;
		}
		if (!cwd) {
			try {
				cwd = canonicalCheckout(cwdInput);
			} catch (cause) {
				const error =
					cause instanceof CodexProcessError
						? cause
						: new CodexProcessError({
								code: "storage_refused",
								terminal: true,
								message: `Could not establish the canonical Codex checkout cwd: ${cause instanceof Error ? cause.message : String(cause)}.`,
								cause,
							});
				terminalFailure(error);
				throw error;
			}
		}
		if (!storage) {
			try {
				storage = prepareStorage(storageInput, { fileSystem: dependencies.fileSystem });
				environment = buildCodexChildEnvironment({
					ambient: options.ambientEnvironment,
					codexHome: storage.codexHome,
					sqliteHome: storage.sqliteHome,
				});
			} catch (cause) {
				const error =
					cause instanceof CodexStorageError
						? mapStorageFailure(cause)
						: new CodexProcessError({
								code: "storage_refused",
								terminal: true,
								message: `Could not prepare the dedicated Codex storage: ${cause instanceof Error ? cause.message : String(cause)}.`,
								cause,
							});
				if (storage) {
					try {
						storage.release();
					} catch {
						/* Preserve the preparation failure. */
					}
					storage = undefined;
				}
				terminalFailure(error);
				throw error;
			}
		}
		if (!environment || !storage || !cwd)
			throw new Error("Codex process lost prepared startup state.");

		let child: Child;
		try {
			child = spawnChild(executablePath, [...CODEX_APP_SERVER_ARGUMENTS], {
				cwd,
				env: environment,
				shell: false,
				detached: true,
				stdio: ["pipe", "pipe", "pipe"],
				windowsHide: true,
			});
		} catch (cause) {
			const error = new CodexProcessError({
				code: "spawn_failed",
				terminal: true,
				message: `Could not spawn the exact Codex app-server child with argv ${JSON.stringify(argv)}.`,
				cause,
			});
			terminalFailure(error);
			throw error;
		}
		if (child.pid === undefined) {
			const error = new CodexProcessError({
				code: "spawn_failed",
				terminal: true,
				message: `The Codex app-server child did not expose a PID after spawn.`,
			});
			terminalFailure(error);
			try {
				child.kill("SIGKILL");
			} catch {
				/* No PID means there is no known child to reap. */
			}
			throw error;
		}
		let resolveClosed!: ChildRecord["resolveClosed"];
		const closed = new Promise<{
			readonly code: number | null;
			readonly signal: NodeJS.Signals | null;
		}>((resolve) => {
			resolveClosed = resolve;
		});
		const record: ChildRecord = {
			child,
			closed,
			resolveClosed,
			spawned: false,
			closedHandled: false,
			strictHint: false,
		};
		current = record;
		child.stderr.on("data", (chunk: Buffer | string) => {
			record.strictHint ||= strictConfigHint(chunk);
			diagnostics.append(chunk);
			publish();
		});
		child.stderr.resume();
		child.once("spawn", () => {
			record.spawned = true;
			if (stopping) return;
			setState("running");
			const publicChild = Object.freeze({
				pid: child.pid!,
				stdin: child.stdin,
				stdout: child.stdout,
				stderr: child.stderr,
			});
			for (const listener of childListeners) listener(publicChild);
			resolvePendingStart();
		});
		child.once("error", (error) => {
			record.error = error;
			if (!record.spawned) {
				const processError = new CodexProcessError({
					code: "spawn_failed",
					terminal: true,
					message: `The Codex app-server child failed before spawn with argv ${JSON.stringify(argv)}: ${error.message}.`,
					cause: error,
				});
				terminalFailure(processError);
				rejectPendingStart(processError);
			}
		});
		child.once("close", (code, signal) => handleClosed(record, { code, signal }));
	}

	function beginStart(): Promise<CodexProcessSnapshot> {
		const pending = new Promise<CodexProcessSnapshot>((resolve, reject) => {
			resolveStart = resolve;
			rejectStart = reject;
		});
		startPromise = pending;
		try {
			spawnAttempt();
		} catch (cause) {
			const error =
				cause instanceof CodexProcessError
					? cause
					: new CodexProcessError({
							code: "spawn_failed",
							terminal: true,
							message: `Could not start the Codex app-server child: ${cause instanceof Error ? cause.message : String(cause)}.`,
							cause,
						});
			if (state !== "terminal_failure") terminalFailure(error);
			rejectPendingStart(error);
		}
		return pending;
	}

	async function start(): Promise<CodexProcessSnapshot> {
		if (state === "running" || state === "starting")
			return startPromise ?? Promise.resolve(snapshot());
		if (state === "backoff") return Promise.resolve(snapshot());
		if (state === "stopping" && stopPromise) {
			await stopPromise;
			return start();
		}
		if (state === "terminal_failure" && terminalError) return Promise.reject(terminalError);
		stopping = false;
		terminalError = undefined;
		lastFailure = null;
		accountReady = false;
		stopPromise = undefined;
		return beginStart();
	}

	async function stop(): Promise<CodexProcessSnapshot> {
		if (stopPromise) return stopPromise;
		stopPromise = (async () => {
			stopping = true;
			clearRestart();
			if (state !== "stopped") setState("stopping");
			const record = current;
			if (record) {
				try {
					if (!record.child.stdin.destroyed && !record.child.stdin.writableEnded)
						record.child.stdin.end();
				} catch (cause) {
					lastFailure = Object.freeze({
						code: "shutdown_failed",
						terminal: false,
						message: `Could not close Codex child stdin: ${cause instanceof Error ? cause.message : String(cause)}.`,
						cause,
					});
					publish();
				}
				if (!record.closedHandled) signalChild(record.child, "SIGTERM");
				const termGraceTimer = new Promise<false>((resolve) => {
					const timer = schedule(() => resolve(false), CODEX_TERM_GRACE_MS);
					void record.closed.then(() => cancel(timer));
				});
				const exitedBeforeKill = await Promise.race([
					record.closed.then(() => true),
					termGraceTimer,
				]);
				if (!exitedBeforeKill && !record.closedHandled) {
					signalChild(record.child, "SIGKILL");
					await record.closed;
				}
			}
			accountReady = false;
			releaseStorage();
			setState("stopped");
			stopping = false;
			return snapshot();
		})();
		return stopPromise;
	}

	function markAccountReady(): void {
		if (state !== "running") return;
		accountReady = true;
		restartAttempt = 0;
		lastFailure = null;
		publish();
	}

	function markTerminalFailure(message: string, cause?: unknown): void {
		terminalFailure(
			new CodexProcessError({ code: "strict_config_rejected", terminal: true, message, cause }),
		);
		if (current) void stop().catch(() => undefined);
	}

	function currentChild(): CodexProcessChild | null {
		if (!current || current.closedHandled) return null;
		return Object.freeze({
			pid: current.child.pid!,
			stdin: current.child.stdin,
			stdout: current.child.stdout,
			stderr: current.child.stderr,
		});
	}

	function onChild(listener: (child: CodexProcessChild) => void): () => void {
		childListeners.add(listener);
		const active = currentChild();
		if (active) listener(active);
		return () => childListeners.delete(listener);
	}

	function subscribe(listener: (currentSnapshot: CodexProcessSnapshot) => void): () => void {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	return Object.freeze({
		start,
		stop,
		markAccountReady,
		markTerminalFailure,
		snapshot,
		currentChild,
		onChild,
		subscribe,
	});
}

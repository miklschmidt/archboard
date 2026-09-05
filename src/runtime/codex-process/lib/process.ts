import {
	spawn as nodeSpawn,
	type ChildProcessEventMap,
	type ChildProcessByStdio,
	type SpawnOptions,
} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Readable, Writable } from "node:stream";

import {
	CODEX_COMPOSED_SHUTDOWN_MS,
	CODEX_PROCESS_RESTART_BASE_MS,
	CODEX_PROCESS_RESTART_MAX_MS,
	CODEX_REQUEST_SETTLEMENT_MS,
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
	createCodexProcessGroupOperations,
	type CodexProcessGroupIdentity,
	type CodexProcessGroupOperations,
} from "./process-group.js";
import { createProcessGroupCleanup } from "./process-group-cleanup.js";
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
const STRICT_CONFIG_MATCH_WINDOW = 256;
const SECRET_ENVIRONMENT_KEY = /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|PRIVATE)/iu;
const PUBLIC_DIAGNOSTIC_MAX_BYTES = CODEX_PROCESS_STDERR_MAX_BYTES;

function truncateUtf8(text: string, limitBytes: number): string {
	const bytes = Buffer.from(text, "utf8");
	if (bytes.byteLength <= limitBytes) return text;
	const marker = limitBytes >= 3 ? "…" : ".";
	const markerBytes = Buffer.byteLength(marker, "utf8");
	let end = Math.max(0, limitBytes - markerBytes);
	while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1;
	return `${bytes.subarray(0, end).toString("utf8")}${marker}`;
}

export type CodexProcessState =
	| "stopped"
	| "starting"
	| "running"
	| "backoff"
	| "group_cleanup"
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
	| "startup_timeout"
	| "listener_failed"
	| "shutdown_failed";

export interface CodexProcessFailure {
	readonly code: CodexProcessFailureCode;
	readonly message: string;
	readonly terminal: boolean;
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
	readonly ready: boolean;
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
	readonly exitCode: number | null;
	readonly signalCode: NodeJS.Signals | null;
	readonly stdin: Writable;
	readonly stdout: Readable;
	readonly stderr: Readable;
	/** Opaque capability bound to this exact child generation. */
	readonly lifecycle: CodexProcessLifecycle;
	on<Event extends "error" | "exit">(
		event: Event,
		listener: (...args: ChildProcessEventMap[Event]) => void,
	): CodexProcessChild;
	removeListener<Event extends "error" | "exit">(
		event: Event,
		listener: (...args: ChildProcessEventMap[Event]) => void,
	): CodexProcessChild;
}

export interface CodexProcessLifecycle {
	readonly markAppServerReady: () => void;
	readonly markAccountReady: () => void;
	readonly markTerminalFailure: (message: string, cause?: unknown) => void;
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
	readonly processGroup?: CodexProcessGroupOperations;
	readonly now?: () => number;
	readonly schedule?: (callback: () => void, delayMs: number) => Timer;
	readonly cancel?: (timer: Timer) => void;
}

export type CodexProcessStorageInput =
	| (CodexStorageInput & { readonly rootDirectory: string })
	| (CodexStorageInput & {
			readonly rootDirectory?: never;
			readonly codexHome: string;
			readonly sqliteHome: string;
	  });

export interface CodexProcessOptions {
	readonly executablePath: string;
	readonly checkoutRoot: string;
	readonly storage: CodexProcessStorageInput;
	/** Publish each exact group identity to an outer cleanup owner before readiness. */
	readonly onGroupOwned?: (identity: CodexProcessGroupIdentity) => void;
	/** Secrets supplied by a caller are redacted before process diagnostics are retained. */
	readonly diagnosticSecrets?: readonly string[];
}

/** Test-only seams for deterministic lifecycle and failure-owner tests. */
export interface CodexProcessTestOptions extends CodexProcessOptions {
	readonly ambientEnvironment?: CodexAmbientEnvironment;
	readonly argv?: readonly string[];
	readonly stderrLimitBytes?: number;
	readonly dependencies?: CodexProcessDependencies;
}

export interface CodexProcess {
	readonly start: () => Promise<CodexProcessSnapshot>;
	readonly stop: () => Promise<CodexProcessSnapshot>;
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
		/** Accepted for internal call-site compatibility but never retained publicly. */
		readonly cause?: unknown;
	}) {
		super(init.message);
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
	} catch {
		throw new CodexProcessError({
			code: "storage_refused",
			terminal: true,
			message: `The Codex checkout cwd ${value} is missing or not a directory.`,
		});
	}
	return canonical;
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
			message:
				"The Codex child argv must contain only the configured executable, app-server, --stdio, and --strict-config. Daemon, proxy, listen, websocket, analytics-default, code-mode-host, Desktop MCP, and caller-supplied extra arguments are refused.",
		});
	return Object.freeze([...candidate]);
}

function strictConfigHint(text: string): boolean {
	return /strict(?:[- ]config)|unknown argument|unrecognized option|invalid config/iu.test(text);
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

function diagnosticSecrets(options: CodexProcessTestOptions): readonly string[] {
	const ambientSecrets = Object.entries(options.ambientEnvironment ?? process.env)
		.filter(([key, value]) => value !== undefined && SECRET_ENVIRONMENT_KEY.test(key))
		.map(([, value]) => value!);
	return Object.freeze([...(options.diagnosticSecrets ?? []), ...ambientSecrets]);
}

/** Own one dedicated, exact-argv Codex app-server child and its restart/stop policy. */
function createCodexProcessInternal(options: CodexProcessTestOptions): CodexProcess {
	const dependencies = options.dependencies ?? {};
	const spawnChild = dependencies.spawn ?? (nodeSpawn as unknown as SpawnChild);
	const verifyExecutable = dependencies.verifyExecutable ?? verifyCodexExecutable;
	const prepareStorage = dependencies.prepareStorage ?? prepareCodexStorage;
	const processGroup = dependencies.processGroup ?? createCodexProcessGroupOperations();
	const now = dependencies.now ?? Date.now;
	const schedule = dependencies.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
	const cancel = dependencies.cancel ?? ((timer) => clearTimeout(timer));
	const diagnostics = createCodexDiagnosticsBuffer(
		options.stderrLimitBytes ?? CODEX_PROCESS_STDERR_MAX_BYTES,
		diagnosticSecrets(options),
	);
	const listeners = new Set<(snapshot: CodexProcessSnapshot) => void>();
	const childListeners = new Set<(child: CodexProcessChild) => void>();
	const cwdInput = options.checkoutRoot;
	const storageInput: CodexStorageInput = options.storage ?? {};

	let state: CodexProcessState = "stopped";
	let executablePath = options.executablePath;
	let argv: readonly string[] = Object.freeze([
		options.executablePath,
		...CODEX_APP_SERVER_ARGUMENTS,
	]);
	let cwd: string | null = null;
	let environment: CodexChildEnvironment | null = null;
	let storage: PreparedCodexStorage | undefined;
	let storageCleanup: (() => void) | undefined;
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
	let nextGeneration = 0;
	const groups = new Set<ChildRecord>();
	const unprovenChildren = new Set<UnprovenChild>();

	interface UnprovenChild {
		readonly child: Child;
		readonly closed: Promise<void>;
	}

	interface ChildRecord {
		readonly child: Child;
		readonly group: CodexProcessGroupIdentity;
		readonly generation: number;
		readonly closed: Promise<{
			readonly code: number | null;
			readonly signal: NodeJS.Signals | null;
		}>;
		readonly resolveClosed: (exit: {
			readonly code: number | null;
			readonly signal: NodeJS.Signals | null;
		}) => void;
		spawned: boolean;
		ready: boolean;
		closedHandled: boolean;
		strictHint: boolean;
		strictTail: string;
		groupQuiescent: boolean;
		readinessTimer: Timer | undefined;
		groupCleanup: Promise<void> | undefined;
		error?: Error;
	}

	function publicDiagnostic(text: string): string {
		return truncateUtf8(diagnostics.redact(text), PUBLIC_DIAGNOSTIC_MAX_BYTES);
	}

	function safeCauseMessage(cause: unknown): string {
		try {
			return publicDiagnostic(cause instanceof Error ? cause.message : String(cause));
		} catch {
			return "an unknown failure";
		}
	}

	function sanitizeProcessError(error: CodexProcessError): CodexProcessError {
		return new CodexProcessError({
			code: error.code,
			terminal: error.terminal,
			message: publicDiagnostic(error.message),
		});
	}

	function snapshot(): CodexProcessSnapshot {
		const unprovenChild = unprovenChildren.values().next().value as UnprovenChild | undefined;
		return Object.freeze({
			state,
			pid: current?.child.pid ?? unprovenChild?.child.pid ?? null,
			executablePath,
			argv: Object.freeze([...argv]),
			cwd,
			ready: current?.ready ?? false,
			accountReady,
			restartAttempt,
			nextRestartAtMs,
			restartDelayMs,
			stderr: diagnostics.snapshot(),
			lastExit,
			failure: lastFailure,
		});
	}

	function listenerFailure(kind: "snapshot" | "child", cause: unknown): CodexProcessError {
		return new CodexProcessError({
			code: "listener_failed",
			terminal: true,
			message: publicDiagnostic(
				`Codex ${kind} listener failed: ${safeCauseMessage(cause)}. Recovery: the listener was retired; inspect the terminal owner and retry after fixing the listener.`,
			),
		});
	}

	function retireListener(kind: "snapshot" | "child", cause: unknown): void {
		terminalFailure(listenerFailure(kind, cause));
		if (!stopping && (current || groups.size > 0 || unprovenChildren.size > 0))
			void stop().catch(() => undefined);
	}

	function publish(): void {
		const currentSnapshot = snapshot();
		const failures: unknown[] = [];
		for (const listener of Array.from(listeners)) {
			try {
				listener(currentSnapshot);
			} catch (cause) {
				listeners.delete(listener);
				failures.push(cause);
			}
		}
		for (const cause of failures) retireListener("snapshot", cause);
	}

	function setState(next: CodexProcessState): void {
		state = next;
		publish();
	}

	function failureValue(error: CodexProcessError): CodexProcessFailure {
		return Object.freeze({
			code: error.code,
			message: publicDiagnostic(error.message),
			terminal: error.terminal,
		});
	}

	function shutdownError(message: string): CodexProcessError {
		return new CodexProcessError({
			code: "shutdown_failed",
			terminal: true,
			message: publicDiagnostic(message),
		});
	}

	const processGroupCleanup = createProcessGroupCleanup(
		processGroup,
		{ now, schedule, cancel: cancelTimer },
		{ failure: shutdownError, safeCauseMessage },
	);

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

	function cancelTimer(timer: Timer | undefined): void {
		if (timer === undefined) return;
		try {
			cancel(timer);
		} catch {
			/* A timer that already fired has no further ownership. */
		}
	}

	function clearReadiness(record: ChildRecord): void {
		cancelTimer(record.readinessTimer);
		record.readinessTimer = undefined;
	}

	function isCurrentGeneration(record: ChildRecord, generation: number): boolean {
		return (
			current === record &&
			record.generation === generation &&
			!record.closedHandled &&
			groups.has(record)
		);
	}

	function markAppServerReady(record: ChildRecord, generation: number): void {
		if (!isCurrentGeneration(record, generation) || stopping || state !== "running" || record.ready)
			return;
		record.ready = true;
		record.strictHint = false;
		record.strictTail = "";
		clearReadiness(record);
		publish();
		resolvePendingStart();
	}

	function markAccountReady(record: ChildRecord, generation: number): void {
		if (!isCurrentGeneration(record, generation) || state !== "running" || !record.ready) return;
		accountReady = true;
		restartAttempt = 0;
		lastFailure = null;
		publish();
	}

	function markTerminalFailure(
		record: ChildRecord,
		generation: number,
		message: string,
		cause?: unknown,
	): void {
		if (!isCurrentGeneration(record, generation) || stopping || state !== "running") return;
		const detail = cause === undefined ? message : `${message}: ${safeCauseMessage(cause)}`;
		terminalFailure(
			new CodexProcessError({
				code: "strict_config_rejected",
				terminal: true,
				message: publicDiagnostic(detail),
			}),
		);
		void stop().catch(() => undefined);
	}

	function childLifecycle(record: ChildRecord): CodexProcessLifecycle {
		const { generation } = record;
		return Object.freeze({
			markAppServerReady: () => markAppServerReady(record, generation),
			markAccountReady: () => markAccountReady(record, generation),
			markTerminalFailure: (message: string, cause?: unknown) =>
				markTerminalFailure(record, generation, message, cause),
		});
	}

	function publicChild(record: ChildRecord): CodexProcessChild {
		const child: CodexProcessChild = {
			pid: record.child.pid!,
			get exitCode() {
				return record.child.exitCode;
			},
			get signalCode() {
				return record.child.signalCode;
			},
			stdin: record.child.stdin,
			stdout: record.child.stdout,
			stderr: record.child.stderr,
			lifecycle: childLifecycle(record),
			on(event, listener) {
				record.child.on(event, listener);
				return child;
			},
			removeListener(event, listener) {
				record.child.removeListener(event, listener);
				return child;
			},
		};
		return Object.freeze(child);
	}

	function releaseStorage(): CodexProcessError | undefined {
		const prepared = storage;
		const retryCleanup = storageCleanup;
		if (!prepared && !retryCleanup) return undefined;
		if (prepared) {
			try {
				prepared.release();
				storage = undefined;
			} catch (cause) {
				const error = shutdownError(
					`Codex child ownership ended, but dedicated storage cleanup failed: ${safeCauseMessage(cause)}. Recovery: retry stop so the lock release can be attempted again.`,
				);
				lastFailure = failureValue(error);
				publish();
				return error;
			}
		}
		if (retryCleanup) {
			try {
				retryCleanup();
				storageCleanup = undefined;
			} catch (cause) {
				const error = shutdownError(
					`Codex child ownership ended, but dedicated storage cleanup failed: ${safeCauseMessage(cause)}. Recovery: retry stop so the lock release can be attempted again.`,
				);
				lastFailure = failureValue(error);
				publish();
				return error;
			}
		}
		return undefined;
	}

	function clearRestart(): void {
		cancelTimer(restartTimer);
		restartTimer = undefined;
		nextRestartAtMs = null;
		restartDelayMs = null;
	}

	function terminalFailure(error: CodexProcessError): void {
		error = sanitizeProcessError(error);
		clearRestart();
		terminalError = error;
		lastFailure = failureValue(error);
		accountReady = false;
		if (current) {
			current.ready = false;
			clearReadiness(current);
		}
		setState("terminal_failure");
		rejectPendingStart(error);
		if (!current && groups.size === 0 && unprovenChildren.size === 0) {
			const cleanupError = releaseStorage();
			if (cleanupError) {
				terminalError = cleanupError;
				lastFailure = failureValue(cleanupError);
				publish();
			}
		}
	}

	function markGroupQuiescent(record: ChildRecord): void {
		record.groupQuiescent = true;
		if (record.closedHandled) groups.delete(record);
	}

	function ensureGroupCleanup(record: ChildRecord, deadlineAtMs: number): Promise<void> {
		if (record.groupQuiescent) {
			markGroupQuiescent(record);
			return Promise.resolve();
		}
		if (record.groupCleanup) return record.groupCleanup;
		const pending = processGroupCleanup.cleanup({
			identity: record.group,
			childClosed: record.closed,
			deadlineAtMs,
		});
		record.groupCleanup = pending;
		void pending.then(
			() => markGroupQuiescent(record),
			() => {
				if (record.groupCleanup === pending) record.groupCleanup = undefined;
			},
		);
		return pending;
	}

	function observeGroupCleanup(record: ChildRecord, deadlineAtMs: number): void {
		const cleanup = ensureGroupCleanup(record, deadlineAtMs);
		void cleanup.then(
			() => {
				if (state === "terminal_failure" && !current && groups.size === 0) {
					const cleanupError = releaseStorage();
					if (cleanupError) {
						terminalError = cleanupError;
						lastFailure = failureValue(cleanupError);
						publish();
					}
				}
				return undefined;
			},
			(cause: unknown) => {
				const error =
					cause instanceof CodexProcessError
						? sanitizeProcessError(cause)
						: shutdownError(
								`Could not complete Codex process-group cleanup: ${safeCauseMessage(cause)}.`,
							);
				terminalFailure(error);
			},
		);
	}

	function classifyExit(record: ChildRecord): CodexProcessExit["classification"] {
		if (stopping) return "requested";
		if (record.strictHint) return "strict_config";
		return record.ready ? "crash" : "early_exit";
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
			message: publicDiagnostic(
				exitFailureMessage(classification, exit, argv, diagnostics.snapshot()),
			),
		});
		setState("backoff");
		try {
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
							? sanitizeProcessError(cause)
							: new CodexProcessError({
									code: "spawn_failed",
									terminal: true,
									message: `Could not restart the Codex child: ${safeCauseMessage(cause)}.`,
									cause,
								});
					terminalFailure(error);
				}
			}, delayMs);
		} catch (cause) {
			terminalFailure(
				shutdownError(`Could not schedule the Codex restart: ${safeCauseMessage(cause)}.`),
			);
		}
	}

	function updateStrictHint(record: ChildRecord, chunk: Uint8Array | string): void {
		const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
		record.strictHint ||= strictConfigHint(text);
		record.strictTail = `${record.strictTail}${text}`.slice(-STRICT_CONFIG_MATCH_WINDOW);
		record.strictHint ||= strictConfigHint(record.strictTail);
	}

	function handleClosed(
		record: ChildRecord,
		exit: { readonly code: number | null; readonly signal: NodeJS.Signals | null },
	): void {
		if (record.closedHandled) return;
		record.closedHandled = true;
		clearReadiness(record);
		diagnostics.finalize();
		record.resolveClosed(exit);
		if (current === record) current = undefined;
		const classification = classifyExit(record);
		if (classification !== "requested") accountReady = false;
		lastExit = Object.freeze({ ...exit, classification });
		publish();

		if (classification === "requested") {
			observeGroupCleanup(record, now() + CODEX_COMPOSED_SHUTDOWN_MS);
			return;
		}
		if (state === "terminal_failure") {
			observeGroupCleanup(record, now() + CODEX_COMPOSED_SHUTDOWN_MS);
			return;
		}
		if (classification === "strict_config") {
			const error = new CodexProcessError({
				code: "strict_config_rejected",
				terminal: true,
				message: publicDiagnostic(
					exitFailureMessage("strict_config", exit, argv, diagnostics.snapshot()) +
						" Check config.toml and the exact strict argv.",
				),
			});
			terminalFailure(error);
			observeGroupCleanup(record, now() + CODEX_COMPOSED_SHUTDOWN_MS);
			return;
		}
		if (!record.ready)
			rejectPendingStart(
				new CodexProcessError({
					code: "early_exit",
					terminal: false,
					message: publicDiagnostic(
						exitFailureMessage("early_exit", exit, argv, diagnostics.snapshot()),
					),
				}),
			);
		setState("group_cleanup");
		const cleanup = ensureGroupCleanup(record, now() + CODEX_COMPOSED_SHUTDOWN_MS);
		void cleanup.then(
			() => {
				if (stopping || state !== "group_cleanup") return;
				scheduleRestart(exit, classification);
				return undefined;
			},
			(cause: unknown) => {
				const error =
					cause instanceof CodexProcessError
						? sanitizeProcessError(cause)
						: shutdownError(
								`Could not complete Codex process-group cleanup: ${safeCauseMessage(cause)}.`,
							);
				terminalFailure(error);
			},
		);
	}

	function readinessTimeout(record: ChildRecord): void {
		record.readinessTimer = undefined;
		if (
			current !== record ||
			record.closedHandled ||
			record.ready ||
			stopping ||
			state !== "running"
		)
			return;
		const error = new CodexProcessError({
			code: "startup_timeout",
			terminal: true,
			message: `The Codex app-server spawned but did not acknowledge typed readiness within ${CODEX_REQUEST_SETTLEMENT_MS} ms. Recovery: verify the app-server handshake and retry start.`,
		});
		terminalFailure(error);
		void stop().catch(() => undefined);
	}

	function spawnAttempt(): void {
		if (stopping) return;
		setState("starting");
		if (state !== "starting" || stopping) return;
		let verified: VerifiedCodexExecutable;
		try {
			verified = verifyExecutable(options.executablePath);
		} catch (cause) {
			const error =
				cause instanceof CodexExecutableError
					? new CodexProcessError({
							code:
								cause.code === "wrong_version"
									? "binary_wrong_version"
									: cause.code === "missing" || cause.code === "version_unavailable"
										? "binary_missing"
										: "binary_invalid",
							terminal: true,
							message: publicDiagnostic(cause.message),
						})
					: new CodexProcessError({
							code: "binary_invalid",
							terminal: true,
							message: `Could not verify the configured Codex executable: ${safeCauseMessage(cause)}.`,
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
					? sanitizeProcessError(cause)
					: new CodexProcessError({
							code: "binary_invalid",
							terminal: true,
							message: `The configured Codex child argv is invalid: ${safeCauseMessage(cause)}.`,
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
						? sanitizeProcessError(cause)
						: new CodexProcessError({
								code: "storage_refused",
								terminal: true,
								message: `Could not establish the canonical Codex checkout cwd: ${safeCauseMessage(cause)}.`,
								cause,
							});
				terminalFailure(error);
				throw error;
			}
		}
		if (!storage) {
			try {
				storage = prepareStorage(
					storageInput,
					dependencies.fileSystem === undefined ? {} : { fileSystem: dependencies.fileSystem },
				);
				environment = buildCodexChildEnvironment({
					...(options.ambientEnvironment === undefined
						? {}
						: { ambient: options.ambientEnvironment }),
					codexHome: storage.codexHome,
					sqliteHome: storage.sqliteHome,
				});
			} catch (cause) {
				const error =
					cause instanceof CodexStorageError
						? new CodexProcessError({
								code: "storage_refused",
								terminal: true,
								message: `${publicDiagnostic(cause.message)} Recovery: use fresh owner-controlled 0700 CODEX_HOME and CODEX_SQLITE_HOME roots, then retry.`,
							})
						: new CodexProcessError({
								code: "storage_refused",
								terminal: true,
								message: `Could not prepare the dedicated Codex storage: ${safeCauseMessage(cause)}.`,
								cause,
							});
				if (cause instanceof CodexStorageError) storageCleanup = cause.retryCleanup;
				if (storage) {
					try {
						storage.release();
						storage = undefined;
					} catch {
						/* Retain storage ownership so terminal cleanup can retry the lock release. */
					}
				}
				if (storageCleanup) {
					try {
						storageCleanup();
						storageCleanup = undefined;
					} catch {
						/* Retain the recovery capability for the next stop attempt. */
					}
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
				message: `Could not spawn the exact Codex app-server child with argv ${JSON.stringify(argv)}: ${safeCauseMessage(cause)}.`,
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

		let group: CodexProcessGroupIdentity;
		try {
			group = processGroup.capture(child.pid);
		} catch (cause) {
			const error = new CodexProcessError({
				code: "spawn_failed",
				terminal: true,
				message: `Could not prove ownership of the Codex process group after spawn. Recovery: refuse restart until the child-group boundary is available.`,
				cause,
			});
			let resolveClosed!: () => void;
			const unproven: UnprovenChild = {
				child,
				closed: new Promise<void>((resolve) => void (resolveClosed = resolve)),
			};
			unprovenChildren.add(unproven);
			child.once("close", () => {
				unprovenChildren.delete(unproven);
				resolveClosed();
				if (!stopping) terminalFailure(error);
			});
			terminalError = sanitizeProcessError(error);
			lastFailure = failureValue(terminalError);
			accountReady = false;
			setState("terminal_failure");
			try {
				child.kill("SIGKILL");
			} catch {
				/* stop() retains this exact child handle and retries before it can report success. */
			}
			return;
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
			group,
			generation: ++nextGeneration,
			closed,
			resolveClosed,
			spawned: false,
			ready: false,
			closedHandled: false,
			strictHint: false,
			strictTail: "",
			groupQuiescent: false,
			readinessTimer: undefined,
			groupCleanup: undefined,
		};
		current = record;
		groups.add(record);
		child.stderr.on("data", (chunk: Buffer | string) => {
			if (!record.ready) updateStrictHint(record, chunk);
			diagnostics.append(chunk);
			publish();
		});
		child.stderr.resume();
		child.once("spawn", () => {
			if (record.closedHandled) return;
			record.spawned = true;
			if (stopping) return;
			setState("running");
			if (state !== "running" || stopping || record.closedHandled) return;
			try {
				record.readinessTimer = schedule(
					() => readinessTimeout(record),
					CODEX_REQUEST_SETTLEMENT_MS,
				);
			} catch (cause) {
				terminalFailure(
					shutdownError(
						`Could not schedule the Codex readiness timeout: ${safeCauseMessage(cause)}.`,
					),
				);
				void stop().catch(() => undefined);
				return;
			}
			const childValue = publicChild(record);
			const failures: unknown[] = [];
			for (const listener of Array.from(childListeners)) {
				try {
					listener(childValue);
				} catch (cause) {
					childListeners.delete(listener);
					failures.push(cause);
				}
			}
			for (const cause of failures) retireListener("child", cause);
		});
		child.once("error", (error) => {
			record.error = error;
			if (!record.spawned) {
				const processError = new CodexProcessError({
					code: "spawn_failed",
					terminal: true,
					message: `The Codex app-server child failed before spawn with argv ${JSON.stringify(argv)}: ${safeCauseMessage(error)}.`,
					cause: error,
				});
				terminalFailure(processError);
				rejectPendingStart(sanitizeProcessError(processError));
			}
		});
		child.once("close", (code, signal) => handleClosed(record, { code, signal }));
		try {
			options.onGroupOwned?.(group);
		} catch (cause) {
			const error = shutdownError(
				`Could not publish the owned Codex process group to the application cleanup boundary: ${safeCauseMessage(cause)}.`,
			);
			terminalFailure(error);
			rejectPendingStart(sanitizeProcessError(error));
			void stop().catch(() => undefined);
		}
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
					? sanitizeProcessError(cause)
					: new CodexProcessError({
							code: "spawn_failed",
							terminal: true,
							message: `Could not start the Codex app-server child: ${safeCauseMessage(cause)}.`,
							cause,
						});
			if (state !== "terminal_failure") terminalFailure(error);
			rejectPendingStart(error);
		}
		return pending;
	}

	function waitForReadiness(): Promise<CodexProcessSnapshot> {
		if (current?.ready) return Promise.resolve(snapshot());
		if (startPromise) return startPromise;
		if (!current)
			return Promise.reject(
				new CodexProcessError({
					code: "spawn_failed",
					terminal: true,
					message: "The Codex process is running without an owned child readiness record.",
				}),
			);
		const pending = new Promise<CodexProcessSnapshot>((resolve, reject) => {
			resolveStart = resolve;
			rejectStart = reject;
		});
		startPromise = pending;
		return pending;
	}

	async function start(): Promise<CodexProcessSnapshot> {
		if (state === "running" || state === "starting") return waitForReadiness();
		if (state === "backoff" || state === "group_cleanup") return Promise.resolve(snapshot());
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
		const operation = (async (): Promise<CodexProcessSnapshot> => {
			stopping = true;
			clearRestart();
			if (state !== "stopped") setState("stopping");
			const deadlineAtMs = now() + CODEX_COMPOSED_SHUTDOWN_MS;
			rejectPendingStart(
				shutdownError(
					"Codex startup was canceled by stop before app-server readiness. Recovery: await stop, then retry start.",
				),
			);
			let shutdownIssue: CodexProcessError | undefined;
			const record = current;
			if (record) {
				try {
					if (!record.child.stdin.destroyed && !record.child.stdin.writableEnded)
						record.child.stdin.end();
				} catch (cause) {
					shutdownIssue = shutdownError(
						`Could not close Codex child stdin: ${safeCauseMessage(cause)}. Recovery: retry stop after the child has settled.`,
					);
				}
			}

			const records = [...groups];
			const work: Promise<void>[] = [];
			for (const owned of records) {
				work.push(
					(async () => {
						await ensureGroupCleanup(owned, deadlineAtMs);
						if (owned.closedHandled) return;
						const result = await processGroupCleanup.waitForClosedOrAt(owned.closed, deadlineAtMs);
						if (result === "time")
							throw shutdownError(
								"The Codex child did not close before the composed shutdown deadline. Recovery: inspect the retained process group and retry stop.",
							);
					})(),
				);
			}
			for (const unproven of unprovenChildren) {
				work.push(
					(async () => {
						try {
							unproven.child.kill("SIGKILL");
						} catch (cause) {
							throw shutdownError(
								`Could not kill the Codex child whose process group was unavailable: ${safeCauseMessage(cause)}. Recovery: inspect the retained child and retry stop.`,
							);
						}
						if (
							(await processGroupCleanup.waitForClosedOrAt(unproven.closed, deadlineAtMs)) ===
							"time"
						)
							throw shutdownError(
								"The Codex child whose process group was unavailable did not close before the composed shutdown deadline. Recovery: inspect the retained child and retry stop.",
							);
					})(),
				);
			}
			const results = await processGroupCleanup.settleBeforeDeadline(work, deadlineAtMs);
			const failed = results.find(
				(result): result is PromiseRejectedResult => result.status === "rejected",
			);
			if (failed) {
				const cause = failed.reason;
				throw cause instanceof CodexProcessError
					? sanitizeProcessError(cause)
					: shutdownError(`Could not complete Codex shutdown: ${safeCauseMessage(cause)}.`);
			}
			if (now() >= deadlineAtMs || current || groups.size > 0 || unprovenChildren.size > 0)
				throw shutdownError(
					"Codex shutdown did not prove that the child and its process group are quiescent. Recovery: inspect the retained ownership and retry stop.",
				);
			if (shutdownIssue) throw shutdownIssue;
			const releaseError = releaseStorage();
			if (releaseError) throw releaseError;
			accountReady = false;
			stopping = false;
			setState("stopped");
			return snapshot();
		})();
		stopPromise = operation;
		void operation.catch((cause: unknown) => {
			if (stopPromise !== operation) return;
			stopPromise = undefined;
			const error =
				cause instanceof CodexProcessError
					? sanitizeProcessError(cause)
					: shutdownError(`Could not complete Codex shutdown: ${safeCauseMessage(cause)}.`);
			terminalFailure(error);
		});
		return operation;
	}

	function currentChild(): CodexProcessChild | null {
		if (!current || current.closedHandled || !current.spawned) return null;
		return publicChild(current);
	}

	function onChild(listener: (child: CodexProcessChild) => void): () => void {
		childListeners.add(listener);
		const active = currentChild();
		if (active) {
			try {
				listener(active);
			} catch (cause) {
				childListeners.delete(listener);
				retireListener("child", cause);
			}
		}
		return () => childListeners.delete(listener);
	}

	function subscribe(listener: (currentSnapshot: CodexProcessSnapshot) => void): () => void {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	return Object.freeze({
		start,
		stop,
		snapshot,
		currentChild,
		onChild,
		subscribe,
	});
}

/** Production lifecycle entrypoint. Test seams are available from testing.ts. */
export function createCodexProcess(options: CodexProcessOptions): CodexProcess {
	return createCodexProcessInternal(options);
}

/** Deterministic test entrypoint for injected process, storage, and clock seams. */
export function createCodexProcessForTesting(options: CodexProcessTestOptions): CodexProcess {
	return createCodexProcessInternal(options);
}

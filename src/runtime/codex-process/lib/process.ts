import {
	spawn as nodeSpawn,
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
	createCodexProcessGroupOperations,
	type CodexProcessGroupIdentity,
	type CodexProcessGroupInspection,
	type CodexProcessGroupOperations,
} from "./process-group.js";
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
	readonly processGroup?: CodexProcessGroupOperations;
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
	/** Secrets supplied by a caller are redacted before process diagnostics are retained. */
	readonly diagnosticSecrets?: readonly string[];
	readonly argv?: readonly string[];
	readonly stderrLimitBytes?: number;
	readonly dependencies?: CodexProcessDependencies;
}

export interface CodexProcess {
	readonly start: () => Promise<CodexProcessSnapshot>;
	readonly stop: () => Promise<CodexProcessSnapshot>;
	readonly markAppServerReady: () => void;
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
			message: `The Codex child argv must be exactly ${JSON.stringify(expected)}; received ${JSON.stringify(candidate)}. Daemon, proxy, listen, websocket, analytics-default, code-mode-host, Desktop MCP, and caller-supplied extra arguments are refused.`,
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

function diagnosticSecrets(options: CodexProcessOptions): readonly string[] {
	const ambientSecrets = Object.entries(options.ambientEnvironment ?? process.env)
		.filter(([key, value]) => value !== undefined && SECRET_ENVIRONMENT_KEY.test(key))
		.map(([, value]) => value!);
	return Object.freeze([...(options.diagnosticSecrets ?? []), ...ambientSecrets]);
}

/** Own one dedicated, exact-argv Codex app-server child and its restart/stop policy. */
export function createCodexProcess(options: CodexProcessOptions): CodexProcess {
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
	const groups = new Set<ChildRecord>();

	interface ChildRecord {
		readonly child: Child;
		readonly group: CodexProcessGroupIdentity;
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
		readinessTimer?: Timer;
		groupCleanup?: Promise<void>;
		error?: Error;
	}

	function safeCauseMessage(cause: unknown): string {
		return diagnostics.redact(cause instanceof Error ? cause.message : String(cause));
	}

	function snapshot(): CodexProcessSnapshot {
		return Object.freeze({
			state,
			pid: current?.child.pid ?? null,
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

	function publish(): void {
		const currentSnapshot = snapshot();
		for (const listener of listeners) listener(currentSnapshot);
	}

	function setState(next: CodexProcessState): void {
		state = next;
		publish();
	}

	function failureValue(error: CodexProcessError): CodexProcessFailure {
		return Object.freeze({
			code: error.code,
			message: diagnostics.redact(error.message),
			terminal: error.terminal,
		});
	}

	function shutdownError(message: string): CodexProcessError {
		return new CodexProcessError({ code: "shutdown_failed", terminal: true, message });
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

	function releaseStorage(): CodexProcessError | undefined {
		const prepared = storage;
		if (!prepared) return undefined;
		try {
			prepared.release();
			storage = undefined;
			return undefined;
		} catch (cause) {
			const error = shutdownError(
				`Codex child ownership ended, but dedicated storage cleanup failed: ${safeCauseMessage(cause)}. Recovery: retry stop so the lock release can be attempted again.`,
			);
			lastFailure = failureValue(error);
			publish();
			return error;
		}
	}

	function clearRestart(): void {
		cancelTimer(restartTimer);
		restartTimer = undefined;
		nextRestartAtMs = null;
		restartDelayMs = null;
	}

	function terminalFailure(error: CodexProcessError): void {
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
		if (!current && groups.size === 0) {
			const cleanupError = releaseStorage();
			if (cleanupError) {
				terminalError = cleanupError;
				lastFailure = failureValue(cleanupError);
				publish();
			}
		}
	}

	function groupInspection(record: ChildRecord): CodexProcessGroupInspection {
		try {
			return processGroup.inspect(record.group);
		} catch {
			return "unproven";
		}
	}

	function markGroupQuiescent(record: ChildRecord): void {
		record.groupQuiescent = true;
		if (record.closedHandled) groups.delete(record);
	}

	function groupFailure(status: CodexProcessGroupInspection, action: string): CodexProcessError {
		const detail =
			status === "reused" ? "its leader identity was reused" : "its ownership could not be proved";
		return shutdownError(
			`Could not ${action}: the Codex process group is ${detail}. Recovery: keep the owner terminal and retry after inspecting the remaining process group.`,
		);
	}

	function waitUntil(deadlineAtMs: number): Promise<void> {
		const delayMs = Math.max(0, deadlineAtMs - now());
		if (delayMs === 0) return Promise.resolve();
		return new Promise<void>((resolve, reject) => {
			let timer: Timer | undefined;
			let settled = false;
			const finish = (): void => {
				if (settled) return;
				settled = true;
				cancelTimer(timer);
				resolve();
			};
			try {
				timer = schedule(finish, delayMs);
				if (settled) cancelTimer(timer);
			} catch (cause) {
				if (settled) return;
				settled = true;
				reject(cause);
			}
		});
	}

	function waitForClosedOrAt(
		record: ChildRecord,
		deadlineAtMs: number,
	): Promise<"closed" | "time"> {
		const delayMs = Math.max(0, deadlineAtMs - now());
		if (delayMs === 0) return Promise.resolve("time");
		return new Promise<"closed" | "time">((resolve, reject) => {
			let timer: Timer | undefined;
			let settled = false;
			const finish = (result: "closed" | "time"): void => {
				if (settled) return;
				settled = true;
				cancelTimer(timer);
				resolve(result);
			};
			void record.closed.then(() => finish("closed"));
			try {
				timer = schedule(() => finish("time"), delayMs);
				if (settled) cancelTimer(timer);
			} catch (cause) {
				if (settled) return;
				settled = true;
				reject(cause);
			}
		});
	}

	async function settleBeforeDeadline(
		work: readonly Promise<void>[],
		deadlineAtMs: number,
	): Promise<PromiseSettledResult<void>[]> {
		const all = Promise.allSettled(work);
		let timer: Timer | undefined;
		let settled = false;
		const deadline = new Promise<never>((_resolve, reject) => {
			const fail = (): void => {
				if (settled) return;
				settled = true;
				reject(
					shutdownError(
						"The composed Codex shutdown deadline expired. Recovery: inspect retained process ownership and retry stop.",
					),
				);
			};
			try {
				timer = schedule(fail, Math.max(0, deadlineAtMs - now()));
				if (settled) cancelTimer(timer);
			} catch (cause) {
				if (settled) return;
				settled = true;
				reject(
					shutdownError(
						`Could not schedule the composed Codex shutdown deadline: ${safeCauseMessage(cause)}.`,
					),
				);
			}
		});
		try {
			return await Promise.race([all, deadline]);
		} finally {
			settled = true;
			cancelTimer(timer);
		}
	}

	async function cleanupGroup(record: ChildRecord, deadlineAtMs: number): Promise<void> {
		if (record.groupQuiescent) return;
		let status = groupInspection(record);
		if (status === "quiescent") {
			markGroupQuiescent(record);
			return;
		}
		if (status !== "owned") throw groupFailure(status, "clean up the Codex process group");
		try {
			processGroup.signal(record.group, "SIGTERM");
		} catch (cause) {
			throw shutdownError(
				`Could not send TERM to the Codex process group. Recovery: ${safeCauseMessage(cause)}.`,
			);
		}

		const termAtMs = Math.min(deadlineAtMs, now() + CODEX_TERM_GRACE_MS);
		const firstEvent = await waitForClosedOrAt(record, termAtMs);
		status = groupInspection(record);
		if (status === "quiescent") {
			markGroupQuiescent(record);
			return;
		}
		if (status !== "owned")
			throw groupFailure(status, "finish TERM cleanup of the Codex process group");
		if (firstEvent === "closed" && now() < termAtMs) await waitUntil(termAtMs);
		if (now() < termAtMs) await waitUntil(termAtMs);

		status = groupInspection(record);
		if (status === "quiescent") {
			markGroupQuiescent(record);
			return;
		}
		if (status !== "owned") throw groupFailure(status, "escalate the Codex process group");
		try {
			processGroup.signal(record.group, "SIGKILL");
		} catch (cause) {
			throw shutdownError(
				`Could not send KILL to the Codex process group. Recovery: ${safeCauseMessage(cause)}.`,
			);
		}
		status = groupInspection(record);
		if (status === "quiescent") {
			markGroupQuiescent(record);
			return;
		}
		if (status !== "owned")
			throw groupFailure(status, "verify KILL cleanup of the Codex process group");
		if (now() < deadlineAtMs) {
			const killEvent = await waitForClosedOrAt(record, deadlineAtMs);
			if (killEvent === "closed") {
				status = groupInspection(record);
				if (status === "quiescent") {
					markGroupQuiescent(record);
					return;
				}
				if (status !== "owned")
					throw groupFailure(status, "verify KILL cleanup of the Codex process group");
			}
			if (now() < deadlineAtMs) await waitUntil(deadlineAtMs);
		}
		status = groupInspection(record);
		if (status === "quiescent") {
			markGroupQuiescent(record);
			return;
		}
		throw groupFailure(status, "complete composed Codex shutdown");
	}

	function ensureGroupCleanup(record: ChildRecord, deadlineAtMs: number): Promise<void> {
		if (record.groupQuiescent) return Promise.resolve();
		if (record.groupCleanup) return record.groupCleanup;
		const pending = cleanupGroup(record, deadlineAtMs);
		record.groupCleanup = pending;
		void pending.catch(() => {
			if (record.groupCleanup === pending) record.groupCleanup = undefined;
		});
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
						? cause
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
			message: diagnostics.redact(
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
							? cause
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

	function updateStrictHint(record: ChildRecord, chunk: string): void {
		record.strictHint ||= strictConfigHint(chunk);
		record.strictTail = `${record.strictTail}${chunk}`.slice(-STRICT_CONFIG_MATCH_WINDOW);
		record.strictHint ||= strictConfigHint(record.strictTail);
	}

	function handleClosed(
		record: ChildRecord,
		exit: { readonly code: number | null; readonly signal: NodeJS.Signals | null },
	): void {
		if (record.closedHandled) return;
		record.closedHandled = true;
		clearReadiness(record);
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
				message:
					exitFailureMessage("strict_config", exit, argv, diagnostics.snapshot()) +
					" Check config.toml and the exact strict argv.",
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
					message: exitFailureMessage("early_exit", exit, argv, diagnostics.snapshot()),
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
						? cause
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
							message: diagnostics.redact(cause.message),
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
					? cause
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
						? cause
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
				storage = prepareStorage(storageInput, { fileSystem: dependencies.fileSystem });
				environment = buildCodexChildEnvironment({
					ambient: options.ambientEnvironment,
					codexHome: storage.codexHome,
					sqliteHome: storage.sqliteHome,
				});
			} catch (cause) {
				const error =
					cause instanceof CodexStorageError
						? new CodexProcessError({
								code: "storage_refused",
								terminal: true,
								message: `${diagnostics.redact(cause.message)} Recovery: use fresh owner-controlled 0700 CODEX_HOME and CODEX_SQLITE_HOME roots, then retry.`,
							})
						: new CodexProcessError({
								code: "storage_refused",
								terminal: true,
								message: `Could not prepare the dedicated Codex storage: ${safeCauseMessage(cause)}.`,
								cause,
							});
				if (storage) {
					try {
						storage.release();
						storage = undefined;
					} catch {
						/* Retain storage ownership so terminal cleanup can retry the lock release. */
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
			try {
				child.kill("SIGKILL");
			} catch {
				/* A positive child handle is the only safe fallback when group proof failed. */
			}
			terminalFailure(error);
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
			group,
			closed,
			resolveClosed,
			spawned: false,
			ready: false,
			closedHandled: false,
			strictHint: false,
			strictTail: "",
			groupQuiescent: false,
		};
		current = record;
		groups.add(record);
		child.stderr.on("data", (chunk: Buffer | string) => {
			const redacted = diagnostics.append(chunk);
			updateStrictHint(record, redacted);
			publish();
		});
		child.stderr.resume();
		child.once("spawn", () => {
			if (record.closedHandled) return;
			record.spawned = true;
			if (stopping) return;
			setState("running");
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
			const publicChild = Object.freeze({
				pid: child.pid!,
				stdin: child.stdin,
				stdout: child.stdout,
				stderr: child.stderr,
			});
			for (const listener of childListeners) listener(publicChild);
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
						const result = await waitForClosedOrAt(owned, deadlineAtMs);
						if (result === "time")
							throw shutdownError(
								"The Codex child did not close before the composed shutdown deadline. Recovery: inspect the retained process group and retry stop.",
							);
					})(),
				);
			}
			const results = await settleBeforeDeadline(work, deadlineAtMs);
			const failed = results.find(
				(result): result is PromiseRejectedResult => result.status === "rejected",
			);
			if (failed) {
				const cause = failed.reason;
				throw cause instanceof CodexProcessError
					? cause
					: shutdownError(`Could not complete Codex shutdown: ${safeCauseMessage(cause)}.`);
			}
			if (now() >= deadlineAtMs || current || groups.size > 0)
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
					? cause
					: shutdownError(`Could not complete Codex shutdown: ${safeCauseMessage(cause)}.`);
			terminalFailure(error);
		});
		return operation;
	}

	function markAppServerReady(): void {
		if (stopping || state !== "running" || !current || current.closedHandled || current.ready)
			return;
		current.ready = true;
		clearReadiness(current);
		publish();
		resolvePendingStart();
	}

	function markAccountReady(): void {
		if (state !== "running" || !current?.ready) return;
		accountReady = true;
		restartAttempt = 0;
		lastFailure = null;
		publish();
	}

	function markTerminalFailure(message: string, cause?: unknown): void {
		terminalFailure(
			new CodexProcessError({ code: "strict_config_rejected", terminal: true, message, cause }),
		);
		if (current || groups.size > 0) void stop().catch(() => undefined);
	}

	function currentChild(): CodexProcessChild | null {
		if (!current || current.closedHandled || !current.spawned) return null;
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
		markAppServerReady,
		markAccountReady,
		markTerminalFailure,
		snapshot,
		currentChild,
		onChild,
		subscribe,
	});
}

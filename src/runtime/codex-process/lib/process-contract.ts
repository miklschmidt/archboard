import type {
	ChildProcessEventMap,
	ChildProcessByStdio,
	SpawnOptionsWithStdioTuple,
	StdioPipe,
} from "node:child_process";
import type { Readable, Writable } from "node:stream";

import type { BoundedCodexDiagnostics } from "@/runtime/codex-process/lib/diagnostics";
import type { CodexAmbientEnvironment } from "@/runtime/codex-process/lib/environment";
import type { VerifiedCodexExecutable } from "@/runtime/codex-process/lib/executable";
import type {
	CodexProcessGroupIdentity,
	CodexProcessGroupOperations,
} from "@/runtime/codex-process/lib/process-group";
import type {
	CodexStorageFileSystem,
	CodexStorageInput,
	PreparedCodexStorage,
} from "@/runtime/codex-process/lib/storage";

const CODEX_APP_SERVER_ARGUMENTS = Object.freeze([
	"app-server",
	"--stdio",
	"--strict-config",
] as const);
const CODEX_PROCESS_STDERR_MAX_BYTES = 64 * 1024;

type CodexProcessState =
	| "stopped"
	| "starting"
	| "running"
	| "backoff"
	| "group_cleanup"
	| "stopping"
	| "terminal_failure";

type CodexProcessFailureCode =
	| "binary_invalid"
	| "binary_missing"
	| "binary_wrong_version"
	| "storage_refused"
	| "spawn_failed"
	| "process_group_unavailable"
	| "strict_config_rejected"
	| "early_exit"
	| "crash"
	| "startup_timeout"
	| "listener_failed"
	| "shutdown_failed";

interface CodexProcessFailure {
	readonly code: CodexProcessFailureCode;
	readonly message: string;
	readonly terminal: boolean;
}

/** The exit code and signal reported when a child closes. */
interface ChildExit {
	readonly code: number | null;
	readonly signal: NodeJS.Signals | null;
}

interface CodexProcessExit extends ChildExit {
	readonly classification: "early_exit" | "crash" | "strict_config" | "requested";
}

interface CodexProcessSnapshot {
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

interface CodexProcessChild {
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

interface CodexProcessLifecycle {
	readonly markAppServerReady: () => void;
	readonly markAccountReady: () => void;
	readonly markTerminalFailure: (message: string, cause?: unknown) => void;
}

type Child = ChildProcessByStdio<Writable, Readable, Readable>;
type Timer = ReturnType<typeof setTimeout>;
/** The piped-stdio spawn overload; the only shape the owner ever spawns with. */
type SpawnChild = (
	file: string,
	args: readonly string[],
	options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioPipe>,
) => Child;

interface CodexProcessDependencies {
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

type CodexProcessStorageInput =
	| (CodexStorageInput & { readonly rootDirectory: string })
	| (CodexStorageInput & {
			readonly rootDirectory?: never;
			readonly codexHome: string;
			readonly sqliteHome: string;
	  });

interface CodexProcessOptions {
	readonly executablePath: string;
	readonly checkoutRoot: string;
	readonly storage: CodexProcessStorageInput;
	/** Publish each exact group identity to an outer cleanup owner before readiness. */
	readonly onGroupOwned?: (identity: CodexProcessGroupIdentity) => void;
	/** Secrets supplied by a caller are redacted before process diagnostics are retained. */
	readonly diagnosticSecrets?: readonly string[];
}

/** Test-only seams for deterministic lifecycle and failure-owner tests. */
interface CodexProcessTestOptions extends CodexProcessOptions {
	readonly ambientEnvironment?: CodexAmbientEnvironment;
	readonly argv?: readonly string[];
	readonly stderrLimitBytes?: number;
	readonly dependencies?: CodexProcessDependencies;
}

interface CodexProcess {
	readonly start: () => Promise<CodexProcessSnapshot>;
	readonly stop: () => Promise<CodexProcessSnapshot>;
	readonly snapshot: () => CodexProcessSnapshot;
	readonly currentChild: () => CodexProcessChild | null;
	readonly onChild: (listener: (child: CodexProcessChild) => void) => () => void;
	readonly subscribe: (listener: (snapshot: CodexProcessSnapshot) => void) => () => void;
}

/** What a process-owner failure records about itself. */
interface CodexProcessErrorInit {
	readonly code: CodexProcessFailureCode;
	readonly message: string;
	readonly terminal: boolean;
	/** Accepted for internal call-site compatibility but never retained publicly. */
	readonly cause?: unknown;
}

class CodexProcessError extends Error {
	readonly code: CodexProcessFailureCode;
	readonly terminal: boolean;

	/**
	 * Classify a process-owner failure and record whether it ends the owner.
	 * @param init - The failure code, message, terminality, and an internal cause never retained publicly.
	 */
	constructor(init: CodexProcessErrorInit) {
		super(init.message);
		this.name = "CodexProcessError";
		this.code = init.code;
		this.terminal = init.terminal;
	}
}

export {
	CODEX_APP_SERVER_ARGUMENTS,
	CODEX_PROCESS_STDERR_MAX_BYTES,
	CodexProcessError,
	type Child,
	type ChildExit,
	type CodexProcess,
	type CodexProcessChild,
	type CodexProcessDependencies,
	type CodexProcessExit,
	type CodexProcessFailure,
	type CodexProcessFailureCode,
	type CodexProcessLifecycle,
	type CodexProcessOptions,
	type CodexProcessSnapshot,
	type CodexProcessState,
	type CodexProcessStorageInput,
	type CodexProcessTestOptions,
	type SpawnChild,
	type Timer,
};

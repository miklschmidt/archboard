import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { isAbsolute, join, relative, resolve } from "node:path";

import {
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_BROWSER_POLL_MS,
} from "../../../../src/shared/timing/timing.ts";

export const BROWSER_ADAPTER_PATH = "tests/system/browser/run-browser-lane.ts";

export const BROWSER_TEST_PATHS = [
	"tests/system/browser/human-edit-performance.test.ts",
	"tests/system/browser/fixed-point-document.test.ts",
	"tests/system/browser/malformed-geometry-recovery.test.ts",
	"tests/system/browser/pane-telemetry-recovery.test.ts",
	"tests/system/browser/arrow-binding-differential.test.ts",
	"tests/system/browser/finding-export.test.ts",
	"tests/system/browser/shell-layout.test.ts",
	"tests/system/browser/typed-text.test.ts",
	"tests/system/browser/live-session-convergence.test.ts",
	"tests/system/browser/server-update-ordering.test.ts",
	"tests/system/browser/hold-generation.test.ts",
	"tests/system/browser/human-hold-persistence.test.ts",
	"tests/system/browser/claim-interaction.test.ts",
	"tests/system/browser/opener-settings.test.ts",
	"tests/system/browser/code-target-activation.test.ts",
] as const;

export type BrowserTestPath = (typeof BROWSER_TEST_PATHS)[number];
export const HUMAN_PERFORMANCE_BROWSER_OWNER = BROWSER_TEST_PATHS[0];
export const CI_EXCLUDED_BROWSER_OWNERS_ENV = "ARCHBOARD_CI_EXCLUDED_BROWSER_OWNERS";
const CI_EXCLUDED_BROWSER_OWNERS_VALUE = "all";
export interface BrowserSelection {
	mode: "package" | "focus";
	files: BrowserTestPath[];
}
export interface BrowserTestRoots {
	laneRoot: string;
	ownerRoot: string;
}
export interface PollOptions {
	timeoutMs?: number;
	intervalMs?: number;
}
export type TestEnvironment = Readonly<Record<string, string | undefined>>;

const PATH_INDEX = new Map<string, number>(BROWSER_TEST_PATHS.map((file, index) => [file, index]));
const REQUIRED_BROWSER_ENV = [
	"PATH",
	"HOME",
	"XDG_CONFIG_HOME",
	"XDG_STATE_HOME",
	"TMPDIR",
	"AGENT_BROWSER_SOCKET_DIR",
	"AGENT_BROWSER_SESSION",
	"AGENT_BROWSER_NAMESPACE",
	"AGENT_BROWSER_IDLE_TIMEOUT_MS",
] as const;
const CLEARED_CANVAS_ENV = [
	"ARCHBOARD_VAULT",
	"ARCHBOARD_REPOS",
	"ARCHBOARD_INJECT",
	"ARCHBOARD_INJECT_LOUD",
	"ARCHBOARD_INJECT_THREAD",
	"ARCHBOARD_INJECT_DEBOUNCE_MS",
	"ARCHBOARD_INJECT_MIN_INTERVAL_MS",
	"ARCHBOARD_SETTLE_MS",
	"ARCHBOARD_SETTLE_MAX_MS",
	"ARCHBOARD_OPENER_CONFIG",
	"CYCLES",
	"HOST",
	"PORT",
	"EXPRESS_SERVER_URL",
	"ENABLE_CANVAS_SYNC",
	"EXCALIDRAW_NO_AUTOSTART",
	"CODEX_HOME",
	"LOCALAPPDATA",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"ALL_PROXY",
	"NO_PROXY",
] as const;

function selectionError(message: string): never {
	throw new Error(
		`${message}\nUse the complete package command or ` +
			`bun ${BROWSER_ADAPTER_PATH} --focus <canonical test path> [...].`,
	);
}

export function validateBrowserSelection(argv: readonly string[]): BrowserSelection {
	if (argv[0] !== "bun" || argv[1] !== BROWSER_ADAPTER_PATH) {
		selectionError(`Browser lane must start with \`bun ${BROWSER_ADAPTER_PATH}\`.`);
	}
	const tail = argv.slice(2);
	const mode = tail[0] === "--focus" ? "focus" : "package";
	const selected = mode === "focus" ? tail.slice(1) : tail;
	if (mode === "focus" && selected.length === 0) selectionError("Focused browser lane is empty.");
	if (selected.some((token) => token.startsWith("-"))) {
		selectionError("Browser lane accepts no extra flags.");
	}
	const indices = selected.map((file) => PATH_INDEX.get(file));
	const unknown = selected.find((_, index) => indices[index] === undefined);
	if (unknown) selectionError(`Browser lane names unknown path \`${unknown}\`.`);
	const duplicate = selected.find((file, index) => selected.indexOf(file) !== index);
	if (duplicate) selectionError(`Browser lane repeats \`${duplicate}\`.`);
	for (let index = 1; index < indices.length; index += 1) {
		if ((indices[index - 1] ?? -1) >= (indices[index] ?? -1)) {
			selectionError("Focused browser paths are not in canonical relative order.");
		}
	}
	if (
		mode === "package" &&
		(selected.length !== BROWSER_TEST_PATHS.length ||
			selected.some((file, index) => file !== BROWSER_TEST_PATHS[index]))
	) {
		selectionError("Package browser lane must name all 15 canonical paths in order.");
	}
	return { mode, files: selected as BrowserTestPath[] };
}

export function applyCiBrowserOwnerExclusion(
	selection: BrowserSelection,
	environment: Readonly<Record<string, string | undefined>>,
): BrowserSelection {
	const excluded = environment[CI_EXCLUDED_BROWSER_OWNERS_ENV];
	if (excluded === undefined) return selection;
	if (environment.CI !== "true")
		selectionError(`${CI_EXCLUDED_BROWSER_OWNERS_ENV} requires CI=true.`);
	if (selection.mode !== "package") {
		selectionError(`${CI_EXCLUDED_BROWSER_OWNERS_ENV} is valid only for the package browser lane.`);
	}
	if (excluded !== CI_EXCLUDED_BROWSER_OWNERS_VALUE) {
		selectionError(`${CI_EXCLUDED_BROWSER_OWNERS_ENV} cannot exclude \`${excluded}\`.`);
	}
	return {
		...selection,
		files: [],
	};
}

function requiredEnvironment(name: (typeof REQUIRED_BROWSER_ENV)[number]): string {
	const value = process.env[name];
	if (!value) throw new Error(`Browser owner is missing runner-provided ${name}.`);
	return value;
}

function inside(parent: string, child: string): boolean {
	const step = relative(resolve(parent), resolve(child));
	return step === "" || (!step.startsWith("..") && !isAbsolute(step));
}

export function browserTestRoots(): BrowserTestRoots {
	const laneRoot = process.env.ARCHBOARD_TEST_BROWSER_LANE_ROOT;
	const ownerRoot = process.env.ARCHBOARD_TEST_BROWSER_OWNER_ROOT;
	if (!laneRoot || !ownerRoot)
		throw new Error("Browser test must run through run-browser-lane.ts.");
	if (!inside(laneRoot, ownerRoot) || laneRoot === ownerRoot) {
		throw new Error("Browser owner root must be a child of its lane root.");
	}
	if (!existsSync(laneRoot) || !existsSync(ownerRoot)) {
		throw new Error("Browser runner removed an owner root before the test acquired it.");
	}
	return { laneRoot, ownerRoot };
}

export function browserTestEnvironment(): Record<string, string> {
	const env: Record<string, string> = {
		LANG: "C.UTF-8",
		LC_ALL: "C.UTF-8",
		NO_COLOR: "1",
	};
	for (const name of REQUIRED_BROWSER_ENV) env[name] = requiredEnvironment(name);
	if (process.env.AGENT_BROWSER_EXECUTABLE_PATH) {
		env.AGENT_BROWSER_EXECUTABLE_PATH = process.env.AGENT_BROWSER_EXECUTABLE_PATH;
	}
	if (process.env.AGENT_BROWSER_DEFAULT_TIMEOUT) {
		env.AGENT_BROWSER_DEFAULT_TIMEOUT = process.env.AGENT_BROWSER_DEFAULT_TIMEOUT;
	}
	return env;
}

export function canvasTestEnvironment(
	values: TestEnvironment = {},
): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = browserTestEnvironment();
	env.LOG_FILE_PATH = join(browserTestRoots().ownerRoot, "canvas.log");
	for (const name of CLEARED_CANVAS_ENV) env[name] = undefined;
	for (const name of Object.keys(process.env)) {
		if (name.startsWith("ARCHBOARD_TEST_") || name.startsWith("AGENT_BROWSER_"))
			env[name] = undefined;
	}
	for (const [name, value] of Object.entries(values)) env[name] = value;
	return env;
}

function valueForDiagnostic(value: unknown): string {
	try {
		return JSON.stringify(value)?.slice(0, 500) ?? String(value);
	} catch {
		return String(value);
	}
}

export async function pollUntil<T>(
	read: () => T | Promise<T>,
	accepts: (value: T) => boolean,
	description: string,
	options: PollOptions = {},
): Promise<T> {
	const timeoutMs = options.timeoutMs ?? TEST_BROWSER_COMMAND_TIMEOUT_MS;
	const intervalMs = options.intervalMs ?? TEST_BROWSER_POLL_MS;
	const deadline = Date.now() + timeoutMs;
	let last!: T;
	for (;;) {
		last = await read();
		if (accepts(last)) return last;
		const remainingMs = deadline - Date.now();
		if (remainingMs <= 0) break;
		await Bun.sleep(Math.min(intervalMs, remainingMs));
	}
	throw new Error(`Timed out waiting for ${description}; last value: ${valueForDiagnostic(last)}`);
}

export function browserCleanupObservationMs(idleTimeout: string): number {
	const idleTimeoutMs = Number(idleTimeout);
	if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs < 0) {
		throw new Error(`Invalid owned agent-browser idle timeout: ${idleTimeout}`);
	}
	return idleTimeoutMs + TEST_BROWSER_POLL_MS;
}

export function registerCanvasBase(base: string): void {
	const url = new URL(base);
	if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port) {
		throw new Error(`Owned canvas base is not an explicit loopback listener: ${base}`);
	}
	const { ownerRoot } = browserTestRoots();
	appendFileSync(join(ownerRoot, ".canvas-bases"), `${url.origin}\n`, { encoding: "utf8" });
}

function ownedProcessIds(namespace: string, session: string): number[] {
	const wanted = [`AGENT_BROWSER_NAMESPACE=${namespace}`, `AGENT_BROWSER_SESSION=${session}`];
	const found: number[] = [];
	for (const entry of readdirSync("/proc", { withFileTypes: true })) {
		if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
		try {
			const env = readFileSync(join("/proc", entry.name, "environ"), "utf8").split("\0");
			if (wanted.some((item) => env.includes(item))) found.push(Number(entry.name));
		} catch {
			// A process may exit between listing /proc and reading its environment.
		}
	}
	return found;
}

function namespaceArtifacts(socketDir: string): string[] {
	if (!existsSync(socketDir)) return [];
	const found: string[] = [];
	const queue = [socketDir];
	while (queue.length > 0) {
		const directory = queue.pop();
		if (!directory) continue;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) queue.push(absolute);
			else found.push(relative(socketDir, absolute));
		}
	}
	return found.toSorted();
}

export interface AgentBrowserSession extends AsyncDisposable {
	readonly session: string;
	readonly namespace: string;
	readonly socketDir: string;
	readonly env: Readonly<Record<string, string>>;
	run(argv: readonly string[], options?: BrowserCommandOptions): Promise<string>;
	eval<T>(source: string): Promise<T>;
	close(): Promise<void>;
}

export interface BrowserCommandOptions {
	readonly stdin?: string;
	readonly timeoutMs?: number;
}

export async function createAgentBrowser(): Promise<AgentBrowserSession> {
	const roots = browserTestRoots();
	const env = browserTestEnvironment();
	const session = requiredEnvironment("AGENT_BROWSER_SESSION");
	const namespace = requiredEnvironment("AGENT_BROWSER_NAMESPACE");
	const socketDir = requiredEnvironment("AGENT_BROWSER_SOCKET_DIR");
	const cleanupObservationMs = browserCleanupObservationMs(
		requiredEnvironment("AGENT_BROWSER_IDLE_TIMEOUT_MS"),
	);
	const directories = [
		requiredEnvironment("HOME"),
		requiredEnvironment("XDG_CONFIG_HOME"),
		requiredEnvironment("XDG_STATE_HOME"),
		requiredEnvironment("TMPDIR"),
		socketDir,
	];
	for (const directory of directories) {
		if (!inside(roots.ownerRoot, directory)) {
			throw new Error(`Runner-provided browser directory escapes owner root: ${directory}`);
		}
		mkdirSync(directory, { recursive: true });
	}
	const children = new Set<ChildProcessWithoutNullStreams>();
	let closed = false;
	let used = false;
	let disposal: Promise<void> | null = null;

	const run = (argv: readonly string[], options: BrowserCommandOptions = {}): Promise<string> => {
		const timeoutMs = options.timeoutMs ?? TEST_BROWSER_COMMAND_TIMEOUT_MS;
		if (!Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
			return Promise.reject(
				new Error(
					`Agent-browser command timeout must be a positive finite integer; received ${timeoutMs}.`,
				),
			);
		}
		return new Promise((resolveRun, rejectRun) => {
			if (closed && argv[0] !== "close") {
				rejectRun(new Error("Cannot run a command after closing the agent-browser session."));
				return;
			}
			if (argv[0] !== "close") used = true;
			const child = spawn(
				"agent-browser",
				["--namespace", namespace, "--session", session, ...argv],
				{
					cwd: roots.ownerRoot,
					env,
					stdio: ["pipe", "pipe", "pipe"],
				},
			) as unknown as ChildProcessWithoutNullStreams;
			children.add(child);
			let stdout = "";
			let stderr = "";
			let timedOut = false;
			const graceful = setTimeout(() => {
				timedOut = true;
				child.kill("SIGTERM");
			}, timeoutMs);
			const forced = setTimeout(() => child.kill("SIGKILL"), timeoutMs + TEST_BROWSER_POLL_MS);
			child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
			child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
			child.once("error", (error) => {
				clearTimeout(graceful);
				clearTimeout(forced);
				children.delete(child);
				rejectRun(
					new Error(`Could not start agent-browser ${argv[0] ?? "command"}.`, { cause: error }),
				);
			});
			child.once("close", (code, signal) => {
				clearTimeout(graceful);
				clearTimeout(forced);
				children.delete(child);
				if (code === 0 && !timedOut) resolveRun(stdout);
				else {
					const exit = signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`;
					rejectRun(
						new Error(
							timedOut
								? `agent-browser ${argv[0] ?? "command"} timed out after ${timeoutMs}ms and ended with ${exit}: ${(stderr || stdout).trim()}`
								: `agent-browser ${argv[0] ?? "command"} ended with ${exit}: ${(stderr || stdout).trim()}`,
						),
					);
				}
			});
			child.stdin.end(options.stdin ?? "");
		});
	};

	const cleanup = async (): Promise<void> => {
		if (disposal) return disposal;
		disposal = (async () => {
			closed = true;
			let closeFailure: unknown;
			if (used) {
				try {
					await run(["close"]);
				} catch (error) {
					closeFailure = error;
				}
			}
			for (const child of children) child.kill("SIGTERM");
			await pollUntil(
				() => ({
					sockets: namespaceArtifacts(socketDir).filter((entry) => entry.endsWith(".sock")),
					processes: ownedProcessIds(namespace, session).filter((pid) => pid !== process.pid),
				}),
				(state) => state.processes.length === 0 && state.sockets.length === 0,
				`agent-browser session ${session} and daemon namespace ${namespace} to disappear`,
				{ timeoutMs: cleanupObservationMs },
			);
			rmSync(socketDir, { recursive: true, force: true });
			if (closeFailure) throw closeFailure;
		})();
		return disposal;
	};

	return {
		session,
		namespace,
		socketDir,
		env,
		run,
		async eval<T>(source: string): Promise<T> {
			const output = await run(["eval", "--stdin"], { stdin: source });
			try {
				return JSON.parse(output) as T;
			} catch (error) {
				throw new Error(`agent-browser eval returned non-JSON: ${output.trim().slice(0, 500)}`, {
					cause: error,
				});
			}
		},
		close: cleanup,
		[Symbol.asyncDispose]: cleanup,
	};
}

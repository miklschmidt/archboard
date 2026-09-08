import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";

import { TEST_BROWSER_COMMAND_TIMEOUT_MS, TEST_BROWSER_POLL_MS } from "../../support/timing.ts";
import { browserProfileForSession } from "./browser-executable.ts";
import { processIdsWithEnvironmentMarkers } from "./process-environment-census.ts";

interface BrowserTestRoots {
	laneRoot: string;
	ownerRoot: string;
}
interface PollOptions {
	timeoutMs?: number;
	intervalMs?: number;
}
type TestEnvironment = Readonly<Record<string, string | undefined>>;

function runCanvasCli(base: string, vault: string, args: string[]): string {
	const repoRoot = resolve(import.meta.dir, "../../../..");
	const result = spawnSync(join(repoRoot, "bin/canvas"), args, {
		cwd: repoRoot,
		encoding: "utf8",
		timeout: TEST_BROWSER_COMMAND_TIMEOUT_MS,
		killSignal: "SIGKILL",
		env: {
			...process.env,
			ARCHBOARD_VAULT: vault,
			EXPRESS_SERVER_URL: base,
			EXCALIDRAW_NO_AUTOSTART: "1",
		},
	});
	if (result.error || result.status !== 0) {
		const detail = result.error?.message ?? (result.stderr || `exit ${result.status ?? "unknown"}`);
		throw new Error(detail);
	}
	return result.stdout;
}

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

function requiredEnvironment(name: (typeof REQUIRED_BROWSER_ENV)[number]): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Browser owner is missing runner-provided ${name}.`);
	}
	return value;
}

function inside(parent: string, child: string): boolean {
	const step = relative(resolve(parent), resolve(child));
	return step === "" || (!step.startsWith("..") && !isAbsolute(step));
}

function browserTestRoots(): BrowserTestRoots {
	const laneRoot = process.env["ARCHBOARD_TEST_BROWSER_LANE_ROOT"];
	const ownerRoot = process.env["ARCHBOARD_TEST_BROWSER_OWNER_ROOT"];
	if (!laneRoot || !ownerRoot) {
		throw new Error("Browser test must run through run-browser-lane.ts.");
	}
	if (!inside(laneRoot, ownerRoot) || laneRoot === ownerRoot) {
		throw new Error("Browser owner root must be a child of its lane root.");
	}
	if (!existsSync(laneRoot) || !existsSync(ownerRoot)) {
		throw new Error("Browser runner removed an owner root before the test acquired it.");
	}
	return { laneRoot, ownerRoot };
}

function browserTestEnvironment(): Record<string, string> {
	const env: Record<string, string> = {
		LANG: "C.UTF-8",
		LC_ALL: "C.UTF-8",
		NO_COLOR: "1",
	};
	for (const name of REQUIRED_BROWSER_ENV) {
		env[name] = requiredEnvironment(name);
	}
	if (process.env["AGENT_BROWSER_EXECUTABLE_PATH"]) {
		env["AGENT_BROWSER_EXECUTABLE_PATH"] = process.env["AGENT_BROWSER_EXECUTABLE_PATH"];
	}
	if (process.env["AGENT_BROWSER_PROFILE"]) {
		env["AGENT_BROWSER_PROFILE"] = process.env["AGENT_BROWSER_PROFILE"];
	}
	if (process.env["AGENT_BROWSER_DEFAULT_TIMEOUT"]) {
		env["AGENT_BROWSER_DEFAULT_TIMEOUT"] = process.env["AGENT_BROWSER_DEFAULT_TIMEOUT"];
	}
	return env;
}

function canvasTestEnvironment(values: TestEnvironment = {}): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = browserTestEnvironment();
	// The test page and its server renderer are separate browser launches.
	// Preserve the renderer override instead of falling back to managed Chrome.
	if (process.env["ARCHBOARD_RENDERER_CHROMIUM"]) {
		env["ARCHBOARD_RENDERER_CHROMIUM"] = process.env["ARCHBOARD_RENDERER_CHROMIUM"];
	}
	env["LOG_FILE_PATH"] = join(browserTestRoots().ownerRoot, "canvas.log");
	for (const name of CLEARED_CANVAS_ENV) {
		env[name] = undefined;
	}
	for (const name of Object.keys(process.env)) {
		if (name.startsWith("ARCHBOARD_TEST_") || name.startsWith("AGENT_BROWSER_")) {
			env[name] = undefined;
		}
	}
	for (const [name, value] of Object.entries(values)) {
		env[name] = value;
	}
	return env;
}

function valueForDiagnostic(value: unknown): string {
	try {
		return JSON.stringify(value)?.slice(0, 500) ?? String(value);
	} catch {
		return String(value);
	}
}

async function pollUntil<T>(
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
		if (accepts(last)) {
			return last;
		}
		const remainingMs = deadline - Date.now();
		if (remainingMs <= 0) {
			break;
		}
		await Bun.sleep(Math.min(intervalMs, remainingMs));
	}
	throw new Error(`Timed out waiting for ${description}; last value: ${valueForDiagnostic(last)}`);
}

function browserCleanupObservationMs(idleTimeout: string): number {
	const idleTimeoutMs = Number(idleTimeout);
	if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs < 0) {
		throw new Error(`Invalid owned agent-browser idle timeout: ${idleTimeout}`);
	}
	return idleTimeoutMs + TEST_BROWSER_POLL_MS;
}

function registerCanvasBase(base: string): void {
	const url = new URL(base);
	if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port) {
		throw new Error(`Owned canvas base is not an explicit loopback listener: ${base}`);
	}
	const { ownerRoot } = browserTestRoots();
	appendFileSync(join(ownerRoot, ".canvas-bases"), `${url.origin}\n`, { encoding: "utf8" });
}

function ownedProcessIds(namespace: string, session: string): number[] {
	return processIdsWithEnvironmentMarkers([
		`AGENT_BROWSER_NAMESPACE=${namespace}`,
		`AGENT_BROWSER_SESSION=${session}`,
	]);
}

function namespaceArtifacts(socketDir: string): string[] {
	if (!existsSync(socketDir)) {
		return [];
	}
	const found: string[] = [];
	const queue = [socketDir];
	while (queue.length > 0) {
		const directory = queue.pop();
		if (!directory) {
			continue;
		}
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) {
				queue.push(absolute);
			} else {
				found.push(relative(socketDir, absolute));
			}
		}
	}
	return found.toSorted();
}

interface AgentBrowserSession extends AsyncDisposable {
	readonly session: string;
	readonly namespace: string;
	readonly socketDir: string;
	readonly env: Readonly<Record<string, string>>;
	run(argv: readonly string[], options?: BrowserCommandOptions): Promise<string>;
	eval<T>(source: string): Promise<T>;
	close(): Promise<void>;
}

interface BrowserCommandOptions {
	readonly stdin?: string;
	readonly timeoutMs?: number;
}

async function createAgentBrowser(): Promise<AgentBrowserSession> {
	const roots = browserTestRoots();
	const env = browserTestEnvironment();
	const configuredSession = requiredEnvironment("AGENT_BROWSER_SESSION");
	const identity = randomUUID().slice(0, 8);
	const session =
		process.platform === "darwin" ? `${configuredSession}-${identity}` : configuredSession;
	const namespace = requiredEnvironment("AGENT_BROWSER_NAMESPACE");
	const socketDir = requiredEnvironment("AGENT_BROWSER_SOCKET_DIR");
	const browserProfile = browserProfileForSession(roots.ownerRoot, identity);
	env["AGENT_BROWSER_SESSION"] = session;
	if (browserProfile) env["AGENT_BROWSER_PROFILE"] = browserProfile;
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
			if (argv[0] !== "close") {
				used = true;
			}
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
				if (code === 0 && !timedOut) {
					resolveRun(stdout);
				} else {
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
		if (disposal) {
			return disposal;
		}
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
			for (const child of children) {
				child.kill("SIGTERM");
			}
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
			if (closeFailure) {
				throw closeFailure;
			}
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

export {
	BROWSER_ADAPTER_PATH,
	BROWSER_TEST_PATHS,
	OPT_IN_BROWSER_TEST_PATHS,
	type BrowserTestPath,
	HUMAN_PERFORMANCE_BROWSER_OWNER,
	CI_EXCLUDED_BROWSER_OWNERS_ENV,
	type BrowserSelection,
	validateBrowserSelection,
	browserOwnerCommandArguments,
	applyCiBrowserOwnerExclusion,
} from "./browser-selection.ts";
export {
	type BrowserTestRoots,
	type PollOptions,
	type TestEnvironment,
	runCanvasCli,
	browserTestRoots,
	browserTestEnvironment,
	canvasTestEnvironment,
	pollUntil,
	browserCleanupObservationMs,
	registerCanvasBase,
	type AgentBrowserSession,
	type BrowserCommandOptions,
	createAgentBrowser,
};

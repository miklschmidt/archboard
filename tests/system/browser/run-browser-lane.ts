import {
	accessSync,
	constants,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	unlinkSync,
} from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_BROWSER_POLL_MS,
} from "../../../src/shared/timing/timing.ts";
import {
	BROWSER_ADAPTER_PATH,
	browserCleanupObservationMs,
	pollUntil,
	type BrowserSelection,
	type BrowserTestPath,
	validateBrowserSelection,
} from "./support/agent-browser.ts";
import { ensureFreshFrontend, type FrontendBuildRequest } from "./support/frontend-build.ts";

export {
	BROWSER_ADAPTER_PATH,
	BROWSER_TEST_PATHS,
	validateBrowserSelection,
} from "./support/agent-browser.ts";
export type { BrowserSelection, BrowserTestPath } from "./support/agent-browser.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const HUMAN_PERFORMANCE = "tests/system/browser/human-edit-performance.test.ts";

class CouldNotRunError extends Error {}
class InterruptedError extends Error {
	constructor(
		readonly signal: "SIGINT" | "SIGTERM",
		cause?: unknown,
	) {
		super(`Browser lane interrupted by ${signal}.`, { cause });
	}
}

interface OwnedChild {
	child: ChildProcess;
	pid: number;
	termGraceMs: number;
	exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

interface OwnerContext {
	file: BrowserTestPath;
	root: string;
	processGroup: number;
	env: Record<string, string>;
}

interface OwnerAuditSample {
	groupAlive: boolean;
	processes: number[];
	sockets: string[];
	listeners: string[];
}

function ownerIsClean(state: OwnerAuditSample): boolean {
	return (
		!state.groupAlive &&
		state.processes.length === 0 &&
		state.sockets.length === 0 &&
		state.listeners.length === 0
	);
}

function preflightEnvironment(): Record<string, string> {
	const selectedPath = process.env.PATH;
	if (!selectedPath) throw new CouldNotRunError("Browser lane has no PATH for prerequisites.");
	return { PATH: selectedPath, LANG: "C.UTF-8", LC_ALL: "C.UTF-8", NO_COLOR: "1" };
}

function probe(command: string, argv: readonly string[], label: string): void {
	const result = spawnSync(command, argv, {
		env: preflightEnvironment(),
		encoding: "utf8",
		stdio: "pipe",
		timeout: TEST_BROWSER_COMMAND_TIMEOUT_MS,
	});
	if (result.error || result.signal || result.status !== 0) {
		const exit = result.error
			? result.error.message
			: result.signal
				? `signal ${result.signal}`
				: `exit ${result.status ?? "unknown"}`;
		throw new CouldNotRunError(`${label} prerequisite could not run: ${exit}`);
	}
}

function configuredBrowserExecutable(): string {
	const configured = process.env.AGENT_BROWSER_EXECUTABLE_PATH;
	if (!configured) {
		throw new CouldNotRunError(
			"AGENT_BROWSER_EXECUTABLE_PATH is missing; set it to the absolute Chrome executable installed for this lane.",
		);
	}
	if (!isAbsolute(configured)) {
		throw new CouldNotRunError(`AGENT_BROWSER_EXECUTABLE_PATH must be absolute: ${configured}`);
	}
	const executable = resolve(configured);
	let stat: ReturnType<typeof statSync>;
	try {
		stat = statSync(executable);
	} catch (error) {
		throw new CouldNotRunError(`AGENT_BROWSER_EXECUTABLE_PATH does not exist: ${executable}`, {
			cause: error,
		});
	}
	if (!stat.isFile()) {
		throw new CouldNotRunError(`AGENT_BROWSER_EXECUTABLE_PATH is not a file: ${executable}`);
	}
	try {
		accessSync(executable, constants.X_OK);
	} catch (error) {
		throw new CouldNotRunError(`AGENT_BROWSER_EXECUTABLE_PATH is not executable: ${executable}`, {
			cause: error,
		});
	}
	return executable;
}

function verifyPrerequisites(selection: BrowserSelection): string {
	const browserExecutable = configuredBrowserExecutable();
	probe("agent-browser", ["--version"], "agent-browser");
	if (selection.files.includes(HUMAN_PERFORMANCE)) probe("strace", ["--version"], "strace");
	return browserExecutable;
}

function childName(index: number): string {
	return String(index + 1).padStart(2, "0");
}

function ownerEnvironment(
	laneRoot: string,
	ownerRoot: string,
	browserExecutable: string,
): Record<string, string> {
	const selectedPath = process.env.PATH;
	if (!selectedPath) throw new CouldNotRunError("Browser lane has no PATH for its Bun child.");
	const identity = randomUUID().slice(0, 8);
	return {
		PATH: selectedPath,
		LANG: "C.UTF-8",
		LC_ALL: "C.UTF-8",
		NO_COLOR: "1",
		HOME: join(ownerRoot, "home"),
		XDG_CONFIG_HOME: join(ownerRoot, "xdg-config"),
		XDG_STATE_HOME: join(ownerRoot, "xdg-state"),
		TMPDIR: join(ownerRoot, "tmp"),
		AGENT_BROWSER_SOCKET_DIR: join(ownerRoot, "ab"),
		AGENT_BROWSER_SESSION: `s-${identity}`,
		AGENT_BROWSER_NAMESPACE: `n-${identity}`,
		AGENT_BROWSER_IDLE_TIMEOUT_MS: String(TEST_BROWSER_COMMAND_TIMEOUT_MS),
		AGENT_BROWSER_EXECUTABLE_PATH: browserExecutable,
		ARCHBOARD_TEST_BROWSER_LANE_ROOT: laneRoot,
		ARCHBOARD_TEST_BROWSER_OWNER_ROOT: ownerRoot,
	};
}

function spawnOwner(file: BrowserTestPath, env: Record<string, string>): OwnedChild {
	const fixture = process.env.ARCHBOARD_TEST_BROWSER_OWNER_FIXTURE;
	if (fixture && (!isAbsolute(fixture) || !existsSync(fixture))) {
		throw new CouldNotRunError(
			"ARCHBOARD_TEST_BROWSER_OWNER_FIXTURE must name an existing absolute file.",
		);
	}
	const argv = fixture
		? [fixture]
		: ["test", "--no-orphans", "--isolate", "--max-concurrency=1", file];
	const child = spawn("bun", argv, {
		cwd: repoRoot,
		detached: true,
		env,
		stdio: "inherit",
	});
	if (child.pid === undefined) throw new CouldNotRunError(`Bun did not return a pid for ${file}.`);
	const pid = child.pid;
	const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
		(resolveExit, rejectExit) => {
			child.once("error", (error) =>
				rejectExit(new CouldNotRunError(`Could not start Bun owner ${file}.`, { cause: error })),
			);
			child.once("exit", (code, signal) => resolveExit({ code, signal }));
		},
	);
	return { child, pid, termGraceMs: TEST_BROWSER_COMMAND_TIMEOUT_MS, exit };
}

function spawnFrontendBuild(request: FrontendBuildRequest): OwnedChild {
	const child = spawn(request.executable, request.argv, {
		cwd: request.cwd,
		detached: true,
		env: request.env,
		stdio: "inherit",
	});
	if (child.pid === undefined)
		throw new CouldNotRunError("Bun did not return a frontend build pid.");
	const pid = child.pid;
	const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
		(resolveExit, rejectExit) => {
			child.once("error", (error) =>
				rejectExit(new CouldNotRunError("Could not start the frontend build.", { cause: error })),
			);
			child.once("exit", (code, signal) => resolveExit({ code, signal }));
		},
	);
	return { child, pid, termGraceMs: TEST_BROWSER_POLL_MS, exit };
}

function processGroupExists(processGroup: number): boolean {
	try {
		process.kill(-processGroup, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

function markedProcesses(ownerRoot: string, namespace: string, session: string): number[] {
	const wanted = [
		`ARCHBOARD_TEST_BROWSER_OWNER_ROOT=${ownerRoot}`,
		`AGENT_BROWSER_NAMESPACE=${namespace}`,
		`AGENT_BROWSER_SESSION=${session}`,
	];
	const found: number[] = [];
	for (const entry of readdirSync("/proc", { withFileTypes: true })) {
		if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
		try {
			const env = readFileSync(join("/proc", entry.name, "environ"), "utf8").split("\0");
			if (wanted.some((item) => env.includes(item))) found.push(Number(entry.name));
		} catch {
			// Processes can exit while the audit walks /proc.
		}
	}
	return found;
}

function namespaceArtifacts(directory: string): string[] {
	if (!existsSync(directory)) return [];
	const found: string[] = [];
	const queue = [directory];
	while (queue.length > 0) {
		const current = queue.pop();
		if (!current) continue;
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const absolute = join(current, entry.name);
			if (entry.isDirectory()) queue.push(absolute);
			else found.push(absolute.slice(directory.length + 1));
		}
	}
	return found.toSorted();
}

async function canvasListenerIsClosed(base: string): Promise<boolean> {
	try {
		await fetch(`${base}/health`, { signal: AbortSignal.timeout(TEST_BROWSER_POLL_MS) });
		return false;
	} catch {
		return true;
	}
}

function registeredCanvasBases(ownerRoot: string): string[] {
	const registry = join(ownerRoot, ".canvas-bases");
	if (!existsSync(registry)) return [];
	const bases = readFileSync(registry, "utf8").split("\n").filter(Boolean);
	unlinkSync(registry);
	return bases;
}

async function auditOwner(context: OwnerContext): Promise<void> {
	const bases = registeredCanvasBases(context.root);
	const sample = async (): Promise<OwnerAuditSample> => {
		const listeners: string[] = [];
		for (const base of bases) {
			if (!(await canvasListenerIsClosed(base))) listeners.push(base);
		}
		return {
			groupAlive: processGroupExists(context.processGroup),
			processes: markedProcesses(
				context.root,
				context.env.AGENT_BROWSER_NAMESPACE!,
				context.env.AGENT_BROWSER_SESSION!,
			).filter((pid) => pid !== process.pid),
			sockets: namespaceArtifacts(context.env.AGENT_BROWSER_SOCKET_DIR!).filter((entry) =>
				entry.endsWith(".sock"),
			),
			listeners,
		};
	};
	let state: Awaited<ReturnType<typeof sample>>;
	try {
		state = await pollUntil(sample, ownerIsClean, `browser owner ${context.file} cleanup`, {
			timeoutMs: browserCleanupObservationMs(context.env.AGENT_BROWSER_IDLE_TIMEOUT_MS!),
		});
	} catch {
		state = await sample();
	}
	const failures: string[] = [];
	if (state.groupAlive) failures.push(`process group ${context.processGroup} remains`);
	if (state.processes.length > 0)
		failures.push(`owned processes remain: ${state.processes.join(", ")}`);
	if (state.sockets.length > 0)
		failures.push(`agent-browser sockets remain: ${state.sockets.join(", ")}`);
	for (const base of state.listeners) failures.push(`canvas listener remains at ${base}`);
	rmSync(context.root, { recursive: true, force: true });
	if (existsSync(context.root)) failures.push("file-specific owner directory remains");
	if (failures.length > 0) {
		throw new Error(`Browser owner cleanup failed for ${context.file}: ${failures.join("; ")}`);
	}
}

async function waitForExit(child: OwnedChild, timeoutMs: number): Promise<boolean> {
	return new Promise((resolveExit, rejectExit) => {
		const timeout = setTimeout(() => resolveExit(false), timeoutMs);
		child.exit.then(
			() => {
				clearTimeout(timeout);
				return resolveExit(true);
			},
			(error: unknown) => {
				clearTimeout(timeout);
				return rejectExit(error);
			},
		);
	});
}

async function waitForProcessGroup(processGroup: number, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (processGroupExists(processGroup) && Date.now() < deadline) {
		await Bun.sleep(TEST_BROWSER_POLL_MS);
	}
	return !processGroupExists(processGroup);
}

async function stopOwnedChild(child: OwnedChild): Promise<void> {
	if (child.child.exitCode === null && child.child.signalCode === null) child.child.kill("SIGTERM");
	if (!(await waitForExit(child, child.termGraceMs))) {
		if (processGroupExists(child.pid)) process.kill(-child.pid, "SIGKILL");
	}
	if (!(await waitForExit(child, TEST_BROWSER_COMMAND_TIMEOUT_MS))) {
		throw new Error(`Bun owner process group ${child.pid} did not exit after SIGKILL.`);
	}
	await child.exit;
	if (!(await waitForProcessGroup(child.pid, TEST_BROWSER_COMMAND_TIMEOUT_MS))) {
		process.kill(-child.pid, "SIGKILL");
		if (!(await waitForProcessGroup(child.pid, TEST_BROWSER_COMMAND_TIMEOUT_MS))) {
			throw new Error(`Bun owner process group ${child.pid} retained descendants after SIGKILL.`);
		}
	}
}

async function reapExitedOwner(child: OwnedChild): Promise<void> {
	if (!processGroupExists(child.pid)) return;
	process.kill(-child.pid, "SIGTERM");
	if (await waitForProcessGroup(child.pid, TEST_BROWSER_COMMAND_TIMEOUT_MS)) return;
	process.kill(-child.pid, "SIGKILL");
	if (!(await waitForProcessGroup(child.pid, TEST_BROWSER_COMMAND_TIMEOUT_MS))) {
		throw new Error(`Bun owner process group ${child.pid} retained descendants after cleanup.`);
	}
}

async function runSelection(
	selection: BrowserSelection,
	browserExecutable: string,
): Promise<number> {
	let current: OwnedChild | null = null;
	let interrupted: "SIGINT" | "SIGTERM" | null = null;
	let interruption: Promise<void> | null = null;
	const interrupt = (signal: "SIGINT" | "SIGTERM"): void => {
		interrupted ??= signal;
		if (!interruption) {
			interruption = current ? stopOwnedChild(current) : Promise.resolve();
		}
	};
	const onSigint = (): void => interrupt("SIGINT");
	const onSigterm = (): void => interrupt("SIGTERM");
	const pendingInterruption = (): Promise<void> | null => interruption;
	const interruptionSignal = (): "SIGINT" | "SIGTERM" | null => interrupted;
	const raiseInterruption = async (): Promise<never> => {
		const signal = interruptionSignal();
		if (!signal) throw new Error("Interruption cleanup ran without a signal.");
		let cause: unknown;
		try {
			await (pendingInterruption() ?? Promise.resolve());
		} catch (error) {
			cause = error;
		}
		throw new InterruptedError(signal, cause);
	};
	const finishChild = async (child: OwnedChild, label: string): Promise<void> => {
		const outcome = await child.exit;
		if (interruptionSignal()) await raiseInterruption();
		await reapExitedOwner(child);
		if (outcome.signal || outcome.code !== 0) {
			const exit = outcome.signal
				? `signal ${outcome.signal}`
				: `exit ${outcome.code ?? "unknown"}`;
			throw new Error(`${label} ended with ${exit}.`);
		}
	};
	process.on("SIGINT", onSigint);
	process.on("SIGTERM", onSigterm);

	await using resources = new AsyncDisposableStack();
	let laneRoot = "";
	let result: number | undefined;
	let runFailure: unknown;
	try {
		laneRoot = mkdtempSync(join(tmpdir(), "ab-lane-"));
		resources.defer(() => rmSync(laneRoot, { recursive: true, force: true }));
		if (interruptionSignal()) await raiseInterruption();
		await ensureFreshFrontend(repoRoot, async (request) => {
			if (interruptionSignal()) await raiseInterruption();
			const build = spawnFrontendBuild(request);
			current = build;
			try {
				await finishChild(build, "Frontend build");
			} finally {
				current = null;
			}
		});
		if (interruptionSignal()) await raiseInterruption();
		for (const [index, file] of selection.files.entries()) {
			if (interrupted) throw new InterruptedError(interrupted);
			const name = childName(index);
			const ownerRoot = join(laneRoot, name);
			mkdirSync(ownerRoot);
			const env = ownerEnvironment(laneRoot, ownerRoot, browserExecutable);
			current = spawnOwner(file, env);
			const processGroup = current.pid;
			try {
				await finishChild(current, `Browser owner ${file}`);
			} finally {
				current = null;
				await auditOwner({ file, root: ownerRoot, processGroup, env });
			}
			if (interruptionSignal()) await raiseInterruption();
		}
		result = 0;
	} catch (error) {
		runFailure = error;
	}
	let cleanupFailure: unknown;
	try {
		if (current) await stopOwnedChild(current);
		const pending = pendingInterruption();
		if (pending) await pending;
	} catch (error) {
		cleanupFailure = error;
	}
	process.off("SIGINT", onSigint);
	process.off("SIGTERM", onSigterm);
	const signal = interruptionSignal();
	if (signal) throw new InterruptedError(signal, cleanupFailure ?? runFailure);
	if (cleanupFailure) throw cleanupFailure;
	if (runFailure) throw runFailure;
	if (result === undefined) throw new Error("Browser lane ended without a result.");
	return result;
}

async function main(): Promise<number> {
	let selection: BrowserSelection;
	try {
		selection = validateBrowserSelection(["bun", BROWSER_ADAPTER_PATH, ...process.argv.slice(2)]);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
	try {
		const browserExecutable = verifyPrerequisites(selection);
		return await runSelection(selection, browserExecutable);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		if (error instanceof CouldNotRunError) return 2;
		if (error instanceof InterruptedError) return error.signal === "SIGINT" ? 130 : 143;
		return 1;
	}
}

if (import.meta.main) process.exitCode = await main();

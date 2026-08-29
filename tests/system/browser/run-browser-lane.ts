import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	unlinkSync,
} from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_BROWSER_POLL_MS,
} from "../../../src/shared/timing/timing.ts";
import {
	BROWSER_ADAPTER_PATH,
	type BrowserSelection,
	type BrowserTestPath,
	validateBrowserSelection,
} from "./support/agent-browser.ts";
import { ensureFreshFrontend } from "./support/frontend-build.ts";

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
	constructor(readonly signal: "SIGINT" | "SIGTERM") {
		super(`Browser lane interrupted by ${signal}.`);
	}
}

interface OwnedChild {
	child: ChildProcess;
	pid: number;
	exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

interface OwnerContext {
	file: BrowserTestPath;
	root: string;
	processGroup: number;
	env: Record<string, string>;
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

function verifyPrerequisites(selection: BrowserSelection): void {
	probe("agent-browser", ["--version"], "agent-browser");
	if (selection.files.includes(HUMAN_PERFORMANCE)) probe("strace", ["--version"], "strace");
}

function childName(index: number): string {
	return String(index + 1).padStart(2, "0");
}

function ownerEnvironment(laneRoot: string, ownerRoot: string): Record<string, string> {
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
		ARCHBOARD_TEST_BROWSER_LANE_ROOT: laneRoot,
		ARCHBOARD_TEST_BROWSER_OWNER_ROOT: ownerRoot,
	};
}

function spawnOwner(file: BrowserTestPath, env: Record<string, string>): OwnedChild {
	const child = spawn("bun", ["test", "--no-orphans", "--isolate", "--max-concurrency=1", file], {
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
	return { child, pid, exit };
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
	const deadline = Date.now() + TEST_BROWSER_COMMAND_TIMEOUT_MS;
	let groupAlive: boolean;
	let processes: number[];
	let sockets: string[];
	let listeners: string[];
	do {
		groupAlive = processGroupExists(context.processGroup);
		processes = markedProcesses(
			context.root,
			context.env.AGENT_BROWSER_NAMESPACE!,
			context.env.AGENT_BROWSER_SESSION!,
		).filter((pid) => pid !== process.pid);
		sockets = namespaceArtifacts(context.env.AGENT_BROWSER_SOCKET_DIR!).filter((entry) =>
			entry.endsWith(".sock"),
		);
		listeners = [];
		for (const base of bases) {
			if (!(await canvasListenerIsClosed(base))) listeners.push(base);
		}
		if (!groupAlive && processes.length === 0 && sockets.length === 0 && listeners.length === 0)
			break;
		await Bun.sleep(TEST_BROWSER_POLL_MS);
	} while (Date.now() < deadline);
	const failures: string[] = [];
	if (groupAlive) failures.push(`process group ${context.processGroup} remains`);
	if (processes.length > 0) failures.push(`owned processes remain: ${processes.join(", ")}`);
	if (sockets.length > 0) failures.push(`agent-browser sockets remain: ${sockets.join(", ")}`);
	for (const base of listeners) failures.push(`canvas listener remains at ${base}`);
	rmSync(context.root, { recursive: true, force: true });
	if (existsSync(context.root)) failures.push("file-specific owner directory remains");
	if (failures.length > 0) {
		throw new Error(`Browser owner cleanup failed for ${context.file}: ${failures.join("; ")}`);
	}
}

async function waitForExit(child: OwnedChild, timeoutMs: number): Promise<boolean> {
	return Promise.race([child.exit.then(() => true), Bun.sleep(timeoutMs).then(() => false)]);
}

async function waitForProcessGroup(processGroup: number, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (processGroupExists(processGroup) && Date.now() < deadline) {
		await Bun.sleep(TEST_BROWSER_POLL_MS);
	}
	return !processGroupExists(processGroup);
}

async function stopOwnedChild(child: OwnedChild, signal: NodeJS.Signals): Promise<void> {
	if (child.child.exitCode === null && child.child.signalCode === null) child.child.kill(signal);
	if (!(await waitForExit(child, TEST_BROWSER_COMMAND_TIMEOUT_MS))) {
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

async function runSelection(selection: BrowserSelection): Promise<number> {
	let current: OwnedChild | null = null;
	let interrupted: "SIGINT" | "SIGTERM" | null = null;
	let interruption: Promise<void> | null = null;
	const interrupt = (signal: "SIGINT" | "SIGTERM"): void => {
		interrupted ??= signal;
		if (!interruption) {
			interruption = current ? stopOwnedChild(current, signal) : Promise.resolve();
		}
	};
	const onSigint = (): void => interrupt("SIGINT");
	const onSigterm = (): void => interrupt("SIGTERM");
	const pendingInterruption = (): Promise<void> | null => interruption;
	process.on("SIGINT", onSigint);
	process.on("SIGTERM", onSigterm);

	await using resources = new AsyncDisposableStack();
	let laneRoot = "";
	try {
		laneRoot = mkdtempSync(join(tmpdir(), "ab-lane-"));
		resources.defer(() => rmSync(laneRoot, { recursive: true, force: true }));
		await ensureFreshFrontend(repoRoot);
		for (const [index, file] of selection.files.entries()) {
			if (interrupted) throw new InterruptedError(interrupted);
			const name = childName(index);
			const ownerRoot = join(laneRoot, name);
			mkdirSync(ownerRoot);
			const env = ownerEnvironment(laneRoot, ownerRoot);
			current = spawnOwner(file, env);
			const processGroup = current.pid;
			let outcome: { code: number | null; signal: NodeJS.Signals | null };
			try {
				outcome = await current.exit;
				const pending = pendingInterruption();
				if (pending) await pending;
				else await reapExitedOwner(current);
			} finally {
				current = null;
				await auditOwner({ file, root: ownerRoot, processGroup, env });
			}
			if (interrupted) throw new InterruptedError(interrupted);
			if (outcome.signal || outcome.code !== 0) {
				const exit = outcome.signal
					? `signal ${outcome.signal}`
					: `exit ${outcome.code ?? "unknown"}`;
				throw new Error(`Browser owner ${file} ended with ${exit}.`);
			}
		}
		return 0;
	} finally {
		if (current) await stopOwnedChild(current, interrupted ?? "SIGTERM");
		const pending = pendingInterruption();
		if (pending) await pending;
		process.off("SIGINT", onSigint);
		process.off("SIGTERM", onSigterm);
	}
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
		verifyPrerequisites(selection);
		return await runSelection(selection);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		if (error instanceof CouldNotRunError) return 2;
		if (error instanceof InterruptedError) return error.signal === "SIGINT" ? 130 : 143;
		return 1;
	}
}

if (import.meta.main) process.exitCode = await main();

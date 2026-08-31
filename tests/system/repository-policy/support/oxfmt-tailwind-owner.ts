import {
	existsSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
	TEST_CANVAS_STARTUP_TIMEOUT_MS,
} from "../../../../src/shared/timing/timing.ts";
import {
	CANONICAL_FORMAT_SCRIPTS,
	artifactSnapshot,
	dependencySnapshot,
	fileSnapshot,
	restoreAndRemoveScenarioRoot,
	type DependencyRecord,
} from "./oxfmt-tailwind-fixture.ts";
export {
	CANONICAL_FORMAT_SCRIPTS,
	artifactSnapshot,
	copyReadOnlyDependencyView,
	dependencySnapshot,
	fileSnapshot,
	installLiveOxfmtEntrypoint,
	restoreAndRemoveScenarioRoot,
	type DependencyRecord,
} from "./oxfmt-tailwind-fixture.ts";

export interface CommandRecord {
	script: keyof typeof CANONICAL_FORMAT_SCRIPTS;
	status: number | null;
	signal: NodeJS.Signals | null;
	spawnError?: string;
	stdout: string;
	stderr: string;
}

export interface OwnerResult {
	commands: CommandRecord[];
	formatted?: string;
	canonical?: DependencyRecord[];
	dependencies?: DependencyRecord[];
	artifacts?: DependencyRecord[];
	error?: string;
}

export interface OwnerState {
	root: string;
	formatterGroups: number[];
}

function requiredEnvironment(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name} for the Oxfmt owner.`);
	return value;
}

export function readOwnerState(file: string): OwnerState {
	return JSON.parse(readFileSync(file, "utf8")) as OwnerState;
}

function removeExternalCleanupPaths(): void {
	const encoded = process.env.ARCHBOARD_OXFMT_OWNER_CLEANUP_PATHS;
	if (!encoded) return;
	const paths = JSON.parse(encoded) as unknown;
	if (!Array.isArray(paths) || !paths.every((path): path is string => typeof path === "string"))
		throw new Error("Invalid formatter owner cleanup paths.");
	for (const path of paths) rmSync(path, { force: true });
}

function packageScripts(fixtureRoot: string): Record<string, unknown> {
	return (
		(
			JSON.parse(readFileSync(join(fixtureRoot, "package.json"), "utf8")) as {
				scripts?: Record<string, unknown>;
			}
		).scripts ?? {}
	);
}

function validateFixture(fixtureRoot: string): void {
	const scripts = packageScripts(fixtureRoot);
	for (const [name, expected] of Object.entries(CANONICAL_FORMAT_SCRIPTS)) {
		if (scripts[name] !== expected) {
			throw new Error(
				`Refusing to execute fixture script ${name}: expected exact checked-in command ${JSON.stringify(expected)}, received ${JSON.stringify(scripts[name])}.`,
			);
		}
	}
	const packageFile = join(fixtureRoot, "node_modules/oxfmt/package.json");
	const executable = join(fixtureRoot, "node_modules/oxfmt/bin/oxfmt");
	if (!existsSync(packageFile) || !existsSync(executable)) {
		throw new Error(
			"Refusing to execute fixture: project-local Oxfmt package or executable is missing.",
		);
	}
	const packageRecord = JSON.parse(readFileSync(packageFile, "utf8")) as { version?: unknown };
	if (packageRecord.version !== "0.65.0") {
		throw new Error(
			`Refusing to execute fixture: expected Oxfmt 0.65.0, received ${String(packageRecord.version)}.`,
		);
	}
	const dependencyRoot = realpathSync(join(fixtureRoot, "node_modules"));
	const executableRealpath = realpathSync(executable);
	if (!executableRealpath.startsWith(`${dependencyRoot}/`)) {
		throw new Error(
			`Refusing to execute fixture: Oxfmt executable escaped dependency view: ${executableRealpath}`,
		);
	}
}

async function waitForGroupGone(group: number): Promise<boolean> {
	const deadline = Date.now() + TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (
			!processGroupMembers(group).some((pid) => {
				try {
					const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
					return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3) !== "Z";
				} catch {
					return false;
				}
			})
		)
			return true;
		await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
	}
	return !processGroupMembers(group).some((pid) => {
		try {
			const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
			return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3) !== "Z";
		} catch {
			return false;
		}
	});
}

export async function reapProcessGroup(group: number): Promise<void> {
	try {
		process.kill(-group, "SIGCONT");
		process.kill(-group, "SIGTERM");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
		throw error;
	}
	if (!(await waitForGroupGone(group))) {
		process.kill(-group, "SIGKILL");
		if (!(await waitForGroupGone(group))) {
			throw new Error(`Owned process group ${group} survived bounded SIGKILL cleanup.`);
		}
	}
}

async function stopProcessGroup(group: number): Promise<void> {
	try {
		process.kill(-group, "SIGCONT");
		process.kill(-group, "SIGTERM");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
	}
	if (!(await waitForGroupGone(group))) {
		process.kill(-group, "SIGKILL");
		if (!(await waitForGroupGone(group))) {
			throw new Error(`Formatter process group ${group} survived bounded SIGKILL cleanup.`);
		}
	}
}

function processGroupMembers(group: number): number[] {
	const members: number[] = [];
	for (const entry of readdirSync("/proc", { withFileTypes: true })) {
		if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
		try {
			const stat = readFileSync(`/proc/${entry.name}/stat`, "utf8");
			const close = stat.lastIndexOf(")");
			const fields = stat.slice(close + 2).split(" ");
			if (Number(fields[2]) === group) members.push(Number(entry.name));
		} catch {
			continue;
		}
	}
	return members;
}

function actualOxfmtProcess(group: number): number | undefined {
	for (const pid of processGroupMembers(group)) {
		try {
			const command = readFileSync(`/proc/${pid}/cmdline`).toString().replaceAll("\0", " ");
			if (command.includes("oxfmt")) return pid;
		} catch {
			continue;
		}
	}
	return undefined;
}

function processGroupOf(pid: number): number {
	const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
	const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
	return Number(fields[2]);
}

async function holdActualFormatter(
	child: Bun.Subprocess,
	script: keyof typeof CANONICAL_FORMAT_SCRIPTS,
): Promise<void> {
	const phase = process.env.ARCHBOARD_OXFMT_OWNER_HOLD_PHASE;
	const phaseName = script === "fmt:check" ? "check" : "fmt";
	if (phase !== phaseName) return;
	const marker = requiredEnvironment("ARCHBOARD_OXFMT_OWNER_HOLD_MARKER");
	const deadline = Date.now() + TEST_CANVAS_STARTUP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) throw new Error(`Actual Oxfmt exited before the ${script} hold.`);
		const formatter = actualOxfmtProcess(child.pid);
		if (formatter !== undefined) {
			activeGroups.add(processGroupOf(formatter));
			writeOwnerState();
			process.kill(-child.pid, "SIGSTOP");
			process.kill(-processGroupOf(formatter), "SIGSTOP");
			writeFileSync(marker, String(child.pid));
			return;
		}
		await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
	}
	throw new Error(`Timed out waiting for actual Oxfmt during ${script}.`);
}

function writeOwnerState(): void {
	const file = process.env.ARCHBOARD_OXFMT_OWNER_STATE;
	if (!file) return;
	writeFileSync(
		file,
		JSON.stringify({
			root: requiredEnvironment("ARCHBOARD_OXFMT_OWNER_ROOT"),
			formatterGroups: [...activeGroups],
		}),
	);
}

function refreshFormatterGroups(root: string): void {
	const groupFile = process.env.ARCHBOARD_OXFMT_OWNER_FORMATTER_GROUP_FILE;
	if (groupFile && existsSync(groupFile)) {
		try {
			const group = Number(
				(JSON.parse(readFileSync(groupFile, "utf8")) as { group?: unknown }).group,
			);
			if (Number.isSafeInteger(group) && group > 0) activeGroups.add(group);
		} catch {
			/* The entrypoint may be publishing its group file in this tick. */
		}
	}
	const formatterPids = new Set<number>();
	for (const entry of readdirSync("/proc", { withFileTypes: true })) {
		if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
		const pid = Number(entry.name);
		try {
			const command = readFileSync(`/proc/${entry.name}/cmdline`).toString();
			if (command.includes(`${root}/node_modules/`) && command.includes("oxfmt"))
				formatterPids.add(pid);
		} catch {
			continue;
		}
	}
	for (const entry of readdirSync("/proc", { withFileTypes: true })) {
		if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
		try {
			const stat = readFileSync(`/proc/${entry.name}/stat`, "utf8");
			const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
			if (formatterPids.has(Number(fields[1]))) formatterPids.add(Number(entry.name));
		} catch {
			continue;
		}
	}
	for (const pid of formatterPids) activeGroups.add(processGroupOf(pid));
	writeOwnerState();
}

async function runScript(
	fixtureRoot: string,
	script: keyof typeof CANONICAL_FORMAT_SCRIPTS,
): Promise<CommandRecord> {
	const child = Bun.spawn({
		cmd: [process.execPath, "run", script],
		cwd: fixtureRoot,
		detached: true,
		stdout: "pipe",
		stderr: "pipe",
	});
	activeGroups.add(child.pid);
	writeOwnerState();
	const activePidFile = process.env.ARCHBOARD_OXFMT_OWNER_ACTIVE_PID;
	if (activePidFile) writeFileSync(activePidFile, String(child.pid));
	const stdout = new Response(child.stdout).text();
	const stderr = new Response(child.stderr).text();
	let result: CommandRecord | undefined;
	let primaryError: unknown;
	let cleanupError: unknown;
	const refreshTimer = setInterval(
		() => refreshFormatterGroups(fixtureRoot),
		TEST_CANVAS_HEALTH_POLL_MS,
	);
	try {
		await holdActualFormatter(child, script);
		const timedOut = Symbol("formatter-timeout");
		let executionTimer: Timer | undefined;
		const status = await Promise.race([
			child.exited,
			new Promise<typeof timedOut>((resolve) => {
				executionTimer = setTimeout(() => resolve(timedOut), TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS);
			}),
		]).finally(() => clearTimeout(executionTimer));
		if (typeof status !== "number")
			throw new Error(
				`Formatter script ${script} exceeded ${TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS}ms.`,
			);
		let outputTimer: Timer | undefined;
		const output = await Promise.race([
			Promise.all([stdout, stderr]),
			new Promise<never>((_, reject) => {
				outputTimer = setTimeout(
					() => reject(new Error(`Formatter script ${script} output stayed open after exit.`)),
					TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
				);
			}),
		]).finally(() => clearTimeout(outputTimer));
		result = {
			script,
			status,
			signal: child.signalCode ?? null,
			stdout: output[0],
			stderr: output[1],
		};
	} catch (error) {
		primaryError = error;
	} finally {
		clearInterval(refreshTimer);
		try {
			refreshFormatterGroups(fixtureRoot);
		} catch (error) {
			cleanupError = error;
		}
		const groups = [...activeGroups];
		for (const group of groups) {
			try {
				await stopProcessGroup(group);
				activeGroups.delete(group);
			} catch (error) {
				cleanupError ??= error;
			}
		}
		writeOwnerState();
	}
	if (primaryError && cleanupError)
		throw new AggregateError(
			[primaryError, cleanupError],
			"Formatter execution and cleanup both failed",
		);
	if (primaryError) throw primaryError;
	if (cleanupError) throw cleanupError;
	return result!;
}

const activeGroups = new Set<number>();
let interrupted = false;

async function handleSignal(signal: "SIGINT" | "SIGTERM"): Promise<void> {
	if (interrupted) return;
	interrupted = true;
	const root = requiredEnvironment("ARCHBOARD_OXFMT_OWNER_ROOT");
	const failures: string[] = [];
	try {
		for (const group of activeGroups) {
			await stopProcessGroup(group);
			activeGroups.delete(group);
		}
		writeOwnerState();
	} catch (error) {
		failures.push(`formatter cleanup: ${error instanceof Error ? error.message : String(error)}`);
	}
	try {
		restoreAndRemoveScenarioRoot(root);
		if (existsSync(root)) failures.push(`scenario root remains after cleanup: ${root}`);
	} catch (error) {
		failures.push(`scenario cleanup: ${error instanceof Error ? error.message : String(error)}`);
	}
	try {
		removeExternalCleanupPaths();
	} catch (error) {
		failures.push(`external cleanup: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (failures.length > 0)
		process.stderr.write(`Interrupted by ${signal}; cleanup failures: ${failures.join("; ")}\n`);
	process.exit(signal === "SIGINT" ? 130 : 143);
}

async function runOwner(): Promise<void> {
	const root = requiredEnvironment("ARCHBOARD_OXFMT_OWNER_ROOT");
	const resultFile = requiredEnvironment("ARCHBOARD_OXFMT_OWNER_RESULT");
	writeOwnerState();
	process.once("SIGINT", () => void handleSignal("SIGINT"));
	process.once("SIGTERM", () => void handleSignal("SIGTERM"));
	let primaryError: unknown;
	const result: OwnerResult = { commands: [] };
	try {
		validateFixture(root);
		for (const script of ["fmt:check", "fmt", "fmt:check"] as const) {
			result.commands.push(await runScript(root, script));
		}
		result.formatted = readFileSync(join(root, "src/fixture.tsx"), "utf8");
		result.canonical = fileSnapshot(root, [
			"package.json",
			".oxfmtrc.jsonc",
			"src/ui/theme/app.css",
			"src/ui/shell/shell.css",
			"src/ui/ui-classnames/index.ts",
		]);
		result.dependencies = dependencySnapshot(root);
		result.artifacts = artifactSnapshot(root);
	} catch (error) {
		primaryError = error;
		result.error = error instanceof Error ? error.message : String(error);
	}
	let cleanupError: unknown;
	try {
		restoreAndRemoveScenarioRoot(root);
		if (existsSync(root)) throw new Error(`scenario root remains after cleanup: ${root}`);
	} catch (error) {
		cleanupError = error;
	}
	try {
		writeFileSync(resultFile, JSON.stringify(result));
	} catch (error) {
		cleanupError ??= error;
	}
	if (primaryError && cleanupError) {
		process.stderr.write(
			`${new AggregateError([primaryError, cleanupError], "Formatter owner and cleanup both failed").message}\n`,
		);
		process.exit(1);
	}
	if (primaryError || cleanupError) {
		const failure = primaryError ?? cleanupError;
		process.stderr.write(`${failure instanceof Error ? failure.message : String(failure)}\n`);
		process.exit(1);
	}
}

if (import.meta.main) void runOwner();

import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
	TEST_CANVAS_STARTUP_TIMEOUT_MS,
} from "../../../../src/shared/timing/timing.ts";
import {
	actualOxfmtProcess,
	liveProcessReader,
	processGroupMembers,
	processGroupOf,
	processIsLive,
	refreshFormatterGroups as refreshProcessGroups,
} from "./oxfmt-tailwind-process.ts";
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
export { inspectFormatterGroupsForTest } from "./oxfmt-tailwind-process.ts";
export type { ProcessReader } from "./oxfmt-tailwind-process.ts";

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
	cleanupError?: string;
}

export interface OwnerState {
	root: string;
	formatterGroups: number[];
	refreshError?: string;
}

function requiredEnvironment(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name} for the Oxfmt owner.`);
	return value;
}

function errorMessage(error: unknown): string {
	if (error instanceof AggregateError)
		return `${error.message}: ${error.errors.map((nested) => errorMessage(nested)).join(" | ")}`;
	const message = error instanceof Error ? error.message : String(error);
	const code = (error as NodeJS.ErrnoException).code;
	return code && !message.startsWith(`${code}:`) ? `${code}: ${message}` : message;
}

export function readOwnerState(file: string): OwnerState {
	return JSON.parse(readFileSync(file, "utf8")) as OwnerState;
}

export function ownerExitDiagnostic(file: string, exitCode: number): string {
	const container = dirname(file);
	const resultPath = join(container, "owner-result.json");
	const result = existsSync(resultPath)
		? (JSON.parse(readFileSync(resultPath, "utf8")) as OwnerResult)
		: undefined;
	const statePath = join(container, "owner-state.json");
	const state = existsSync(statePath) ? readOwnerState(statePath) : undefined;
	return `Owner exited before ${file}: ${exitCode}; primary=${result?.error ?? "unpublished"}; cleanup=${result?.cleanupError ?? (state ? `refresh=${state.refreshError ?? "none"}; root=${existsSync(state.root) ? "present" : "removed"}; formatterGroups=${state.formatterGroups.join(",") || "none"}` : "unpublished")}`;
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
		if (!processGroupMembers(group).some(processIsLive)) return true;
		await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
	}
	return !processGroupMembers(group).some(processIsLive);
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
			const formatterGroup = processGroupOf(formatter);
			if (formatterGroup !== undefined) {
				activeGroups.add(formatterGroup);
				writeOwnerState();
				process.kill(-child.pid, "SIGSTOP");
				process.kill(-formatterGroup, "SIGSTOP");
				writeFileSync(marker, String(child.pid));
				return;
			}
		}
		await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
	}
	throw new Error(`Timed out waiting for actual Oxfmt during ${script}.`);
}

function writeOwnerState(refreshError?: string): void {
	const file = process.env.ARCHBOARD_OXFMT_OWNER_STATE;
	if (!file) return;
	let previousRefreshError: string | undefined;
	if (existsSync(file)) {
		try {
			previousRefreshError = readOwnerState(file).refreshError;
		} catch {
			/* Replace a partial state publication with the next complete state. */
		}
	}
	const state: OwnerState = {
		root: requiredEnvironment("ARCHBOARD_OXFMT_OWNER_ROOT"),
		formatterGroups: [...activeGroups],
	};
	const publishedRefreshError = refreshError ?? previousRefreshError;
	if (publishedRefreshError) state.refreshError = publishedRefreshError;
	writeFileSync(file, JSON.stringify(state));
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
	refreshProcessGroups(root, activeGroups, liveProcessReader);
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
	let refreshError: unknown;
	const recordRefreshError = (error: unknown): void => {
		refreshError ??= error;
		try {
			writeOwnerState(errorMessage(refreshError));
		} catch (stateError) {
			refreshError = new AggregateError(
				[refreshError, stateError],
				"Formatter refresh failure could not be published",
			);
		}
	};
	const refreshTimer = setInterval(() => {
		try {
			refreshFormatterGroups(fixtureRoot);
		} catch (error) {
			recordRefreshError(error);
		}
	}, TEST_CANVAS_HEALTH_POLL_MS);
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
			recordRefreshError(error);
		}
		if (refreshError) {
			const refreshFailure = new Error(
				`Formatter process refresh failed: ${errorMessage(refreshError)}`,
				{ cause: refreshError },
			);
			primaryError = primaryError
				? new AggregateError(
						[primaryError, refreshFailure],
						"Formatter execution and process refresh both failed",
					)
				: refreshFailure;
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
		writeOwnerState(refreshError ? errorMessage(refreshError) : undefined);
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
		result.error = errorMessage(error);
	}
	let cleanupError: unknown;
	try {
		restoreAndRemoveScenarioRoot(root);
		if (existsSync(root)) throw new Error(`scenario root remains after cleanup: ${root}`);
	} catch (error) {
		cleanupError = error;
	}
	if (cleanupError) result.cleanupError = errorMessage(cleanupError);
	try {
		writeFileSync(resultFile, JSON.stringify(result));
	} catch (error) {
		cleanupError ??= error;
	}
	if (primaryError && cleanupError) {
		process.stderr.write(
			`${errorMessage(new AggregateError([primaryError, cleanupError], "Formatter owner and cleanup both failed"))}\n`,
		);
		process.exit(1);
	}
	if (primaryError || cleanupError) {
		const failure = primaryError ?? cleanupError;
		process.stderr.write(`${errorMessage(failure)}\n`);
		process.exit(1);
	}
}

if (import.meta.main) void runOwner();

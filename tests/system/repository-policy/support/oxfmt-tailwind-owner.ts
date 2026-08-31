import { createHash } from "node:crypto";
import {
	chmodSync,
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

import {
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
	TEST_CANVAS_STARTUP_TIMEOUT_MS,
} from "../../../../src/shared/timing/timing.ts";

export const CANONICAL_FORMAT_SCRIPTS = {
	fmt: "oxfmt . '!dist/**' '!node_modules/**' '!backlog/**'",
	"fmt:check": "oxfmt --check . '!dist/**' '!node_modules/**' '!backlog/**'",
} as const;

export const DEPENDENCY_PACKAGES = [
	"oxfmt",
	"tailwindcss",
	"tinypool",
	"@oxfmt/binding-linux-x64-gnu",
] as const;

export interface DependencyRecord {
	path: string;
	realpath: string;
	mode: number;
	size: number;
	sha256: string;
}

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

function requiredEnvironment(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name} for the Oxfmt owner.`);
	return value;
}

function sha256(file: string): string {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function walkFiles(root: string): string[] {
	if (!existsSync(root)) return [];
	const entries = [
		...new Bun.Glob("**/*").scanSync({ cwd: root, absolute: true, onlyFiles: true }),
	];
	return entries.toSorted();
}

function walkDirectories(root: string): string[] {
	if (!existsSync(root)) return [];
	const directories: string[] = [];
	const pending = [root];
	while (pending.length > 0) {
		const directory = pending.pop();
		if (!directory) continue;
		directories.push(directory);
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(join(directory, entry.name));
		}
	}
	return directories;
}

export function dependencySnapshot(fixtureRoot: string): DependencyRecord[] {
	const root = join(fixtureRoot, "node_modules");
	return walkFiles(root).map((file) => {
		const stat = statSync(file);
		return {
			path: relative(root, file),
			realpath: realpathSync(file),
			mode: stat.mode & 0o777,
			size: stat.size,
			sha256: sha256(file),
		};
	});
}

export function artifactSnapshot(fixtureRoot: string): DependencyRecord[] {
	const root = join(fixtureRoot, "dist");
	return walkFiles(root).map((file) => {
		const stat = statSync(file);
		return {
			path: relative(fixtureRoot, file),
			realpath: realpathSync(file),
			mode: stat.mode & 0o777,
			size: stat.size,
			sha256: sha256(file),
		};
	});
}

export function fileSnapshot(root: string, relativePaths: readonly string[]): DependencyRecord[] {
	return relativePaths.map((path) => {
		const file = join(root, path);
		const stat = statSync(file);
		return {
			path,
			realpath: realpathSync(file),
			mode: stat.mode & 0o777,
			size: stat.size,
			sha256: sha256(file),
		};
	});
}

function makeReadOnly(root: string): void {
	for (const file of walkFiles(root)) {
		const mode = statSync(file).mode & 0o111 ? 0o555 : 0o444;
		chmodSync(file, mode);
	}
	const directories = walkDirectories(root).toSorted().toReversed();
	for (const directory of directories) chmodSync(directory, 0o555);
}

function removeScenarioRoot(root: string): void {
	for (const file of walkFiles(root)) chmodSync(file, statSync(file).mode & 0o111 ? 0o755 : 0o644);
	for (const directory of walkDirectories(root).toSorted().toReversed())
		chmodSync(directory, 0o755);
	rmSync(root, { recursive: true, force: true });
}

function removeExternalCleanupPaths(): void {
	const encoded = process.env.ARCHBOARD_OXFMT_OWNER_CLEANUP_PATHS;
	if (!encoded) return;
	const paths = JSON.parse(encoded) as unknown;
	if (!Array.isArray(paths) || !paths.every((path): path is string => typeof path === "string"))
		throw new Error("Invalid formatter owner cleanup paths.");
	for (const path of paths) rmSync(path, { force: true });
}

function rejectSymlinks(root: string): void {
	const pending = [root];
	while (pending.length > 0) {
		const directory = pending.pop();
		if (!directory) continue;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (lstatSync(path).isSymbolicLink())
				throw new Error(`Dependency view contains symlink: ${path}`);
			if (entry.isDirectory()) pending.push(path);
		}
	}
}

export function copyReadOnlyDependencyView(repoRoot: string, fixtureRoot: string): void {
	const destination = join(fixtureRoot, "node_modules");
	mkdirSync(join(destination, ".bin"), { recursive: true });
	for (const packageName of DEPENDENCY_PACKAGES) {
		const source = join(repoRoot, "node_modules", packageName);
		const target = join(destination, packageName);
		if (!existsSync(source))
			throw new Error(`Missing installed dependency ${source}; run bun install.`);
		mkdirSync(dirname(target), { recursive: true });
		cpSync(source, target, { recursive: true, dereference: true });
	}
	const oxfmtBin = join(repoRoot, "node_modules/oxfmt/bin/oxfmt");
	if (!existsSync(oxfmtBin)) throw new Error(`Missing project-local Oxfmt executable ${oxfmtBin}.`);
	const launcher = join(destination, ".bin/oxfmt");
	writeFileSync(launcher, '#!/usr/bin/env node\nimport "../oxfmt/bin/oxfmt";\n');
	chmodSync(launcher, 0o755);
	rejectSymlinks(destination);
	makeReadOnly(destination);
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

async function stopProcessGroup(child: Bun.Subprocess): Promise<void> {
	try {
		process.kill(-child.pid, "SIGCONT");
		process.kill(-child.pid, "SIGTERM");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
	}
	if (!(await waitForGroupGone(child.pid))) {
		process.kill(-child.pid, "SIGKILL");
		if (!(await waitForGroupGone(child.pid))) {
			throw new Error(`Formatter process group ${child.pid} survived bounded SIGKILL cleanup.`);
		}
	}
	await child.exited;
}

function processGroupMembers(group: number): number[] {
	const members: number[] = [];
	for (const entry of readdirSync("/proc", { withFileTypes: true })) {
		if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
		const stat = readFileSync(`/proc/${entry.name}/stat`, "utf8");
		const close = stat.lastIndexOf(")");
		const fields = stat.slice(close + 2).split(" ");
		if (Number(fields[2]) === group) members.push(Number(entry.name));
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
		if (actualOxfmtProcess(child.pid) !== undefined) {
			process.kill(-child.pid, "SIGSTOP");
			writeFileSync(marker, String(child.pid));
			return;
		}
		await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
	}
	throw new Error(`Timed out waiting for actual Oxfmt during ${script}.`);
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
	activeChild = child;
	const activePidFile = process.env.ARCHBOARD_OXFMT_OWNER_ACTIVE_PID;
	if (activePidFile) writeFileSync(activePidFile, String(child.pid));
	await holdActualFormatter(child, script);
	const stdout = new Response(child.stdout).text();
	const stderr = new Response(child.stderr).text();
	let status: number | null = null;
	let signal: NodeJS.Signals | null = null;
	let spawnError: string | undefined;
	try {
		status = await child.exited;
	} catch (error) {
		spawnError = error instanceof Error ? error.message : String(error);
	}
	if (child.signalCode) signal = child.signalCode;
	activeChild = undefined;
	return { script, status, signal, spawnError, stdout: await stdout, stderr: await stderr };
}

let activeChild: Bun.Subprocess | undefined;
let interrupted = false;

async function handleSignal(signal: "SIGINT" | "SIGTERM"): Promise<void> {
	if (interrupted) return;
	interrupted = true;
	const root = requiredEnvironment("ARCHBOARD_OXFMT_OWNER_ROOT");
	const failures: string[] = [];
	try {
		if (activeChild) await stopProcessGroup(activeChild);
	} catch (error) {
		failures.push(`formatter cleanup: ${error instanceof Error ? error.message : String(error)}`);
	}
	try {
		removeScenarioRoot(root);
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
		removeScenarioRoot(root);
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

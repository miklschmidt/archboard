import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
	CANONICAL_FORMAT_SCRIPTS,
	artifactSnapshot,
	copyReadOnlyDependencyView,
	dependencySnapshot,
	fileSnapshot,
	installLiveOxfmtEntrypoint,
	readOwnerState,
	reapProcessGroup,
	restoreAndRemoveScenarioRoot,
	type CommandRecord,
	type DependencyRecord,
	type OwnerResult,
} from "./support/oxfmt-tailwind-owner.ts";
import {
	TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_SHUTDOWN_TIMEOUT_MS,
	TEST_CANVAS_STARTUP_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const ownerScript = join(import.meta.dir, "support/oxfmt-tailwind-owner.ts");
const canonicalFiles = [
	"package.json",
	".oxfmtrc.jsonc",
	"src/ui/theme/app.css",
	"src/ui/shell/shell.css",
	"src/ui/ui-classnames/index.ts",
] as const;
const unsortedFixture = `import { cn } from "./ui/ui-classnames";

type Data = { classes: string };

export function Fixture({ enabled, tone, data }: { enabled: boolean; tone: string; data: Data }) {
	return <div className="text-sm md:p-4 hover:bg-primary flex p-2 items-center bg-secondary">{cn("text-muted-foreground p-4 flex items-center bg-secondary hover:bg-primary", \`data-[tone=\${tone}]:text-foreground\`, data.classes, enabled && "hidden")}</div>;
}
`;
const expectedFormattedFixture = `import { cn } from "./ui/ui-classnames";

type Data = { classes: string };

export function Fixture({ enabled, tone, data }: { enabled: boolean; tone: string; data: Data }) {
	return (
		<div className="text-sm md:p-4 p-2 flex items-center bg-secondary hover:bg-primary">
			{cn(
				"p-4 flex items-center bg-secondary text-muted-foreground hover:bg-primary",
				\`data-[tone=\${tone}]:text-foreground\`,
				data.classes,
				enabled && "hidden",
			)}
		</div>
	);
}
`;
const fmtCheckInvocation = "$ oxfmt --check . '!dist/**' '!node_modules/**' '!backlog/**'";
const fmtInvocation = "$ oxfmt . '!dist/**' '!node_modules/**' '!backlog/**'";

function requiredFile(relativePath: string): string {
	const file = join(repoRoot, relativePath);
	if (!existsSync(file)) throw new Error(`Missing canonical formatter file ${relativePath}.`);
	return file;
}

function assertCanonicalInputs(): void {
	const packageJson = JSON.parse(readFileSync(requiredFile("package.json"), "utf8")) as {
		scripts?: Record<string, unknown>;
	};
	for (const [name, command] of Object.entries(CANONICAL_FORMAT_SCRIPTS))
		expect(packageJson.scripts?.[name], `checked-in package.json ${name} script`).toBe(command);
	const config = readFileSync(requiredFile(".oxfmtrc.jsonc"), "utf8");
	expect(config).toContain('"sortTailwindcss": {');
	expect(config).toContain('"src/ui/theme/app.css"');
	expect(config).toContain('"functions": ["cn"]');
	expect(config).toContain('"preserveDuplicates": true');
	const oxfmtPackage = JSON.parse(
		readFileSync(requiredFile("node_modules/oxfmt/package.json"), "utf8"),
	) as { version?: unknown };
	expect(oxfmtPackage.version, "project-local Oxfmt identity").toBe("0.65.0");
	const executable = requiredFile("node_modules/oxfmt/bin/oxfmt");
	const dependencyRoot = resolve(repoRoot, "node_modules");
	expect(
		realpathSync(executable).startsWith(`${realpathSync(dependencyRoot)}/`),
		"Oxfmt executable containment",
	).toBeTrue();
}

function canonicalState(): DependencyRecord[] {
	return fileSnapshot(repoRoot, canonicalFiles);
}

function authoredGitState(): string {
	const commands = [
		["status", ["status", "--porcelain=v1", "--untracked-files=all"]],
		["staged", ["diff", "--cached", "--binary", "--no-ext-diff"]],
		["unstaged", ["diff", "--binary", "--no-ext-diff"]],
	] as const;
	const state: Record<string, string> = {};
	for (const [label, args] of commands) {
		const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
		if (result.error || result.signal || result.status !== 0)
			throw new Error(
				`Could not capture authored ${label} state: ${result.error?.message ?? result.status}`,
			);
		state[label] = result.stdout;
	}
	return JSON.stringify(state);
}

function createFixture(container: string): string {
	const root = join(container, "fixture");
	mkdirSync(root, { recursive: true });
	for (const relativePath of canonicalFiles) {
		const target = join(root, relativePath);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, readFileSync(requiredFile(relativePath)));
	}
	copyReadOnlyDependencyView(repoRoot, root);
	const fixtureFile = join(root, "src/fixture.tsx");
	mkdirSync(dirname(fixtureFile), { recursive: true });
	writeFileSync(fixtureFile, unsortedFixture);
	return root;
}

function createSignalFixture(container: string): string {
	const root = createFixture(container);
	for (let index = 0; index < 256; index++) {
		writeFileSync(join(root, `src/fixture-${index}.tsx`), unsortedFixture);
	}
	return root;
}

function mutateScript(
	root: string,
	script: keyof typeof CANONICAL_FORMAT_SCRIPTS,
	marker: string,
): void {
	const packageFile = join(root, "package.json");
	const packageJson = JSON.parse(readFileSync(packageFile, "utf8")) as {
		scripts: Record<string, string>;
	};
	packageJson.scripts[script] =
		`${CANONICAL_FORMAT_SCRIPTS[script]} ; ${process.execPath} -e ${JSON.stringify(`require("node:fs").writeFileSync(${JSON.stringify(marker)}, "escaped")`)}`;
	writeFileSync(packageFile, `${JSON.stringify(packageJson, null, "\t")}\n`);
}

function assertDependencyContainment(root: string, records: readonly DependencyRecord[]): void {
	const dependencyRoot = resolve(root, "node_modules");
	for (const record of records) {
		expect(record.realpath.startsWith(`${dependencyRoot}/`), record.path).toBeTrue();
	}
}

function assertReadOnlyDependencyView(root: string): void {
	const target = join(root, "node_modules/oxfmt/package.json");
	const before = readFileSync(target);
	let failure: unknown;
	try {
		writeFileSync(target, Buffer.concat([before, Buffer.from("blocked")]));
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(Error);
	expect(readFileSync(target)).toEqual(before);
}

function resultFile(container: string): string {
	return join(container, "owner-result.json");
}

function stateFile(container: string): string {
	return join(container, "owner-state.json");
}

function launchOwner(
	root: string,
	container: string,
	options: {
		activePidFile?: string;
		cleanupPaths?: readonly string[];
		holdPhase?: "check" | "fmt";
		holdMarker?: string;
		formatterGroupFile?: string;
	} = {},
): Bun.Subprocess {
	writeFileSync(stateFile(container), JSON.stringify({ root, formatterGroups: [] }));
	return Bun.spawn({
		cmd: [process.execPath, ownerScript],
		detached: true,
		env: {
			...process.env,
			ARCHBOARD_OXFMT_OWNER_ROOT: root,
			ARCHBOARD_OXFMT_OWNER_RESULT: resultFile(container),
			ARCHBOARD_OXFMT_OWNER_STATE: stateFile(container),
			...(options.cleanupPaths || options.activePidFile
				? {
						ARCHBOARD_OXFMT_OWNER_CLEANUP_PATHS: JSON.stringify(
							options.cleanupPaths ?? [options.activePidFile],
						),
					}
				: {}),
			...(options.activePidFile ? { ARCHBOARD_OXFMT_OWNER_ACTIVE_PID: options.activePidFile } : {}),
			...(options.holdPhase ? { ARCHBOARD_OXFMT_OWNER_HOLD_PHASE: options.holdPhase } : {}),
			...(options.holdMarker ? { ARCHBOARD_OXFMT_OWNER_HOLD_MARKER: options.holdMarker } : {}),
			...(options.formatterGroupFile
				? { ARCHBOARD_OXFMT_OWNER_FORMATTER_GROUP_FILE: options.formatterGroupFile }
				: {}),
		},
		stdout: "pipe",
		stderr: "pipe",
	});
}

async function waitForFile(file: string, child: Bun.Subprocess): Promise<void> {
	const deadline = Date.now() + TEST_CANVAS_STARTUP_TIMEOUT_MS;
	while (!existsSync(file)) {
		if (child.exitCode !== null) throw new Error(`Owner exited before ${file}: ${child.exitCode}`);
		if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${file}`);
		await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
	}
}

async function waitForExit(
	child: Bun.Subprocess,
	timeoutMs = TEST_CANVAS_CHILD_EXIT_TIMEOUT_MS,
): Promise<number> {
	const deadline = Date.now() + timeoutMs;
	while (child.exitCode === null && Date.now() < deadline)
		await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
	if (child.exitCode === null) throw new Error(`Owner ${child.pid} exceeded bounded exit wait.`);
	return await child.exited;
}

async function ownerExitedWithin(child: Bun.Subprocess): Promise<boolean> {
	return Promise.race([
		child.exited.then(() => true),
		Bun.sleep(TEST_CANVAS_SHUTDOWN_TIMEOUT_MS).then(() => false),
	]);
}

async function stopOwner(
	child: Bun.Subprocess,
	root: string,
	container: string,
): Promise<{ ownerTimedOut: boolean; formatterGroups: number[] }> {
	let ownerTimedOut = false;
	if (child.exitCode === null) {
		child.kill("SIGCONT");
		child.kill("SIGTERM");
		ownerTimedOut = !(await ownerExitedWithin(child));
	}
	const state = existsSync(stateFile(container))
		? readOwnerState(stateFile(container))
		: { root, formatterGroups: [] };
	const failures: unknown[] = [];
	for (const group of state.formatterGroups) {
		try {
			await reapProcessGroup(group);
		} catch (error) {
			failures.push(error);
		}
	}
	try {
		if (existsSync(root)) restoreAndRemoveScenarioRoot(root);
	} catch (error) {
		failures.push(error);
	}
	if (child.exitCode === null) {
		child.kill("SIGKILL");
		await child.exited;
	}
	if (failures.length > 0) throw new AggregateError(failures, "Owner fallback cleanup failed");
	return { ownerTimedOut, formatterGroups: state.formatterGroups };
}

function readOwnerResult(container: string): OwnerResult {
	const file = resultFile(container);
	if (!existsSync(file)) throw new Error(`Owner did not publish ${file}.`);
	return JSON.parse(readFileSync(file, "utf8")) as OwnerResult;
}

function commandFailure(command: CommandRecord): string {
	return [
		`bun run ${command.script} failed unexpectedly`,
		`status=${command.status ?? "null"}`,
		`signal=${command.signal ?? "null"}`,
		`spawnError=${command.spawnError ?? "none"}`,
		`stdout:\n${command.stdout}`,
		`stderr:\n${command.stderr}`,
	].join("\n");
}

function expectCommand(command: CommandRecord, status: number): void {
	expect(command.spawnError, commandFailure(command)).toBeUndefined();
	expect(command.signal, commandFailure(command)).toBeNull();
	expect(command.status, commandFailure(command)).toBe(status);
}

async function withContainer<T>(operation: (container: string) => Promise<T>): Promise<T> {
	const container = mkdtempSync(join(tmpdir(), "archboard-oxfmt-tailwind-owner-"));
	let primary: unknown;
	let value: T | undefined;
	try {
		value = await operation(container);
	} catch (error) {
		primary = error;
	}
	let cleanup: unknown;
	try {
		rmSync(container, { recursive: true, force: true });
		if (existsSync(container)) throw new Error(`Container remains after cleanup: ${container}`);
	} catch (error) {
		cleanup = error;
	}
	if (primary && cleanup)
		throw new AggregateError([primary, cleanup], "formatter fixture and cleanup failed");
	if (primary) throw primary;
	if (cleanup) throw cleanup;
	return value as T;
}

test("checks native Tailwind formatting through a bounded owner", async () => {
	const beforeCheckout = authoredGitState();
	assertCanonicalInputs();
	const beforeCanonical = canonicalState();
	await withContainer(async (container) => {
		const root = createFixture(container);
		const beforeFixtureCanonical = fileSnapshot(root, canonicalFiles);
		const beforeDependencies = dependencySnapshot(root);
		const beforeArtifacts = artifactSnapshot(root);
		assertDependencyContainment(root, beforeDependencies);
		assertReadOnlyDependencyView(root);
		const owner = launchOwner(root, container);
		try {
			expect(await waitForExit(owner)).toBe(0);
		} finally {
			if (owner.exitCode === null) await stopOwner(owner, root, container);
		}
		const result = readOwnerResult(container);
		expect(result.error).toBeUndefined();
		expect(result.commands).toHaveLength(3);
		const [before, format, after] = result.commands;
		if (!before || !format || !after)
			throw new Error("Owner returned an incomplete formatter result.");
		expectCommand(before, 1);
		expect(before.stderr).toContain(fmtCheckInvocation);
		const beforeOutput = `${before.stdout}\n${before.stderr}`;
		expect(beforeOutput).toContain("src/fixture.tsx");
		expect(beforeOutput).toContain("Format issues found");
		expectCommand(format, 0);
		expect(format.stderr).toContain(fmtInvocation);
		expectCommand(after, 0);
		expect(after.stdout).toContain("All matched files use the correct format.");
		expect(result.formatted).toBe(expectedFormattedFixture);
		expect(result.formatted).toContain("`data-[tone=${tone}]:text-foreground`");
		expect(result.formatted).toContain("data.classes");
		expect(result.formatted).toContain('enabled && "hidden"');
		expect(result.canonical).toEqual(beforeFixtureCanonical);
		expect(result.dependencies).toEqual(beforeDependencies);
		expect(result.artifacts).toEqual(beforeArtifacts);
		assertDependencyContainment(root, result.dependencies ?? []);
	});
	expect(authoredGitState()).toBe(beforeCheckout);
	expect(canonicalState()).toEqual(beforeCanonical);
});

for (const script of ["fmt", "fmt:check"] as const) {
	test(`rejects a hostile ${script} suffix before it can escape the fixture`, async () => {
		const beforeCheckout = authoredGitState();
		assertCanonicalInputs();
		await withContainer(async (container) => {
			const root = createFixture(container);
			const marker = join(container, "escaped-marker");
			mutateScript(root, script, marker);
			const owner = launchOwner(root, container);
			try {
				expect(await waitForExit(owner)).toBe(1);
			} finally {
				if (owner.exitCode === null) await stopOwner(owner, root, container);
			}
			const result = readOwnerResult(container);
			expect(result.error).toContain(`Refusing to execute fixture script ${script}`);
			expect(result.commands).toEqual([]);
			expect(existsSync(marker)).toBeFalse();
		});
		expect(authoredGitState()).toBe(beforeCheckout);
	});
}

test("parent fallback preserves timeout and cleanup evidence for a live copied entrypoint", async () => {
	const beforeCheckout = authoredGitState();
	let containerPath = "";
	await withContainer(async (container) => {
		containerPath = container;
		const root = createFixture(container);
		const groupFile = join(container, "hostile-formatter-group");
		installLiveOxfmtEntrypoint(root, groupFile);
		const owner = launchOwner(root, container, { formatterGroupFile: groupFile });
		let primary: unknown;
		try {
			await waitForFile(groupFile, owner);
			await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS * 2);
			const observed = readOwnerState(stateFile(container));
			expect(observed.root).toBe(root);
			expect(observed.formatterGroups.length).toBeGreaterThan(1);
			const hostileGroup = Number(JSON.parse(readFileSync(groupFile, "utf8")).group);
			expect(observed.formatterGroups).toContain(hostileGroup);
			try {
				await waitForExit(owner, TEST_CANVAS_SHUTDOWN_TIMEOUT_MS);
			} catch (error) {
				primary = error;
			}
			expect(primary).toBeInstanceOf(Error);
			expect((primary as Error).message).toContain("exceeded bounded exit wait");
			const cleanup = await stopOwner(owner, root, container);
			expect(cleanup.ownerTimedOut).toBeTrue();
			expect(cleanup.formatterGroups).toContain(hostileGroup);
			await expectProcessGroupGone(hostileGroup);
			expect(existsSync(root)).toBeFalse();
		} finally {
			if (owner.exitCode === null) await stopOwner(owner, root, container);
		}
	});
	expect(existsSync(containerPath)).toBeFalse();
	expect(authoredGitState()).toBe(beforeCheckout);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	for (const phase of ["check", "fmt"] as const) {
		test(`reaps the real blocked ${phase} formatter on ${signal}`, async () => {
			const beforeCheckout = authoredGitState();
			assertCanonicalInputs();
			await withContainer(async (container) => {
				const root = createSignalFixture(container);
				const blockedMarker = join(container, "blocked-formatter");
				const activePidFile = join(container, "active-owner-child");
				const beforeDependencies = dependencySnapshot(root);
				const owner = launchOwner(root, container, {
					activePidFile,
					cleanupPaths: [blockedMarker, activePidFile],
					holdPhase: phase,
					holdMarker: blockedMarker,
				});
				let ownerExit: number | undefined;
				try {
					await waitForFile(blockedMarker, owner);
					expect(existsSync(activePidFile)).toBeTrue();
					const activePid = Number(readFileSync(activePidFile, "utf8"));
					expect(Number.isSafeInteger(activePid)).toBeTrue();
					owner.kill(signal);
					ownerExit = await waitForExit(owner);
					expect(ownerExit).toBe(signal === "SIGINT" ? 130 : 143);
					expect(existsSync(root)).toBeFalse();
					expect(existsSync(blockedMarker)).toBeFalse();
					expect(existsSync(activePidFile)).toBeFalse();
					await expectProcessGroupGone(activePid);
				} finally {
					if (ownerExit === undefined) await stopOwner(owner, root, container);
				}
				expect(beforeDependencies.length).toBeGreaterThan(0);
			});
			expect(authoredGitState()).toBe(beforeCheckout);
		});
	}
}

async function expectProcessGroupGone(group: number): Promise<void> {
	const deadline = Date.now() + TEST_CANVAS_SHUTDOWN_TIMEOUT_MS;
	while (Date.now() < deadline) {
		try {
			process.kill(-group, 0);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
		}
		await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
	}
	throw new Error(`Formatter process group ${group} survived bounded cleanup.`);
}

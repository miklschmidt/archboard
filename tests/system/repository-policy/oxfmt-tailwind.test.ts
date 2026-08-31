import { expect, test } from "bun:test";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
	TEST_CANVAS_HEALTH_POLL_MS,
	TEST_CANVAS_STARTUP_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const canonicalFiles = [
	"package.json",
	".oxfmtrc.jsonc",
	"src/ui/theme/app.css",
	"src/ui/shell/shell.css",
	"src/ui/ui-classnames/index.ts",
] as const;
const fmtCheckInvocation = "$ oxfmt --check . '!dist/**' '!node_modules/**' '!backlog/**'";
const fmtInvocation = "$ oxfmt . '!dist/**' '!node_modules/**' '!backlog/**'";

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

type CommandResult = SpawnSyncReturns<string>;

function requiredCanonicalFile(relativePath: string): string {
	const source = join(repoRoot, relativePath);
	if (!existsSync(source)) {
		throw new Error(
			`Tailwind formatter fixture cannot start: missing canonical file ${relativePath}. Restore the checked-in stylesheet, formatter configuration, or helper before running fmt checks.`,
		);
	}
	return source;
}

function copyCanonicalFile(fixtureRoot: string, relativePath: string): void {
	const source = requiredCanonicalFile(relativePath);
	const target = join(fixtureRoot, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, readFileSync(source));
}

function assertCanonicalFormatterConfiguration(): void {
	const config = readFileSync(requiredCanonicalFile(".oxfmtrc.jsonc"), "utf8");
	if (!config.includes('"sortTailwindcss"')) {
		throw new Error(
			"Tailwind formatter fixture requires .oxfmtrc.jsonc sortTailwindcss configuration; restore the native formatter option before running this check.",
		);
	}
	if (!/"stylesheet"\s*:\s*"src\/ui\/theme\/app\.css"/.test(config)) {
		throw new Error(
			"Tailwind formatter fixture requires sortTailwindcss.stylesheet to be src/ui/theme/app.css; restore the canonical v4 stylesheet path before running this check.",
		);
	}
	if (!/"functions"\s*:\s*\[[^\]]*"cn"/.test(config)) {
		throw new Error(
			"Tailwind formatter fixture requires cn in sortTailwindcss.functions; restore the exact composition helper configuration before running this check.",
		);
	}
}

function assertFormatterScripts(): void {
	const packageJson = JSON.parse(readFileSync(requiredCanonicalFile("package.json"), "utf8")) as {
		scripts?: Record<string, unknown>;
	};
	for (const script of ["fmt", "fmt:check"]) {
		const command = packageJson.scripts?.[script];
		if (typeof command !== "string" || !command.includes("oxfmt")) {
			throw new Error(
				`Tailwind formatter fixture requires the checked-in bun run ${script} script to invoke oxfmt; restore the repository formatter command before running this check.`,
			);
		}
	}
}

function runFormatterScript(fixtureRoot: string, script: "fmt" | "fmt:check"): CommandResult {
	return spawnSync("bun", ["run", script], {
		cwd: fixtureRoot,
		encoding: "utf8",
	});
}

function commandFailure(script: string, result: CommandResult): string {
	return [
		`bun run ${script} did not complete successfully`,
		`status: ${result.status ?? "null"}`,
		`signal: ${result.signal ?? "null"}`,
		`spawn error: ${result.error?.message ?? "none"}`,
		`stdout:\n${result.stdout}`,
		`stderr:\n${result.stderr}`,
	].join("\n");
}

function expectCommandStatus(
	script: "fmt" | "fmt:check",
	result: CommandResult,
	status: number,
): void {
	expect(result.error, commandFailure(script, result)).toBeUndefined();
	expect(result.signal, commandFailure(script, result)).toBeNull();
	expect(result.status, commandFailure(script, result)).toBe(status);
}

function authoredGitState(): string {
	const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
	const staged = spawnSync("git", ["diff", "--cached", "--binary", "--no-ext-diff"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
	const unstaged = spawnSync("git", ["diff", "--binary", "--no-ext-diff"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
	for (const [label, result] of [
		["status", status],
		["staged diff", staged],
		["unstaged diff", unstaged],
	] as const) {
		if (result.error || result.signal || result.status !== 0) {
			throw new Error(
				`Could not capture authored checkout ${label}: status=${result.status ?? "null"}, signal=${result.signal ?? "null"}, error=${result.error?.message ?? "none"}`,
			);
		}
	}
	return JSON.stringify({
		status: status.stdout,
		staged: staged.stdout,
		unstaged: unstaged.stdout,
	});
}

async function withTemporaryRoot<T>(
	prefix: string,
	operation: (root: string) => T | Promise<T>,
): Promise<T> {
	const resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), prefix));
	resources.defer(() => {
		rmSync(root, { recursive: true, force: true });
		if (existsSync(root)) throw new Error(`temporary root still exists after cleanup: ${root}`);
	});
	let primaryError: unknown;
	let value: T | undefined;
	try {
		value = await operation(root);
	} catch (error) {
		primaryError = error;
	}
	let cleanupError: unknown;
	try {
		await resources.disposeAsync();
	} catch (error) {
		cleanupError = error;
	}
	if (primaryError && cleanupError) {
		throw new AggregateError(
			[primaryError, cleanupError],
			`Temporary formatter fixture failed and cleanup also failed for ${root}`,
		);
	}
	if (primaryError) throw primaryError;
	if (cleanupError) throw cleanupError;
	return value as T;
}

async function waitForFile(file: string, owner: Bun.Subprocess): Promise<void> {
	const deadline = Date.now() + TEST_CANVAS_STARTUP_TIMEOUT_MS;
	while (!existsSync(file)) {
		if (owner.exitCode !== null) {
			throw new Error(`signal cleanup owner exited before readiness with code ${owner.exitCode}`);
		}
		if (Date.now() >= deadline) {
			throw new Error(`signal cleanup owner did not publish readiness at ${file}`);
		}
		await Bun.sleep(TEST_CANVAS_HEALTH_POLL_MS);
	}
}

test("checks native Tailwind ordering through the checked-in fmt scripts", async () => {
	assertCanonicalFormatterConfiguration();
	assertFormatterScripts();
	const authoredBefore = authoredGitState();
	let primaryError: unknown;
	try {
		await withTemporaryRoot("archboard-oxfmt-tailwind-", async (fixtureRoot) => {
			for (const relativePath of canonicalFiles) copyCanonicalFile(fixtureRoot, relativePath);
			const nodeModules = join(repoRoot, "node_modules");
			if (!existsSync(nodeModules)) {
				throw new Error(
					"Tailwind formatter fixture requires installed dependencies; run bun install first.",
				);
			}
			symlinkSync(nodeModules, join(fixtureRoot, "node_modules"));
			const canonicalBefore = new Map(
				canonicalFiles.map((relativePath) => [
					relativePath,
					readFileSync(join(fixtureRoot, relativePath), "utf8"),
				]),
			);
			const fixtureFile = join(fixtureRoot, "src/fixture.tsx");
			mkdirSync(dirname(fixtureFile), { recursive: true });
			writeFileSync(fixtureFile, unsortedFixture);

			const before = runFormatterScript(fixtureRoot, "fmt:check");
			expectCommandStatus("fmt:check", before, 1);
			expect(before.stderr).toContain(fmtCheckInvocation);
			expect(before.stdout).toContain("src/fixture.tsx");
			expect(before.stdout).toContain("Format issues found");

			const format = runFormatterScript(fixtureRoot, "fmt");
			expectCommandStatus("fmt", format, 0);
			expect(format.stderr).toContain(fmtInvocation);

			const formatted = readFileSync(fixtureFile, "utf8");
			if (formatted !== expectedFormattedFixture) {
				throw new Error(
					[
						"Native Oxfmt Tailwind output drifted for the representative fixture.",
						"Run bun run fmt in this checkout and review the canonical stylesheet/configuration before updating this conformance test.",
						`Expected:\n${expectedFormattedFixture}`,
						`Observed:\n${formatted}`,
					].join("\n"),
				);
			}
			expect(formatted).toContain("`data-[tone=${tone}]:text-foreground`");
			expect(formatted).toContain("data.classes");
			expect(formatted).toContain('enabled && "hidden"');

			for (const relativePath of canonicalFiles) {
				const original = canonicalBefore.get(relativePath);
				if (original === undefined) throw new Error(`missing canonical snapshot: ${relativePath}`);
				expect(readFileSync(join(fixtureRoot, relativePath), "utf8"), relativePath).toBe(original);
			}

			const after = runFormatterScript(fixtureRoot, "fmt:check");
			expectCommandStatus("fmt:check", after, 0);
			expect(after.stderr).toContain(fmtCheckInvocation);
			expect(after.stdout).toContain("All matched files use the correct format.");
		});
	} catch (error) {
		primaryError = error;
	}
	let gitStateError: unknown;
	try {
		expect(authoredGitState(), "formatter fixture must leave authored git state unchanged").toBe(
			authoredBefore,
		);
	} catch (error) {
		gitStateError = error;
	}
	if (primaryError && gitStateError) {
		throw new AggregateError(
			[primaryError, gitStateError],
			"Formatter fixture failure and authored checkout state failure",
		);
	}
	if (primaryError) throw primaryError;
	if (gitStateError) throw gitStateError;
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	test(`cleans a formatter owner fixture when the owner receives ${signal}`, async () => {
		await withTemporaryRoot("archboard-oxfmt-tailwind-signal-", async (root) => {
			const ownerScript = join(root, "owner.ts");
			const ready = join(root, "ready");
			writeFileSync(
				ownerScript,
				`import { join } from "node:path";
import { rmSync, writeFileSync } from "node:fs";

const root = process.env.ARCHBOARD_OXFMT_SIGNAL_ROOT;
if (!root) throw new Error("missing signal cleanup root");
const cleanup = () => {
	rmSync(root, { recursive: true, force: true });
	process.exit(0);
};
process.once("SIGTERM", cleanup);
process.once("SIGINT", cleanup);
writeFileSync(join(root, "ready"), String(process.pid));
await new Promise<never>(() => undefined);
`,
			);
			const owner = Bun.spawn({
				cmd: [process.execPath, ownerScript],
				env: { ...process.env, ARCHBOARD_OXFMT_SIGNAL_ROOT: root },
				stdout: "ignore",
				stderr: "pipe",
			});
			let exitObserved = false;
			try {
				await waitForFile(ready, owner);
				owner.kill(signal);
				expect(await owner.exited).toBe(0);
				exitObserved = true;
				expect(existsSync(root)).toBeFalse();
			} finally {
				if (!exitObserved) owner.kill("SIGKILL");
				if (!exitObserved) await owner.exited;
			}
		});
	});
}

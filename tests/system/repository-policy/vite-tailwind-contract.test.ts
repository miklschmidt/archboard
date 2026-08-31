import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { InlineConfig } from "vite";
import {
	buildViteTailwindFixture,
	captureFailure,
	childLineReader,
	childStdout,
	createViteTailwindFixture,
	prefixedFixtureRoots,
	reapChild,
	runCleanupSteps,
	type FixturePhase,
	toPosixSpecifier,
	withPrimaryAndCleanup,
	withReapedChild,
	withViteTailwindFixture,
} from "./support/vite-tailwind-fixture.ts";
import {
	assertViteContract,
	tailwindRegistrationCount,
	withAlias,
	withPlugins,
} from "./support/vite-tailwind-contract.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const configPath = join(repoRoot, "vite.config.js");
const sourceRoot = fileURLToPath(new URL("../../../src", import.meta.url));
const productionConfig = (
	(await import(pathToFileURL(configPath).href)) as { default: InlineConfig }
).default;
function gitSnapshot(): { status: string; diff: string } {
	return {
		status: execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
			cwd: repoRoot,
			encoding: "utf8",
		}),
		diff: execFileSync("git", ["diff", "--no-ext-diff", "--binary"], {
			cwd: repoRoot,
			encoding: "utf8",
		}),
	};
}

async function buildFixture(config: InlineConfig): Promise<string> {
	return await buildViteTailwindFixture(config, tmpdir(), repoRoot);
}

function runOwnedFixtureChild(
	parent: string,
	mode: "hold" | "fail" | "interrupt",
	interruptAt?: FixturePhase,
): ReturnType<typeof Bun.spawn> {
	const supportPath = join(
		repoRoot,
		"tests/system/repository-policy/support/vite-tailwind-fixture.ts",
	);
	const script = `(async () => {
	const { runOwnedViteTailwindFixture } = await import(${JSON.stringify(pathToFileURL(supportPath).href)});
	const config = (await import(${JSON.stringify(pathToFileURL(configPath).href)})).default;
	await runOwnedViteTailwindFixture(config, {
		parent: ${JSON.stringify(parent)},
		dependenciesRoot: ${JSON.stringify(repoRoot)},
		failAfterReady: ${mode === "fail"},
		holdAfterReady: ${mode === "hold"},
		interruptAt: ${JSON.stringify(interruptAt)},
	});
})().catch(() => process.exit(1));`;
	return Bun.spawn(["bun", "-e", script], {
		cwd: parent,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
}

describe("Vite Tailwind configuration", () => {
	test("builds a disposable aliased Tailwind fixture outside the checkout", async () => {
		assertViteContract(productionConfig, sourceRoot);
		const css = await buildFixture(productionConfig);
		expect(css).toMatch(/\.bg-red-500\s*\{/);
		expect(css).toContain("background-color");
	});

	test("normalizes fixture specifiers and handles spaces in temporary paths", () => {
		expect(toPosixSpecifier("nested\\source with spaces\\entry.ts")).toBe(
			"nested/source with spaces/entry.ts",
		);
	});

	test("keeps fixture cleanup safe around an existing colliding sibling", async () => {
		const fixture = await createViteTailwindFixture(tmpdir(), repoRoot);
		const sibling = `${fixture.root}.existing`;
		writeFileSync(sibling, "preserve me");
		try {
			expect(readlinkSync(join(fixture.root, "node_modules"))).toBe(join(repoRoot, "node_modules"));
			await fixture.dispose();
			expect(readFileSync(sibling, "utf8")).toBe("preserve me");
		} finally {
			rmSync(sibling, { force: true });
		}
	});

	test("cleans the real fixture owner after readiness is published", async () => {
		const parent = mkdtempSync(join(tmpdir(), "archboard-vite-ready-parent-"));
		const before = gitSnapshot();
		let child: ReturnType<typeof Bun.spawn> | undefined;
		try {
			child = runOwnedFixtureChild(parent, "hold");
			const nextLine = childLineReader(childStdout(child));
			await withReapedChild(child, async (owner) => {
				const ready = await nextLine();
				expect(ready).toMatch(/^READY \/.*archboard-vite-tailwind-/);
				owner.kill("SIGTERM");
				expect(await owner.exited).toBe(143);
				expect(prefixedFixtureRoots(parent)).toEqual([]);
			});
		} finally {
			await reapChild(child);
			rmSync(parent, { recursive: true, force: true });
		}
		expect(gitSnapshot()).toEqual(before);
	});

	test("cleans a fixture after an in-process callback throws", async () => {
		let fixtureRoot = "";
		try {
			await withViteTailwindFixture(async (fixture) => {
				fixtureRoot = fixture.root;
				throw new Error("fixture callback failure");
			});
		} catch (error) {
			expect((error as Error).message).toBe("fixture callback failure");
		}
		expect(fixtureRoot).not.toBe("");
		expect(existsSync(fixtureRoot)).toBe(false);
	});

	test("cleans a child fixture before reporting child failure", async () => {
		const parent = mkdtempSync(join(tmpdir(), "archboard-vite-failure-parent-"));
		const before = gitSnapshot();
		let child: ReturnType<typeof Bun.spawn> | undefined;
		try {
			child = runOwnedFixtureChild(parent, "fail");
			const nextLine = childLineReader(childStdout(child));
			await withReapedChild(child, async (owner) => {
				expect(await nextLine()).toMatch(/^READY /);
				expect(await owner.exited).toBe(1);
				expect(prefixedFixtureRoots(parent)).toEqual([]);
			});
		} finally {
			await reapChild(child);
			rmSync(parent, { recursive: true, force: true });
		}
		expect(gitSnapshot()).toEqual(before);
	});

	for (const phase of [
		"after-mkdtemp",
		"dependency-link",
		"project-directory",
		"source-directory",
		"index-file",
		"main-file",
		"source-file",
		"stylesheet-file",
		"before-ready",
		"after-ready",
		"callback",
		"during-build",
	] as const) {
		test(`cleans a real owner interrupted at ${phase}`, async () => {
			const parent = mkdtempSync(join(tmpdir(), `archboard-vite-${phase}-parent-`));
			const before = gitSnapshot();
			let child: ReturnType<typeof Bun.spawn> | undefined;
			try {
				child = runOwnedFixtureChild(parent, "interrupt", phase);
				await withReapedChild(child, async (owner) => {
					expect(await owner.exited).toBe(143);
					expect(prefixedFixtureRoots(parent)).toEqual([]);
				});
			} finally {
				await reapChild(child);
				rmSync(parent, { recursive: true, force: true });
			}
			expect(gitSnapshot()).toEqual(before);
		});
	}

	test("keeps parallel fixture owners independent", async () => {
		const parent = mkdtempSync(join(tmpdir(), "archboard-vite-parallel-parent-"));
		try {
			const [first, second] = await Promise.all([
				createViteTailwindFixture(parent, repoRoot),
				createViteTailwindFixture(parent, repoRoot),
			]);
			try {
				await first.dispose();
				expect(existsSync(second.root)).toBe(true);
			} finally {
				await second.dispose();
			}
			expect(prefixedFixtureRoots(parent)).toEqual([]);
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("keeps parallel lint and reads isolated from fixture files", async () => {
		const before = gitSnapshot();
		let lint: ReturnType<typeof Bun.spawn> | undefined;
		try {
			lint = Bun.spawn(["bunx", "oxlint", "vite.config.js", "tests/system/repository-policy"], {
				cwd: repoRoot,
				stdout: "pipe",
				stderr: "pipe",
			});
			await withReapedChild(lint, async (owner) => {
				const [css, configBytes, lintExit] = await Promise.all([
					buildFixture(productionConfig),
					readFile(configPath, "utf8"),
					owner.exited,
				]);
				expect(lintExit).toBe(0);
				expect(configBytes).toContain("@tailwindcss/vite");
				expect(css).toContain(".bg-red-500");
			});
		} finally {
			await reapChild(lint);
		}
		expect(gitSnapshot()).toEqual(before);
	});

	test("normalizes object and array aliases from a non-repository cwd", () => {
		const cwd = mkdtempSync(join(tmpdir(), "archboard-vite-cwd-"));
		const supportPath = join(
			repoRoot,
			"tests/system/repository-policy/support/vite-tailwind-fixture.ts",
		);
		try {
			for (const form of ["object", "array"] as const) {
				const script = `
					const config = (await import(${JSON.stringify(pathToFileURL(configPath).href)})).default;
					const { normalizeViteAliasEntries } = await import(${JSON.stringify(pathToFileURL(supportPath).href)});
					const aliases = ${form === "object" ? '{ "@": config.resolve.alias["@"], "~": config.resolve.alias["@"] + "/ui" }' : '[{ find: "@", replacement: config.resolve.alias["@"] }, { find: /^virtual\\//, replacement: config.resolve.alias["@"] + "/shared" }]'};
					const entries = normalizeViteAliasEntries(aliases);
					const exact = entries?.filter((entry) => entry.find === "@");
					console.log(${JSON.stringify(form)} + ":" + exact?.length + ":" + exact?.[0]?.replacement);
				`;
				const result = Bun.spawnSync(["bun", "-e", script], {
					cwd,
					stdout: "pipe",
					stderr: "pipe",
				});
				expect(result.exitCode).toBe(0);
				expect(new TextDecoder().decode(result.stdout).trim()).toBe(`${form}:1:${sourceRoot}`);
			}
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("allows unrelated string and regex aliases", () => {
		const aliases = [
			{ find: "@", replacement: sourceRoot },
			{ find: "~", replacement: join(sourceRoot, "ui") },
			{ find: /^virtual\//, replacement: join(sourceRoot, "shared") },
			{ find: "@\\admin", replacement: join(sourceRoot, "admin") },
			{ find: "@?admin", replacement: join(sourceRoot, "admin") },
			{ find: /^@admin/, replacement: join(sourceRoot, "admin") },
			{ find: /^@admin\/panel/, replacement: join(sourceRoot, "admin/panel") },
		];
		expect(() =>
			assertViteContract(withAlias(productionConfig, aliases), sourceRoot),
		).not.toThrow();
	});

	test("rejects every string alias rooted at @/ regardless of depth", () => {
		for (const find of ["@/admin", "@/a/b/c/deeper"]) {
			expect(() =>
				assertViteContract(
					withAlias(productionConfig, { "@": sourceRoot, [find]: sourceRoot }),
					sourceRoot,
				),
			).toThrow("overlapping alias");
		}
	});

	test("preserves primary and cleanup failures in stable order", async () => {
		const primary = new Error("primary");
		const cleanup = new Error("cleanup");
		const failure = await captureFailure(() =>
			withPrimaryAndCleanup(
				async () => {
					throw primary;
				},
				() => {
					throw cleanup;
				},
			),
		);
		expect(failure).toBeInstanceOf(AggregateError);
		expect((failure as AggregateError).errors).toEqual([primary, cleanup]);
	});

	test("preserves primary-only and cleanup-only failures", async () => {
		const primary = new Error("primary-only");
		const cleanup = new Error("cleanup-only");
		expect(
			await captureFailure(() =>
				withPrimaryAndCleanup(
					async () => {
						throw primary;
					},
					() => undefined,
				),
			),
		).toBe(primary);
		expect(
			await captureFailure(() =>
				withPrimaryAndCleanup(
					async () => "ok",
					() => {
						throw cleanup;
					},
				),
			),
		).toBe(cleanup);
	});

	test("preserves multiple cleanup failures after the primary and removes the root", async () => {
		const parent = mkdtempSync(join(tmpdir(), "archboard-vite-cleanup-failure-"));
		const root = join(parent, "root");
		writeFileSync(root, "temporary");
		const before = gitSnapshot();
		const primary = new Error("build-failure");
		const firstCleanup = new Error("first-cleanup");
		const secondCleanup = new Error("second-cleanup");
		try {
			const failure = await captureFailure(() =>
				withPrimaryAndCleanup(
					async () => {
						throw primary;
					},
					() =>
						runCleanupSteps([
							() => rmSync(root),
							() => {
								throw firstCleanup;
							},
							() => {
								throw secondCleanup;
							},
						]),
				),
			);
			expect((failure as AggregateError).errors[0]).toBe(primary);
			expect((failure as AggregateError).errors[1]).toBeInstanceOf(AggregateError);
			expect(((failure as AggregateError).errors[1] as AggregateError).errors).toEqual([
				firstCleanup,
				secondCleanup,
			]);
			expect(existsSync(root)).toBe(false);
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
		expect(gitSnapshot()).toEqual(before);
	});

	const negativeFixtures: Array<[string, (config: InlineConfig) => InlineConfig, string]> = [
		[
			"missing plugin",
			(config) =>
				withPlugins(
					config,
					(config.plugins ?? []).filter((plugin) => tailwindRegistrationCount(plugin) === 0),
				),
			"missing @tailwindcss/vite plugin registration",
		],
		[
			"wrong alias target",
			(config) => withAlias(config, { "@": join(sourceRoot, "ui") }),
			"@/ alias must target repository src",
		],
		[
			"alias escape",
			(config) => withAlias(config, { "@": dirname(sourceRoot) }),
			"@/ alias escapes repository src",
		],
		[
			"relative alias",
			(config) => withAlias(config, { "@": "src" }),
			"@/ alias must be an absolute repository src path",
		],
		[
			"earlier overlapping string alias",
			(config) => withAlias(config, { "@/ui": join(sourceRoot, "ui"), "@": sourceRoot }),
			"overlapping alias",
		],
		[
			"later overlapping string alias",
			(config) => withAlias(config, { "@": sourceRoot, "@/ui": join(sourceRoot, "ui") }),
			"overlapping alias",
		],
		[
			"overlapping regex alias",
			(config) =>
				withAlias(config, [
					{ find: /^@\//, replacement: join(sourceRoot, "ui") },
					{ find: "@", replacement: sourceRoot },
				]),
			"overlapping regex alias",
		],
		[
			"deep overlapping string alias",
			(config) => withAlias(config, { "@/a/b/c/deeper": sourceRoot, "@": sourceRoot }),
			"overlapping alias",
		],
		[
			"deep overlapping regex alias",
			(config) =>
				withAlias(config, [
					{ find: /^@\/a\/b\/c\/deeper/, replacement: sourceRoot },
					{ find: "@", replacement: sourceRoot },
				]),
			"overlapping regex alias",
		],
		[
			"ambiguous regex alias",
			(config) =>
				withAlias(config, [
					{ find: /@/, replacement: sourceRoot },
					{ find: "@", replacement: sourceRoot },
				]),
			"unsupported regex alias overlap",
		],
		[
			"alternating regex alias",
			(config) =>
				withAlias(config, [
					{ find: /^virtual|^@\//, replacement: sourceRoot },
					{ find: "@", replacement: sourceRoot },
				]),
			"unsupported regex alias overlap",
		],
		[
			"duplicate @ aliases",
			(config) =>
				withAlias(config, [
					{ find: "@", replacement: sourceRoot },
					{ find: "@", replacement: sourceRoot },
				]),
			"duplicate @ aliases",
		],
		[
			"duplicate plugin",
			(config) => {
				const tailwind = (config.plugins ?? []).find(
					(plugin) => tailwindRegistrationCount(plugin) > 0,
				);
				return withPlugins(config, [...(config.plugins ?? []), tailwind!]);
			},
			"expected one @tailwindcss/vite registration, found 2",
		],
		[
			"production root drift",
			(config) => ({ ...config, root: "frontend-drift" }),
			"production config drifted from root frontend",
		],
		[
			"production output cleanup drift",
			(config) => ({ ...config, build: { ...config.build, emptyOutDir: false } }),
			"output must retain emptyOutDir=true",
		],
		[
			"production port drift",
			(config) => ({ ...config, server: { ...config.server, port: 5174 } }),
			"server port drifted from 5173",
		],
	];

	for (const [name, mutate, diagnostic] of negativeFixtures) {
		test(`rejects ${name} with an actionable fixture diagnostic`, () => {
			expect(() => assertViteContract(mutate(productionConfig), sourceRoot)).toThrow(diagnostic);
		});
	}
});

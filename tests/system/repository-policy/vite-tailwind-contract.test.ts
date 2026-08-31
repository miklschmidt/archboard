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
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { InlineConfig } from "vite";
import {
	buildViteTailwindFixture,
	childLineReader,
	createViteTailwindFixture,
	prefixedFixtureRoots,
	reapChild,
	toPosixSpecifier,
	withReapedChild,
	withViteTailwindFixture,
} from "./support/vite-tailwind-fixture.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const configPath = join(repoRoot, "vite.config.js");
const sourceRoot = fileURLToPath(new URL("../../../src", import.meta.url));
const productionConfig = (
	(await import(pathToFileURL(configPath).href)) as { default: InlineConfig }
).default;

type PluginLike = { name?: unknown };
type OutputContract = { chunkFileNames?: (chunk: { name: string }) => string };
type ProxyContract = { target?: string; changeOrigin?: boolean };
type ResolveOptions = NonNullable<InlineConfig["resolve"]>;
type AliasEntry = { find: string | RegExp; replacement?: string };

function pluginName(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null || !("name" in value)) return undefined;
	const name = (value as PluginLike).name;
	return typeof name === "string" ? name : undefined;
}

function tailwindRegistrationCount(value: unknown): number {
	if (!Array.isArray(value)) return 0;
	const containsTailwindPlugin = value.some((item) =>
		pluginName(item)?.startsWith("@tailwindcss/vite:"),
	);
	return (
		(containsTailwindPlugin ? 1 : 0) +
		value.reduce((count, item) => count + tailwindRegistrationCount(item), 0)
	);
}

function isWithin(root: string, candidate: string): boolean {
	const pathFromRoot = relative(root, candidate);
	const parts = pathFromRoot.split(sep);
	return pathFromRoot === "" || (!isAbsolute(pathFromRoot) && !parts.includes(".."));
}

function aliasEntries(config: InlineConfig): AliasEntry[] | undefined {
	const aliases = config.resolve?.alias;
	if (aliases === undefined || aliases === null) return undefined;
	if (Array.isArray(aliases)) return aliases as AliasEntry[];
	if (typeof aliases !== "object") return undefined;
	return Object.entries(aliases).map(([find, replacement]) => ({
		find,
		replacement: typeof replacement === "string" ? replacement : undefined,
	}));
}

function aliasMatches(find: string | RegExp, importee: string): boolean {
	if (typeof find === "string") return importee === find || importee.startsWith(`${find}/`);
	const lastIndex = find.lastIndex;
	find.lastIndex = 0;
	const matches = find.test(importee);
	find.lastIndex = lastIndex;
	return matches;
}

function overlapsAt(find: string | RegExp): boolean {
	return ["@", "@/", "@/ui", "@/ui/source.ts"].some((importee) => aliasMatches(find, importee));
}

function assertViteContract(config: InlineConfig): void {
	const registrations = tailwindRegistrationCount(config.plugins);
	if (registrations === 0) {
		throw new Error("Vite fixture contract: missing @tailwindcss/vite plugin registration.");
	}
	if (registrations !== 1) {
		throw new Error(
			`Vite fixture contract: expected one @tailwindcss/vite registration, found ${registrations}.`,
		);
	}

	const aliases = aliasEntries(config);
	if (aliases === undefined) {
		throw new Error("Vite fixture contract: production aliases must contain one exact @ entry.");
	}
	const canonicalAliases = aliases.filter((entry) => entry.find === "@");
	if (canonicalAliases.length === 0) {
		throw new Error("Vite fixture contract: production aliases must contain one exact @ entry.");
	}
	if (canonicalAliases.length > 1) {
		throw new Error("Vite fixture contract: duplicate @ aliases are forbidden.");
	}
	for (const alias of aliases) {
		if (alias.find !== "@" && overlapsAt(alias.find)) {
			throw new Error(`Vite fixture contract: overlapping alias ${String(alias.find)} shadows @/.`);
		}
	}
	const configuredAlias = canonicalAliases[0]?.replacement;
	if (typeof configuredAlias !== "string" || !isAbsolute(configuredAlias)) {
		throw new Error(
			`Vite fixture contract: @/ alias must be an absolute repository src path: ${String(configuredAlias)}.`,
		);
	}
	if (resolve(configuredAlias) !== sourceRoot) {
		const escaped = !isWithin(sourceRoot, resolve(configuredAlias));
		throw new Error(
			escaped
				? `Vite fixture contract: @/ alias escapes repository src: ${configuredAlias}.`
				: `Vite fixture contract: @/ alias must target repository src: ${configuredAlias}.`,
		);
	}

	if (config.root !== "frontend") {
		throw new Error(
			`Vite fixture contract: production config drifted from root frontend: ${config.root}.`,
		);
	}
	if (config.build?.outDir !== "../dist/frontend") {
		throw new Error(
			`Vite fixture contract: production config drifted from dist/frontend output: ${config.build?.outDir}.`,
		);
	}
	if (config.build?.emptyOutDir !== true) {
		throw new Error("Vite fixture contract: production output must retain emptyOutDir=true.");
	}
	if (config.server?.port !== 5173) {
		throw new Error(
			`Vite fixture contract: production server port drifted from 5173: ${config.server?.port}.`,
		);
	}

	const output = config.build?.rollupOptions?.output as OutputContract | undefined;
	if (typeof output?.chunkFileNames !== "function") {
		throw new Error("Vite fixture contract: production Excalidraw chunk naming is missing.");
	}
	if (output.chunkFileNames({ name: "subset-worker" }) !== "assets/[name].js") {
		throw new Error(
			"Vite fixture contract: production Excalidraw subset chunks must stay unhashed.",
		);
	}
	if (output.chunkFileNames({ name: "application" }) !== "assets/[name]-[hash].js") {
		throw new Error("Vite fixture contract: production chunks must retain hashed naming.");
	}

	const proxy = config.server?.proxy as Record<string, ProxyContract> | undefined;
	if (
		proxy?.["/api"]?.target !== "http://127.0.0.1:3000" ||
		proxy["/health"]?.target !== "http://127.0.0.1:3000" ||
		proxy["/api"]?.changeOrigin !== true ||
		proxy["/health"]?.changeOrigin !== true
	) {
		throw new Error("Vite fixture contract: production API and health proxies drifted.");
	}
}

function withPlugins(config: InlineConfig, plugins: InlineConfig["plugins"]): InlineConfig {
	return { ...config, plugins };
}

function withAlias(config: InlineConfig, alias: ResolveOptions["alias"]): InlineConfig {
	return { ...config, resolve: { ...config.resolve, alias } };
}

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

function runOwnedFixtureChild(parent: string, mode: "hold" | "fail"): ReturnType<typeof Bun.spawn> {
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
	});
})().catch(() => process.exit(1));`;
	return Bun.spawn(["bun", "-e", script], {
		cwd: parent,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
}

function childStdout(child: ReturnType<typeof Bun.spawn>): ReadableStream<Uint8Array> {
	if (child.stdout === undefined || typeof child.stdout === "number") {
		throw new Error("Fixture owner stdout must be piped.");
	}
	return child.stdout;
}

describe("Vite Tailwind configuration", () => {
	test("builds a disposable aliased Tailwind fixture outside the checkout", async () => {
		assertViteContract(productionConfig);
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

	test("cleans a signaled fixture before the child exits", async () => {
		const parent = mkdtempSync(join(tmpdir(), "archboard-vite-signal-parent-"));
		const before = gitSnapshot();
		let child: ReturnType<typeof Bun.spawn> | undefined;
		try {
			child = runOwnedFixtureChild(parent, "hold");
			await withReapedChild(child, async (owner) => {
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

	test("imports the canonical config from a non-repository cwd", () => {
		const cwd = mkdtempSync(join(tmpdir(), "archboard-vite-cwd-"));
		try {
			const script = `const config = (await import(${JSON.stringify(pathToFileURL(configPath).href)})).default; console.log(config.resolve.alias["@"])`;
			const result = Bun.spawnSync(["bun", "-e", script], {
				cwd,
				stdout: "pipe",
				stderr: "pipe",
			});
			expect(result.exitCode).toBe(0);
			expect(new TextDecoder().decode(result.stdout).trim()).toBe(sourceRoot);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("allows unrelated string and regex aliases", () => {
		const aliases = [
			{ find: "@", replacement: sourceRoot },
			{ find: "~", replacement: join(sourceRoot, "ui") },
			{ find: /^virtual\//, replacement: join(sourceRoot, "shared") },
		];
		expect(() => assertViteContract(withAlias(productionConfig, aliases))).not.toThrow();
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
			"overlapping alias",
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
			expect(() => assertViteContract(mutate(productionConfig))).toThrow(diagnostic);
		});
	}
});

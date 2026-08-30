import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, type InlineConfig } from "vite";
import {
	createViteTailwindFixture,
	toPosixSpecifier,
	withViteTailwindFixture,
	writeViteTailwindFixture,
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

	const aliases = config.resolve?.alias;
	if (
		Array.isArray(aliases) ||
		aliases === undefined ||
		aliases === null ||
		typeof aliases !== "object"
	) {
		throw new Error(
			"Vite fixture contract: production @/ alias authority must be exactly one object entry; overlapping string or regex aliases are forbidden.",
		);
	}
	const aliasEntries = Object.entries(aliases);
	if (aliasEntries.length !== 1 || aliasEntries[0]?.[0] !== "@") {
		throw new Error(
			"Vite fixture contract: production @/ alias authority must be exactly the single @ entry; overlapping aliases are forbidden.",
		);
	}
	const configuredAlias = aliasEntries[0][1];
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

	const output = config.build.rollupOptions?.output as OutputContract | undefined;
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
	return await withViteTailwindFixture(
		async (fixture) => {
			await writeViteTailwindFixture(fixture);
			await build({
				...config,
				configFile: false,
				root: fixture.projectRoot,
				logLevel: "silent",
				resolve: { ...config.resolve, alias: { "@": fixture.sourceRoot } },
				build: {
					...config.build,
					outDir: fixture.outputRoot,
					emptyOutDir: true,
					rollupOptions: {
						...config.build?.rollupOptions,
						input: join(fixture.projectRoot, "frontend/index.html"),
					},
				},
			});

			const cssFiles = (await readdir(join(fixture.outputRoot, "assets"))).filter((file) =>
				file.endsWith(".css"),
			);
			if (cssFiles.length !== 1)
				throw new Error(`Vite fixture emitted ${cssFiles.length} CSS files.`);
			return await readFile(join(fixture.outputRoot, "assets", cssFiles[0]!), "utf8");
		},
		tmpdir(),
		repoRoot,
	);
}

async function waitForFile(filename: string): Promise<void> {
	for (let attempt = 0; attempt < 1000; attempt++) {
		if (existsSync(filename)) return;
		await Bun.sleep(5);
	}
	throw new Error(`Timed out waiting for ${filename}.`);
}

function runSignalFixture(parent: string, marker: string): ReturnType<typeof Bun.spawn> {
	const supportPath = join(
		repoRoot,
		"tests/system/repository-policy/support/vite-tailwind-fixture.ts",
	);
	const script = `(async () => {
	const { createViteTailwindFixture } = await import(${JSON.stringify(pathToFileURL(supportPath).href)});
	const fixture = await createViteTailwindFixture(${JSON.stringify(parent)}, ${JSON.stringify(repoRoot)});
	process.on("SIGTERM", async () => {
		await fixture.dispose();
		process.exit(0);
	});
	const { writeFileSync } = await import("node:fs");
	writeFileSync(${JSON.stringify(marker)}, fixture.root);
	setInterval(() => {}, 1000);
})().catch(() => process.exit(1));`;
	return Bun.spawn(["bun", "-e", script], {
		cwd: parent,
		stdout: "ignore",
		stderr: "pipe",
	});
}

function runFailingFixture(parent: string, marker: string): ReturnType<typeof Bun.spawn> {
	const supportPath = join(
		repoRoot,
		"tests/system/repository-policy/support/vite-tailwind-fixture.ts",
	);
	const script = `(async () => {
	const { withViteTailwindFixture } = await import(${JSON.stringify(pathToFileURL(supportPath).href)});
	const { writeFileSync } = await import("node:fs");
	await withViteTailwindFixture(async (fixture) => {
		writeFileSync(${JSON.stringify(marker)}, fixture.root);
		throw new Error("fixture child failure");
	}, ${JSON.stringify(parent)}, ${JSON.stringify(repoRoot)});
})().catch(() => process.exit(1));`;
	return Bun.spawn(["bun", "-e", script], {
		cwd: parent,
		stdout: "ignore",
		stderr: "pipe",
	});
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
		const fixture = await createViteTailwindFixture();
		const sibling = `${fixture.root}.existing`;
		writeFileSync(sibling, "preserve me");
		try {
			await fixture.dispose();
			expect(readFileSync(sibling, "utf8")).toBe("preserve me");
		} finally {
			rmSync(sibling, { force: true });
		}
	});

	test("cleans a signaled fixture before the child exits", async () => {
		const parent = mkdtempSync(join(tmpdir(), "archboard-vite-signal-parent-"));
		const marker = join(parent, "fixture-root.txt");
		try {
			const child = runSignalFixture(parent, marker);
			await waitForFile(marker);
			const fixtureRoot = readFileSync(marker, "utf8");
			child.kill("SIGTERM");
			expect(await child.exited).toBe(0);
			expect(existsSync(fixtureRoot)).toBe(false);
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
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
		const marker = join(parent, "fixture-root.txt");
		try {
			const child = runFailingFixture(parent, marker);
			await waitForFile(marker);
			const fixtureRoot = readFileSync(marker, "utf8");
			expect(await child.exited).toBe(1);
			expect(existsSync(fixtureRoot)).toBe(false);
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("keeps parallel lint and reads isolated from fixture files", async () => {
		const before = gitSnapshot();
		const lint = Bun.spawn(["bunx", "oxlint", "vite.config.js", "tests/system/repository-policy"], {
			cwd: repoRoot,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [css, configBytes, lintExit] = await Promise.all([
			buildFixture(productionConfig),
			readFile(configPath, "utf8"),
			lint.exited,
		]);
		expect(lintExit).toBe(0);
		expect(configBytes).toContain("@tailwindcss/vite");
		expect(css).toContain(".bg-red-500");
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
			"exactly the single @ entry",
		],
		[
			"later overlapping string alias",
			(config) => withAlias(config, { "@": sourceRoot, "@/ui": join(sourceRoot, "ui") }),
			"exactly the single @ entry",
		],
		[
			"overlapping regex alias",
			(config) =>
				withAlias(config, [
					{ find: /^@\//, replacement: join(sourceRoot, "ui") },
					{ find: "@", replacement: sourceRoot },
				]),
			"exactly one object entry",
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

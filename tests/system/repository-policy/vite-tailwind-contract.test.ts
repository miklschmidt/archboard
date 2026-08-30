import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type InlineConfig } from "vite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceRoot = fileURLToPath(new URL("../../../src", import.meta.url));
const productionConfig = (
	(await import(new URL("../../../vite.config.js", import.meta.url).href)) as {
		default: InlineConfig;
	}
).default;

type PluginLike = { name?: unknown };
type OutputContract = {
	chunkFileNames?: (chunk: { name: string }) => string;
};
type ProxyContract = { target?: string; changeOrigin?: boolean };

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

function aliasTarget(config: InlineConfig): unknown {
	const aliases = config.resolve?.alias;
	if (Array.isArray(aliases) || aliases === undefined || aliases === null) return undefined;
	return (aliases as Record<string, unknown>)["@"];
}

function isWithin(root: string, candidate: string): boolean {
	const pathFromRoot = relative(root, candidate);
	return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !pathFromRoot.includes(".."));
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

	const configuredAlias = aliasTarget(config);
	if (typeof configuredAlias !== "string" || resolve(configuredAlias) !== sourceRoot) {
		const escaped =
			typeof configuredAlias === "string" && !isWithin(sourceRoot, resolve(configuredAlias));
		throw new Error(
			escaped
				? `Vite fixture contract: @/ alias escapes repository src: ${String(configuredAlias)}.`
				: `Vite fixture contract: @/ alias must target repository src: ${String(configuredAlias)}.`,
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

function withoutTailwind(config: InlineConfig): InlineConfig {
	return {
		...config,
		plugins: (config.plugins ?? []).filter((plugin) => tailwindRegistrationCount(plugin) === 0),
	};
}

function withDuplicateTailwind(config: InlineConfig): InlineConfig {
	const tailwind = (config.plugins ?? []).find((plugin) => tailwindRegistrationCount(plugin) > 0);
	return { ...config, plugins: [...(config.plugins ?? []), tailwind!] };
}

function withAlias(config: InlineConfig, target: string): InlineConfig {
	return {
		...config,
		resolve: { ...config.resolve, alias: { "@": target } },
	};
}

async function buildFixture(config: InlineConfig): Promise<string> {
	const fixtureRoot = await mkdtemp(join(repoRoot, ".tmp-vite-tailwind-"));
	const fixtureSource = await mkdtemp(join(sourceRoot, ".tmp-vite-tailwind-source-"));
	const outputRoot = join(fixtureRoot, "dist");
	try {
		await mkdir(join(fixtureRoot, "frontend"), { recursive: true });
		await writeFile(
			join(fixtureRoot, "frontend/index.html"),
			'<!doctype html><html><body><script type="module" src="./main.ts"></script></body></html>',
		);
		await writeFile(
			join(fixtureRoot, "frontend/main.ts"),
			`import "@/${relative(sourceRoot, join(fixtureSource, "app.css"))}";\nimport { fixtureClassName } from "@/${relative(sourceRoot, join(fixtureSource, "source.ts"))}";\ndocument.body.className = fixtureClassName;\n`,
		);
		await writeFile(
			join(fixtureSource, "source.ts"),
			'export const fixtureClassName = "bg-red-500";\n',
		);
		await writeFile(
			join(fixtureSource, "app.css"),
			'@import "tailwindcss";\n@source "./source.ts";\n',
		);

		await build({
			...config,
			configFile: false,
			root: fixtureRoot,
			logLevel: "silent",
			build: {
				...config.build,
				outDir: outputRoot,
				emptyOutDir: true,
				rollupOptions: {
					...config.build?.rollupOptions,
					input: join(fixtureRoot, "frontend/index.html"),
				},
			},
		});

		const cssFiles = (await readdir(join(outputRoot, "assets"))).filter((file) =>
			file.endsWith(".css"),
		);
		if (cssFiles.length !== 1)
			throw new Error(`Vite fixture emitted ${cssFiles.length} CSS files.`);
		return await readFile(join(outputRoot, "assets", cssFiles[0]!), "utf8");
	} finally {
		await Promise.all([
			rm(fixtureRoot, { recursive: true, force: true }),
			rm(fixtureSource, { recursive: true, force: true }),
		]);
	}
}

describe("Vite Tailwind configuration", () => {
	test("builds a disposable aliased Tailwind fixture", async () => {
		assertViteContract(productionConfig);
		const css = await buildFixture(productionConfig);
		expect(css).toMatch(/\.bg-red-500\s*\{/);
		expect(css).toContain("background-color");
	});

	const negativeFixtures: Array<[string, (config: InlineConfig) => InlineConfig, string]> = [
		["missing plugin", withoutTailwind, "missing @tailwindcss/vite plugin registration"],
		[
			"wrong alias target",
			(config) => withAlias(config, join(sourceRoot, "ui")),
			"@/ alias must target repository src",
		],
		[
			"alias escape",
			(config) => withAlias(config, dirname(sourceRoot)),
			"@/ alias escapes repository src",
		],
		[
			"duplicate plugin",
			withDuplicateTailwind,
			"expected one @tailwindcss/vite registration, found 2",
		],
		[
			"production config drift",
			(config) => ({ ...config, root: "frontend-drift" }),
			"production config drifted from root frontend",
		],
	];

	for (const [name, mutate, diagnostic] of negativeFixtures) {
		test(`rejects ${name} with an actionable fixture diagnostic`, () => {
			expect(() => assertViteContract(mutate(productionConfig))).toThrow(diagnostic);
		});
	}
});

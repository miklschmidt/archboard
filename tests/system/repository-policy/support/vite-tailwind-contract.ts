import { isAbsolute, relative, resolve, sep } from "node:path";
import type { InlineConfig } from "vite";
import { normalizeViteAliasEntries } from "./vite-tailwind-fixture.ts";

type PluginLike = { name?: unknown };
type OutputContract = { chunkFileNames?: (chunk: { name: string }) => string };
type ProxyContract = { target?: string; changeOrigin?: boolean };
type ResolveOptions = NonNullable<InlineConfig["resolve"]>;

function pluginName(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null || !("name" in value)) return undefined;
	const name = (value as PluginLike).name;
	return typeof name === "string" ? name : undefined;
}

export function tailwindRegistrationCount(value: unknown): number {
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

function parseAnchoredLiteralRegex(find: RegExp): string | undefined {
	if (find.flags !== "" || !find.source.startsWith("^")) return undefined;
	let prefix = "";
	const source = find.source.slice(1);
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		if (/[A-Za-z0-9_/@-]/.test(character!)) {
			prefix += character!;
			continue;
		}
		if (character === "\\" && source[index + 1] === "/") {
			prefix += "/";
			index += 1;
			continue;
		}
		return undefined;
	}
	return prefix || undefined;
}

// Regex overlap is accepted only for the complete anchored-literal grammar
// above. Anything else fails closed because Vite may test it against any @/ import.
function assertNoAliasOverlap(find: string | RegExp): void {
	if (typeof find === "string") {
		if (find === "@" || find.startsWith("@/")) {
			throw new Error(`Vite fixture contract: overlapping alias ${find} shadows @/.`);
		}
		return;
	}
	const prefix = parseAnchoredLiteralRegex(find);
	if (prefix === undefined) {
		throw new Error(
			`Vite fixture contract: unsupported regex alias overlap ${String(find)}; use an anchored literal prefix that cannot match @/.`,
		);
	}
	if (prefix === "@" || prefix?.startsWith("@/")) {
		throw new Error(`Vite fixture contract: overlapping regex alias ${String(find)} shadows @/.`);
	}
}

export function assertViteContract(config: InlineConfig, sourceRoot: string): void {
	const registrations = tailwindRegistrationCount(config.plugins);
	if (registrations === 0) {
		throw new Error("Vite fixture contract: missing @tailwindcss/vite plugin registration.");
	}
	if (registrations !== 1) {
		throw new Error(
			`Vite fixture contract: expected one @tailwindcss/vite registration, found ${registrations}.`,
		);
	}

	const aliases = normalizeViteAliasEntries(config.resolve?.alias);
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
		if (alias.find !== "@") assertNoAliasOverlap(alias.find);
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

export function withPlugins(config: InlineConfig, plugins: InlineConfig["plugins"]): InlineConfig {
	return { ...config, plugins };
}

export function withAlias(config: InlineConfig, alias: ResolveOptions["alias"]): InlineConfig {
	return { ...config, resolve: { ...config.resolve, alias } };
}

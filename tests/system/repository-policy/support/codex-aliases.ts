import fs from "node:fs";
import path from "node:path";

function readJson(repoRoot: string, file: string): Record<string, unknown> {
	return JSON.parse(
		fs
			.readFileSync(path.join(repoRoot, file), "utf8")
			.replace(/^\s*\/\/.*$/gmu, "")
			.replace(/\/\*[\s\S]*?\*\//gu, ""),
	) as Record<string, unknown>;
}

function addAlias(aliases: Map<string, string>, name: string, value: unknown): void {
	const target =
		typeof value === "string"
			? value
			: Array.isArray(value)
				? value.find((item): item is string => typeof item === "string")
				: undefined;
	if (target) aliases.set(name, target);
}

export async function configuredAliases(repoRoot: string): Promise<ReadonlyMap<string, string>> {
	const aliases = new Map<string, string>();
	const packageImports = readJson(repoRoot, "package.json").imports;
	if (packageImports && typeof packageImports === "object")
		for (const [name, value] of Object.entries(packageImports)) addAlias(aliases, name, value);
	for (const file of ["tsconfig.json", "tsconfig.frontend.json"]) {
		const paths = (readJson(repoRoot, file).compilerOptions as Record<string, unknown> | undefined)
			?.paths;
		if (paths && typeof paths === "object")
			for (const [name, value] of Object.entries(paths)) addAlias(aliases, name, value);
	}
	const viteConfig = path.join(repoRoot, "vite.config.js");
	if (fs.existsSync(viteConfig) && /\balias\b/u.test(fs.readFileSync(viteConfig, "utf8"))) {
		const { loadConfigFromFile } = await import("vite");
		const loaded = await loadConfigFromFile(
			{ command: "build", mode: "test" },
			viteConfig,
			repoRoot,
			"silent",
		);
		const configured = loaded?.config.resolve?.alias;
		if (Array.isArray(configured)) {
			for (const alias of configured)
				if (typeof alias.find === "string" && typeof alias.replacement === "string")
					aliases.set(alias.find, alias.replacement);
		} else if (configured) {
			for (const [name, target] of Object.entries(configured))
				if (typeof target === "string") aliases.set(name, target);
		}
	}
	return aliases;
}

export function resolveConfiguredAlias(
	aliases: ReadonlyMap<string, string>,
	specifier: string,
): string | undefined {
	for (const [name, target] of aliases) {
		const prefix = name.endsWith("/*") ? name.slice(0, -1) : `${name}/`;
		const wildcard = specifier.startsWith(prefix) ? specifier.slice(prefix.length) : undefined;
		if (name === specifier || wildcard !== undefined)
			return (
				target.replace("*", wildcard ?? "") +
				(target.includes("*") || wildcard === undefined ? "" : wildcard)
			);
	}
	return undefined;
}

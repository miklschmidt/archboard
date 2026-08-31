import fs from "node:fs";
import path from "node:path";
import { API } from "typescript/unstable/async";

export type AliasContext = "root" | "frontend";
export type AliasFind = string | RegExp;

export interface AliasRule {
	readonly find: AliasFind;
	readonly targets: readonly string[];
	readonly kind: "package" | "tsconfig" | "vite";
}

export interface ConfiguredAliases {
	readonly package: readonly AliasRule[];
	readonly root: readonly AliasRule[];
	readonly frontend: readonly AliasRule[];
	readonly vite: readonly AliasRule[];
	readonly errors: readonly string[];
}

export interface AliasResolution {
	readonly target: string;
	readonly kind: AliasRule["kind"];
}

function packageTargets(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.flatMap(packageTargets);
	if (value && typeof value === "object") return Object.values(value).flatMap(packageTargets);
	return [];
}

function readPackageAliases(repoRoot: string): AliasRule[] {
	const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
		imports?: Record<string, unknown>;
	};
	return Object.entries(packageJson.imports ?? {}).flatMap(([find, value]) => {
		const targets = packageTargets(value);
		return targets.length ? [{ find, targets, kind: "package" as const }] : [];
	});
}

interface CompilerOptions {
	readonly baseUrl?: string;
	readonly paths?: Record<string, readonly string[]>;
}

function patternMatch(find: string, specifier: string): string | undefined {
	if (!find.includes("*")) return find === specifier ? "" : undefined;
	const wildcardIndex = find.indexOf("*");
	const prefix = find.slice(0, wildcardIndex);
	const suffix = find.slice(wildcardIndex + 1);
	if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return undefined;
	return specifier.slice(prefix.length, specifier.length - suffix.length || undefined);
}

function ruleSpecificity(rule: AliasRule, specifier: string): number | undefined {
	const { find } = rule;
	if (find instanceof RegExp) {
		find.lastIndex = 0;
		return find.test(specifier) ? 0 : undefined;
	}
	const wildcard =
		rule.kind === "vite" && !find.includes("*")
			? specifier === find || specifier.startsWith(`${find}/`)
				? ""
				: undefined
			: patternMatch(find, specifier);
	return wildcard === undefined
		? undefined
		: find.includes("*")
			? find.slice(0, find.indexOf("*")).length
			: 1_000_000;
}

function matchingRules(rules: readonly AliasRule[], specifier: string): readonly AliasRule[] {
	const matches = rules
		.map((rule) => ({ rule, specificity: ruleSpecificity(rule, specifier) }))
		.filter(
			(entry): entry is { rule: AliasRule; specificity: number } => entry.specificity !== undefined,
		);
	if (!matches.length) return [];
	const highest = Math.max(...matches.map(({ specificity }) => specificity));
	return matches.filter(({ specificity }) => specificity === highest).map(({ rule }) => rule);
}

function firstMatchingRule(rules: readonly AliasRule[], specifier: string): AliasRule | undefined {
	return rules.find((rule) => ruleSpecificity(rule, specifier) !== undefined);
}

function applyRule(rule: AliasRule, specifier: string): string[] {
	if (rule.find instanceof RegExp) {
		rule.find.lastIndex = 0;
		return rule.targets.map((target) => specifier.replace(rule.find, target));
	}
	const wildcard =
		rule.kind === "vite" && typeof rule.find === "string" && !rule.find.includes("*")
			? specifier === rule.find
				? ""
				: specifier.startsWith(`${rule.find}/`)
					? specifier.slice(rule.find.length)
					: undefined
			: patternMatch(rule.find, specifier);
	return wildcard === undefined
		? []
		: rule.targets.map(
				(target) =>
					target.replaceAll("*", wildcard) +
					(rule.kind === "vite" && typeof rule.find === "string" && !rule.find.includes("*")
						? wildcard
						: ""),
			);
}

export function aliasContext(importer: string): AliasContext {
	return /^(?:frontend\/|src\/ui\/)/u.test(importer) ? "frontend" : "root";
}

export async function configuredAliases(repoRoot: string): Promise<ConfiguredAliases> {
	const errors: string[] = [];
	let packageRules: AliasRule[] = [];
	try {
		packageRules = readPackageAliases(repoRoot);
	} catch (error) {
		errors.push(
			`package imports could not be read: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	const root: AliasRule[] = [];
	const frontend: AliasRule[] = [];
	const api = new API({ cwd: repoRoot });
	try {
		const projects = await api.updateSnapshot({
			openProjects: ["tsconfig.json", "tsconfig.frontend.json"]
				.map((file) => path.join(repoRoot, file))
				.filter((file) => fs.existsSync(file)),
			openFiles: [],
		});
		for (const project of projects.getProjects()) {
			const options = project.compilerOptions as CompilerOptions;
			if (!options.paths) continue;
			const destination = project.configFileName.endsWith("tsconfig.frontend.json")
				? frontend
				: root;
			const baseUrl = options.baseUrl ?? path.dirname(project.configFileName);
			for (const [find, targets] of Object.entries(options.paths))
				destination.push({
					find,
					targets: targets.map((target) => path.resolve(baseUrl, target)),
					kind: "tsconfig",
				});
		}
	} catch (error) {
		errors.push(
			`TypeScript alias configuration could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
		);
	} finally {
		void api.close();
	}
	const vite: AliasRule[] = [];
	const viteConfig = path.join(repoRoot, "vite.config.js");
	try {
		if (fs.existsSync(viteConfig) && /\balias\b/u.test(fs.readFileSync(viteConfig, "utf8"))) {
			const { loadConfigFromFile } = await import("vite");
			const loaded = await loadConfigFromFile(
				{ command: "build", mode: "test" },
				viteConfig,
				repoRoot,
				"silent",
			);
			const aliases = loaded?.config.resolve?.alias;
			if (Array.isArray(aliases)) {
				for (const alias of aliases)
					if (typeof alias.find === "string" || alias.find instanceof RegExp)
						vite.push({ find: alias.find, targets: [alias.replacement], kind: "vite" });
			} else if (aliases) {
				for (const [find, target] of Object.entries(aliases))
					if (typeof target === "string") vite.push({ find, targets: [target], kind: "vite" });
			}
		}
	} catch (error) {
		errors.push(
			`Vite alias configuration could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	return { package: packageRules, root, frontend, vite, errors };
}

export function aliasResolutions(
	aliases: ConfiguredAliases,
	importer: string,
	specifier: string,
): readonly AliasResolution[] {
	const rules = [
		...(specifier.startsWith("#") ? matchingRules(aliases.package, specifier) : []),
		...matchingRules(aliases[aliasContext(importer)], specifier),
		...(aliasContext(importer) === "frontend"
			? [firstMatchingRule(aliases.vite, specifier)].filter(
					(rule): rule is AliasRule => rule !== undefined,
				)
			: []),
	];
	return rules.flatMap((rule) =>
		applyRule(rule, specifier).map((target) => ({ target, kind: rule.kind })),
	);
}

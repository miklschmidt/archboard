import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const catalogueRuleSchema = z.object({
	scope: z.string(),
	value: z.string(),
	category: z.string(),
	type_aware: z.boolean(),
});
const stringArraySchema = z.array(z.string());
const allowNameSchema = z.union([z.string(), stringArraySchema]);
const allowEntrySchema = z.object({
	from: z.literal("file"),
	name: allowNameSchema,
	path: z.string(),
});
const policySchema = z.object({
	catalogueRuleCount: z.number(),
	catalogueSha256: z.string(),
	readonlyPrimitiveTypeAllowlist: z.array(allowEntrySchema),
	excludedPlugins: z.record(z.string(), z.string()),
	excludedRules: z.record(z.string(), z.string()),
	vendorDeclarationRules: z.record(z.string(), z.string()),
});
const overrideSchema = z.object({
	files: z.array(z.string()),
	rules: z.record(z.string(), z.unknown()),
});
const configSchema = z.object({
	plugins: z.array(z.string()),
	categories: z.record(z.string(), z.string()),
	rules: z.record(z.string(), z.unknown()),
	overrides: z.array(overrideSchema),
	options: z.object({
		denyWarnings: z.boolean(),
		maxWarnings: z.number(),
		reportUnusedDisableDirectives: z.string(),
	}),
});
const policyPath = path.join(repoRoot, "docs/agents/strict-analysis-policy.json");
const configPath = path.join(repoRoot, ".oxlintrc.jsonc");
const rawPolicy = Bun.JSONC.parse(readFileSync(policyPath, "utf8"));
const policy = policySchema.parse(rawPolicy);
const rawConfig = Bun.JSONC.parse(readFileSync(configPath, "utf8"));
const config = configSchema.parse(rawConfig);

test("the full pinned rule catalogue has an explicit applicable or inapplicable disposition", () => {
	const result = Bun.spawnSync(
		[path.join(repoRoot, "node_modules/.bin/oxlint"), "--rules", "--format=json"],
		{ cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
	);
	expect(result.exitCode, result.stderr.toString()).toBe(0);
	const rules = z.array(catalogueRuleSchema).parse(Bun.JSONC.parse(result.stdout.toString()));
	const identity: Readonly<Record<string, unknown>>[] = [];
	const categories = new Set<string>();
	const scopes = new Set<string>();
	for (const rule of rules) {
		identity.push({
			scope: rule.scope,
			value: rule.value,
			category: rule.category,
			type_aware: rule.type_aware,
		});
		categories.add(rule.category);
		scopes.add(rule.scope);
	}
	expect(rules).toHaveLength(policy.catalogueRuleCount);
	expect(
		createHash("sha256").update(JSON.stringify(identity)).digest("hex"),
		"Re-audit the catalogue when upgrading Oxlint",
	).toBe(policy.catalogueSha256);
	for (const category of categories) {
		expect(config.categories[category], category).toBe("error");
	}
	for (const scope of scopes) {
		if (scope !== "eslint" && !config.plugins.includes(scope.replaceAll("_", "-"))) {
			expect(policy.excludedPlugins[scope], `Unaudited plugin ${scope}`).toBeString();
		}
	}
	const disabled = Object.keys(config.rules)
		.filter((rule) => config.rules[rule] === "off")
		.toSorted();
	expect(disabled).toEqual(Object.keys(policy.excludedRules).toSorted());
	for (const [rule, reason] of Object.entries(policy.excludedRules)) {
		expect(reason.length, `Explain ${rule}`).toBeGreaterThan(20);
	}
	const [vendor] = config.overrides;
	expect(config.overrides).toHaveLength(1);
	expect(vendor?.files).toEqual([
		"src/shared/codex-app-server-contract/generated/versions/version-0.151.0-recipe-2/**/*.ts",
		"src/shared/codex-app-server-contract/generated/current/**/*.ts",
	]);
	expect(Object.keys(vendor?.rules ?? {}).toSorted()).toEqual(
		Object.keys(policy.vendorDeclarationRules).toSorted(),
	);
	for (const rule of rules) {
		const name = `${rule.scope === "eslint" ? "" : `${rule.scope.replaceAll("_", "-")}/`}${rule.value}`;
		if (rule.type_aware || ["react", "react_perf", "jsx_a11y"].includes(rule.scope)) {
			expect(vendor?.rules[name], `Vendor safety rule ${name} must stay enabled`).not.toBe("off");
		}
	}
});

test("named rules, zero warnings and 500 physical authored lines cannot regress", () => {
	for (const rule of [
		"no-await-in-loop",
		"typescript/no-unsafe-type-assertion",
		"typescript/no-unnecessary-type-assertion",
		"typescript/no-base-to-string",
		"typescript/no-unnecessary-condition",
		"typescript/no-unnecessary-type-conversion",
		"typescript/consistent-return",
		"archboard/no-archive-references",
	]) {
		expect(config.rules[rule], rule).toBe("error");
	}
	expect(config.rules["max-lines"]).toEqual([
		"error",
		{ max: 500, skipBlankLines: false, skipComments: false },
	]);
	expect(config.rules["typescript/prefer-readonly-parameter-types"]).toEqual([
		"error",
		{ allow: policy.readonlyPrimitiveTypeAllowlist },
	]);
	expect(config.options).toMatchObject({
		denyWarnings: true,
		maxWarnings: 0,
		reportUnusedDisableDirectives: "error",
	});
});

import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

const repoRoot = resolve(import.meta.dir, "../../..");
interface CatalogueRule {
	scope: string;
	value: string;
	category: string;
	type_aware: boolean;
}
interface Policy {
	catalogueRuleCount: number;
	catalogueSha256: string;
	readonlyPrimitiveTypeAllowlist: readonly Readonly<{
		from: "file";
		name: string | readonly string[];
		path: string;
	}>[];
	excludedPlugins: Record<string, string>;
	excludedRules: Record<string, string>;
	vendorDeclarationRules: Record<string, string>;
}
const configSchema = z.object({
	plugins: z.array(z.string()),
	categories: z.record(z.string(), z.string()),
	rules: z.record(z.string(), z.unknown()),
	overrides: z.array(
		z.object({ files: z.array(z.string()), rules: z.record(z.string(), z.unknown()) }),
	),
	options: z.object({
		denyWarnings: z.boolean(),
		maxWarnings: z.number(),
		reportUnusedDisableDirectives: z.string(),
	}),
});
const policy: Policy = JSON.parse(
	readFileSync(join(repoRoot, "docs/agents/strict-analysis-policy.json"), "utf8"),
);
const rawConfig: unknown = Bun.JSONC.parse(readFileSync(join(repoRoot, ".oxlintrc.jsonc"), "utf8"));
const config = configSchema.parse(rawConfig);

test("the full pinned rule catalogue has an explicit applicable or inapplicable disposition", () => {
	const result = Bun.spawnSync(
		[join(repoRoot, "node_modules/.bin/oxlint"), "--rules", "--format=json"],
		{ cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
	);
	expect(result.exitCode, result.stderr.toString()).toBe(0);
	const rules: CatalogueRule[] = JSON.parse(result.stdout.toString());
	const identity = rules.map(({ scope, value, category, type_aware }) => ({
		scope,
		value,
		category,
		type_aware,
	}));
	expect(rules).toHaveLength(policy.catalogueRuleCount);
	expect(
		createHash("sha256").update(JSON.stringify(identity)).digest("hex"),
		"Re-audit the catalogue when upgrading Oxlint",
	).toBe(policy.catalogueSha256);
	for (const category of new Set(rules.map((rule) => rule.category)))
		expect(config.categories[category], category).toBe("error");
	for (const scope of new Set(rules.map((rule) => rule.scope))) {
		if (scope !== "eslint" && !config.plugins.includes(scope.replaceAll("_", "-")))
			expect(policy.excludedPlugins[scope], `Unaudited plugin ${scope}`).toBeString();
	}
	const disabled = Object.keys(config.rules)
		.filter((rule) => config.rules[rule] === "off")
		.toSorted();
	expect(disabled).toEqual(Object.keys(policy.excludedRules).toSorted());
	for (const [rule, reason] of Object.entries(policy.excludedRules))
		expect(reason.length, `Explain ${rule}`).toBeGreaterThan(20);
	const vendor = config.overrides[0];
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
		if (rule.type_aware || ["react", "react_perf", "jsx_a11y"].includes(rule.scope))
			expect(vendor?.rules[name], `Vendor safety rule ${name} must stay enabled`).not.toBe("off");
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
	])
		expect(config.rules[rule], rule).toBe("error");
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

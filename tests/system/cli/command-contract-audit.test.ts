import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";
import { childDiscoveryOptions } from "../../../src/cli/command-contract/route-options.ts";
import { introspectContracts } from "../../../src/cli/command-contract/introspection.ts";
import { runCommand } from "../../../src/cli/command-contract/runner.ts";
import { ARRANGE_FLAG_SPEC } from "../../../src/cli/commands/arrange.ts";
import { cliContractRegistry, cliSurface } from "../../../src/cli/commands/run.ts";
import { SNAPSHOT_FLAG_SPEC } from "../../../src/cli/commands/snapshot.ts";
import { checkoutRoot } from "./support/package-cli.ts";

const auditSchema = z.object({
	reviewedBase: z.string(),
	surface: z.object({ commands: z.number(), subcommands: z.number(), paths: z.number() }),
	entries: z.array(
		z
			.object({
				path: z.string(),
				handlerOwner: z.string(),
				parserOwner: z.string(),
				prerequisites: z.array(z.string()),
				effects: z.array(z.string()),
				refusals: z.array(z.object({ code: z.string(), exit: z.number() })),
				exits: z.array(z.number()),
				introducedBy: z.string().optional(),
			})
			.passthrough(),
	),
	workflows: z.array(z.object({ name: z.string() }).passthrough()),
});
const compatibilitySchema = z.object({
	schemaVersion: z.literal(2),
	fixedBase: z.string(),
	publicPaths: z.array(z.string()),
	orderedCases: z.array(z.object({ name: z.string() }).passthrough()),
});
const audit = auditSchema.parse(
	JSON.parse(readFileSync(join(checkoutRoot, "docs/design/cli-command-audit.json"), "utf8")),
);
const compatibility = compatibilitySchema.parse(
	JSON.parse(
		readFileSync(
			join(checkoutRoot, "tests/system/cli/fixtures/fixed-base-compatibility.json"),
			"utf8",
		),
	),
);
const registry = cliContractRegistry();
const contracts = introspectContracts(registry);
const auditedPaths = audit.entries.map((entry) => entry.path);

const unconstrained = (schema: unknown): boolean => {
	if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
	const value = schema as Record<string, unknown>;
	const keys = Object.keys(value).filter((key) => key !== "$schema");
	if (keys.length === 0) return true;
	for (const keyword of ["anyOf", "oneOf", "allOf"])
		if (Array.isArray(value[keyword]) && value[keyword].some(unconstrained)) return true;
	return (
		value.type === "object" &&
		Object.keys((value.properties as object) ?? {}).length === 0 &&
		Array.isArray(value.required) &&
		value.required.length === 0 &&
		value.propertyNames === undefined &&
		value.additionalProperties !== false
	);
};

const visitTs = (directory: string): string[] =>
	readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? visitTs(path) : entry.name.endsWith(".ts") ? [path] : [];
	});

describe("command contract audit", () => {
	test("matches the declared CLI registry in canonical order", () => {
		const expectedPaths = cliSurface().flatMap(({ name, subcommands }) =>
			[name].concat(subcommands.map((subcommand) => `${name} ${subcommand}`)),
		);
		expect(auditedPaths).toHaveLength(audit.surface.paths);
		expect(new Set(auditedPaths).size).toBe(auditedPaths.length);
		expect(auditedPaths.toSorted()).toEqual(expectedPaths.toSorted());
		expect(registry.map((entry) => entry.name)).toEqual(auditedPaths);
		expect(contracts.map((entry) => entry.name)).toEqual(auditedPaths);
		expect(registry.every((entry) => entry.contract.path.join(" ") === entry.name)).toBe(true);
		expect(registry.every((entry) => !("handlerName" in entry))).toBe(true);
	});

	test("keeps fixed-base coverage and explicit introduced paths", () => {
		expect(compatibility.fixedBase).toBe("6c42fca6c0d5b9ecaa5ad40fde14ede684722d5a");
		expect(compatibility.publicPaths).toEqual(
			auditedPaths.filter((path) => compatibility.publicPaths.includes(path)),
		);
		for (const entry of audit.entries.filter(
			(candidate) => !compatibility.publicPaths.includes(candidate.path),
		))
			expect(entry.introducedBy?.length, entry.path).toBeGreaterThan(0);
		expect(compatibility.orderedCases.map((record) => record.name).toSorted()).toEqual(
			[
				"status-unavailable",
				"status-foreign-service",
				"board-save-conflict",
				"board-list-here-failure",
				"install-skill-late-failure",
				"promote-binding-resolution-failure",
				"snapshot-save-missing-name",
				"snapshot-restore-missing-name",
				"snapshot-option-leading-restore",
				"arrange-option-leading-align",
				"inject-unknown-option-shaped-subcommand",
			].toSorted(),
		);
	});

	test("matches route owners, parents, prerequisites, effects, refusals, and exits", () => {
		const auditByPath = new Map(audit.entries.map((entry) => [entry.path, entry]));
		for (const entry of registry) {
			const audited = auditByPath.get(entry.name)!;
			const expectedParent = audited.path.includes(" ")
				? audited.path.slice(0, audited.path.lastIndexOf(" "))
				: null;
			expect(entry.parent, entry.name).toBe(expectedParent);
			expect(entry.handlerOwner, entry.name).toBe(audited.handlerOwner);
			expect(entry.parserOwner, entry.name).toBe(audited.parserOwner);
			expect(JSON.stringify(entry.contract.prerequisites), entry.name).toBe(
				JSON.stringify(audited.prerequisites),
			);
			expect(JSON.stringify(entry.contract.effects), entry.name).toBe(
				JSON.stringify(audited.effects),
			);
			expect(
				entry.contract.refusals.map(({ code, exit }) => ({ code, exit })),
				entry.name,
			).toEqual(audited.refusals);
			const namespaceOnly = entry.contract.output.cases.every((output) =>
				output.description.toLowerCase().includes("namespace refusal"),
			);
			const declared = new Set([
				...(namespaceOnly ? [] : [0]),
				...entry.contract.refusals.map(({ exit }) => exit),
				...(entry.contract.outcomes ?? []).map(({ exit }) => exit),
			]);
			expect(
				[...declared].every((exit) => audited.exits.includes(exit)),
				entry.name,
			).toBe(true);
			expect(existsSync(join(checkoutRoot, entry.handlerOwner)), entry.name).toBe(true);
		}
	});

	test("derives family child discovery from parser flag specs", () => {
		for (const [family, spec] of [
			["snapshot", SNAPSHOT_FLAG_SPEC],
			["arrange", ARRANGE_FLAG_SPEC],
		] as const) {
			const route = registry.find((entry) => entry.name === family);
			expect(route?.childDiscovery?.options).toEqual(childDiscoveryOptions(spec));
		}
		for (const entry of registry) {
			if (entry.bare?.kind !== "default") continue;
			const child = entry.bare.child;
			expect(
				registry.some(
					(candidate) =>
						candidate.parent === entry.name && candidate.name === `${entry.name} ${child}`,
				),
			).toBe(true);
		}
	});

	test("publishes constrained result and stage schemas", () => {
		for (const contract of contracts) {
			for (const stage of contract.input.stages) {
				expect(stage.description.length, `${contract.name}:${stage.name}`).toBeGreaterThan(0);
				expect(unconstrained(stage.schema), `${contract.name}:${stage.name}`).toBe(false);
			}
			expect(new Set(contract.input.stages.map((stage) => stage.name)).size).toBe(
				contract.input.stages.length,
			);
		}
		for (const [path, fields] of [
			["board info", ["success", "board", "identity", "elementCount", "version", "placeholder"]],
			["inject test", ["channel", "threadId", "text"]],
		] as const) {
			const schema = contracts.find((contract) => contract.name === path)?.result as
				| { required?: readonly string[] }
				| undefined;
			expect(
				fields.every((field) => schema?.required?.includes(field)),
				path,
			).toBe(true);
		}
	});

	test("keeps contract implementation and private artifact policy narrow", () => {
		expect(runCommand.length).toBe(2);
		const contractSource = readFileSync(
			join(checkoutRoot, "src/cli/command-contract/contract.ts"),
			"utf8",
		);
		expect(contractSource).toMatch(/export interface CommandOutcomeDeclaration\b/);
		const execution =
			contractSource.match(/export interface CommandExecution[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? "";
		for (const forbidden of ["exit:", "stream:", "presentation:", "description:", "held:"])
			expect(execution).not.toContain(forbidden);
		const sourceFiles = visitTs(join(checkoutRoot, "src"));
		const commander = sourceFiles.filter((file) =>
			/from ["']commander["']/.test(readFileSync(file, "utf8")),
		);
		expect(commander.map((file) => relative(checkoutRoot, file))).toEqual([
			"src/cli/command-contract/lib/commander-adapter.ts",
		]);
		for (const deleted of [
			"src/cli/commands/args.ts",
			"src/cli/commands/util.ts",
			"src/cli/command-contract/lib/command-definitions.ts",
			"src/cli/command-contract/testing.ts",
		])
			expect(existsSync(join(checkoutRoot, deleted)), deleted).toBe(false);
	});
});

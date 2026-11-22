// The vault policy's module-depth rules (TASK-650, TASK-651, TASK-659):
// `codeCheck.rules` sets the level of each module-depth code to `information`
// or `off`, and refuses any other code or level, the retired `INTERFACE_WIDE`
// with a message that says so, and `off` on `MODULE_SHALLOW` beside the
// shallow-module gate, with the diagnostic that names the entry.

import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultSemanticPolicy } from "#shared/schemas/semantic-policy.ts";
import { readVaultConfiguration } from "#runtime/store/configuration.ts";

const vault = mkdtempSync(join(tmpdir(), "archboard-policy-"));
mkdirSync(join(vault, ".archboard"));
afterAll(() => rmSync(vault, { recursive: true, force: true }));

/**
 * Read a vault whose policy sets the given code check.
 * @param codeCheck The policy's `codeCheck`.
 * @returns What the vault's configuration reads as.
 */
function read(codeCheck: unknown) {
	writeFileSync(
		join(vault, ".archboard", "config.yaml"),
		Bun.YAML.stringify({ ...defaultSemanticPolicy(), codeCheck }),
	);
	return readVaultConfiguration(vault);
}

test("a rule sets a module-depth code to information or off, and information beside the gate is debt mode", () => {
	for (const codeCheck of [
		{ rules: { EXPOSED_VALUE: "information", CODE_PASS_THROUGH: "off", MODULE_SHALLOW: "off" } },
		{ failShallowModules: true, rules: { MODULE_SHALLOW: "information" } },
	] as const) {
		const configuration = read(codeCheck);
		expect(configuration.diagnostics).toEqual([]);
		expect(configuration.configuration.codeCheck).toEqual(codeCheck);
	}
});

test("a rule on another code, a warning level, or off beside the gate is an invalid configuration that names the entry", () => {
	for (const [codeCheck, path] of [
		[{ rules: { RELATIONSHIP_UNDRAWN: "off" } }, "codeCheck.rules.RELATIONSHIP_UNDRAWN"],
		[{ rules: { EXPOSED_VALUE: "warning" } }, "codeCheck.rules.EXPOSED_VALUE"],
		[
			{ failShallowModules: true, rules: { MODULE_SHALLOW: "off" } },
			"codeCheck.rules.MODULE_SHALLOW",
		],
	] as const) {
		const configuration = read(codeCheck);
		expect(configuration.ok, path).toBe(false);
		expect(configuration.diagnostics.map((each) => [each.code, each.path])).toEqual([
			["INVALID_CONFIG", path],
		]);
		// Bundled defaults are active, so no rule from the refused file applies.
		expect(configuration.configuration.codeCheck).toBeUndefined();
	}
});

test("a rule on the retired INTERFACE_WIDE says it is retired and asks for the entry's removal", () => {
	for (const rules of [{ INTERFACE_WIDE: "off" }, { TYPO: "off", INTERFACE_WIDE: "off" }]) {
		const [diagnostic] = read({ rules }).diagnostics;
		expect(diagnostic?.path).toBe("codeCheck.rules.INTERFACE_WIDE");
		expect(diagnostic?.message).toContain("INTERFACE_WIDE is retired");
		expect(diagnostic?.message).toContain("Remove this entry");
	}
});

/**
 * Read a vault whose policy is the default node vocabulary with these fields.
 * @param fields The relationship kinds, lenses and default lens it writes.
 * @returns What the vault's configuration reads as.
 */
function readPolicy(fields: Record<string, unknown>) {
	const { nodeKinds } = defaultSemanticPolicy();
	writeFileSync(
		join(vault, ".archboard", "config.yaml"),
		Bun.YAML.stringify({ nodeKinds, ...fields }),
	);
	return readVaultConfiguration(vault);
}

test("the built-in kinds sit under a vault's own, and a kind the vault adds names its color", () => {
	const own = readPolicy({
		relationshipKinds: {
			sync: { name: "Sync calls", color: "slate" },
			ledger: { name: "Ledger", color: "rose" },
		},
	});
	expect(own.diagnostics).toEqual([]);
	expect(Object.keys(own.configuration.relationshipKinds)).toEqual([
		"sync",
		"async",
		"http",
		"rpc",
		"event",
		"queue",
		"stream",
		"spawn",
		"render",
		"storage",
		"dependency",
		"ledger",
	]);
	expect(own.configuration.relationshipKinds["sync"]?.name).toBe("Sync calls");
	for (const [relationshipKinds, path] of [
		[{ ledger: { name: "Ledger" } }, "relationshipKinds.ledger.color"],
		// A kind's dash and head follow its effect now; only a whole configuration of an older format records one.
		[{ sync: { name: "Sync", dash: "dashed" } }, "relationshipKinds.sync.dash"],
	] as const) {
		const refused = readPolicy({ relationshipKinds });
		expect(refused.diagnostics.map((each) => [each.code, each.path])).toEqual([
			["INVALID_CONFIG", path],
		]);
	}
});

test("a kind or a lens selector that names call is refused, naming sync and async", () => {
	for (const [fields, path] of [
		[{ relationshipKinds: { call: { name: "Calls", color: "slate" } } }, "relationshipKinds.call"],
		[{ lenses: { x: { name: "X", show: [{ kind: "call" }] } } }, "lenses.x.show.0.kind"],
	] as const) {
		const [refused] = readPolicy(fields).diagnostics;
		expect([refused?.code, refused?.path]).toEqual(["INVALID_CONFIG", path]);
		expect(refused?.message).toMatch(/The kind call is gone: use sync .* or async/u);
	}
});

test("lenses validate against the kinds and effects in effect, each refusal at its path", () => {
	const lenses = readPolicy({
		relationshipKinds: { ledger: { name: "Ledger", color: "rose" } },
		defaultLens: "writes",
		lenses: {
			writes: {
				name: "Model writes",
				show: [{ kind: "ledger" }, { kind: "rpc", effect: "mutation" }],
			},
			all: { name: "Everything", hide: [] },
		},
	});
	expect(lenses.diagnostics).toEqual([]);
	expect(lenses.configuration.defaultLens).toBe("writes");
	expect(Object.keys(lenses.configuration.lenses)).toEqual([
		"main",
		"effects",
		"sync-compute",
		"network",
		"reads",
		"dependencies",
		"all",
		"writes",
	]);
	expect(lenses.configuration.lenses["all"]?.name).toBe("Everything");
	expect(readPolicy({}).configuration.defaultLens).toBe("main");
	for (const [fields, path] of [
		[{ lenses: { x: { name: "X", show: [{ kind: "data" }] } } }, "lenses.x.show.0.kind"],
		[{ lenses: { x: { name: "X", hide: [{ effect: "write" }] } } }, "lenses.x.hide.0.effect"],
		[{ lenses: { x: { name: "X", show: [], hide: [] } } }, "lenses.x"],
		[{ lenses: { x: { name: "X", show: [{}] } } }, "lenses.x.show.0"],
		[{ lenses: { all: { name: "All", hide: [{ kind: "sync" }] } } }, "lenses.all"],
		[{ defaultLens: "traffic" }, "defaultLens"],
	] as const) {
		const refused = readPolicy(fields);
		expect(refused.diagnostics.map((each) => [each.code, each.path])).toEqual([
			["INVALID_CONFIG", path],
		]);
	}
});

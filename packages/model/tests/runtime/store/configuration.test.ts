// The vault policy's module-depth rules (TASK-650): `codeCheck.rules` sets the
// level of each module-depth code to `information` or `off`, and refuses any
// other code or level, and a rule on `MODULE_SHALLOW` beside the
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

test("a rule sets a module-depth code to information or off", () => {
	const rules = { EXPOSED_VALUE: "information", CODE_PASS_THROUGH: "off" } as const;
	const configuration = read({ rules });
	expect(configuration.diagnostics).toEqual([]);
	expect(configuration.configuration.codeCheck).toEqual({ rules });
});

test("a rule on another code, a warning level, or MODULE_SHALLOW beside the gate is an invalid configuration that names the entry", () => {
	for (const [codeCheck, path] of [
		[{ rules: { RELATIONSHIP_UNDRAWN: "off" } }, "codeCheck.rules.RELATIONSHIP_UNDRAWN"],
		[{ rules: { EXPOSED_VALUE: "warning" } }, "codeCheck.rules.EXPOSED_VALUE"],
		[
			{ failShallowModules: true, rules: { MODULE_SHALLOW: "information" } },
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

// The vault's module-depth rules on one reading's findings (TASK-650): a rule
// set to `information` caps a finding's level and says that the vault policy
// set it, `off` removes the finding, and every other finding stays as the pass
// found it.

import { expect, test } from "bun:test";
import { ruleFindings } from "#runtime/code-check/operations/depth-rules.ts";
import type { CodeFinding } from "#shared/protocol/code-check.ts";

/**
 * A finding of one code at one level.
 * @param code The code.
 * @param severity The level the pass found.
 * @returns The finding.
 */
function finding(code: string, severity: CodeFinding["severity"]): CodeFinding {
	return { code, severity, file: "timing.module.json", message: `${code} found.` };
}

const found = [
	finding("EXPOSED_VALUE", "warning"),
	finding("EXPOSED_UNUSED", "information"),
	finding("CODE_PASS_THROUGH", "information"),
	finding("MODULE_SHALLOW", "information"),
	finding("RELATIONSHIP_UNDRAWN", "warning"),
];

test("a rule set to information lowers a finding and says the vault policy set it, and off removes one", () => {
	const ruled = ruleFindings(found, {
		EXPOSED_VALUE: "information",
		EXPOSED_UNUSED: "information",
		CODE_PASS_THROUGH: "off",
	});
	expect(ruled.map((each) => [each.code, each.severity])).toEqual([
		["EXPOSED_VALUE", "information"],
		["EXPOSED_UNUSED", "information"],
		["MODULE_SHALLOW", "information"],
		["RELATIONSHIP_UNDRAWN", "warning"],
	]);
	const [lowered, already, rollUp, other] = ruled;
	expect(lowered?.message).not.toBe(found[0]?.message);
	expect(lowered?.message).toContain("vault policy");
	// A finding the rule does not lower, and one no rule names, keep their message.
	expect(already?.message).toBe(found[1]?.message);
	expect(rollUp).toEqual(found[3]);
	expect(other).toEqual(found[4]);
});

test("without rules, every finding stays as the pass found it", () => {
	expect(ruleFindings(found, undefined)).toEqual(found);
});

// The verdicts on a module as a whole (TASK-651, ADR 0082): `INTERFACE_WIDE`
// on more than 20 names that are not types, and `MODULE_SHALLOW` on a module
// the roll-up names or one with at least 8 such names and fewer than 4 pieces
// of logic behind each, once, with the evidence that applies. Both are
// warnings. The width needs every name in a judged language, and the measured
// ground of `MODULE_SHALLOW` also needs every file parsed whole.

import { expect, test } from "bun:test";
import { moduleFindings } from "#runtime/module-depth/operations/module-measure.ts";

/** A module of functions only, measured from a complete reading. */
const measure = {
	label: 'module "Timing"',
	exports: { functions: 0, classes: 0, methods: 0, values: 0, types: 0 },
	logic: 0,
	supported: true,
	complete: true,
	rolledUp: undefined,
};

/**
 * The codes and levels of the findings on a module.
 * @param change What differs from a module of no exports.
 * @returns Each finding's code and level.
 */
function verdicts(change: Partial<Parameters<typeof moduleFindings>[0]>): string[] {
	const { findings } = moduleFindings({ ...measure, ...change });
	return findings.map((each) => `${each.code} ${each.severity}`);
}

/**
 * Exports of each kind.
 * @param functions Functions.
 * @param others Classes, methods, values and types.
 * @returns The counts.
 */
function counts(functions: number, others: Partial<typeof measure.exports> = {}) {
	return { ...measure.exports, functions, ...others };
}

test("more than 20 names that are not types make a wide interface, a warning that gives the counts", () => {
	expect(verdicts({ exports: counts(20), logic: 1000 })).toEqual([]);
	expect(
		verdicts({ exports: counts(18, { classes: 1, methods: 1, values: 1 }), logic: 1000 }),
	).toEqual(["INTERFACE_WIDE warning"]);
	const [wide] = moduleFindings({
		...measure,
		exports: counts(19, { values: 2 }),
		logic: 1000,
	}).findings;
	expect(wide?.message).toContain("21");
	expect(wide?.message).toContain("19");
});

test("at least 8 names with fewer than 4 pieces of logic behind each make a module shallow, a warning", () => {
	expect(verdicts({ exports: counts(8), logic: 31 })).toEqual(["MODULE_SHALLOW warning"]);
	expect(verdicts({ exports: counts(8), logic: 32 })).toEqual([]);
	expect(verdicts({ exports: counts(7), logic: 0 })).toEqual([]);
});

test("exported types never count toward the width", () => {
	expect(verdicts({ exports: counts(1, { types: 100 }), logic: 4 })).toEqual([]);
});

test("the roll-up and the measure make one shallow finding with the evidence of both", () => {
	const both = moduleFindings({
		...measure,
		exports: counts(8),
		logic: 0,
		rolledUp: ["a", "b"],
	}).findings;
	expect(both.map((each) => each.code)).toEqual(["MODULE_SHALLOW"]);
	expect(both[0]?.message).toContain("a, b");
	expect(both[0]?.message).toContain("8");
	expect(verdicts({ exports: counts(1), logic: 100, rolledUp: ["a"] })).toEqual([
		"MODULE_SHALLOW warning",
	]);
});

test("names in a language no adapter judges leave no measured verdict, and keep the roll-up", () => {
	expect(verdicts({ exports: counts(30), logic: 0, supported: false })).toEqual([]);
	expect(verdicts({ exports: counts(30), logic: 0, supported: false, rolledUp: ["a"] })).toEqual([
		"MODULE_SHALLOW warning",
	]);
});

test("a file that did not parse keeps the wide interface, since the exports are known, and withholds only a shallow verdict the counted logic would give", () => {
	expect(verdicts({ exports: counts(30), logic: 0, complete: false })).toEqual([
		"INTERFACE_WIDE warning",
	]);
	const withheld = (exports: typeof measure.exports, logic: number) =>
		moduleFindings({ ...measure, exports, logic, complete: false }).withheld;
	expect(withheld(counts(8), 31)).toBe(true);
	// More logic than the measure asks for is deep whatever the rest of the file holds.
	expect(withheld(counts(8), 32)).toBe(false);
	expect(withheld(counts(7), 0)).toBe(false);
	expect(moduleFindings({ ...measure, exports: counts(8), logic: 31 }).withheld).toBe(false);
});

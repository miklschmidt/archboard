// The verdict on a module as a whole (TASK-651, TASK-659, ADR 0082):
// `MODULE_SHALLOW`, a warning, on a module the roll-up names or one whose W > 0
// names hide fewer than 4W pieces of logic, once, with the evidence that
// applies. No width exempts a module or caps it. The measured ground needs
// every name in a judged language and every file parsed whole, and a key no
// type closes withholds the verdict it would flip.

import { expect, test } from "bun:test";
import {
	moduleFindings,
	type ModuleMeasure,
} from "#runtime/module-depth/operations/module-measure.ts";

/** A module with no names, measured from a complete reading. */
const measure: ModuleMeasure = {
	label: 'module "Timing"',
	width: 0,
	logic: 0,
	widened: [],
	supported: true,
	complete: true,
	rolledUp: undefined,
};

/**
 * The codes and levels of the findings on a module.
 * @param change What differs from a module of no names.
 * @returns Each finding's code and level.
 */
function verdicts(change: Partial<ModuleMeasure>): string[] {
	const { findings } = moduleFindings({ ...measure, ...change });
	return findings.map((each) => `${each.code} ${each.severity}`);
}

test("fewer than 4 pieces of logic behind each name make a module shallow at any width, and equality passes", () => {
	expect(verdicts({ width: 4, logic: 15 })).toEqual(["MODULE_SHALLOW warning"]);
	expect(verdicts({ width: 4, logic: 16 })).toEqual([]);
	expect(verdicts({ width: 1, logic: 3 })).toEqual(["MODULE_SHALLOW warning"]);
	expect(verdicts({ width: 0, logic: 0 })).toEqual([]);
	const [finding] = moduleFindings({ ...measure, width: 4, logic: 15 }).findings;
	expect(finding?.message).toContain("its 4 names have 15 pieces of logic behind them, 3.75 each, below 4");
});

test("a wide module deep enough passes", () => {
	expect(verdicts({ width: 140, logic: 560 })).toEqual([]);
});

test("the shallow finding names each switchboard and the keys of each operation it picks", () => {
	const [finding] = moduleFindings({
		...measure,
		width: 6,
		logic: 10,
		widened: [{ name: "change", operations: [["claim"], ["release", "drop"], ["takeBack"]] }],
	}).findings;
	expect(finding?.message).toContain("change picks 3 by its key (claim, release or drop, takeBack)");
});

test("the roll-up and the measure make one shallow finding with the evidence of both", () => {
	const both = moduleFindings({ ...measure, width: 8, logic: 0, rolledUp: ["a", "b"] }).findings;
	expect(both.map((each) => each.code)).toEqual(["MODULE_SHALLOW"]);
	expect(both[0]?.message).toContain("a, b");
	expect(both[0]?.message).toContain("8");
	expect(verdicts({ width: 1, logic: 100, rolledUp: ["a"] })).toEqual(["MODULE_SHALLOW warning"]);
});

test("names in a language no adapter judges leave no measured verdict, and keep the roll-up", () => {
	expect(verdicts({ width: 30, logic: 0, supported: false })).toEqual([]);
	expect(verdicts({ width: 30, logic: 0, supported: false, rolledUp: ["a"] })).toEqual([
		"MODULE_SHALLOW warning",
	]);
});

test("a file that did not parse withholds only a shallow verdict the counted logic would give", () => {
	const withheld = (width: number, logic: number) =>
		moduleFindings({ ...measure, width, logic, complete: false }).withheld;
	expect(verdicts({ width: 8, logic: 0, complete: false })).toEqual([]);
	expect(withheld(8, 31)).toBe(true);
	// More logic than the measure asks for is deep whatever the rest of the file holds.
	expect(withheld(8, 32)).toBe(false);
	expect(moduleFindings({ ...measure, width: 8, logic: 31 }).withheld).toBe(false);
});

test("a key no type closes withholds the verdict only where counting its operations would make the module shallow", () => {
	const gaps = (unresolved: ModuleMeasure["unresolved"], logic = 20) =>
		moduleFindings({ ...measure, width: 5, logic, ...(unresolved ? { unresolved } : {}) });
	const flips = gaps({ width: 7, logic: 19, gaps: ["pick: Kind"] });
	expect(flips.findings).toEqual([]);
	expect(flips.gaps).toEqual(["pick: Kind"]);
	expect(gaps({ width: 5, logic: 20, gaps: ["pick: Kind"] }).gaps).toEqual([]);
	// A module shallow without the key stays shallow with it, so nothing is withheld.
	const shallow = gaps({ width: 7, logic: 10, gaps: ["pick: Kind"] }, 10);
	expect(shallow.findings.map((each) => each.code)).toEqual(["MODULE_SHALLOW"]);
	expect(shallow.gaps).toEqual([]);
});

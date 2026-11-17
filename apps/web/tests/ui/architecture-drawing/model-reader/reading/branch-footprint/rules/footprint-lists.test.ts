import { expect, test } from "bun:test";
import type { BranchFootprintAnswer } from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";
import {
	footprintLists,
	type FootprintSkip,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/footprint-lists.ts";

const ANSWER: BranchFootprintAnswer = {
	success: true,
	analysis: "footprint",
	vaultRead: { at: "checkout" },
	model: "Shop",
	state: { id: "Plan", name: "Plan", lifecycle: "draft" },
	revision: { digest: "a".repeat(64), files: [] },
	base: "main",
	against: { id: "Current", name: "Current" },
	proposal: { id: "Plan", name: "Plan" },
	repositories: [],
	commits: [],
	skipped: [],
	unboundFiles: [],
	namedAndChanged: [],
	changedNotNamed: [],
	namedNotChanged: [],
	preexisting: [],
};

/**
 * An unread bound module, either planned or outside the plan.
 * @param named Whether the proposal names it.
 * @returns The skipped module.
 */
function skipped(named: boolean): FootprintSkip {
	return {
		subject: { kind: "node", id: "Shop#Worker", name: "Worker" },
		repo: "example/shop",
		reason: "head-unresolved",
		named: named ? [{ by: "part", status: "changed" }] : [],
	};
}

/**
 * Which lists lack relevant evidence.
 * @param unread The modules that the read skipped.
 * @returns Each list's unread status.
 */
function states(unread: readonly FootprintSkip[]): readonly boolean[] {
	return footprintLists({ ...ANSWER, skipped: [...unread] }).map((list) => list.unread);
}

test("empty outcomes remain incomplete only for lists whose modules were not read", () => {
	expect(states([])).toEqual([false, false, false]);
	expect(states([skipped(true)])).toEqual([true, false, true]);
	expect(states([skipped(false)])).toEqual([false, true, false]);
	expect(states([skipped(true), skipped(false)])).toEqual([true, true, true]);
});

test("an empty unproposed footprint cannot claim no change when modules were not read", () => {
	const answer: BranchFootprintAnswer = { ...ANSWER, proposal: null, changed: [] };
	expect(footprintLists(answer)[0]?.unread).toBe(false);
	expect(footprintLists({ ...answer, skipped: [skipped(false)] })[0]?.unread).toBe(true);
});

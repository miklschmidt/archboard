import { describe, expect, test } from "bun:test";

import { isCoordinatorOwned, planQueueReorder } from "@/ui/workbench-queue";
import type {
	WorkbenchQueueEntry,
	WorkbenchQueueReorderMove,
} from "@/ui/workbench-queue/contracts";
import { entry, nameOf, submission } from "@/ui/workbench-queue/tests/support";

/**
 * Entries from a shape: c = coordinator-owned, f = foreign.
 * @param shape The shape.
 * @returns The entries.
 */
function entries(shape: string): WorkbenchQueueEntry[] {
	return shape
		.split("")
		.map((mark, index) => entry({ id: `${mark}${index + 1}`, owned: mark !== "f" }));
}

/**
 * The planned order, or the refusal.
 * @param shape The shape.
 * @param id The submission to move.
 * @param move The move.
 * @returns The ordered names, or the reason.
 */
function order(
	shape: string,
	id: string,
	move: WorkbenchQueueReorderMove,
): readonly string[] | string {
	const plan = planQueueReorder(entries(shape), submission(id), move);
	return plan.moved ? plan.orderedSubmissionIds.map(nameOf) : plan.reason;
}

const STEP_LATER = { kind: "step", direction: "later" } as const;
const STEP_EARLIER = { kind: "step", direction: "earlier" } as const;

describe("coordinator ownership", () => {
	test("an entry with no coordinator operation is foreign", () => {
		expect(isCoordinatorOwned(entry({ id: "a" }))).toBe(true);
		expect(isCoordinatorOwned(entry({ id: "b", owned: false }))).toBe(false);
	});
});

describe("queue reorder planning", () => {
	test("submits every submission id, not just the moved one", () => {
		const plan = planQueueReorder(entries("ccc"), submission("c1"), STEP_LATER);

		expect(plan.moved).toBe(true);
		if (!plan.moved) {
			throw new Error("expected a plan");
		}
		expect(plan.orderedSubmissionIds).toHaveLength(3);
		expect(plan.orderedSubmissionIds.map(nameOf).toSorted()).toEqual(["c1", "c2", "c3"]);
		expect(plan.fromPosition).toBe(1);
		expect(plan.toPosition).toBe(2);
	});

	test("moves a coordinator entry one coordinator slot at a time", () => {
		expect(order("ccc", "c1", STEP_LATER)).toEqual(["c2", "c1", "c3"]);
		expect(order("ccc", "c3", STEP_EARLIER)).toEqual(["c1", "c3", "c2"]);
	});

	test("steps past a foreign entry without moving it", () => {
		expect(order("cfc", "c1", STEP_LATER)).toEqual(["c3", "f2", "c1"]);
		expect(order("cfc", "c3", STEP_EARLIER)).toEqual(["c3", "f2", "c1"]);
	});

	test("preserves the relative order of every foreign entry", () => {
		const shape = "fccfcf";
		const before = entries(shape)
			.filter((item) => !isCoordinatorOwned(item))
			.map((item) => nameOf(item.submissionId));
		const moved = order(shape, "c5", { kind: "drop", position: 2 });

		expect(Array.isArray(moved)).toBe(true);
		if (!Array.isArray(moved)) {
			throw new Error("expected a plan");
		}
		expect(moved.filter((id) => id.startsWith("f"))).toEqual(before);
		expect(moved).toEqual(["f1", "c5", "c2", "f4", "c3", "f6"]);
	});

	test("a pointer drop lands on the nearest coordinator slot in either direction", () => {
		expect(order("cccc", "c1", { kind: "drop", position: 4 })).toEqual(["c2", "c3", "c1", "c4"]);
		expect(order("cccc", "c1", { kind: "drop", position: 5 })).toEqual(["c2", "c3", "c4", "c1"]);
		expect(order("cccc", "c4", { kind: "drop", position: 1 })).toEqual(["c4", "c1", "c2", "c3"]);
		expect(order("cfcfc", "c5", { kind: "drop", position: 1 })).toEqual([
			"c5",
			"f2",
			"c1",
			"f4",
			"c3",
		]);
	});

	test("refuses to move a foreign entry", () => {
		expect(order("cfc", "f2", STEP_EARLIER)).toBe(
			"Only a submission this coordinator queued can be reordered.",
		);
	});

	test("refuses a submission the authoritative queue is not holding", () => {
		expect(order("ccc", "missing", STEP_LATER)).toBe(
			"That submission is not in the authoritative queue.",
		);
	});

	test("refuses when there is no other coordinator entry to move past", () => {
		expect(order("cff", "c1", STEP_LATER)).toBe(
			"There is no other coordinator-owned submission to move this one past.",
		);
	});

	test("refuses a step off either end and a drop that changes nothing", () => {
		expect(order("ccc", "c1", STEP_EARLIER)).toBe(
			"This submission is already the first coordinator-owned entry.",
		);
		expect(order("ccc", "c3", STEP_LATER)).toBe(
			"This submission is already the last coordinator-owned entry.",
		);
		expect(order("ccc", "c2", { kind: "drop", position: 2 })).toBe(
			"This submission is already in that place.",
		);
	});

	test("never mutates the authoritative entries it was given", () => {
		const authoritative = entries("cfc");
		const before = authoritative.map((item) => nameOf(item.submissionId));

		planQueueReorder(authoritative, submission("c1"), STEP_LATER);

		expect(authoritative.map((item) => nameOf(item.submissionId))).toEqual(before);
	});
});

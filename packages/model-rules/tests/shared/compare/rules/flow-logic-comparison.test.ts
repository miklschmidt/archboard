import { describe, expect, test } from "bun:test";
import type { FlowStep } from "@archboard/model-contract";
import { compareVariants } from "@archboard/model-rules";
import { contentOf as content } from "#tests/shared/support/fixture-orders.ts";

const CLI = { id: "cl", name: "CLI", kind: "app" };
const SERVER = { id: "sv", name: "Server", kind: "service" };
const STORE = { id: "st", name: "Store", kind: "datastore" };

const ASK = { id: "s1", from: "cl", to: "sv", label: "edit", kind: "sync" };
const HELD = { id: "s2", from: "sv", to: "cl", label: "LEASE_HELD", kind: "return" };
const WRITE = { id: "s3", from: "sv", to: "st", label: "write", kind: "sync" };
const DONE = { id: "s4", from: "sv", to: "cl", label: "new version", kind: "return" };

/**
 * A decision on the lease, its "no" side writing each variant in a loop.
 * @param yes The steps on "yes".
 * @param no The steps on "no", before the loop.
 * @returns The decision.
 */
const leaseDecision = (yes: readonly unknown[], no: readonly unknown[]): unknown => ({
	id: "d1",
	kind: "decision",
	question: "Is the lease held?",
	alternatives: [
		{ label: "yes", steps: yes },
		{
			label: "no",
			steps: [
				...no,
				{ id: "l1", kind: "loop", condition: "for each variant", steps: [WRITE] },
				DONE,
			],
		},
	],
});

/**
 * One flow holding the given steps.
 * @param steps Its steps.
 * @returns The content.
 */
const flowing = (steps: readonly unknown[]) =>
	content({
		nodes: [CLI, SERVER, STORE],
		edges: [],
		flows: [{ id: "f1", name: "One edit", participants: ["cl", "sv", "st"], steps }],
	});

const TOLD = flowing([ASK, leaseDecision([HELD], [])]);

/**
 * Every step id of a tree, in document order.
 * @param steps The tree.
 * @returns The ids.
 */
const ids = (steps: readonly FlowStep[]): string[] =>
	steps.flatMap((step) => [
		step.id,
		...(step.kind === "decision" ? step.alternatives.flatMap((one) => ids(one.steps)) : []),
		...(step.kind === "loop" ? ids(step.steps) : []),
	]);

describe("comparing a flow's logic", () => {
	test("a step moved into the other alternative has moved", () => {
		const after = flowing([ASK, leaseDecision([], [HELD])]);
		const comparison = compareVariants(TOLD, after);
		expect(comparison.steps.get("s2")?.kind).toBe("changed");
		expect(comparison.steps.get("s2")?.fields.map((one) => one.field)).toContain("within");
		// The decision itself said nothing new.
		expect(comparison.steps.get("d1")?.kind).toBe("unchanged");
	});

	test("a reworded question changes the decision and none of its steps", () => {
		const reworded = { ...(leaseDecision([HELD], []) as object), question: "Who holds it?" };
		const comparison = compareVariants(TOLD, flowing([ASK, reworded]));
		expect(comparison.steps.get("d1")?.fields.map((one) => one.field)).toEqual(["question"]);
		expect(comparison.steps.get("s3")?.kind).toBe("unchanged");
	});

	test("a step taken out of a loop is put back inside that loop to be drawn", () => {
		const emptied = {
			id: "d1",
			kind: "decision",
			question: "Is the lease held?",
			alternatives: [
				{ label: "yes", steps: [HELD] },
				{ label: "no", steps: [DONE] },
			],
		};
		const after = flowing([ASK, emptied]);
		const comparison = compareVariants(TOLD, after);
		expect(comparison.steps.get("s3")?.kind).toBe("removed");
		expect(comparison.steps.get("l1")?.kind).toBe("removed");
		const drawn = compareVariants(TOLD, after, { kind: "all" }).content.flows[0]!.steps;
		expect(ids(drawn)).toEqual(ids(TOLD.flows[0]!.steps));
	});
});

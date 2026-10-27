import { describe, expect, test } from "bun:test";
import { NewStepSchema } from "#shared/schemas/model-flows.ts";
import { compareVariants, withRemoved } from "#shared/rules/compare/variants.ts";
import { DiagramGrammarSchema } from "#shared/schemas/vocabulary.ts";
import { reconcileVariant } from "#shared/rules/reconcile/variant.ts";
import { VariantContentSchema, type VariantContent } from "#shared/schemas/content.ts";
import { type FlowStep } from "#shared/schemas/views.ts";
import { withFixtureOrders } from "#tests/shared/support/fixture-orders.ts";

/**
 * A variant's content as a document holds it.
 * @param stated What is on it.
 * @returns The content.
 */
const content = (stated: Record<string, unknown>): VariantContent =>
	VariantContentSchema.parse(withFixtureOrders(stated));

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
const flowing = (steps: readonly unknown[]): VariantContent =>
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

describe("what a flow's logic must say to be written", () => {
	const message = { from: "CLI", to: "Server", label: "edit" };

	test("a decision, a loop and a message without a kind are all steps", () => {
		const decision = NewStepSchema.safeParse({
			kind: "decision",
			question: "Held?",
			alternatives: [
				{ label: "yes", steps: [message] },
				{ label: "no", steps: [] },
			],
		});
		const loop = NewStepSchema.safeParse({
			kind: "loop",
			condition: "for each",
			steps: [message],
		});
		expect(decision.success).toBe(true);
		expect(loop.success).toBe(true);
		expect(NewStepSchema.safeParse(message).success).toBe(true);
	});

	test.each([
		["one alternative", [{ label: "yes", steps: [message] }]],
		[
			"two alternatives with one label",
			[
				{ label: "yes", steps: [message] },
				{ label: "yes", steps: [] },
			],
		],
		[
			"alternatives that hold no step",
			[
				{ label: "yes", steps: [] },
				{ label: "no", steps: [] },
			],
		],
	])("a decision with %s is refused", (_case, alternatives) => {
		const parsed = NewStepSchema.safeParse({ kind: "decision", question: "?", alternatives });
		expect(parsed.success).toBe(false);
	});

	test("a loop that repeats nothing is refused", () => {
		const parsed = NewStepSchema.safeParse({ kind: "loop", condition: "while", steps: [] });
		expect(parsed.success).toBe(false);
	});

	test("the old grammar name is refused, and the refusal names the new one", () => {
		const parsed = DiagramGrammarSchema.safeParse("data-flow");
		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0]?.message).toContain('"sequence"');
		expect(DiagramGrammarSchema.safeParse("flowchart").success).toBe(true);
	});
});

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
		const drawn = withRemoved(TOLD, after, comparison).flows[0]!.steps;
		expect(ids(drawn)).toEqual(ids(TOLD.flows[0]!.steps));
	});
});

describe("reconciling a flow's logic", () => {
	test("a step one side added inside an alternative lands there beside the other side's change", () => {
		const added = { id: "a1", from: "sv", to: "sv", label: "log", kind: "self" };
		const reworded = { ...(leaseDecision([HELD], []) as object), question: "Who holds it?" };
		const settled = reconcileVariant({
			base: TOLD,
			mine: flowing([ASK, reworded]),
			theirs: flowing([ASK, leaseDecision([HELD, added], [])]),
		});
		expect(settled.issues).toEqual([]);
		const decision = settled.content.flows[0]!.steps[1]!;
		expect(decision.kind === "decision" && decision.question).toBe("Who holds it?");
		expect(decision.kind === "decision" && ids(decision.alternatives[0]!.steps)).toEqual([
			"s2",
			"a1",
		]);
	});

	test("two removals that empty a loop are reported, not written", () => {
		const twice = { id: "l1", kind: "loop", condition: "for each variant", steps: [WRITE, DONE] };
		const base = flowing([ASK, twice]);
		const settled = reconcileVariant({
			base,
			mine: flowing([ASK, { ...twice, steps: [WRITE] }]),
			theirs: flowing([ASK, { ...twice, steps: [DONE] }]),
		});
		expect(settled.issues.some((issue) => issue.kind === "left-empty")).toBe(true);
		expect(VariantContentSchema.safeParse(settled.content).success).toBe(true);
	});
});

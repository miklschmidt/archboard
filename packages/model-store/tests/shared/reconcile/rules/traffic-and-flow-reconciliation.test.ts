import { describe, expect, test } from "bun:test";
import { type FlowStep, parseDocument, type VariantContent } from "@archboard/model-contract";
import { reconcileVariant } from "#shared/reconcile/rules/variant.ts";

/**
 * A variant's content as a document holds it, its nodes and edges ordered as listed.
 * @param stated What is on it.
 * @returns The content.
 */
function content(stated: {
	readonly nodes: readonly Record<string, unknown>[];
	readonly edges: readonly Record<string, unknown>[];
	readonly flows?: readonly Record<string, unknown>[];
}): VariantContent {
	const ordered = (list: readonly Record<string, unknown>[]) =>
		list.map((one, index) => ({ order: (index + 1) * 1000, ...one }));
	const read = parseDocument("variantContent", {
		...stated,
		nodes: ordered(stated.nodes),
		edges: ordered(stated.edges),
	});
	if (read.success) return read.data;
	throw read.error instanceof Error ? read.error : new Error(JSON.stringify(read.error));
}

const defaults = (() => {
	const read = parseDocument("edgeTraffic", {});
	if (!read.success) throw read.error;
	return read.data;
})();

describe("traffic in reconciliation", () => {
	const NODES = [
		{ id: "api", name: "API", kind: "service" },
		{ id: "db", name: "Database", kind: "datastore" },
	];
	const EDGE = { id: "call", from: "api", to: "db", kind: "call", emphasis: "normal" };
	const holding = (edge: Record<string, unknown>) => content({ nodes: NODES, edges: [edge] });

	test("inherits a predecessor traffic change", () => {
		const base = holding(EDGE);
		const mine = holding({ ...EDGE, label: "reads" });
		const theirs = holding({ ...EDGE, traffic: { speed: 64, volume: 1 } });
		const result = reconcileVariant({ base, mine, theirs });
		expect(result.issues).toEqual([]);
		expect(result.content.edges[0]).toMatchObject({
			label: "reads",
			traffic: { speed: 64, volume: 1 },
		});
	});

	test("holds independently changed traffic as one competing field", () => {
		const base = holding({ ...EDGE, traffic: {} });
		const mine = holding({ ...EDGE, traffic: { speed: 120 } });
		const theirs = holding({ ...EDGE, traffic: { volume: 2 } });
		const result = reconcileVariant({ base, mine, theirs });
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]).toMatchObject({
			subject: "call",
			kind: "competing-field",
			field: "traffic",
		});
		expect(result.content.edges[0]?.traffic).toEqual({
			speed: 120,
			volume: defaults.volume,
		});
	});
});

describe("reconciling a flow's logic", () => {
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
	const leaseDecision = (yes: readonly unknown[], no: readonly unknown[]): object => ({
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

	const TOLD = flowing([ASK, leaseDecision([HELD], [])]);

	test("a step one side added inside an alternative lands there beside the other side's change", () => {
		const added = { id: "a1", from: "sv", to: "sv", label: "log", kind: "self" };
		const reworded = { ...leaseDecision([HELD], []), question: "Who holds it?" };
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
		expect(parseDocument("variantContent", settled.content).success).toBe(true);
	});
});

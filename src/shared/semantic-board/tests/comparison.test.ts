import { describe, expect, test } from "bun:test";
import {
	compareVariants,
	standingOf,
	withRemoved,
	VariantContentSchema,
	type VariantContent,
} from "@/shared/semantic-board/index";

/**
 * A variant's content, stated as an agent's document would hold it.
 * @param stated What is on it.
 * @returns The parsed content.
 */
const content = (stated: Record<string, unknown>): VariantContent =>
	VariantContentSchema.parse(stated);

const GATEWAY = { id: "gw", name: "Gateway", kind: "service" };
const ORDERS = { id: "or", name: "Orders", kind: "service" };
const WIRE = { id: "w1", from: "gw", to: "or", kind: "http", emphasis: "normal" };

const BASELINE = content({ nodes: [GATEWAY, ORDERS], edges: [WIRE] });

describe("what a proposal changed about the variant it came from", () => {
	test("a node that keeps its id through a rename is a rename, not a replacement", () => {
		const after = content({ nodes: [GATEWAY, { ...ORDERS, name: "Order intake" }], edges: [WIRE] });
		const comparison = compareVariants(BASELINE, after);
		expect(comparison.nodes.get("or")?.kind).toBe("changed");
		expect(comparison.nodes.get("or")?.fields).toEqual([
			{ field: "name", before: "Orders", after: "Order intake" },
		]);
		// And nothing else moved.
		expect(comparison.nodes.get("gw")?.kind).toBe("unchanged");
		expect(comparison.edges.get("w1")?.kind).toBe("unchanged");
	});

	test("the same node with a fresh id is a removal standing beside an addition", () => {
		const after = content({ nodes: [GATEWAY, { ...ORDERS, id: "o2" }], edges: [] });
		const comparison = compareVariants(BASELINE, after);
		expect(comparison.nodes.get("or")?.kind).toBe("removed");
		expect(comparison.nodes.get("o2")?.kind).toBe("added");
	});

	test("changing a relationship does not badge the things it connects", () => {
		const after = content({
			nodes: [GATEWAY, ORDERS],
			edges: [{ ...WIRE, kind: "queue", label: "batched" }],
		});
		const comparison = compareVariants(BASELINE, after);
		expect(comparison.edges.get("w1")?.kind).toBe("changed");
		expect(comparison.edges.get("w1")?.fields.map((one) => one.field)).toEqual(["kind", "label"]);
		expect(comparison.nodes.get("gw")?.kind).toBe("unchanged");
		expect(comparison.nodes.get("or")?.kind).toBe("unchanged");
	});

	test("putting a node inside a container does not badge the container", () => {
		const before = content({ nodes: [GATEWAY, ORDERS], edges: [] });
		const after = content({
			nodes: [GATEWAY, ORDERS, { id: "in", name: "Intake", kind: "module", parent: "or" }],
			edges: [],
		});
		const comparison = compareVariants(before, after);
		expect(comparison.nodes.get("in")?.kind).toBe("added");
		expect(comparison.nodes.get("or")?.kind).toBe("unchanged");
	});

	test("moving a node into a different container is a change to that node alone", () => {
		const before = content({
			nodes: [GATEWAY, ORDERS, { id: "in", name: "Intake", kind: "module", parent: "or" }],
			edges: [],
		});
		const after = content({
			nodes: [GATEWAY, ORDERS, { id: "in", name: "Intake", kind: "module", parent: "gw" }],
			edges: [],
		});
		const comparison = compareVariants(before, after);
		expect(comparison.nodes.get("in")?.fields).toEqual([
			{ field: "parent", before: "or", after: "gw" },
		]);
		expect(comparison.nodes.get("or")?.kind).toBe("unchanged");
		expect(comparison.nodes.get("gw")?.kind).toBe("unchanged");
	});
});

describe("what is not a change to the architecture", () => {
	test("a relationship asking for more attention is not a redesign", () => {
		const after = content({ nodes: [GATEWAY, ORDERS], edges: [{ ...WIRE, emphasis: "hero" }] });
		const comparison = compareVariants(BASELINE, after);
		expect(comparison.edges.get("w1")?.kind).toBe("unchanged");
	});
});

describe("flows and their steps", () => {
	const FLOW = {
		id: "f1",
		name: "One order",
		participants: ["gw", "or"],
		steps: [
			{ id: "s1", from: "gw", to: "or", label: "place", kind: "sync" },
			{ id: "s2", from: "or", to: "gw", label: "accepted", kind: "return" },
		],
	};
	const WITH_FLOW = content({ nodes: [GATEWAY, ORDERS], edges: [WIRE], flows: [FLOW] });

	test("a step keeps its identity through a rewording, and says what else moved", () => {
		const after = content({
			nodes: [GATEWAY, ORDERS],
			edges: [WIRE],
			flows: [{ ...FLOW, steps: [FLOW.steps[1], { ...FLOW.steps[0], label: "place an order" }] }],
		});
		const comparison = compareVariants(WITH_FLOW, after);
		expect(comparison.steps.get("s1")?.kind).toBe("changed");
		expect(comparison.steps.get("s1")?.fields).toEqual([
			{ field: "label", before: "place", after: "place an order" },
			{ field: "position", before: 1, after: 2 },
		]);
	});

	test("a step taken out of a flow is removed, and a new one is added", () => {
		const after = content({
			nodes: [GATEWAY, ORDERS],
			edges: [WIRE],
			flows: [{ ...FLOW, steps: [{ id: "s3", from: "gw", to: "or", label: "cancel" }] }],
		});
		const comparison = compareVariants(WITH_FLOW, after);
		expect(comparison.steps.get("s1")?.kind).toBe("removed");
		expect(comparison.steps.get("s2")?.kind).toBe("removed");
		expect(comparison.steps.get("s3")?.kind).toBe("added");
		// The flow itself changed only if its own fields did; its steps are not it.
		expect(comparison.flows.get("f1")?.kind).toBe("unchanged");
	});
});

describe("what a proposal takes away", () => {
	test("a removed subject is returned from the baseline and never written into the proposal", () => {
		const after = content({ nodes: [GATEWAY], edges: [] });
		const comparison = compareVariants(BASELINE, after);
		expect(comparison.nodes.get("or")?.kind).toBe("removed");
		expect(comparison.nodes.get("or")?.entity.name).toBe("Orders");

		// The proposal itself still says only what it proposes.
		expect(after.nodes.map((node) => node.id)).toEqual(["gw"]);

		// The depiction puts the removed subjects back, from the baseline alone.
		const drawn = withRemoved(BASELINE, after, comparison);
		expect(drawn.nodes.map((node) => node.id).toSorted()).toEqual(["gw", "or"]);
		expect(drawn.edges.map((edge) => edge.id)).toEqual(["w1"]);
		expect(standingOf(comparison, "or")).toBe("removed");
		expect(standingOf(comparison, "gw")).toBe("unchanged");
	});

	test("a subject neither variant has is not something the comparison invented", () => {
		expect(standingOf(compareVariants(BASELINE, BASELINE), "nothere")).toBe("unchanged");
	});
});

describe("an ordered exchange", () => {
	const STEPS = [
		{ id: "s1", from: "gw", to: "or", label: "place", kind: "sync" },
		{ id: "s2", from: "or", to: "gw", label: "accepted", kind: "return" },
	];
	const FLOW = { id: "f1", name: "One order", participants: ["gw", "or"], steps: STEPS };
	const TOLD = content({ nodes: [GATEWAY, ORDERS], edges: [WIRE], flows: [FLOW] });

	test("swapping two steps changes what the flow says happens", () => {
		const after = content({
			nodes: [GATEWAY, ORDERS],
			edges: [WIRE],
			flows: [{ ...FLOW, steps: [STEPS[1], STEPS[0]] }],
		});
		const comparison = compareVariants(TOLD, after);
		expect(comparison.steps.get("s1")?.kind).toBe("changed");
		expect(comparison.steps.get("s1")?.fields).toEqual([
			{ field: "position", before: 1, after: 2 },
		]);
		expect(comparison.steps.get("s2")?.fields).toEqual([
			{ field: "position", before: 2, after: 1 },
		]);
	});

	test("moving a step into another conversation is a change to that step", () => {
		const before = content({
			nodes: [GATEWAY, ORDERS],
			edges: [WIRE],
			flows: [
				FLOW,
				{
					id: "f2",
					name: "A refund",
					participants: ["gw", "or"],
					steps: [{ id: "s3", from: "gw", to: "or", label: "refund" }],
				},
			],
		});
		const after = content({
			nodes: [GATEWAY, ORDERS],
			edges: [WIRE],
			flows: [
				{ ...FLOW, steps: [STEPS[0]] },
				{
					id: "f2",
					name: "A refund",
					participants: ["gw", "or"],
					steps: [{ id: "s3", from: "gw", to: "or", label: "refund" }, STEPS[1]],
				},
			],
		});
		const comparison = compareVariants(before, after);
		// It is second in both flows, so only which conversation tells it moved.
		expect(comparison.steps.get("s2")?.fields).toEqual([
			{ field: "flow", before: "f1", after: "f2" },
		]);
	});

	test("reordering a flow's columns is how it is drawn, not what it says", () => {
		const after = content({
			nodes: [GATEWAY, ORDERS],
			edges: [WIRE],
			flows: [{ ...FLOW, participants: ["or", "gw"] }],
		});
		expect(compareVariants(TOLD, after).flows.get("f1")?.kind).toBe("unchanged");
	});

	test("a flow gaining a participant is a change to the flow", () => {
		const after = content({
			nodes: [GATEWAY, ORDERS, { id: "ld", name: "Ledger", kind: "service" }],
			edges: [WIRE],
			flows: [{ ...FLOW, participants: ["gw", "or", "ld"] }],
		});
		const change = compareVariants(TOLD, after).flows.get("f1");
		expect(change?.kind).toBe("changed");
		expect(change?.fields[0]?.field).toBe("participants");
	});

	test("what a proposal cut out of a sequence is drawn back where it was", () => {
		const after = content({
			nodes: [GATEWAY, ORDERS],
			edges: [WIRE],
			flows: [{ ...FLOW, steps: [STEPS[1]] }],
		});
		const comparison = compareVariants(TOLD, after);
		expect(comparison.steps.get("s1")?.kind).toBe("removed");
		const drawn = withRemoved(TOLD, after, comparison);
		expect(drawn.flows[0]?.steps.map((step) => step.id)).toEqual(["s1", "s2"]);
		// And the proposal itself still says only what it proposes.
		expect(after.flows[0]?.steps.map((step) => step.id)).toEqual(["s2"]);
	});

	test("deleted runs stay before their next surviving baseline step through additions and reordering", () => {
		const told = (ids: string[]) =>
			content({
				nodes: [GATEWAY, ORDERS],
				edges: [],
				flows: [{ ...FLOW, steps: ids.map((id) => ({ id, from: "gw", to: "or", label: id })) }],
			});
		const before = told(["call", "fitcall", "fitreply", "reply", "route", "paint", "atlas"]);
		const after = told(["derive", "paint", "call", "measure", "reply", "newtail"]);
		const drawn = withRemoved(before, after, compareVariants(before, after));
		expect(drawn.flows[0]?.steps.map((step) => step.id)).toEqual([
			"derive",
			"route",
			"paint",
			"call",
			"measure",
			"fitcall",
			"fitreply",
			"reply",
			"newtail",
			"atlas",
		]);
		expect(after.flows[0]?.steps.map((step) => step.id)).toEqual([
			"derive",
			"paint",
			"call",
			"measure",
			"reply",
			"newtail",
		]);
	});

	test("a whole conversation a proposal dropped is drawn back, steps and all", () => {
		const after = content({ nodes: [GATEWAY, ORDERS], edges: [WIRE] });
		const comparison = compareVariants(TOLD, after);
		expect(comparison.flows.get("f1")?.kind).toBe("removed");
		const drawn = withRemoved(TOLD, after, comparison);
		expect(drawn.flows.map((flow) => flow.id)).toEqual(["f1"]);
		// Restored once, with its flow, rather than a second time on its own.
		expect(drawn.flows[0]?.steps.map((step) => step.id)).toEqual(["s1", "s2"]);
	});
});

describe("where a step stands", () => {
	const STEPS = [
		{ id: "s1", from: "gw", to: "or", label: "place" },
		{ id: "s2", from: "or", to: "gw", label: "accepted" },
		{ id: "s3", from: "gw", to: "or", label: "confirm" },
	];
	/**
	 * One flow told in the given order.
	 * @param steps The steps, in order.
	 * @returns The content.
	 */
	const told = (steps: readonly Record<string, unknown>[]): VariantContent =>
		content({
			nodes: [GATEWAY, ORDERS],
			edges: [WIRE],
			flows: [{ id: "f1", name: "One order", participants: ["gw", "or"], steps }],
		});

	test("adding a step does not change the steps that follow it", () => {
		// Counting absolute positions would say that inserting one step changed
		// every step after it, which is the opposite of what happened.
		const before = told(STEPS);
		const after = told([{ id: "s0", from: "gw", to: "or", label: "look up" }, ...STEPS]);
		const comparison = compareVariants(before, after);
		expect(comparison.steps.get("s0")?.kind).toBe("added");
		for (const id of ["s1", "s2", "s3"]) {
			expect(comparison.steps.get(id)?.kind, id).toBe("unchanged");
		}
	});

	test("removing a step does not change the steps that follow it either", () => {
		const comparison = compareVariants(told(STEPS), told([STEPS[0]!, STEPS[2]!]));
		expect(comparison.steps.get("s2")?.kind).toBe("removed");
		expect(comparison.steps.get("s3")?.kind).toBe("unchanged");
	});

	test("a genuine reorder is still a change to the steps that moved", () => {
		const comparison = compareVariants(told(STEPS), told([STEPS[2]!, STEPS[0]!, STEPS[1]!]));
		expect(comparison.steps.get("s3")?.fields).toEqual([
			{ field: "position", before: 3, after: 1 },
		]);
		expect(comparison.steps.get("s1")?.kind).toBe("changed");
	});
});

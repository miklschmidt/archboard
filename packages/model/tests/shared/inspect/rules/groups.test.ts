// What a group is, read off a variant: explicit members across containers,
// the wiring between them, the relationships that cross the boundary and
// which way, and the immediate neighbours those reach. And how memberships
// compare and merge: as a set, one membership at a time.

import { describe, expect, test } from "bun:test";
import { compareVariants } from "#shared/compare/rules/variants.ts";
import { groupsUsed, inspectGroup } from "#shared/inspect/rules/groups.ts";
import { normalizeGroupIds } from "#shared/schemas/primitives.ts";
import { reconcileVariant } from "#shared/reconcile/rules/variant.ts";
import {
	SemanticNodeSchema,
	VariantContentSchema,
	type VariantContent,
} from "#shared/schemas/content.ts";
import { withFixtureOrders } from "#tests/shared/support/fixture-orders.ts";

/**
 * A variant's content as a document holds it.
 * @param stated What is on it.
 * @returns The content.
 */
const content = (stated: Record<string, unknown>): VariantContent =>
	VariantContentSchema.parse(withFixtureOrders(stated));

// Fulfillment spans two services; the worker inside Shipping is also Billing's.
const ORDERS = { id: "orders", name: "Orders", kind: "service" };
const SHIPPING = { id: "shipping", name: "Shipping", kind: "service" };
const HANDLER = {
	id: "h",
	name: "Handler",
	kind: "route",
	parent: "orders",
	groups: ["fulfillment"],
};
const QUEUE = { id: "q", name: "Queue", kind: "queue", parent: "orders", groups: ["fulfillment"] };
const WORKER = {
	id: "w",
	name: "Worker",
	kind: "job",
	parent: "shipping",
	groups: ["billing", "fulfillment"],
};
const LEDGER = { id: "l", name: "Ledger", kind: "datastore", groups: ["billing"], order: 1000 };
const GATEWAY = { id: "g", name: "Gateway", kind: "route" };
const MODEL = content({
	nodes: [ORDERS, SHIPPING, HANDLER, QUEUE, WORKER, LEDGER, GATEWAY],
	edges: [
		{ id: "e1", from: "g", to: "h", kind: "http" },
		{ id: "e2", from: "h", to: "q", kind: "queue" },
		{ id: "e3", from: "q", to: "w", kind: "queue" },
		{ id: "e4", from: "w", to: "l", kind: "data" },
		{ id: "e5", from: "l", to: "g", kind: "event" },
	],
});

describe("inspecting one group", () => {
	test("members are explicit, cross containers, and are never their containers", () => {
		const fulfillment = inspectGroup(MODEL, "fulfillment");
		expect(fulfillment.members.map((node) => node.id)).toEqual(["h", "q", "w"]);
		expect(fulfillment.internalEdges.map((edge) => edge.id)).toEqual(["e2", "e3"]);
		expect(fulfillment.boundaryEdges).toEqual([
			{ edge: MODEL.edges[0]!, direction: "incoming", member: "h", neighbor: "g" },
			{ edge: MODEL.edges[3]!, direction: "outgoing", member: "w", neighbor: "l" },
		]);
		expect(fulfillment.neighbors.map((node) => node.id)).toEqual(["l", "g"]);
	});

	test("a node in two groups is a member of both, and a neighbour is counted once", () => {
		const billing = inspectGroup(MODEL, "billing");
		expect(billing.members.map((node) => node.id)).toEqual(["w", "l"]);
		expect(billing.internalEdges.map((edge) => edge.id)).toEqual(["e4"]);
		expect(billing.boundaryEdges.map((edge) => [edge.edge.id, edge.direction])).toEqual([
			["e3", "incoming"],
			["e5", "outgoing"],
		]);
		expect(billing.neighbors.map((node) => node.id)).toEqual(["q", "g"]);
	});

	test("a group nobody belongs to is empty rather than an error, and the ids in use are listed once", () => {
		const nothing = inspectGroup(MODEL, "platform");
		expect(nothing.members).toEqual([]);
		expect(nothing.boundaryEdges).toEqual([]);
		expect(nothing.neighbors).toEqual([]);
		expect(groupsUsed(MODEL)).toEqual(["billing", "fulfillment"]);
	});
});

/** The worker on its own, so a merge has nothing but memberships to decide. */
const FREE_WORKER = { id: "w", name: "Worker", kind: "job", groups: ["billing", "fulfillment"] };

describe("memberships as a set", () => {
	test("a relationship to a part of a member reaches that member, and one inside a member crosses nothing", () => {
		const held = content({
			nodes: [
				{ id: "api", name: "API", kind: "service", groups: ["sales"] },
				{ id: "route", name: "Route", kind: "route", parent: "api" },
				{ id: "store", name: "Store", kind: "module", parent: "api" },
				{ id: "ledger", name: "Ledger", kind: "service", groups: ["sales"] },
				{ id: "web", name: "Web", kind: "ui" },
			],
			edges: [
				{ id: "in", from: "web", to: "route", kind: "http" },
				{ id: "own", from: "route", to: "store", kind: "call" },
				{ id: "across", from: "store", to: "ledger", kind: "call" },
			],
		});
		const sales = inspectGroup(held, "sales");
		expect(sales.internalEdges.map((edge) => edge.id)).toEqual(["across"]);
		expect(sales.boundaryEdges).toMatchObject([
			{ direction: "incoming", member: "api", neighbor: "web" },
		]);
	});

	test("the document refuses a non-canonical spelling and the boundary produces one", () => {
		expect(SemanticNodeSchema.safeParse({ ...LEDGER, groups: ["b", "a"] }).success).toBe(false);
		expect(SemanticNodeSchema.safeParse({ ...LEDGER, groups: ["a", "a"] }).success).toBe(false);
		expect(SemanticNodeSchema.safeParse({ ...LEDGER, groups: ["a", "b"] }).success).toBe(true);
		expect(normalizeGroupIds(["b", "a", "b"])).toEqual(["a", "b"]);
	});

	test("absence and an empty list do not compare as change; membership does", () => {
		const before = content({ nodes: [WORKER, GATEWAY] });
		const reordered = content({
			nodes: [WORKER, { ...GATEWAY, groups: [] }],
		});
		const same = compareVariants(before, reordered);
		expect(same.nodes.get("w")?.kind).toBe("unchanged");
		expect(same.nodes.get("g")?.kind).toBe("unchanged");
		const left = compareVariants(
			before,
			content({ nodes: [{ ...WORKER, groups: ["billing"] }, GATEWAY] }),
		);
		expect(left.nodes.get("w")?.kind).toBe("changed");
		expect(left.nodes.get("w")?.fields.map((field) => field.field)).toEqual(["groups"]);
	});

	test("each membership merges independently: additions and removals on different groups both land", () => {
		const base = content({ nodes: [FREE_WORKER] });
		// The proposal leaves Billing; the predecessor joins the read path.
		const mine = content({ nodes: [{ ...FREE_WORKER, groups: ["fulfillment"] }] });
		const theirs = content({
			nodes: [{ ...FREE_WORKER, groups: ["billing", "fulfillment", "read-path"] }],
		});
		const settled = reconcileVariant({ base, mine, theirs });
		expect(settled.issues).toEqual([]);
		expect(settled.content.nodes[0]?.groups).toEqual(["fulfillment", "read-path"]);
		expect(settled.inherited).toContain("w");
	});

	test("both sides making the same move agree, and a membership only this side touched is kept", () => {
		const base = content({ nodes: [FREE_WORKER] });
		const mine = content({ nodes: [{ ...FREE_WORKER, groups: ["fulfillment"] }] });
		const agreed = reconcileVariant({ base, mine, theirs: mine });
		expect(agreed.issues).toEqual([]);
		expect(agreed.content.nodes[0]?.groups).toEqual(["fulfillment"]);
		expect(agreed.inherited).toEqual([]);
		const everything = content({ nodes: [{ ...FREE_WORKER, groups: [] }] });
		const cleared = reconcileVariant({ base, mine: everything, theirs: base });
		expect(cleared.content.nodes[0]?.groups).toBeUndefined();
	});
});

// What a group is, read off a variant: explicit members across containers,
// the wiring between them, the relationships that cross the boundary and
// which way, and the immediate neighbours those reach. And how memberships
// compare: as a set, one membership at a time.

import { describe, expect, test } from "bun:test";
import { normalizeGroupIds, parseDocument } from "@archboard/model-contract";
import { compareVariants, inspectGroups } from "@archboard/model-rules";
import { contentOf as content, withFixtureOrders } from "#tests/shared/support/fixture-orders.ts";

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
const LEDGER = { id: "l", name: "Ledger", kind: "datastore", groups: ["billing"] };
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
		const fulfillment = inspectGroups(MODEL, "fulfillment");
		expect(fulfillment.members.map((node) => node.id)).toEqual(["h", "q", "w"]);
		expect(fulfillment.internalEdges.map((edge) => edge.id)).toEqual(["e2", "e3"]);
		expect(fulfillment.boundaryEdges).toEqual([
			{ edge: MODEL.edges[0]!, direction: "incoming", member: "h", neighbor: "g" },
			{ edge: MODEL.edges[3]!, direction: "outgoing", member: "w", neighbor: "l" },
		]);
		expect(fulfillment.neighbors.map((node) => node.id)).toEqual(["l", "g"]);
	});

	test("a node in two groups is a member of both, and a neighbour is counted once", () => {
		const billing = inspectGroups(MODEL, "billing");
		expect(billing.members.map((node) => node.id)).toEqual(["w", "l"]);
		expect(billing.internalEdges.map((edge) => edge.id)).toEqual(["e4"]);
		expect(billing.boundaryEdges.map((edge) => [edge.edge.id, edge.direction])).toEqual([
			["e3", "incoming"],
			["e5", "outgoing"],
		]);
		expect(billing.neighbors.map((node) => node.id)).toEqual(["q", "g"]);
	});

	test("a group nobody belongs to is empty rather than an error, and the ids in use are listed once", () => {
		const nothing = inspectGroups(MODEL, "platform");
		expect(nothing.members).toEqual([]);
		expect(nothing.boundaryEdges).toEqual([]);
		expect(nothing.neighbors).toEqual([]);
		expect(inspectGroups(MODEL).map(({ group }) => group)).toEqual(["billing", "fulfillment"]);
	});
});

/** The worker on its own, so a comparison has nothing but memberships to decide. */
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
		const sales = inspectGroups(held, "sales");
		expect(sales.internalEdges.map((edge) => edge.id)).toEqual(["across"]);
		expect(sales.boundaryEdges).toMatchObject([
			{ direction: "incoming", member: "api", neighbor: "web" },
		]);
	});

	test("the document refuses a non-canonical spelling and the boundary produces one", () => {
		const spelled = (groups: string[]) =>
			parseDocument(
				"variantContent",
				withFixtureOrders({ nodes: [{ ...LEDGER, groups }], edges: [] }),
			).success;
		expect(spelled(["b", "a"])).toBe(false);
		expect(spelled(["a", "a"])).toBe(false);
		expect(spelled(["a", "b"])).toBe(true);
		expect(normalizeGroupIds(["b", "a", "b"])).toEqual(["a", "b"]);
	});

	test("absence and an empty list do not compare as change; membership does", () => {
		const before = content({ nodes: [FREE_WORKER, GATEWAY] });
		const reordered = content({
			nodes: [FREE_WORKER, { ...GATEWAY, groups: [] }],
		});
		const same = compareVariants(before, reordered);
		expect(same.nodes.get("w")?.kind).toBe("unchanged");
		expect(same.nodes.get("g")?.kind).toBe("unchanged");
		const left = compareVariants(
			before,
			content({ nodes: [{ ...FREE_WORKER, groups: ["billing"] }, GATEWAY] }),
		);
		expect(left.nodes.get("w")?.kind).toBe("changed");
		expect(left.nodes.get("w")?.fields.map((field) => field.field)).toEqual(["groups"]);
	});
});

// What a container's interface is, read off one variant (ADR 0044): the
// children that relationships from outside reach, the children they do not,
// who calls, where the container calls out, and which entry points only pass
// one call on.

import { describe, expect, test } from "bun:test";
import {
	inspectContainer,
	passThroughEntryPoints,
	type ContainerInterface,
} from "#shared/rules/inspect/container-interface.ts";
import { VariantContentSchema, type VariantContent } from "#shared/schemas/content.ts";
import { withFixtureOrders } from "#tests/shared/support/fixture-orders.ts";

/**
 * A variant's content as a document holds it.
 * @param stated What is on it.
 * @returns The content.
 */
const content = (stated: Record<string, unknown>): VariantContent =>
	VariantContentSchema.parse(withFixtureOrders(stated));

/**
 * A node, the id being its name in lower case.
 * @param name What it is called.
 * @param parent The id of its container, when it has one.
 * @returns The node as the document states it.
 */
const node = (name: string, parent?: string) => ({
	id: name.toLowerCase(),
	name,
	kind: "module",
	...(parent === undefined ? {} : { parent }),
});

let edgeCount = 0;

/**
 * A relationship with an id of its own.
 * @param from The source's id.
 * @param to The target's id.
 * @param kind What the relationship is.
 * @returns The relationship as the document states it.
 */
const edge = (from: string, to: string, kind = "call") => ({
	id: `e${++edgeCount}`,
	from,
	to,
	kind,
});

/**
 * A node of a variant.
 * @param variant The variant.
 * @param id The node.
 * @returns The node.
 */
function nodeOf(variant: VariantContent, id: string) {
	const found = variant.nodes.find((one) => one.id === id);
	if (found === undefined) throw new Error(`no node ${id}`);
	return found;
}

/**
 * The interface of a node that has one.
 * @param variant The variant.
 * @param id The node.
 * @returns Its interface.
 */
function interfaceOf(variant: VariantContent, id: string): ContainerInterface {
	const found = inspectContainer(variant, nodeOf(variant, id));
	if (!found.holdsParts) throw new Error(`${id} has no interface`);
	return found;
}

/**
 * The ids of some nodes.
 * @param nodes The nodes.
 * @returns Their ids, in order.
 */
const ids = (nodes: readonly { readonly id: string }[]): string[] => nodes.map((one) => one.id);

/**
 * Where some relationships go.
 * @param edges The relationships.
 * @returns Each one as `from>to` or `from>to:kind`, in order.
 */
const ends = (edges: readonly { from: string; to: string; kind: string }[]): string[] =>
	edges.map((one) => `${one.from}>${one.to}${one.kind === "call" ? "" : `:${one.kind}`}`);

describe("a container's interface", () => {
	// Store holds an index, a ledger and a cache. Server calls the index and
	// Cron calls it too; the index calls the ledger; the ledger writes to Disk.
	const store = content({
		nodes: [
			node("Store"),
			node("Server"),
			node("Cron"),
			node("Disk"),
			node("Index", "store"),
			node("Ledger", "store"),
			node("Cache", "store"),
		],
		edges: [
			edge("server", "index"),
			edge("cron", "index"),
			edge("cron", "index", "event"),
			edge("index", "ledger"),
			edge("ledger", "disk", "data"),
		],
	});

	test("the children that something outside reaches are entry points, and the rest are hidden", () => {
		const found = interfaceOf(store, "store");
		expect(ids(found.entryPoints.map((entry) => entry.node))).toEqual(["index"]);
		expect(ends(found.entryPoints[0]?.reachedBy ?? [])).toEqual([
			"server>index",
			"cron>index",
			"cron>index:event",
		]);
		expect(ids(found.hiddenParts)).toEqual(["ledger", "cache"]);
	});

	test("a caller counts once however many relationships it sends, and the container's exits are outgoing", () => {
		const found = interfaceOf(store, "store");
		expect(ids(found.callers.map((caller) => caller.node))).toEqual(["server", "cron"]);
		expect(found.callers[1]?.edges).toHaveLength(2);
		expect(found.callers[1]?.reaches).toEqual(["index"]);
		expect(ends(found.outgoing)).toEqual(["ledger>disk:data"]);
		expect(found.measures).toEqual({
			entryPoints: 1,
			hiddenParts: 2,
			callers: 2,
			outgoing: 1,
			passThrough: 0,
		});
	});

	test("a relationship between two parts inside, or the container and a part inside, changes no measure", () => {
		const before = interfaceOf(store, "store");
		const wired = content({
			...store,
			edges: [
				...store.edges,
				edge("cache", "ledger"),
				edge("store", "cache"),
				edge("ledger", "store"),
			],
		});
		expect(interfaceOf(wired, "store").measures).toEqual(before.measures);
	});

	test("only relationships count: a flow step from outside makes no entry point", () => {
		const told = content({
			...store,
			flows: [
				{
					id: "reply",
					name: "Reply",
					participants: ["server", "cache"],
					steps: [{ id: "s1", from: "server", to: "cache", label: "return the page" }],
				},
			],
		});
		expect(ids(interfaceOf(told, "store").hiddenParts)).toContain("cache");
	});

	test("a node with no children holds no parts, however much reaches it", () => {
		expect(inspectContainer(store, nodeOf(store, "ledger"))).toEqual({
			container: nodeOf(store, "ledger"),
			holdsParts: false,
		});
	});
});

describe("a container nothing outside reaches", () => {
	const closed = content({
		nodes: [node("Browser"), node("Panes", "browser"), node("Camera", "browser")],
		edges: [edge("panes", "camera")],
	});

	test("every child is a hidden part and the callers are empty", () => {
		const found = interfaceOf(closed, "browser");
		expect(found.entryPoints).toEqual([]);
		expect(ids(found.hiddenParts)).toEqual(["panes", "camera"]);
		expect(found.callers).toEqual([]);
		expect(found.outgoing).toEqual([]);
	});
});

describe("nested containers", () => {
	// C holds D and c2; D holds d1. X is outside C. P holds C and Q.
	const nested = content({
		nodes: [
			node("P"),
			node("X"),
			node("Q", "p"),
			node("C", "p"),
			node("D", "c"),
			node("c2", "c"),
			node("d1", "d"),
		],
		edges: [edge("x", "d1"), edge("d1", "c2"), edge("q", "c2")],
	});

	test("a relationship that ends deeper makes an entry point of the child that holds its end", () => {
		const outer = interfaceOf(nested, "c");
		expect(ids(outer.entryPoints.map((entry) => entry.node))).toEqual(["d", "c2"]);
		const inner = interfaceOf(nested, "d");
		expect(ids(inner.entryPoints.map((entry) => entry.node))).toEqual(["d1"]);
		expect(ids(inner.callers.map((caller) => caller.node))).toEqual(["x"]);
	});

	test("a part that reaches up stays inside: it is outgoing for the nested container only", () => {
		const outer = interfaceOf(nested, "c");
		expect(outer.outgoing).toEqual([]);
		expect(ends(interfaceOf(nested, "d").outgoing)).toEqual(["d1>c2"]);
		// c2 is reached only because Q is outside C. d1 alone would not reach it.
		const withoutQ = content({ ...nested, edges: [edge("x", "d1"), edge("d1", "c2")] });
		expect(ids(interfaceOf(withoutQ, "c").hiddenParts)).toEqual(["c2"]);
	});

	test("a sibling, the parent and a part of another branch are all outside, and the caller is the part itself", () => {
		const outer = interfaceOf(nested, "c");
		expect(ids(outer.callers.map((caller) => caller.node))).toEqual(["x", "q"]);
		const fromParent = content({ ...nested, edges: [edge("p", "c2")] });
		expect(ids(interfaceOf(fromParent, "c").callers.map((caller) => caller.node))).toEqual(["p"]);
	});
});

describe("a relationship that ends on the container itself", () => {
	// Gateway depends on the whole of Billing, and Billing sits inside Platform.
	const whole = content({
		nodes: [
			node("Platform"),
			node("Gateway"),
			node("Billing", "platform"),
			node("Invoices", "billing"),
			node("Audit", "platform"),
		],
		edges: [edge("gateway", "billing"), edge("audit", "billing")],
	});

	test("it makes its source a caller, makes no entry point and is listed apart", () => {
		const found = interfaceOf(whole, "billing");
		expect(found.entryPoints).toEqual([]);
		expect(ids(found.hiddenParts)).toEqual(["invoices"]);
		expect(ids(found.callers.map((caller) => caller.node))).toEqual(["gateway", "audit"]);
		expect(found.callers.map((caller) => caller.reaches)).toEqual([[], []]);
		expect(ends(found.onContainer)).toEqual(["gateway>billing", "audit>billing"]);
	});

	test("for the container's own parent it ends on a child, so the container is an entry point there if the source is outside", () => {
		const parent = interfaceOf(whole, "platform");
		expect(ids(parent.entryPoints.map((entry) => entry.node))).toEqual(["billing"]);
		expect(ids(parent.callers.map((caller) => caller.node))).toEqual(["gateway"]);
		expect(ids(parent.hiddenParts)).toEqual(["audit"]);
	});

	test("a relationship that starts on the container and ends outside is outgoing", () => {
		const calling = content({ ...whole, edges: [edge("billing", "gateway")] });
		expect(ends(interfaceOf(calling, "billing").outgoing)).toEqual(["billing>gateway"]);
	});
});

/**
 * The pass-through entry points of a container Shop with one leaf, Route.
 * @param edges The relationships.
 * @param more More nodes of the variant.
 * @returns The ids.
 */
function passing(edges: unknown[], more: unknown[] = []): string[] {
	const variant = content({
		nodes: [
			node("Shop"),
			node("Client"),
			node("Ledger"),
			node("Route", "shop"),
			node("Helper", "shop"),
			...more,
		],
		edges,
	});
	return ids(interfaceOf(variant, "shop").passThrough);
}

describe("a pass-through entry point", () => {
	test("a leaf that sends one relationship of the kind it receives passes the call on", () => {
		expect(passing([edge("client", "route"), edge("route", "ledger")])).toEqual(["route"]);
		expect(
			passing([edge("client", "route"), edge("route", "ledger"), edge("helper", "route")]),
		).toEqual(["route"]);
	});

	test("a part that changes the kind, sends two relationships or sends none does more than pass a call on", () => {
		expect(passing([edge("client", "route", "http"), edge("route", "ledger", "call")])).toEqual([]);
		expect(
			passing([edge("client", "route"), edge("route", "ledger"), edge("route", "client")]),
		).toEqual([]);
		expect(passing([edge("client", "route")])).toEqual([]);
	});

	test("every relationship it receives counts, from inside the container too", () => {
		expect(
			passing([edge("client", "route"), edge("helper", "route", "event"), edge("route", "ledger")]),
		).toEqual([]);
	});

	test("an entry point with children is never a pass-through", () => {
		expect(
			passing([edge("client", "route"), edge("route", "ledger")], [node("Inner", "route")]),
		).toEqual([]);
	});
});

describe("the pass-through entry points of a variant", () => {
	test("each one comes with the container it is on, across containers and in a nested one", () => {
		const variant = content({
			nodes: [
				node("Client"),
				node("Ledger"),
				node("Shop"),
				node("Route", "shop"),
				node("Billing"),
				node("Charge", "billing"),
				node("Cards", "billing"),
				node("Token", "cards"),
			],
			edges: [
				edge("client", "route"),
				edge("route", "ledger"),
				edge("client", "charge"),
				edge("charge", "ledger"),
				edge("client", "token"),
				edge("token", "ledger"),
			],
		});
		expect(
			passThroughEntryPoints(variant).map(({ container, part }) => [container.id, part.id]),
		).toEqual([
			["shop", "route"],
			["billing", "charge"],
			["cards", "token"],
		]);
	});

	test("a variant with no container has none", () => {
		const variant = content({
			nodes: [node("Client"), node("Ledger")],
			edges: [edge("client", "ledger")],
		});
		expect(passThroughEntryPoints(variant)).toEqual([]);
	});
});

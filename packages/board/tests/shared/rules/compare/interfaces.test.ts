// What a variant changed about the interface of each container (ADR 0044): the
// entry points added and removed, the parts that moved between the interface
// and the hidden parts, and the callers gained and lost. That the reading sets
// no comparison status is owned where both sit in one answer
// (`src/cli/commands/tests/comparison-answer.test.ts`).

import { describe, expect, test } from "bun:test";
import { compareInterfaces, type InterfaceChange } from "#shared/rules/compare/interfaces.ts";
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

/**
 * A relationship whose id is the first three letters of its two ends.
 * @param from The source's id.
 * @param to The target's id.
 * @returns The relationship as the document states it.
 */
const edge = (from: string, to: string) => ({
	id: `${from.slice(0, 3)}-${to.slice(0, 3)}`,
	from,
	to,
	kind: "call",
});

/**
 * The ids of some nodes.
 * @param nodes The nodes.
 * @returns Their ids, in order.
 */
const ids = (nodes: readonly { readonly id: string }[]): string[] => nodes.map((one) => one.id);

/**
 * What one container changed.
 * @param before The variant it is read against.
 * @param after The variant compared.
 * @param id The container.
 * @returns Its change.
 */
function changeOf(before: VariantContent, after: VariantContent, id: string): InterfaceChange {
	const found = compareInterfaces(before, after).changed.find((one) => one.container.id === id);
	if (found === undefined) throw new Error(`the interface of ${id} did not change`);
	return found;
}

// Store holds an index, a ledger and a cache. Server calls the index.
const STORE = [
	node("Store"),
	node("Server"),
	node("Cron"),
	node("Index", "store"),
	node("Ledger", "store"),
	node("Cache", "store"),
];
const BEFORE = content({ nodes: STORE, edges: [edge("server", "index"), edge("index", "ledger")] });

describe("what a comparison says about a container's interface", () => {
	test("an entry point on one variant that is not a child on the other is added or removed", () => {
		const after = content({
			nodes: [...STORE.filter((one) => one.id !== "index"), node("Lookup", "store")],
			edges: [edge("server", "lookup"), edge("lookup", "ledger")],
		});
		const change = changeOf(BEFORE, after, "store");
		expect(ids(change.entryPointsAdded)).toEqual(["lookup"]);
		expect(ids(change.entryPointsRemoved)).toEqual(["index"]);
		expect(change.becameEntryPoints).toEqual([]);
		expect(change.becameHidden).toEqual([]);
		expect(change.callersGained).toEqual([]);
		expect(change.callersLost).toEqual([]);
		expect(change.holdsParts).toEqual({ before: true, after: true });
	});

	test("a child on both variants that an outside caller now reaches moved into the interface", () => {
		const after = content({
			nodes: STORE,
			edges: [edge("server", "index"), edge("index", "ledger"), edge("cron", "cache")],
		});
		const change = changeOf(BEFORE, after, "store");
		expect(ids(change.becameEntryPoints)).toEqual(["cache"]);
		// The part was a child before, so it is not an added entry point, and a new caller came with it.
		expect(change.entryPointsAdded).toEqual([]);
		expect(ids(change.callersGained)).toEqual(["cron"]);
	});

	test("a child on both variants that nothing outside reaches any longer moved out of the interface", () => {
		const after = content({ nodes: STORE, edges: [edge("index", "ledger")] });
		const change = changeOf(BEFORE, after, "store");
		expect(ids(change.becameHidden)).toEqual(["index"]);
		expect(change.entryPointsRemoved).toEqual([]);
		expect(ids(change.callersLost)).toEqual(["server"]);
	});

	test("a caller that reaches another entry point is neither gained nor lost", () => {
		const after = content({
			nodes: STORE,
			edges: [edge("server", "cache"), edge("index", "ledger")],
		});
		const change = changeOf(BEFORE, after, "store");
		expect(change.callersGained).toEqual([]);
		expect(change.callersLost).toEqual([]);
		expect(ids(change.becameEntryPoints)).toEqual(["cache"]);
		expect(ids(change.becameHidden)).toEqual(["index"]);
	});

	test("a change inside the container that no outside part sees moves no interface", () => {
		const after = content({
			nodes: STORE,
			edges: [edge("server", "index"), edge("index", "cache"), edge("cache", "ledger")],
		});
		const comparison = compareInterfaces(BEFORE, after);
		expect(comparison.changed).toEqual([]);
		expect(ids(comparison.unchanged)).toEqual(["store"]);
	});

	test("a part moved out of the container is a removed entry point, not a part that became hidden", () => {
		const after = content({
			nodes: [...STORE.filter((one) => one.id !== "index"), node("Index")],
			edges: [edge("server", "index"), edge("index", "ledger")],
		});
		const change = changeOf(BEFORE, after, "store");
		expect(ids(change.entryPointsRemoved)).toEqual(["index"]);
		expect(change.becameHidden).toEqual([]);
		expect(ids(change.callersLost)).toEqual(["server"]);
	});

	test("a node that gains its first children appears with its whole interface added", () => {
		const before = content({
			nodes: [node("Store"), node("Server")],
			edges: [edge("server", "store")],
		});
		const after = content({
			nodes: [node("Store"), node("Server"), node("Index", "store")],
			edges: [edge("server", "index")],
		});
		const change = changeOf(before, after, "store");
		expect(change.holdsParts).toEqual({ before: false, after: true });
		expect(ids(change.entryPointsAdded)).toEqual(["index"]);
		expect(ids(change.callersGained)).toEqual(["server"]);
	});

	test("a container taken away, or emptied, loses its whole interface", () => {
		const removed = content({ nodes: [node("Server")], edges: [] });
		const gone = changeOf(BEFORE, removed, "store");
		expect(gone.holdsParts).toEqual({ before: true, after: false });
		expect(gone.container.name).toBe("Store");
		expect(ids(gone.entryPointsRemoved)).toEqual(["index"]);
		expect(ids(gone.callersLost)).toEqual(["server"]);
		// Emptied: the node stays on the later variant, named as it is there.
		const emptied = content({
			nodes: [{ ...node("Store"), name: "Storage" }, node("Server")],
			edges: [],
		});
		expect(changeOf(BEFORE, emptied, "store").container.name).toBe("Storage");
	});

	test("a container that nothing outside reaches changed when it appears or empties", () => {
		// A node with no children has no interface, and a container nobody calls has an empty one.
		const leaf = content({ nodes: [node("Store")], edges: [] });
		const holding = content({ nodes: [node("Store"), node("Index", "store")], edges: [] });
		expect(changeOf(leaf, holding, "store").holdsParts).toEqual({ before: false, after: true });
		expect(changeOf(holding, leaf, "store").holdsParts).toEqual({ before: true, after: false });
	});

	test("every container is read on its own, so nesting moves one interface and not the other", () => {
		// Index becomes a container: Server now reaches its lookup child.
		const before = content({
			nodes: [node("Store"), node("Server"), node("Index", "store")],
			edges: [edge("server", "index")],
		});
		const after = content({
			nodes: [node("Store"), node("Server"), node("Index", "store"), node("Lookup", "index")],
			edges: [edge("server", "lookup")],
		});
		const comparison = compareInterfaces(before, after);
		expect(ids(comparison.changed.map((one) => one.container))).toEqual(["index"]);
		expect(ids(comparison.unchanged)).toEqual(["store"]);
	});
});

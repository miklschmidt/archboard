import { expect, test } from "bun:test";
import { parseDocument } from "@archboard/model-contract";
import { compareVariants } from "@archboard/model-rules";
import { contentOf as content } from "#tests/shared/support/fixture-orders.ts";

const NODES = [
	{ id: "api", name: "API", kind: "service" },
	{ id: "db", name: "Database", kind: "datastore" },
];
const EDGE = { id: "call", from: "api", to: "db", kind: "call", emphasis: "normal", order: 1000 };

/**
 * One content value holding one relationship.
 * @param edge The relationship as a document states it.
 * @returns The content, read through the contract.
 */
const holding = (edge: Record<string, unknown>) => content({ nodes: NODES, edges: [edge] });

/** The traffic a relationship gets when it states none of its parts. */
const defaults = (() => {
	const read = parseDocument("edgeTraffic", {});
	if (!read.success) throw read.error;
	return read.data;
})();

test("enabling traffic changes the relationship once", () => {
	const comparison = compareVariants(holding(EDGE), holding({ ...EDGE, traffic: {} }));
	expect(comparison.edges.get("call")?.fields).toEqual([
		{ field: "traffic", before: undefined, after: defaults },
	]);
});

test("empty and explicitly defaulted traffic are equivalent", () => {
	const before = holding({ ...EDGE, traffic: {} });
	const after = holding({ ...EDGE, traffic: { ...defaults } });
	expect(compareVariants(before, after).edges.get("call")?.kind).toBe("unchanged");
});

test("structured traffic compares by value independent of key order", () => {
	const before = holding({ ...EDGE, traffic: { speed: 72, volume: 2 } });
	const parsedAfter = holding({ ...EDGE, traffic: { speed: 72, volume: 2 } });
	const after = {
		...parsedAfter,
		edges: [{ ...parsedAfter.edges[0]!, traffic: { volume: 2, speed: 72 } }],
	};
	expect(compareVariants(before, after).edges.get("call")?.kind).toBe("unchanged");
});

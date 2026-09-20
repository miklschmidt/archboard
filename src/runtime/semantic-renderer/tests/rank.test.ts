// Cycles use authored order, so rearranging the stored arrays cannot silently
// change which part starts the reading.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";

/**
 * Two parts calling each other, in the given authored order.
 * @param order The node ids, first to last.
 * @returns The content.
 */
function cycle(order: readonly [string, string]) {
	return orderedFixture({
		nodes: order.map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "ab", from: "a", to: "b", kind: "call" },
			{ id: "ba", from: "b", to: "a", kind: "call" },
		],
	});
}

test("a two-part cycle follows authored order across document array permutations", async () => {
	const content = cycle(["a", "b"]);
	const first = await renderArchitecture({ content, theme: "light" });
	expect(first.atlas.nodes["a"]!.y).toBeLessThan(first.atlas.nodes["b"]!.y);
	const reordered = await renderArchitecture({
		content: { ...content, nodes: content.nodes.toReversed(), edges: content.edges.toReversed() },
		theme: "light",
	});
	expect(reordered.atlas.nodes).toEqual(first.atlas.nodes);
	const flipped = await renderArchitecture({ content: cycle(["b", "a"]), theme: "light" });
	expect(flipped.atlas.nodes["b"]!.y).toBeLessThan(flipped.atlas.nodes["a"]!.y);
});

test("a longer cycle drops exactly the edge that closes it from the first part, and every other step reads down", async () => {
	const content = orderedFixture({
		nodes: ["a", "b", "c", "d"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "da", from: "d", to: "a", kind: "call" },
			{ id: "ab", from: "a", to: "b", kind: "call" },
			{ id: "bc", from: "b", to: "c", kind: "call" },
			{ id: "cd", from: "c", to: "d", kind: "call" },
		],
	});
	const drawing = await renderArchitecture({ content, theme: "light" });
	const y = (id: string) => drawing.atlas.nodes[id]!.y;
	expect(y("a")).toBeLessThan(y("b"));
	expect(y("b")).toBeLessThan(y("c"));
	expect(y("c")).toBeLessThan(y("d"));
});

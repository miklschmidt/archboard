// Ranking is semantic and deterministic: a cycle is broken by a depth-first
// walk in document order, so which edge of a cycle runs back up the page is
// fixed by the board text, and a chain always reads down the page.

import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";

/**
 * Two parts calling each other, in the given document order.
 * @param order The node ids, first to last.
 * @returns The content.
 */
function cycle(order: readonly [string, string]) {
	return VariantContentSchema.parse({
		nodes: order.map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "ab", from: "a", to: "b", kind: "call" },
			{ id: "ba", from: "b", to: "a", kind: "call" },
		],
	});
}

test("a two-part cycle is broken from the first part in document order: it reads down from that part, and reordering the document flips it", async () => {
	const first = await renderArchitecture({ content: cycle(["a", "b"]), theme: "light" });
	expect(first.atlas.nodes["a"]!.y).toBeLessThan(first.atlas.nodes["b"]!.y);
	const flipped = await renderArchitecture({ content: cycle(["b", "a"]), theme: "light" });
	expect(flipped.atlas.nodes["b"]!.y).toBeLessThan(flipped.atlas.nodes["a"]!.y);
});

test("a longer cycle drops exactly the edge that closes it from the first part, and every other step reads down", async () => {
	const content = VariantContentSchema.parse({
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

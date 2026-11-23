import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { corridorPoints } from "#tests/runtime/support/drawn-routes.ts";
import { defaultSemanticPolicy } from "@archboard/model/policy";

test("relationships between two cards draw as one cable whose strands of different kinds stay apart", async () => {
	const content = orderedFixture({
		nodes: ["a", "b"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "call", from: "a", to: "b", kind: "call" },
			{ id: "data", from: "a", to: "b", kind: "data" },
			{ id: "event", from: "a", to: "b", kind: "event" },
		],
	});
	const drawing = await renderArchitecture({
		policy: defaultSemanticPolicy(),
		content,
		theme: "light",
	});
	const routes = corridorPoints(drawing.svg);
	const strands = ["call", "data", "event"].map((id) => routes.get(id)!);
	// Each strand is its own line, and stands half a lane from the next at both ends.
	for (const end of [0, -1] as const) {
		const ends = strands.map((points) => points.at(end)!);
		for (const [index, one] of ends.entries())
			for (const other of ends.slice(index + 1))
				expect(Math.hypot(one.x - other.x, one.y - other.y)).toBeGreaterThanOrEqual(8 - 0.01);
	}
	for (const [index, one] of strands.entries())
		for (const other of strands.slice(index + 1))
			expect(sharedLength(one, other)).toBeLessThanOrEqual(0.01);
});

/**
 * How long two routes run on one line together.
 * @param one A route.
 * @param other Another route.
 * @returns The length of their shared ink.
 */
function sharedLength(
	one: readonly { x: number; y: number }[],
	other: readonly { x: number; y: number }[],
): number {
	let shared = 0;
	for (const [index, end] of one.slice(1).entries()) {
		const start = one[index]!;
		for (const [otherIndex, otherEnd] of other.slice(1).entries()) {
			const otherStart = other[otherIndex]!;
			for (const [along, across] of [
				["x", "y"],
				["y", "x"],
			] as const) {
				if (start[across] !== end[across] || otherStart[across] !== otherEnd[across]) continue;
				if (Math.abs(start[across] - otherStart[across]) > 0.01) continue;
				const overlap =
					Math.min(
						Math.max(start[along], end[along]),
						Math.max(otherStart[along], otherEnd[along]),
					) -
					Math.max(
						Math.min(start[along], end[along]),
						Math.min(otherStart[along], otherEnd[along]),
					);
				shared += Math.max(0, overlap);
			}
		}
	}
	return shared;
}

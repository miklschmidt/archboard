// How a route that shares a lane is cut, which the viewer reads (TASK-387).
//
// Where routes of one kind lie on one line, one of them draws the stretch and
// the others have it cut away by their mask. The viewer lights a route along its
// whole length by taking that cutout back, and keeps the gap under a line that
// crosses over. It tells the two apart by how each is capped, so this holds the
// renderer to it.
//
// What is guarded: the stretch another route draws is cut with butt ends, and a
// crossing's gap with round ones.

import { expect, test } from "bun:test";

import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

// One service calls three others: their routes leave it along one lane.
const FAN_OUT = orderedFixture({
	nodes: ["hub", "a", "b", "c"].map((id) => ({ id, name: id, kind: "service" })),
	edges: ["a", "b", "c"].map((to) => ({
		id: `hub-${to}`,
		from: "hub",
		to,
		kind: "call",
		traffic: {},
	})),
});

// Complete bipartite connections cannot all be drawn without crossings.
const CROSSED = orderedFixture({
	nodes: ["a", "b", "c", "x", "y", "z"].map((id) => ({ id, name: id, kind: "service" })),
	edges: ["a", "b", "c"].flatMap((from) =>
		["x", "y", "z"].map((to) => ({ id: from + to, from, to, kind: "call", traffic: {} })),
	),
});

/**
 * The caps of the black cutouts of every mask in a drawing.
 * @param svg The drawing.
 * @returns The caps, mask by mask.
 */
function capsOf(svg: string): string[][] {
	return [...svg.matchAll(/<mask id="[^"]+"[^>]*>([\s\S]*?)<\/mask>/gu)].map((mask) =>
		[...mask[1]!.matchAll(/<path [^>]*stroke(?:="|:)black[^>]*>/gu)].map(
			(path) => /stroke-linecap="(\w+)"/u.exec(path[0])?.[1] ?? "none",
		),
	);
}

test("the stretch another route of a trunk draws is cut with butt ends, and nothing else is", async () => {
	const { svg } = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: FAN_OUT,
		theme: "light",
	});
	const masks = capsOf(svg);
	expect(masks.length, "a trunk has routes whose ink another route draws").toBeGreaterThan(0);
	for (const caps of masks) {
		expect(caps.every((cap) => cap === "butt")).toBe(true);
	}
});

test("the gap under a line that crosses over is cut with round ends", async () => {
	const { svg } = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: CROSSED,
		theme: "light",
	});
	const caps = capsOf(svg).flat();
	expect(caps).toContain("round");
	expect(caps.every((cap) => cap === "round" || cap === "butt")).toBe(true);
});

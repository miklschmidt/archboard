import { expect, test } from "bun:test";
import type { DiagramBox } from "@archboard/board/render-reply";
import { renderDataFlow } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/**
 * Whether one box sits wholly inside another, allowing a hair of rounding.
 * @param inner The box that should be inside.
 * @param outer The box that should contain it.
 * @returns True when it does.
 */
function within(inner: DiagramBox, outer: DiagramBox): boolean {
	const slack = 0.01;
	return (
		inner.x >= outer.x - slack &&
		inner.y >= outer.y - slack &&
		inner.x + inner.width <= outer.x + outer.width + slack &&
		inner.y + inner.height <= outer.y + outer.height + slack
	);
}

test("every message's loop and words lie inside its own flow's frame, on either edge", () => {
	// The frame is the flow: a self-message's words on the last column, or a
	// crossing label longer than a first-column hop, reach past the columns, and
	// a frame that does not follow leaves those words outside the flow.
	const long = "a label long enough to reach past every column of this flow";
	const rendered = renderDataFlow({
		policy: DEFAULT_SEMANTIC_POLICY,
		theme: "light",
		content: orderedFixture({
			nodes: [
				{ id: "a", name: "A", kind: "service" },
				{ id: "b", name: "B", kind: "service" },
				{ id: "c", name: "C", kind: "service" },
			],
			flows: [
				{
					id: "edges",
					name: "Words at the edges",
					participants: ["a", "b", "c"],
					steps: [
						{ id: "e1", from: "a", to: "a", label: long, kind: "self" },
						{ id: "e2", from: "a", to: "b", label: long, kind: "sync" },
						{ id: "e3", from: "b", to: "c", label: "short", kind: "sync" },
						{ id: "e4", from: "c", to: "c", label: long, kind: "self" },
						{
							id: "e5",
							from: "c",
							to: "c",
							label: "again",
							kind: "self",
							note: "why it runs twice",
						},
						{ id: "e6", from: "c", to: "b", label: long, kind: "return" },
					],
				},
				{
					id: "solo",
					name: "One participant",
					participants: ["c"],
					steps: [{ id: "o1", from: "c", to: "c", label: long, kind: "self" }],
				},
			],
		}),
	});
	const page = { x: 0, y: 0, width: rendered.width, height: rendered.height };
	for (const [flow, steps] of [
		["edges", ["e1", "e2", "e3", "e4", "e5", "e6"]],
		["solo", ["o1"]],
	] as const) {
		const frame = rendered.atlas.regions[flow]!;
		expect(within(frame, page)).toBe(true);
		for (const step of steps) {
			expect(within(rendered.atlas.edges[step]!, frame)).toBe(true);
		}
	}
});

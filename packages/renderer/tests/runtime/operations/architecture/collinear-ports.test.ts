import { expect, test } from "bun:test";
import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { collinearPorts } from "#tests/runtime/support/drawn-ports.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

const content = orderedFixture({
	nodes: ["card", "left", "right"].map((id) => ({ id, name: id, kind: "module" })),
	edges: [
		{ id: "one", from: "card", to: "left", kind: "call" },
		{ id: "two", from: "card", to: "right", kind: "call" },
	],
});

/** Build two outward routes with an optional offset or rotation. */
function drawing(offset: number, vertical = false): RenderedDiagram {
	const point = (x: number, y: number) => (vertical ? `${y},${x}` : `${x},${y}`);
	const box = (x: number) => ({
		x: vertical ? 100 : x,
		y: vertical ? x : 100,
		width: vertical ? 80 : 40,
		height: vertical ? 40 : 80,
	});
	return {
		svg: `<g data-semantic-kind="edge" data-semantic-id="one"><path d="M${point(100, 120)} L${point(40, 120)}" marker-end="url(#head)"/></g><g data-semantic-kind="edge" data-semantic-id="two"><path d="M${point(140, 120 + offset)} L${point(200, 120 + offset)}" marker-end="url(#head)"/></g>`,
		width: 240,
		height: 240,
		appearances: [],
		key: null,
		placed: ["card", "left", "right", "one", "two"],
		atlas: {
			nodes: { card: box(100), left: box(0), right: box(200) },
			edges: { one: box(40), two: box(140) },
			regions: {},
		},
	};
}

test.each([false, true])(
	"opposite card walls cannot make distinct routes read as one (vertical=%s)",
	(vertical) => {
		expect(collinearPorts(drawing(0, vertical), content)).toHaveLength(1);
		expect(collinearPorts(drawing(2, vertical), content)).toHaveLength(1);
		expect(collinearPorts(drawing(12, vertical), content)).toHaveLength(1);
		expect(collinearPorts(drawing(16, vertical), content)).toEqual([]);
		expect(() => expectDrawingIntact(drawing(0, vertical), content, "blocks")).toThrow();
		expect(() => expectDrawingIntact(drawing(16, vertical), content, "blocks")).not.toThrow();
	},
);

test("the same relationship can enter and leave a card", () => {
	const loop = orderedFixture({
		nodes: content.nodes,
		edges: [{ id: "one", from: "card", to: "card", kind: "call" }],
	});
	const picture = {
		...drawing(0),
		svg: '<g data-semantic-kind="edge" data-semantic-id="one"><path d="M100,120 L80,120 L80,80 L160,80 L160,120 L140,120" marker-end="url(#head)"/></g>',
	};
	expect(collinearPorts(picture, loop)).toEqual([]);
});

import { expect, test } from "bun:test";
import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { routesThroughGroupHeaders } from "#tests/runtime/support/drawn-checks.ts";
import { ambiguousTrunks } from "#tests/runtime/support/drawn-ink.ts";
import {
	endsOffCards,
	hiddenParentFrames,
	routesThroughParentHeaders,
} from "#tests/runtime/support/drawn-parents.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

const content = orderedFixture({
	nodes: ["source", "target"].map((id) => ({ id, name: id, kind: "module" })),
	edges: [{ id: "edge", from: "source", to: "target", kind: "call" }],
});

/** A saved drawing whose atlas remains intact when its painted SVG changes. */
function drawing(svg: string): RenderedDiagram {
	return {
		svg,
		width: 400,
		height: 300,
		appearances: [],
		key: null,
		placed: ["source", "target", "edge"],
		atlas: {
			nodes: {
				source: { x: 0, y: 100, width: 40, height: 40 },
				target: { x: 200, y: 100, width: 40, height: 40 },
			},
			edges: { edge: { x: 40, y: 120, width: 160, height: 0 } },
			regions: {},
		},
	};
}

function route(path: string, id = "edge"): string {
	return `<g data-semantic-kind="edge" data-semantic-id="${id}"><path d="${path}" marker-end="url(#head)"/></g>`;
}

test("drawing integrity rejects an unpainted relationship retained in the atlas", () => {
	expect(() =>
		expectDrawingIntact(drawing(route("M40,120 L200,120")), content, "track"),
	).not.toThrow();
	expect(() => expectDrawingIntact(drawing("<svg/>"), content, "track")).toThrow();
});

test("trunk checks reject shared ink between unrelated same-kind relationships", () => {
	const unrelated = orderedFixture({
		nodes: ["a", "b", "c", "d"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "left", from: "a", to: "b", kind: "call" },
			{ id: "right", from: "c", to: "d", kind: "call" },
		],
	});
	const shared = drawing(
		route("M0,0 L100,0 L100,100", "left") + route("M0,0 L150,0 L150,100", "right"),
	);
	expect(ambiguousTrunks(shared, unrelated)).toEqual(["left / right"]);
});

test.each(["M50,120 L200,120", "M40,120 L190,120"])(
	"endpoint checks reject a detached source or target (%s)",
	(path) => {
		expect(endsOffCards(drawing(route("M40,120 L200,120")), content)).toEqual([]);
		expect(endsOffCards(drawing(route(path)), content)).toHaveLength(1);
	},
);

test("parent header checks reject ink through the face and allow its boundary", () => {
	const header = `<g data-semantic-kind="region" data-semantic-id="parent"><rect x="50" y="10" width="100" height="40" rx="8"/></g>`;
	expect(routesThroughParentHeaders(drawing(header + route("M0,10 L200,10")))).toEqual([]);
	expect(routesThroughParentHeaders(drawing(header + route("M0,30 L200,30")))).toHaveLength(1);
});

test.each([50, 100])("group header checks reject ink through either zoom layer (x=%i)", (x) => {
	const group = `<g data-semantic-kind="group-region" data-group="checks"><g class="ab-near"><path d="M10,60 V20 A10,10 0 0 1 20,10 H80 V60 Z"/></g><g class="ab-far"><path d="M10,60 V20 A10,10 0 0 1 20,10 H110 V60 Z"/></g></g>`;
	expect(routesThroughGroupHeaders(drawing(group + route("M120,0 L120,80")))).toEqual([]);
	expect(routesThroughGroupHeaders(drawing(group + route(`M${x},0 L${x},80`)))).toHaveLength(1);
});

test("parent frame checks reject absent frames and frames painted below an ancestor", () => {
	const nested = orderedFixture({
		nodes: [
			{ id: "source", name: "Outer", kind: "module" },
			{ id: "target", name: "Inner", kind: "module", parent: "source" },
			{ id: "leaf", name: "Leaf", kind: "module", parent: "target" },
		],
		edges: [],
	});
	const outer = `<g data-semantic-kind="region" data-semantic-id="source"><rect x="0" y="0" width="300" height="300" pointer-events="all"/></g>`;
	const inner = `<g data-semantic-kind="region" data-semantic-id="target"><rect x="50" y="50" width="200" height="200" pointer-events="all"/></g>`;
	expect(hiddenParentFrames(drawing(outer + inner), nested)).toEqual([]);
	expect(hiddenParentFrames(drawing(outer), nested)).toHaveLength(1);
	expect(hiddenParentFrames(drawing(inner + outer), nested)).toHaveLength(1);
});

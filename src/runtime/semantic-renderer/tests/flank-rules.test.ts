// Which flank a return travels and how a skip attaches is the renderer's
// choice (docs/design/layout-rules.md section 21): a first render is settled
// under each flank rule and the scorecard keeps the drawing that is better on
// more measures, never buying a smaller page with a crossing or a route
// through a card; and a proposal keeps its predecessor's rule, as it keeps
// its reading.

import { describe, expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	bestOf,
	type ArchitectureDrawing,
	type DrawingEdge,
	type Point,
} from "@/runtime/semantic-renderer/layout";

/**
 * One straight route between two points.
 * @param id The relationship.
 * @param from Where it starts.
 * @param to Where it ends.
 * @returns The routed edge.
 */
function route(id: string, from: Point, to: Point): DrawingEdge {
	return {
		edge: { id, from: `${id}-from`, to: `${id}-to`, kind: "call", emphasis: "normal" },
		curve: { from, segments: [{ kind: "line", to }] },
		path: "",
	};
}

/**
 * A drawing of a given size.
 * @param width Its width.
 * @param height Its height.
 * @param more Its routes and cards, when it has any.
 * @returns The drawing.
 */
function page(
	width: number,
	height: number,
	more: Partial<Pick<ArchitectureDrawing, "edges" | "cards">> = {},
): ArchitectureDrawing {
	return {
		direction: "down",
		wrapped: false,
		flanks: "bracketed",
		width,
		height,
		cards: more.cards ?? [],
		containers: [],
		edges: more.edges ?? [],
	};
}

/** A card at the given place, connected to nothing drawn here. */
const CARD = {
	measured: {
		node: VariantContentSchema.parse({
			nodes: [{ id: "card", name: "Card", kind: "module" }],
			edges: [],
		}).nodes[0]!,
		width: 100,
		height: 100,
		headerHeight: 0,
		runs: [],
	},
	box: { x: 50, y: 0, width: 100, height: 100 },
	depth: 0,
};

describe("the scorecard keeps", () => {
	test("the drawing better on more measures", () => {
		const smaller = page(1000, 1000);
		expect(bestOf([page(2000, 2000), smaller])).toBe(smaller);
	});

	test("the first drawing when another differs only by a reader-invisible amount", () => {
		const first = page(1000, 1000);
		expect(bestOf([first, page(1010, 1000)])).toBe(first);
	});

	test("the first drawing over a smaller page that adds a crossing", () => {
		const first = page(1000, 1000);
		const crossed = page(500, 500, {
			edges: [
				route("across", { x: 0, y: 50 }, { x: 100, y: 50 }),
				route("down", { x: 50, y: 0 }, { x: 50, y: 100 }),
			],
		});
		expect(bestOf([first, crossed])).toBe(first);
	});

	test("the first drawing over a smaller page with a route through a card", () => {
		const first = page(1000, 1000, { cards: [CARD] });
		const through = page(500, 500, {
			cards: [CARD],
			edges: [route("past", { x: 0, y: 50 }, { x: 200, y: 50 })],
		});
		expect(bestOf([first, through])).toBe(first);
	});
});

/**
 * The flank rule a drawing was kept under.
 * @param svg The rendered document.
 * @returns The rule's name.
 */
function ruleOf(svg: string): string | undefined {
	return /data-flank-rule="([^"]+)"/u.exec(svg)?.[1];
}

test("a proposal keeps its predecessor's flank rule", async () => {
	// Two skips to one card, listed so that a first render keeps the mirrored
	// rule: its lanes nest on the right, and the page is narrower than today's.
	const before = VariantContentSchema.parse({
		nodes: [
			{ id: "first", name: "Theme", kind: "module" },
			{ id: "second", name: "Layout", kind: "module" },
			{ id: "middle", name: "Intermediate stage", kind: "module" },
			{ id: "last", name: "SVG painters", kind: "module" },
			{ id: "end", name: "Other destination", kind: "module" },
		],
		edges: [
			{ id: "near", from: "second", to: "last", kind: "data", label: "placed architecture" },
			{ id: "far", from: "first", to: "last", kind: "data", label: "literal colors" },
			{ id: "other", from: "middle", to: "end", kind: "data", label: "another destination" },
			{ id: "step4", from: "last", to: "end", kind: "call" },
			{ id: "step3", from: "middle", to: "last", kind: "call" },
			{ id: "step2", from: "second", to: "middle", kind: "call" },
			{ id: "step1", from: "first", to: "second", kind: "call" },
		],
	});
	const first = ruleOf((await renderArchitecture({ content: before, theme: "light" })).svg);
	expect(first, "the first render keeps a rule other than the default").not.toBe("bracketed");
	const proposal = VariantContentSchema.parse({
		nodes: [...before.nodes, { id: "extra", name: "Extra stage", kind: "module" }],
		edges: [...before.edges, { id: "extra", from: "end", to: "extra", kind: "call" }],
	});
	const drawn = await renderArchitecture({
		content: proposal,
		predecessors: [before],
		theme: "light",
	});
	expect(ruleOf(drawn.svg)).toBe(first);
});

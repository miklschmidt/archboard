// Which way a board reads is the renderer's decision (ADR 0028): a first
// render is settled both ways and the reading that fits the reader's pane
// better is kept, down the page when they tie; a proposal keeps its
// predecessor's reading whatever it would choose alone; and the choice is
// deterministic and written on the document for the atlas, the measure
// script and these tests to read.

import { describe, expect, test } from "bun:test";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";
import { fitIn } from "@/shared/shell-geometry/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { labelsOffRuns, routesThroughCards } from "@/runtime/semantic-renderer/tests/drawn-ink";
import { across, along, readingOf } from "@/runtime/semantic-renderer/tests/drawn-reading";

/**
 * One hub with a fan of many dependents: a row of them across the page is
 * far wider than the pane, a column of them is not much taller than it.
 * @param count How many dependents.
 * @returns The board.
 */
function fan(count: number): VariantContent {
	const leaves = Array.from({ length: count }, (_, index) => ({
		id: `l${index}`,
		name: `Dependent service number ${index + 1}`,
		kind: "service",
	}));
	return VariantContentSchema.parse({
		nodes: [{ id: "hub", name: "Hub", kind: "service" }, ...leaves],
		edges: leaves.map((leaf) => ({ id: `e${leaf.id}`, from: "hub", to: leaf.id, kind: "call" })),
	});
}

/** A short chain: fits the pane whole either way, so the tie goes down the page. */
const CHAIN = VariantContentSchema.parse({
	nodes: ["a", "b", "c"].map((id) => ({ id, name: id, kind: "module" })),
	edges: [
		{ id: "ab", from: "a", to: "b", kind: "call" },
		{ id: "bc", from: "b", to: "c", kind: "call" },
	],
});

describe("a first render reads whichever way fits the pane better", () => {
	test("a wide fan reads left to right, and the document says so", async () => {
		const drawing = await renderArchitecture({ content: fan(16), theme: "light" });
		expect(drawing.readingDirection).toBe("right");
		expect(readingOf(drawing)).toBe("right");
		// Read that way, the fan is a column beside its hub, not a row under it.
		const hub = drawing.atlas.nodes["hub"]!;
		for (const leaf of Object.entries(drawing.atlas.nodes)
			.filter(([id]) => id !== "hub")
			.map(([, box]) => box)) {
			expect(along(leaf, "right")).toBeGreaterThan(along(hub, "right") + hub.width);
		}
		expect(
			new Set(Object.values(drawing.atlas.nodes).map((box) => across(box, "right"))).size,
		).toBe(Object.keys(drawing.atlas.nodes).length);
	});

	test("a fan read left to right keeps every label on a straight run of its own route", async () => {
		const labelled = fan(16);
		const content = VariantContentSchema.parse({
			...labelled,
			edges: labelled.edges.map((edge, index) => ({
				id: edge.id,
				from: edge.from,
				to: edge.to,
				kind: edge.kind,
				label: `request ${index + 1}`,
			})),
		});
		const drawing = await renderArchitecture({ content, theme: "light" });
		expect(drawing.readingDirection).toBe("right");
		expect(labelsOffRuns(drawing)).toEqual([]);
		expect(routesThroughCards(drawing, content)).toEqual([]);
	});

	test("a tie goes down the page", async () => {
		const drawing = await renderArchitecture({ content: CHAIN, theme: "light" });
		expect(fitIn(drawing)).toBe(1);
		expect(drawing.readingDirection).toBe("down");
		expect(readingOf(drawing)).toBe("down");
	});

	test("the choice is the same on every render", async () => {
		const [one, other] = await Promise.all([
			renderArchitecture({ content: fan(16), theme: "light" }),
			renderArchitecture({ content: fan(16), theme: "dark" }),
		]);
		expect(one.readingDirection).toBe(other.readingDirection);
		expect(one.atlas).toEqual(other.atlas);
	});
});

describe("a proposal keeps its predecessor's reading", () => {
	test("whatever it would choose alone", async () => {
		// A chain reads down; the proposal grows a fan off it that alone reads
		// right, and still reads down beside its predecessor.
		const grown = VariantContentSchema.parse({
			nodes: [...CHAIN.nodes, ...fan(16).nodes.filter((node) => node.id !== "hub")],
			edges: [
				...CHAIN.edges,
				...fan(16).edges.map((edge) => ({ id: edge.id, from: "c", to: edge.to, kind: edge.kind })),
			],
		});
		const alone = await renderArchitecture({ content: grown, theme: "light" });
		const proposal = await renderArchitecture({
			content: grown,
			predecessors: [CHAIN],
			theme: "light",
		});
		expect(alone.readingDirection).toBe("right");
		expect(proposal.readingDirection).toBe("down");
		expect(readingOf(proposal)).toBe("down");
	});

	test("and the other way round", async () => {
		const trimmed = VariantContentSchema.parse({
			nodes: fan(16).nodes.slice(0, 3),
			edges: fan(16).edges.slice(0, 2),
		});
		const alone = await renderArchitecture({ content: trimmed, theme: "light" });
		const proposal = await renderArchitecture({
			content: trimmed,
			predecessors: [fan(16)],
			theme: "light",
		});
		expect(alone.readingDirection).toBe("down");
		expect(proposal.readingDirection).toBe("right");
	});
});

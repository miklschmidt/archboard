// Which way a board reads is the renderer's decision (ADR 0028): a first
// render is settled both ways and the reading that fits the reader's pane
// better is kept, down the page when they tie; the choice is
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

/**
 * A pipeline of cards, long enough that a column of it is taller than the pane.
 * @param length How many stages.
 * @param framed Whether the stages sit inside one frame.
 * @returns The board.
 */
function pipeline(length: number, framed = false): VariantContent {
	const stages = Array.from({ length }, (_, index) => ({
		id: `s${index}`,
		name: `Pipeline stage ${index + 1}`,
		kind: "module",
		...(framed ? { parent: "app" } : {}),
	}));
	return VariantContentSchema.parse({
		nodes: [...(framed ? [{ id: "app", name: "Application", kind: "service" }] : []), ...stages],
		edges: stages.slice(1).map((stage, index) => ({
			id: `e${index}`,
			from: `s${index}`,
			to: stage.id,
			kind: "call",
		})),
	});
}

/**
 * Whether the document says its layers fold.
 * @param drawing The rendered board.
 * @param drawing.svg Its document.
 * @returns True when the reading folds.
 */
function folded(drawing: { readonly svg: string }): boolean {
	return /<svg [^>]*data-reading-wrapped="true"/.test(drawing.svg);
}

describe("a long flat chain folds toward the pane's shape", () => {
	test("when folding raises its fit, with no card crossed and every label on its run", async () => {
		const content = pipeline(12);
		const drawing = await renderArchitecture({ content, theme: "light" });
		expect(folded(drawing)).toBe(true);
		expect(fitIn(drawing)).toBe(1);
		expect(routesThroughCards(drawing, content)).toEqual([]);
		expect(labelsOffRuns(drawing)).toEqual([]);
	});

	test("never inside a frame, which the fold is kept away from", async () => {
		const drawing = await renderArchitecture({ content: pipeline(12, true), theme: "light" });
		expect(folded(drawing)).toBe(false);
	});
});

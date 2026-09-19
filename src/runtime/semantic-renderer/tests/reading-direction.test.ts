// Architecture diagrams always read top to bottom, including wide fans and long pipelines.

import { describe, expect, test } from "bun:test";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";
import { fitIn } from "@/shared/shell-geometry/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { labelsOffRuns, routesThroughCards } from "@/runtime/semantic-renderer/tests/drawn-ink";
import { readingOf } from "@/runtime/semantic-renderer/tests/drawn-reading";

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

/** A short chain that fits the pane at native scale. */
const CHAIN = VariantContentSchema.parse({
	nodes: ["a", "b", "c"].map((id) => ({ id, name: id, kind: "module" })),
	edges: [
		{ id: "ab", from: "a", to: "b", kind: "call" },
		{ id: "bc", from: "b", to: "c", kind: "call" },
	],
});

describe("architecture diagrams read top to bottom", () => {
	test("a wide fan stays below its source, and the document records downward reading", async () => {
		const drawing = await renderArchitecture({ content: fan(16), theme: "light" });
		expect(drawing.readingDirection).toBe("down");
		expect(readingOf(drawing)).toBe("down");
		// Width no longer rotates a fan into a column beside its source.
		const hub = drawing.atlas.nodes["hub"]!;
		for (const leaf of Object.entries(drawing.atlas.nodes)
			.filter(([id]) => id !== "hub")
			.map(([, box]) => box)) {
			expect(leaf.y).toBeGreaterThan(hub.y + hub.height);
		}
		const leaves = Object.entries(drawing.atlas.nodes).filter(([id]) => id !== "hub");
		expect(new Set(leaves.map(([, box]) => box.x)).size).toBe(leaves.length);
	});

	test("a wide downward fan keeps every label on a straight run of its own route", async () => {
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
		expect(drawing.readingDirection).toBe("down");
		expect(labelsOffRuns(drawing)).toEqual([]);
		expect(routesThroughCards(drawing, content)).toEqual([]);
	});

	test("a short chain reads down the page", async () => {
		const drawing = await renderArchitecture({ content: CHAIN, theme: "light" });
		expect(fitIn(drawing)).toBe(1);
		expect(drawing.readingDirection).toBe("down");
		expect(readingOf(drawing)).toBe("down");
	});

	test("geometry is the same on every render", async () => {
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

test.each([false, true])(
	"a long chain preserves reading order and clear routes (framed: %s)",
	async (framed) => {
		const content = pipeline(12, framed);
		const drawing = await renderArchitecture({ content, theme: "light" });
		const direction = readingOf(drawing);
		expect(direction).toBe("down");
		let continuations = 0;
		for (let index = 1; index < 12; index++) {
			const before = drawing.atlas.nodes[`s${index - 1}`]!;
			const after = drawing.atlas.nodes[`s${index}`]!;
			if (after.y < before.y) {
				continuations += 1;
				expect(framed).toBe(false);
				expect(after.x).toBeGreaterThan(before.x + before.width);
				expect(after.y).toBe(drawing.atlas.nodes["s0"]!.y);
			} else {
				expect(after.y).toBeGreaterThan(before.y + before.height);
				if (!framed) {
					expect(after.x).toBeLessThan(before.x + before.width);
					expect(after.x + after.width).toBeGreaterThan(before.x);
				}
			}
		}
		expect(continuations).toBe(framed ? 0 : 1);
		expect(routesThroughCards(drawing, content)).toEqual([]);
		expect(labelsOffRuns(drawing)).toEqual([]);
	},
);

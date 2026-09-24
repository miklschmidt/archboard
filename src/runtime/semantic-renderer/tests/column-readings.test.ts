// A board taller than the pane may read better folded into columns. The
// column count is chosen on each count's placement, and only the chosen count
// is settled (TASK-342). The engine's pages for a real board are its own to
// change, so the rule is held against readings whose answers are fixed here.

import { describe, expect, test } from "bun:test";
import { REFERENCE_PANE } from "@/shared/shell-geometry/index";
import { chooseReading, type ArchitectureDrawing } from "@/runtime/semantic-renderer/layout";

/** Cards in the unfolded reading, one to a row, each row calling the next. */
const ROWS = 8;

/**
 * A page that fits the reference pane at the given scale.
 * @param fit The scale.
 * @returns The page.
 */
function pageAt(fit: number): Pick<ArchitectureDrawing, "width" | "height"> {
	return { width: REFERENCE_PANE.width / fit, height: REFERENCE_PANE.height / fit };
}

/**
 * The unfolded reading: one narrow column of cards twice as tall as the pane.
 * @returns The settled drawing.
 */
function unfolded(): ArchitectureDrawing {
	const height = REFERENCE_PANE.height * 2;
	const cards = Array.from({ length: ROWS }, (_, index) => ({
		measured: {
			node: { id: `c${index}`, order: 1000 * (index + 1), name: `Card ${index}`, kind: "module" },
			width: 200,
			height: 60,
			headerHeight: 0,
			runs: [],
		},
		box: { x: 40, y: 40 + (index * (height - 80)) / ROWS, width: 200, height: 60 },
		depth: 0,
	}));
	return {
		direction: "down",
		width: 280,
		height,
		cards,
		containers: [],
		edges: cards.slice(1).map((card, index) => ({
			edge: {
				id: `e${index}`,
				order: 1000 * (index + 1),
				from: `c${index}`,
				to: card.measured.node.id,
				kind: "call",
				emphasis: "normal",
			},
			curve: { from: { x: 0, y: 0 }, segments: [] },
			path: "",
		})),
	};
}

/**
 * Readings whose placed pages and settled drawings are fixed by column count.
 * @param baseline The settled unfolded reading.
 * @param placed Each folded count's placed fit; a count not named fits as the settled baseline does.
 * @param settled Each folded count's settled drawing, or its refusal.
 * @returns The readings, and the column counts settled, in the order asked.
 */
function readingsFrom(
	baseline: ArchitectureDrawing,
	placed: Readonly<Record<number, number>>,
	settled: (columns: number) => ArchitectureDrawing,
) {
	const asked: number[] = [];
	const readingOf = (columns: number) => ({
		// The unfolded placement reserves no label, so it fits better than its
		// settled page; a fold is measured against the settled page.
		page: async () => pageAt(columns === 1 ? 0.95 : (placed[columns] ?? 0.5)),
		settle: async () => {
			asked.push(columns);
			return columns === 1 ? baseline : settled(columns);
		},
	});
	return { readingOf, asked };
}

describe("a board taller than the pane", () => {
	test("settles only the column count whose placement fits materially better", async () => {
		const baseline = unfolded();
		const folded = { ...unfolded(), ...pageAt(0.9) };
		// Four columns replace two; three and five fit better than the count
		// kept before them, but by less than the material gain.
		const { readingOf, asked } = readingsFrom(
			baseline,
			{ 2: 0.6, 3: 0.62, 4: 0.9, 5: 0.92 },
			() => folded,
		);
		expect(await chooseReading(readingOf)).toBe(folded);
		expect(asked).toEqual([1, 4]);
	});

	test.each([
		[
			"refused",
			() => {
				throw new Error("a route cannot clear a card");
			},
		],
		["settled no better than the unfolded reading", () => ({ ...unfolded(), ...pageAt(0.51) })],
	] as const)("keeps the unfolded reading when the chosen count is %s", async (_name, settle) => {
		const baseline = unfolded();
		const { readingOf } = readingsFrom(baseline, { 3: 0.9 }, settle);
		expect(await chooseReading(readingOf)).toBe(baseline);
	});
});

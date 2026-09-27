// A board taller than the pane may read better folded into columns. The
// column count is chosen on each count's placement, and only the chosen count
// is settled (TASK-342), and kept only when it also scores higher once each
// crossing takes its share of the fit. The engine's pages for a real board
// are its own to change, so the rule is held against readings whose answers
// are fixed here.

import { describe, expect, test } from "bun:test";
import { REFERENCE_PANE } from "@/shared/shell-geometry/index";
import {
	chooseReading,
	RouteCheckFailed,
	type ArchitectureDrawing,
	type Point,
} from "@/runtime/semantic-renderer/layout";

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

/**
 * A route through some corners, each turned on a short curve as a drawn route is.
 * @param points Its ends and corners.
 * @returns The route.
 */
function rounded(points: readonly Point[]): ArchitectureDrawing["edges"][number]["curve"] {
	const segments = points.slice(1, -1).flatMap((corner, index) => {
		const toward = (end: Point) => ({
			x: corner.x + Math.sign(end.x - corner.x) * 4,
			y: corner.y + Math.sign(end.y - corner.y) * 4,
		});
		return [
			{ kind: "line" as const, to: toward(points[index]!) },
			{ kind: "cubic" as const, first: corner, second: corner, to: toward(points[index + 2]!) },
		];
	});
	return { from: points[0]!, segments: [...segments, { kind: "line", to: points.at(-1)! }] };
}

/**
 * The unfolded reading with its first line hooked: out of Card 0's side, down
 * past its bottom, and across into Card 1.
 * @returns The settled drawing.
 */
function hooked(): ArchitectureDrawing {
	const plain = unfolded();
	const hook = [
		{ x: 240, y: 70 },
		{ x: 250, y: 70 },
		{ x: 250, y: 200 },
		{ x: 140, y: 200 },
		{ x: 140, y: plain.cards[1]!.box.y },
	];
	const [first, ...rest] = plain.edges;
	return { ...plain, edges: [{ ...first!, curve: rounded(hook) }, ...rest] };
}

/**
 * A fold that fits the pane at nine tenths, drawn as the given straight lines.
 * @param lines Each line's ends.
 * @returns The settled drawing.
 */
function foldDrawing(lines: readonly { from: Point; to: Point }[]): ArchitectureDrawing {
	return {
		...unfolded(),
		...pageAt(0.9),
		edges: lines.map(({ from, to }, index) => ({
			edge: {
				id: `x${index}`,
				order: index,
				from: "c0",
				to: "c1",
				kind: "call",
				emphasis: "normal",
			},
			curve: { from, segments: [{ kind: "line" as const, to }] },
			path: "",
		})),
	};
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
				throw new RouteCheckFailed("a route cannot clear a card");
			},
		],
		["settled no better than the unfolded reading", () => ({ ...unfolded(), ...pageAt(0.51) })],
	] as const)("keeps the unfolded reading when the chosen count is %s", async (_name, settle) => {
		const baseline = unfolded();
		const { readingOf } = readingsFrom(baseline, { 3: 0.9 }, settle);
		expect(await chooseReading(readingOf)).toBe(baseline);
	});

	test("throws a fault in settling the chosen count", async () => {
		const { readingOf } = readingsFrom(unfolded(), { 3: 0.9 }, () => {
			throw new TypeError("a pass read past a line's end");
		});
		await expect(chooseReading(readingOf)).rejects.toThrow(TypeError);
	});

	// The unfolded reading hooks one line into a card's side, where the fold
	// hooks none, so the fold reads worse only on its crossings and better on
	// its hooks: the reading measures and the fit alone would take it, and
	// its score, with a share of its fit for each crossing, keeps the
	// unfolded reading.
	test("keeps the unfolded reading when the fold fits better but crosses far more", async () => {
		const baseline = hooked();
		// A grid of five level and five upright lines: twenty-five crossings.
		const folded = foldDrawing(
			[0, 1, 2, 3, 4].flatMap((index) => [
				{ from: { x: 0, y: 100 + index * 40 }, to: { x: 400, y: 100 + index * 40 } },
				{ from: { x: 100 + index * 40, y: 0 }, to: { x: 100 + index * 40, y: 400 } },
			]),
		);
		const { readingOf } = readingsFrom(baseline, { 3: 0.9 }, () => folded);
		expect(await chooseReading(readingOf)).toBe(baseline);
	});

	// Command interface, One command's path (Graphviz): unfolded, it crosses one
	// line fewer than folded but hooks lines into cards' sides. Read first, the
	// unfolded drawing wins on its crossings; weighed as before ADR 0039, the
	// fold scores higher; and the unfolded drawing reads worse on its hooks, so
	// the guard keeps the earlier pick.
	test("keeps the fold where the unfolded reading crosses a line fewer but hooks one more", async () => {
		const baseline = hooked();
		const folded = foldDrawing([
			{ from: { x: 0, y: 200 }, to: { x: 400, y: 200 } },
			{ from: { x: 200, y: 0 }, to: { x: 200, y: 400 } },
		]);
		const { readingOf } = readingsFrom(baseline, { 3: 0.9 }, () => folded);
		expect(await chooseReading(readingOf)).toBe(folded);
	});
});

// The scorecard a layout change is judged by: every measure of quality a
// reader pays for, read off the drawn page, so no single number decides
// whether a drawing is better. Fit in the pane rewards a shape and ignores
// empty space; page area and card share reward compactness and ignore the
// pane; route length, bends and crossings say what a reader traces; lane ink
// and the flank fan say how much wiring runs down margins; label reach says
// how far a reader goes along a line before meeting its words, and the shared
// corridor how long two routes run side by side. The invariants at the end
// must stay zero.
//
// Read by docs/design/wide-board-layout-fixtures/measure.ts, which prints it
// for every board and compares two runs measure by measure.

import type { VariantContent } from "@/shared/semantic-board/index";
import type { RenderedDiagram } from "@/runtime/semantic-renderer/index";
import {
	fitOf,
	flankFanOf,
	inkOf,
	labelReachOf,
	labelsOffRuns,
	routesThroughCards,
	runsOf,
	sharedCorridorOf,
	type Run,
} from "@/runtime/semantic-renderer/tests/drawn-ink";

/** Which way a measure should move for a reader to be better off. */
type Better = "lower" | "higher";

/** One measure of a drawing. */
interface Measure {
	readonly name: string;
	readonly value: number;
	/** How to print it. */
	readonly digits: number;
	readonly better: Better;
	/** What it means, in a reader's words. */
	readonly meaning: string;
}

/**
 * Whether a value lies strictly between two others, half a unit in.
 * @param value The value.
 * @param one One bound.
 * @param other The other bound.
 * @returns True when it is inside.
 */
function inside(value: number, one: number, other: number): boolean {
	return value > Math.min(one, other) + 0.5 && value < Math.max(one, other) - 0.5;
}

/**
 * How many times two different routes cross at a right angle.
 * @param runs Every run of every route.
 * @returns The crossings.
 */
function crossingsOf(runs: readonly Run[]): number {
	const horizontal = runs.filter(([from, to]) => from.y === to.y && from.x !== to.x);
	const vertical = runs.filter(([from, to]) => from.x === to.x && from.y !== to.y);
	let count = 0;
	for (const [left, right, id] of horizontal) {
		for (const [top, bottom, other] of vertical) {
			if (id === other) continue;
			if (inside(top.x, left.x, right.x) && inside(left.y, top.y, bottom.y)) count += 1;
		}
	}
	return count;
}

/**
 * Every measure of one drawing.
 * @param drawing The rendered board.
 * @param content The board.
 * @returns The scorecard, in a fixed order.
 */
function scorecardOf(drawing: RenderedDiagram, content: VariantContent): Measure[] {
	const cards = Object.entries(drawing.atlas.nodes)
		.filter(([id]) => !(id in drawing.atlas.regions))
		.map(([, box]) => box);
	const page = drawing.width * drawing.height;
	const runs = runsOf(drawing);
	const length = runs.reduce(
		(total, [from, to]) => total + Math.abs(to.x - from.x) + Math.abs(to.y - from.y),
		0,
	);
	const ink = inkOf(drawing);
	const corridor = sharedCorridorOf(drawing);
	const reach = labelReachOf(drawing);
	return [
		{
			name: "fit",
			value: fitOf(drawing),
			digits: 2,
			better: "higher",
			meaning: "scale the whole drawing shows at in the pane",
		},
		{ name: "megapixels", value: page / 1e6, digits: 2, better: "lower", meaning: "page area" },
		{
			name: "card share",
			value: cards.reduce((total, box) => total + box.width * box.height, 0) / page,
			digits: 2,
			better: "higher",
			meaning: "share of the page under cards; the rest is space between them",
		},
		{
			name: "route length",
			value: length,
			digits: 0,
			better: "lower",
			meaning: "total length of every route",
		},
		{
			name: "bends per route",
			value: ink.bends,
			digits: 1,
			better: "lower",
			meaning: "turns a reader follows along one route",
		},
		{
			name: "crossings",
			value: crossingsOf(runs),
			digits: 0,
			better: "lower",
			meaning: "right-angle crossings between two routes",
		},
		{
			name: "lane ink",
			value: ink.corridor,
			digits: 2,
			better: "lower",
			meaning: "share of route length in margin lanes beside no card",
		},
		{
			name: "flank fan",
			value: flankFanOf(drawing, content),
			digits: 0,
			better: "lower",
			meaning: "most routes leaving one card by its beside flank",
		},
		{
			name: "label reach",
			value: reach.farthest,
			digits: 0,
			better: "lower",
			meaning: "farthest a label sits from the nearer end of the line it names",
		},
		{
			name: "label strand",
			value: reach.strand,
			digits: 2,
			better: "lower",
			meaning: "farthest a label sits from its nearer card, as a share of the way between the two",
		},
		{
			name: "shared corridor",
			value: corridor.longest,
			digits: 0,
			better: "lower",
			meaning: "longest stretch two routes run side by side",
		},
		{
			name: "corridor routes",
			value: corridor.widest,
			digits: 0,
			better: "lower",
			meaning: "most routes a reader counts across one corridor",
		},
		{
			name: "shared ink",
			value: corridor.share,
			digits: 2,
			better: "lower",
			meaning: "share of route length drawn beside another route",
		},
		{
			name: "routes through cards",
			value: routesThroughCards(drawing, content).length,
			digits: 0,
			better: "lower",
			meaning: "invariant, must be zero",
		},
		{
			name: "labels off runs",
			value: labelsOffRuns(drawing).length,
			digits: 0,
			better: "lower",
			meaning: "invariant, must be zero",
		},
	];
}

/**
 * How one measure moved between two drawings of the same board.
 * @param before The measure in the first run.
 * @param after The same measure in the second run.
 * @returns "better", "worse" or "same".
 */
function verdictOf(before: Measure, after: Measure): string {
	const scale = 10 ** before.digits;
	const delta = Math.round(after.value * scale) - Math.round(before.value * scale);
	if (delta === 0) return "same";
	return delta < 0 === (before.better === "lower") ? "better" : "worse";
}

export { scorecardOf, verdictOf, type Measure };

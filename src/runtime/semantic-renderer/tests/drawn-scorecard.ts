// The scorecard a layout change is judged by: every measure a reader pays
// for, read off the drawn page, so no single number decides whether a drawing
// is better. Fit in the pane rewards a shape and ignores empty space; page
// area rewards compactness and ignores the pane; route length, bends and
// crossings say what a reader traces; lanes, side ports and horizontal label
// runs say how the wiring sits. The invariants at the end must stay zero.
//
// Read by docs/design/wide-board-layout-fixtures/measure.ts, which prints it
// for every board and compares two runs measure by measure.

import type { VariantContent } from "@/shared/semantic-board/index";
import type { RenderedDiagram } from "@/runtime/semantic-renderer/index";
import {
	fitOf,
	flankFanOf,
	inkOf,
	labelsOffRuns,
	routesThroughCards,
} from "@/runtime/semantic-renderer/tests/drawn-ink";
import { faceOf, readingOf } from "@/runtime/semantic-renderer/tests/drawn-reading";
import {
	corridorPoints,
	routeLabels,
	type DrawnPoint,
} from "@/runtime/semantic-renderer/tests/drawn-routes";

/** Which way a measure should move for a reader to be better off. */
type Better = "lower" | "higher" | "neither";

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

/** One drawn run between two points. */
type Run = readonly [DrawnPoint, DrawnPoint, string];

/**
 * Every straight run of every route, bridges removed.
 * @param drawing The rendered board.
 * @returns The runs, each with its relationship's id.
 */
function runsOf(drawing: RenderedDiagram): Run[] {
	return [...corridorPoints(drawing.svg)].flatMap(([id, points]) =>
		points.slice(1).map((end, index): Run => [points[index]!, end, id]),
	);
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
 * How many route ends meet a card on a side face rather than on the face ahead
 * of or behind it in the reading.
 * @param drawing The rendered board.
 * @param content The board.
 * @returns Side ends, and all ends.
 */
function sideEndsOf(
	drawing: RenderedDiagram,
	content: VariantContent,
): { readonly side: number; readonly all: number } {
	const direction = readingOf(drawing);
	const routes = corridorPoints(drawing.svg);
	let side = 0,
		all = 0;
	for (const edge of content.edges) {
		const route = routes.get(edge.id);
		const from = drawing.atlas.nodes[edge.from];
		const to = drawing.atlas.nodes[edge.to];
		if (route === undefined || from === undefined || to === undefined || edge.from === edge.to)
			continue;
		for (const [point, box] of [
			[route[0]!, from],
			[route.at(-1)!, to],
		] as const) {
			all += 1;
			const face = faceOf(point, box, direction);
			if (face === "beside" || face === "return") side += 1;
		}
	}
	return { side, all };
}

/**
 * How many labels sit on a horizontal run of their own route.
 * @param drawing The rendered board.
 * @returns Those labels, and all labels.
 */
function horizontalLabelsOf(drawing: RenderedDiagram): {
	readonly horizontal: number;
	readonly all: number;
} {
	const routes = corridorPoints(drawing.svg);
	const labels = [...routeLabels(drawing.svg)];
	const horizontal = labels.filter(([id, label]) => {
		const centre = label.y + label.height / 2;
		const route = routes.get(id) ?? [];
		return route.some(
			(point, index) =>
				index > 0 &&
				route[index - 1]!.y === point.y &&
				Math.abs(point.y - centre) < 1 &&
				Math.min(point.x, route[index - 1]!.x) <= label.x &&
				Math.max(point.x, route[index - 1]!.x) >= label.x + label.width,
		);
	}).length;
	return { horizontal, all: labels.length };
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
	const ends = sideEndsOf(drawing, content);
	const labels = horizontalLabelsOf(drawing);
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
			name: "side ends",
			value: ends.all === 0 ? 0 : ends.side / ends.all,
			digits: 2,
			better: "neither",
			meaning: "share of route ends on a card's side face",
		},
		{
			name: "horizontal labels",
			value: labels.all === 0 ? 0 : labels.horizontal / labels.all,
			digits: 2,
			better: "neither",
			meaning: "share of labels on a horizontal run of their route",
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
 * @returns "better", "worse", "same", or "more"/"fewer" for a measure with no preferred direction.
 */
function verdictOf(before: Measure, after: Measure): string {
	const scale = 10 ** before.digits;
	const delta = Math.round(after.value * scale) - Math.round(before.value * scale);
	if (delta === 0) return "same";
	if (before.better === "neither") return delta > 0 ? "more" : "fewer";
	return delta < 0 === (before.better === "lower") ? "better" : "worse";
}

export { scorecardOf, verdictOf, type Measure };

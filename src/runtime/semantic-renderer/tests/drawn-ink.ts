// What a reader gets from a drawn architecture, measured off the page: the
// fit in the reference pane, the routes that run through cards, the skips
// fanned down one card's flank, the share of route ink in margin corridors,
// the bends a reader follows, and the labels that sit off their own route.
//
// One owner for these, read by the wide-board suite and by
// docs/design/wide-board-layout-fixtures/measure.ts, so a number in a test and
// the same number in a design note are the same measurement.

import type { DiagramBox, VariantContent } from "@/shared/semantic-board/index";
import { fitIn } from "@/shared/shell-geometry/index";
import type { RenderedDiagram } from "@/runtime/semantic-renderer/index";
import {
	across,
	along,
	breadth,
	faceOf,
	readingOf,
} from "@/runtime/semantic-renderer/tests/drawn-reading";
import {
	corridorPoints,
	routeCrosses,
	routeLabels,
	routePoints,
	type DrawnPoint,
} from "@/runtime/semantic-renderer/tests/drawn-routes";

/** Route ink in margin corridors as a share of all ink, and bends per route. */
interface Ink {
	readonly corridor: number;
	readonly bends: number;
}

/**
 * A drawing's fit in the reference pane.
 * @param drawing The rendered board.
 * @returns The scale that shows it whole, capped at one.
 */
function fitOf(drawing: RenderedDiagram): number {
	return fitIn(drawing);
}

/**
 * The cards of a drawing: its nodes less the frames, which a route inside
 * them or entering them crosses by design.
 * @param drawing The rendered board.
 * @returns Each card's box by id.
 */
function cardsOf(drawing: RenderedDiagram): [string, DiagramBox][] {
	return Object.entries(drawing.atlas.nodes).filter(([id]) => !(id in drawing.atlas.regions));
}

/**
 * The routes that pass through a card that is neither of their ends.
 * @param drawing The rendered board.
 * @param content The board.
 * @returns "edge through card" for each offence.
 */
function routesThroughCards(drawing: RenderedDiagram, content: VariantContent): string[] {
	const routes = routePoints(drawing.svg);
	const found: string[] = [];
	for (const edge of content.edges) {
		const route = routes.get(edge.id);
		if (route === undefined) continue;
		for (const [id, box] of cardsOf(drawing)) {
			if (id === edge.from || id === edge.to) continue;
			if (routeCrosses(route, box)) found.push(`${edge.id} through ${id}`);
		}
	}
	return found;
}

/**
 * How many routes leave each card by each of its flanks: the left and right
 * faces when the page reads down, the top and bottom when it reads left to
 * right. A flank rule can put skips on either (layout-rules.md section 21).
 * @param drawing The rendered board.
 * @param content The board.
 * @returns The largest count over the cards and flanks: a fan of routes down one flank.
 */
function flankFanOf(drawing: RenderedDiagram, content: VariantContent): number {
	const direction = readingOf(drawing);
	const counts = new Map<string, number>();
	for (const [id, points] of corridorPoints(drawing.svg)) {
		const edge = content.edges.find((candidate) => candidate.id === id);
		const from = edge === undefined ? undefined : drawing.atlas.nodes[edge.from];
		if (edge === undefined || from === undefined) continue;
		const face = faceOf(points[0]!, from, direction);
		if (face !== "beside" && face !== "return") continue;
		const key = `${edge.from}:${face}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return Math.max(0, ...counts.values());
}

/**
 * The share of route ink in runs along the reading beside no card, which is
 * a lane down a margin rather than a route between rows, and the bends per
 * route.
 * @param drawing The rendered board.
 * @returns Corridor ink over all ink, and bends per route.
 */
function inkOf(drawing: RenderedDiagram): Ink {
	const direction = readingOf(drawing);
	const cards = Object.values(drawing.atlas.nodes);
	let total = 0,
		corridor = 0,
		bends = 0,
		routes = 0;
	for (const points of corridorPoints(drawing.svg).values()) {
		routes += 1;
		for (let index = 1; index < points.length; index += 1) {
			const start = points[index - 1]!,
				end = points[index]!;
			const length = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
			total += length;
			const lane = across(start, direction);
			const alongReading =
				lane === across(end, direction) && along(start, direction) !== along(end, direction);
			if (
				alongReading &&
				!cards.some(
					(box) =>
						across(box, direction) <= lane &&
						lane <= across(box, direction) + breadth(box, direction),
				)
			)
				corridor += length;
			if (index >= 2) {
				const before = points[index - 2]!;
				if ((before.x === start.x) !== (start.x === end.x)) bends += 1;
			}
		}
	}
	return { corridor: total === 0 ? 0 : corridor / total, bends: routes === 0 ? 0 : bends / routes };
}

/**
 * Whether a label lies on one straight axis-aligned run of a route.
 * @param points The route without its bridges.
 * @param label The label's box.
 * @returns True when one run carries the whole label through its centre.
 */
function onStraightRun(
	points: readonly DrawnPoint[],
	label: { x: number; y: number; width: number; height: number },
): boolean {
	const centre = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
	// The engine centres an inline label at a rounded width and snaps routes to
	// whole units, so a label on its run can sit up to about a unit off it
	// (0.88 on Canvas server): invisible, and not a label off its line.
	const snap = 1;
	return points.slice(1).some((end, index) => {
		const start = points[index]!;
		const horizontal = start.y === end.y && Math.abs(start.y - centre.y) < snap;
		const vertical = start.x === end.x && Math.abs(start.x - centre.x) < snap;
		return (
			(horizontal &&
				Math.min(start.x, end.x) <= label.x &&
				Math.max(start.x, end.x) >= label.x + label.width) ||
			(vertical &&
				Math.min(start.y, end.y) <= label.y &&
				Math.max(start.y, end.y) >= label.y + label.height)
		);
	});
}

/**
 * The labelled relationships whose label does not sit on a straight run of
 * its own route.
 * @param drawing The rendered board.
 * @returns Their ids.
 */
function labelsOffRuns(drawing: RenderedDiagram): string[] {
	const routes = corridorPoints(drawing.svg);
	const found: string[] = [];
	for (const [id, label] of routeLabels(drawing.svg)) {
		const route = routes.get(id);
		if (route !== undefined && !onStraightRun(route, label)) found.push(id);
	}
	return found;
}

export { type Ink, fitOf, flankFanOf, inkOf, labelsOffRuns, routesThroughCards };

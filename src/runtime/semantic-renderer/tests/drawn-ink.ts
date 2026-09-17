// What a reader gets from a drawn architecture, measured off the page: the
// fit in the reference pane, the routes that run through cards, the skips
// fanned down one card's flank, the share of route ink in margin corridors,
// the bends a reader follows, the labels that sit off their own route, how far
// a label sits from the line's nearer end, and how long two routes run side by
// side.
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

/** One drawn run between two points, with the id of the route that drew it. */
type Run = readonly [DrawnPoint, DrawnPoint, string];

/** How far the labels sit from the end of the line they name. */
interface Reach {
	/** The farthest any label sits from the nearer end of its own route. */
	readonly farthest: number;
	/**
	 * The worst of those distances as a share of the way between the two cards
	 * the line joins: half is a label at the midpoint of a straight route, and
	 * anything near one is a label stranded away from both of its cards. Unlike
	 * the distance itself, this does not grow with the board.
	 */
	readonly strand: number;
}

/** Two routes drawn side by side, near enough to read as one corridor. */
interface Corridor {
	/** The longest stretch over which two routes run side by side. */
	readonly longest: number;
	/** The most routes side by side over one long stretch: what a reader counts across. */
	readonly widest: number;
	/** The share of route ink drawn beside another route. */
	readonly share: number;
}

/**
 * How near two routes have to be drawn to read as one corridor rather than as
 * two lines going the same way. The engine spaces parallel routes 20 apart
 * (`elk.spacing.edgeEdge`) and snapping moves a run up to a unit, so 20 and 21
 * are what it deliberately draws; the next separation any board uses is 26.
 */
const SIDE_BY_SIDE = 24;

/**
 * How long a corridor has to be before a reader has to count across it to tell
 * two routes apart. No two routes on any board the vault holds share more than
 * 382 units (docs/design/layout-rules.md section 25), so a corridor this long
 * is already longer than anything on a board a reader reads today.
 */
const CORRIDOR_RUN = 400;

/**
 * Every straight run of every route, with the id of the route that drew it.
 * Bridges are removed: a bridge lifts one route over another and is not a
 * place either of them goes.
 * @param drawing The rendered board.
 * @returns The runs.
 */
function runsOf(drawing: RenderedDiagram): Run[] {
	return [...corridorPoints(drawing.svg)].flatMap(([id, points]) =>
		points.slice(1).map((end, index): Run => [points[index]!, end, id]),
	);
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

/**
 * How far each label sits from the nearer end of the line it names, which is
 * how far a reader tracing that line from either card goes before meeting its
 * words. Measured from the badge's centre, the point the renderer itself
 * places by (`lib/layout/label-runs.ts`).
 * @param drawing The rendered board.
 * @returns The farthest and the middle distance, in page units.
 */
function labelReachOf(drawing: RenderedDiagram): Reach {
	const routes = corridorPoints(drawing.svg);
	const reaches: number[] = [];
	const strands: number[] = [];
	for (const [id, label] of routeLabels(drawing.svg)) {
		const points = routes.get(id);
		if (points === undefined || points.length < 2) continue;
		const centre = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
		const ends = [points[0]!, points.at(-1)!];
		const reach = Math.min(...ends.map((end) => Math.hypot(centre.x - end.x, centre.y - end.y)));
		const between = Math.hypot(ends[0]!.x - ends[1]!.x, ends[0]!.y - ends[1]!.y);
		reaches.push(reach);
		strands.push(between === 0 ? 0 : reach / between);
	}
	const sorted = reaches.toSorted((one, other) => one - other);
	return {
		farthest: sorted.at(-1) ?? 0,
		strand: Math.max(0, ...strands),
	};
}

/**
 * How far along one run another route runs beside it, or nothing when the two
 * are not parallel, are not side by side, or never overlap.
 * @param one The run.
 * @param other The other route's run.
 * @param gap How far apart the two may be drawn and still be side by side.
 * @returns The stretch they share, as [start, end] along their own axis.
 */
function besideRun(
	one: Run,
	other: Run,
	gap: number = SIDE_BY_SIDE,
): readonly [number, number] | undefined {
	const axis = one[0].x === one[1].x && one[0].y !== one[1].y ? "y" : "x";
	const straight = (run: Run) =>
		axis === "y"
			? run[0].x === run[1].x && run[0].y !== run[1].y
			: run[0].y === run[1].y && run[0].x !== run[1].x;
	const lane = axis === "y" ? "x" : "y";
	if (!straight(one) || !straight(other)) return undefined;
	if (Math.abs(one[0][lane] - other[0][lane]) > gap) return undefined;
	const start = Math.max(
		Math.min(one[0][axis], one[1][axis]),
		Math.min(other[0][axis], other[1][axis]),
	);
	const end = Math.min(
		Math.max(one[0][axis], one[1][axis]),
		Math.max(other[0][axis], other[1][axis]),
	);
	return end > start ? [start, end] : undefined;
}

/**
 * How much of a run is covered by the stretches other routes share with it.
 * @param stretches The shared stretches, in any order.
 * @returns The length they cover between them, counting an overlap once.
 */
function coveredBy(stretches: readonly (readonly [number, number])[]): number {
	let covered = 0;
	let reached = Number.NEGATIVE_INFINITY;
	for (const [start, end] of stretches.toSorted((one, other) => one[0] - other[0])) {
		covered += Math.max(0, end - Math.max(start, reached));
		reached = Math.max(reached, end);
	}
	return covered;
}

/**
 * How many routes share the corridor one run lies in: every route whose run is
 * parallel to it, shares a long stretch of it, and is within reach of it across
 * a chain of neighbours, since a reader counting across a bundle counts the
 * whole bundle and not only its near side.
 * @param run The run.
 * @param runs Every run of every route.
 * @returns The routes a reader counts across there, the run's own included.
 */
function bundleAt(run: Run, runs: readonly Run[]): number {
	const lane = run[0].x === run[1].x && run[0].y !== run[1].y ? "x" : "y";
	const beside = runs
		.filter((other) => {
			const shared = besideRun(run, other, Number.POSITIVE_INFINITY);
			return shared !== undefined && shared[1] - shared[0] >= CORRIDOR_RUN;
		})
		.toSorted((one, other) => one[0][lane] - other[0][lane]);
	let bundle = new Set<string>();
	let widest = 0;
	let last: number | undefined;
	for (const other of beside) {
		if (last !== undefined && other[0][lane] - last > SIDE_BY_SIDE) bundle = new Set();
		bundle.add(other[2]);
		last = other[0][lane];
		widest = Math.max(widest, bundle.size);
	}
	return widest;
}

/**
 * The corridors two routes share: the longest stretch over which two of them
 * are drawn side by side, the most routes side by side over such a stretch,
 * and the share of all route ink that has another route beside it. A reader
 * can follow one line out of such a corridor only by counting lines across it.
 * @param drawing The rendered board.
 * @returns The longest shared stretch, the widest bundle and the share of ink drawn beside another route.
 */
function sharedCorridorOf(drawing: RenderedDiagram): Corridor {
	const runs = runsOf(drawing);
	let total = 0,
		beside = 0,
		longest = 0,
		widest = 0;
	for (const run of runs) {
		total += Math.abs(run[1].x - run[0].x) + Math.abs(run[1].y - run[0].y);
		const stretches: (readonly [number, number])[] = [];
		for (const other of runs) {
			if (other[2] === run[2]) continue;
			const shared = besideRun(run, other);
			if (shared === undefined) continue;
			stretches.push(shared);
			longest = Math.max(longest, shared[1] - shared[0]);
		}
		beside += coveredBy(stretches);
		widest = Math.max(widest, bundleAt(run, runs));
	}
	return { longest, widest, share: total === 0 ? 0 : beside / total };
}

export {
	type Corridor,
	type Ink,
	type Reach,
	type Run,
	SIDE_BY_SIDE,
	fitOf,
	flankFanOf,
	inkOf,
	labelReachOf,
	labelsOffRuns,
	routesThroughCards,
	runsOf,
	sharedCorridorOf,
};

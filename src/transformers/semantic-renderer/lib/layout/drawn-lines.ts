// The lines a reader sees, as opposed to the routes that draw them. Routes of
// one kind that lie on one line are a trunk: one drawn line, whose ink the
// heaviest of them draws (then the earliest painted). Crossings are between
// drawn lines, and each line's straight runs are what a hop may stand on.
import { APPROACH_STRAIGHT } from "@/transformers/semantic-renderer/lib/design";
import type { DrawingEdge } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	EPSILON,
	segmentStart,
	type Curve,
} from "@/transformers/semantic-renderer/lib/layout/curves";

type Axis = "x" | "y";

/** Two straight pieces closer than this across their axis draw as one line. */
const SHARED_INK = 2;

/** Which of several routes on one line draws it: the heaviest. */
const WEIGHT = { hero: 2, normal: 1, muted: 0 } as const;

/** One axis-aligned straight piece in the original paint order. */
interface Run {
	readonly edgeIndex: number;
	readonly segmentIndex: number;
	readonly from: Point;
	readonly to: Point;
	readonly axis: Axis;
	readonly length: number;
	/** Straight line kept clear at each end: an arrowhead's approach at a route's end, none at a bend. */
	readonly startRoom: number;
	readonly endRoom: number;
}

/** One drawn line at a crossing: the run that draws its ink there, and every run sharing that ink. */
interface Line {
	readonly drawer: Run;
	readonly members: readonly Run[];
}

/** Two drawn lines crossing on straight ink. */
interface DrawnCrossing {
	readonly point: Point;
	readonly lines: readonly [Line, Line];
}

/** Local upper ink and the lower connections it clears. */
interface Bridge {
	readonly edgeId: string;
	readonly under: readonly string[];
	readonly curve: Curve;
	/** A join on the upper line stands on this piece: the cut clears its mark too. */
	readonly join?: true;
}

/**
 * The other axis.
 * @param axis One axis.
 * @returns The perpendicular one.
 */
function across(axis: Axis): Axis {
	return axis === "x" ? "y" : "x";
}

/**
 * Whether two boxes touch. Bounds include the clearance their caller needs.
 * @param a The first box.
 * @param b The second box.
 * @returns Whether the boxes intersect.
 */
function overlaps(a: Box, b: Box): boolean {
	return (
		a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
	);
}

/**
 * Which coordinate changes on a nonzero orthogonal line.
 * @param from The line's start.
 * @param to The line's end.
 * @returns Its axis, or undefined for a diagonal or point.
 */
function straightAxis(from: Point, to: Point): Axis | undefined {
	// Engine coordinates carry floating noise (575.0000000000001 against 575);
	// a line that is straight to the eye is straight here.
	const dx = Math.abs(to.x - from.x),
		dy = Math.abs(to.y - from.y);
	if (dy < EPSILON && dx >= EPSILON) return "x";
	if (dx < EPSILON && dy >= EPSILON) return "y";
	return undefined;
}

/**
 * The straight pieces on which a bridge can fit, excluding diagonal lines.
 * @param edges The final routed edges.
 * @returns Runs in paint order and then route order.
 */
function straightRuns(edges: readonly DrawingEdge[]): Run[] {
	return edges.flatMap((edge, edgeIndex) =>
		edge.curve.segments.flatMap((segment, segmentIndex) => {
			if (segment.kind !== "line") return [];
			const from = segmentStart(edge.curve, segmentIndex);
			const axis = straightAxis(from, segment.to);
			if (axis === undefined) return [];
			const last = edge.curve.segments.length - 1;
			return [
				{
					edgeIndex,
					segmentIndex,
					from,
					to: segment.to,
					axis,
					length: Math.abs(segment.to[axis] - from[axis]),
					startRoom: segmentIndex === 0 ? APPROACH_STRAIGHT : 0,
					endRoom: segmentIndex === last ? APPROACH_STRAIGHT : 0,
				},
			];
		}),
	);
}

/**
 * The coordinate a run keeps: its y when it runs across, its x when it runs down.
 * @param run The run.
 * @returns The coordinate.
 */
function fixedOf(run: Run): number {
	return run.from[across(run.axis)];
}

/**
 * Where a run lies along its own axis, lowest coordinate first.
 * @param run The run.
 * @param rooms Whether to leave out the straight line each end keeps clear.
 * @returns The low and high coordinates.
 */
function extentOf(run: Run, rooms = false): { readonly low: number; readonly high: number } {
	const forward = run.to[run.axis] >= run.from[run.axis];
	const [first, last] = forward ? [run.startRoom, run.endRoom] : [run.endRoom, run.startRoom];
	const low = Math.min(run.from[run.axis], run.to[run.axis]);
	const high = Math.max(run.from[run.axis], run.to[run.axis]);
	return rooms ? { low: low + first, high: high - last } : { low, high };
}

/**
 * How far along a run, from its start, a coordinate on its axis lies.
 * @param run The run.
 * @param coordinate The coordinate.
 * @returns The distance, negative before the start.
 */
function along(run: Run, coordinate: number): number {
	return (coordinate - run.from[run.axis]) * Math.sign(run.to[run.axis] - run.from[run.axis]);
}

/**
 * A point following route direction, displaced toward a hop's side: up from a
 * line across, right of a line down.
 * @param run The straight run.
 * @param distance Distance along it.
 * @param height Height above the line (right of a vertical line).
 * @returns A drawing-space point.
 */
function onRun(run: Run, distance: number, height = 0): Point {
	const direction = Math.sign(run.to[run.axis] - run.from[run.axis]);
	return run.axis === "x"
		? { x: run.from.x + direction * distance, y: run.from.y - height }
		: { x: run.from.x + height, y: run.from.y + direction * distance };
}

/**
 * A straight piece of a run, centred on a place along it, as far as the run goes.
 * @param run The run.
 * @param at Where along it.
 * @param reach How far to either side.
 * @returns The piece.
 */
function pieceOf(run: Run, at: number, reach: number): Curve {
	return {
		from: onRun(run, Math.max(0, at - reach)),
		segments: [{ kind: "line", to: onRun(run, Math.min(run.length, at + reach)) }],
	};
}

/**
 * Whether two runs of different routes lie on one drawn line.
 * @param a One run.
 * @param b Another.
 * @returns True when they run the same way this close across.
 */
function onLine(a: Run, b: Run): boolean {
	return (
		a.edgeIndex !== b.edgeIndex &&
		a.axis === b.axis &&
		Math.abs(fixedOf(a) - fixedOf(b)) <= SHARED_INK
	);
}

/**
 * Whether two runs are one drawn line: on one line, and relationships of one kind.
 * @param edges The routes.
 * @param a One run.
 * @param b Another.
 * @returns True when they share their ink.
 */
function sameInk(edges: readonly DrawingEdge[], a: Run, b: Run): boolean {
	return onLine(a, b) && edges[a.edgeIndex]!.edge.kind === edges[b.edgeIndex]!.edge.kind;
}

/**
 * Whether one route draws the ink it shares with another: the heavier, then the earlier.
 * @param edges The routes.
 * @param a One route's index.
 * @param b Another's.
 * @returns True when `a` draws it.
 */
function outranks(edges: readonly DrawingEdge[], a: number, b: number): boolean {
	const weight = WEIGHT[edges[a]!.edge.emphasis] - WEIGHT[edges[b]!.edge.emphasis];
	return weight > 0 || (weight === 0 && a < b);
}

/**
 * Whether a coordinate lies strictly inside a run.
 * @param run The run.
 * @param coordinate A coordinate on its axis.
 * @returns True when inside and not at either end.
 */
function holds(run: Run, coordinate: number): boolean {
	const { low, high } = extentOf(run);
	return coordinate > low + EPSILON && coordinate < high - EPSILON;
}

/**
 * The drawn line a run is part of at one coordinate.
 * @param edges The routes.
 * @param runs Every run.
 * @param run The run.
 * @param coordinate Where along its axis.
 * @returns The run drawing that ink there and every run sharing it.
 */
function lineAt(
	edges: readonly DrawingEdge[],
	runs: readonly Run[],
	run: Run,
	coordinate: number,
): Line {
	const members = [
		run,
		...runs.filter((other) => sameInk(edges, run, other) && holds(other, coordinate)),
	];
	const drawer = members.reduce((best, member) =>
		outranks(edges, member.edgeIndex, best.edgeIndex) ? member : best,
	);
	return { drawer, members };
}

/**
 * A proper perpendicular crossing between two straight pieces of different routes.
 * Shared endpoints, collinear overlaps and existing corners are not crossings.
 * @param upper One run.
 * @param lower The other.
 * @returns The crossing's distance along the first, when both contain it.
 */
function crossingOf(upper: Run, lower: Run): number | undefined {
	if (upper.axis === lower.axis || upper.edgeIndex === lower.edgeIndex) return undefined;
	const at = along(upper, fixedOf(lower));
	const beneath = along(lower, fixedOf(upper));
	if (Math.min(at, upper.length - at) <= EPSILON) return undefined;
	if (Math.min(beneath, lower.length - beneath) <= EPSILON) return undefined;
	return at;
}

/**
 * The crossing a run across and a run down make, when both draw their lines there.
 * @param edges The routes.
 * @param runs Every run.
 * @param row A run across.
 * @param down A run down.
 * @returns The crossing, or nothing when they do not cross or another run draws either line.
 */
function drawnCrossingOf(
	edges: readonly DrawingEdge[],
	runs: readonly Run[],
	row: Run,
	down: Run,
): DrawnCrossing[] {
	if (down.axis !== "y" || crossingOf(row, down) === undefined) return [];
	const point = { x: fixedOf(down), y: fixedOf(row) };
	const lines = [lineAt(edges, runs, row, point.x), lineAt(edges, runs, down, point.y)] as const;
	// Every member of a trunk crosses; its drawer stands for all of them.
	return lines[0].drawer === row && lines[1].drawer === down ? [{ point, lines }] : [];
}

/**
 * Every place two drawn lines cross on straight ink, once each.
 * @param edges The routes.
 * @param runs Every run.
 * @returns The crossings.
 */
function drawnCrossings(edges: readonly DrawingEdge[], runs: readonly Run[]): DrawnCrossing[] {
	return runs
		.filter((row) => row.axis === "x")
		.flatMap((row) => runs.flatMap((down) => drawnCrossingOf(edges, runs, row, down)));
}

/**
 * Every run on a run's drawn line, of any kind, itself first.
 * @param runs Every run.
 * @param run The run.
 * @returns The runs.
 */
function lineRuns(runs: readonly Run[], run: Run): Run[] {
	return [run, ...runs.filter((other) => onLine(run, other))];
}

/**
 * Whether a drawn line runs straight and alone through a stretch: every run on
 * that line which reaches into the stretch holds all of it, clear of its ends'
 * approaches, so nothing bends, joins, parts or ends there.
 * @param runs Every run.
 * @param run The run drawing the line.
 * @param low The stretch's lowest coordinate on the run's axis.
 * @param high Its highest.
 * @returns True when the stretch is clear.
 */
function straightThrough(runs: readonly Run[], run: Run, low: number, high: number): boolean {
	return lineRuns(runs, run).every((other) => {
		const whole = extentOf(other);
		if (whole.high <= low + EPSILON || whole.low >= high - EPSILON) return true;
		const clear = extentOf(other, true);
		return clear.low <= low + EPSILON && clear.high >= high - EPSILON;
	});
}

/**
 * Whether a drawn line joins or parts near a coordinate: one of its routes
 * ends inside another route's run on that line there, where the painter
 * draws a junction mark.
 * @param runs Every run.
 * @param run The run drawing the line.
 * @param coordinate The coordinate on its axis.
 * @param reach How near counts.
 * @returns True when a join stands within reach.
 */
function joinNear(runs: readonly Run[], run: Run, coordinate: number, reach: number): boolean {
	const line = lineRuns(runs, run);
	return line.some((one) => {
		const { low, high } = extentOf(one);
		return [low, high].some(
			(end) => Math.abs(end - coordinate) <= reach && endsInside(line, one, end),
		);
	});
}

/**
 * Whether a run's end lies inside another route's run on the same line, clear
 * of that run's own ends: two routes a hair apart that turn together are one
 * line turning, not a join.
 * @param line Every run on the line.
 * @param one The run.
 * @param end The end's coordinate on the line's axis.
 * @returns True when another route runs on past it.
 */
function endsInside(line: readonly Run[], one: Run, end: number): boolean {
	return line.some((other) => {
		const span = extentOf(other);
		return (
			other.edgeIndex !== one.edgeIndex &&
			end > span.low + SHARED_INK &&
			end < span.high - SHARED_INK
		);
	});
}

/**
 * How far a drawn line runs straight and alone on either side of a coordinate.
 * @param runs Every run.
 * @param run The run drawing the line there.
 * @param coordinate The coordinate on its axis.
 * @returns The shorter of the two straight stretches.
 */
function straightness(runs: readonly Run[], run: Run, coordinate: number): number {
	return Math.min(
		...lineRuns(runs, run).map((other) => {
			const whole = extentOf(other);
			if (coordinate <= whole.low || coordinate >= whole.high)
				return Math.max(whole.low - coordinate, coordinate - whole.high);
			const clear = extentOf(other, true);
			return Math.min(coordinate - clear.low, clear.high - coordinate);
		}),
	);
}

/**
 * Identify one contact independently of which route carries its bridge.
 * @param a One piece.
 * @param b The other.
 * @returns A stable pair of segment identities.
 */
function crossingKey(
	a: Pick<Run, "edgeIndex" | "segmentIndex">,
	b: Pick<Run, "edgeIndex" | "segmentIndex">,
): string {
	return [`${a.edgeIndex}:${a.segmentIndex}`, `${b.edgeIndex}:${b.segmentIndex}`]
		.toSorted()
		.join("/");
}

/**
 * Overlapping stretches along one line, joined.
 * @param stretches Stretches sorted by where they start.
 * @returns The same ground, one stretch per unbroken piece.
 */
function mergedStretches(
	stretches: readonly { readonly from: number; readonly to: number }[],
): { from: number; to: number }[] {
	const merged: { from: number; to: number }[] = [];
	for (const stretch of stretches) {
		const last = merged.at(-1);
		if (last !== undefined && stretch.from <= last.to) last.to = Math.max(last.to, stretch.to);
		else merged.push({ ...stretch });
	}
	return merged;
}

/**
 * The stretches of one run another route of its trunk draws.
 * @param edges The routes.
 * @param runs Every run.
 * @param run The run.
 * @returns The stretches, one curve each.
 */
function drawnForRun(edges: readonly DrawingEdge[], runs: readonly Run[], run: Run): Curve[] {
	const { low, high } = extentOf(run);
	const stretches = runs
		.filter(
			(other) => sameInk(edges, run, other) && outranks(edges, other.edgeIndex, run.edgeIndex),
		)
		.flatMap((other) => {
			const theirs = extentOf(other);
			const from = Math.max(low, theirs.low);
			const to = Math.min(high, theirs.high);
			return to - from > SHARED_INK ? [{ from, to }] : [];
		})
		.toSorted((a, b) => a.from - b.from);
	return mergedStretches(stretches).map(({ from, to }) => ({
		from: { ...run.from, [run.axis]: from },
		segments: [{ kind: "line", to: { ...run.from, [run.axis]: to } }],
	}));
}

/** One rounded turn of one route, as its own curve. */
interface Turn {
	readonly edgeIndex: number;
	readonly curve: Curve;
}

/**
 * Whether two turns are the same turn drawn twice: both ends in one place.
 * @param a One turn.
 * @param b Another.
 * @returns True when they coincide.
 */
function sameTurn(a: Turn, b: Turn): boolean {
	const ends = [a.curve.from, a.curve.segments[0]!.to];
	return [b.curve.from, b.curve.segments[0]!.to].every((point) =>
		ends.some((end) => Math.hypot(end.x - point.x, end.y - point.y) <= SHARED_INK),
	);
}

/**
 * The pieces of each route's ink that another route draws: where routes of one
 * kind lie on one line, the heaviest (then the earliest) draws it once, so a
 * trunk shows one stroke, one dash pattern and one arrowhead.
 * @param edges The routes, before any hop is drawn.
 * @returns For each route's index, the stretches and turns of its ink another route draws.
 */
function sharedInk(edges: readonly DrawingEdge[]): ReadonlyMap<number, readonly Curve[]> {
	const runs = straightRuns(edges);
	const turns: Turn[] = edges.flatMap((edge, edgeIndex) =>
		edge.curve.segments.flatMap((segment, index) =>
			segment.kind === "cubic"
				? [{ edgeIndex, curve: { from: segmentStart(edge.curve, index), segments: [segment] } }]
				: [],
		),
	);
	const shared = new Map<number, Curve[]>();
	for (const [edgeIndex] of edges.entries()) {
		const pieces = [
			...runs
				.filter((run) => run.edgeIndex === edgeIndex)
				.flatMap((run) => drawnForRun(edges, runs, run)),
			...turns
				.filter(
					(turn) =>
						turn.edgeIndex === edgeIndex &&
						turns.some(
							(other) =>
								other.edgeIndex !== edgeIndex &&
								edges[other.edgeIndex]!.edge.kind === edges[edgeIndex]!.edge.kind &&
								outranks(edges, other.edgeIndex, edgeIndex) &&
								sameTurn(turn, other),
						),
				)
				.map(({ curve }) => curve),
		];
		if (pieces.length > 0) shared.set(edgeIndex, pieces);
	}
	return shared;
}

export {
	across,
	along,
	crossingKey,
	drawnCrossings,
	extentOf,
	fixedOf,
	joinNear,
	lineRuns,
	onLine,
	onRun,
	overlaps,
	pieceOf,
	SHARED_INK,
	sharedInk,
	straightness,
	straightRuns,
	straightThrough,
	type Axis,
	type Bridge,
	type DrawnCrossing,
	type Line,
	type Run,
};

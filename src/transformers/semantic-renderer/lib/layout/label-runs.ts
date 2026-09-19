// Measured badges use clear runs in the layout owner. A missing fit requests
// an engine reservation before the one complete drawing can be returned.
import type {
	ArchitectureDrawing,
	DrawingEdge,
	MeasuredArchitecture,
} from "@/transformers/semantic-renderer/lib/drawing";
import { DIAGRAM_MARGIN } from "@/transformers/semantic-renderer/lib/design";
import { inflate, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import { curveBounds, pointAt } from "@/transformers/semantic-renderer/lib/layout/curves";
import { COMPOUND_OPTIONS } from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import { headerAxis, type HeaderSide } from "@/transformers/semantic-renderer/lib/layout/reading";

/** A route piece and its conservative bounds, including rounded corners. */
interface RoutePiece {
	readonly edgeId: string;
	readonly index: number;
	readonly box: Box;
	readonly axis: "x" | "y" | undefined;
}

/** A feasible badge box and the physical length of its unobstructed run. */
interface Candidate {
	readonly box: Box;
	readonly length: number;
	readonly index: number;
	/** How far the badge sits from the nearer of its route's two ends. */
	readonly reach: number;
}

/** A point on the page. */
interface Point {
	readonly x: number;
	readonly y: number;
}

type Interval = readonly [number, number];

/**
 * What a badge on one route piece must keep clear of, already grown by its
 * clearance: groups applied in order, one of which is every route piece, with
 * the piece the badge sits on skipped. Built once per placement and shared by
 * every piece, rather than copied and grown again for each.
 */
interface Obstacles {
	readonly groups: readonly (readonly Box[])[];
	/** The route pieces, grown by the route clearance, in piece order. */
	readonly pieces: readonly Box[];
	/** The index, among them, of the piece the badge sits on. */
	readonly ownPiece: number;
}

/**
 * How far a label may sit inside an obstacle's clearance before it counts as
 * meeting it. The engine spaces rows so that a label centred on a route has
 * exactly its clearance on each side, then snaps the route to a whole unit,
 * which leaves the label up to half a unit off that centre. Refusing the run
 * for that half unit would reserve the label with the engine instead, and a
 * reservation makes a layer of its own, moving every row and bending the route.
 */
const ROUTE_SNAP = 0.5;
/** The run kept clear at each end of a badge when the node spacing leaves no room at all. */
const TIGHT_AIR = 8;

const DIMENSIONS = {
	x: { cross: "y", length: "width", breadth: "height" },
	y: { cross: "x", length: "height", breadth: "width" },
} as const;

/**
 * Bound the actual rounded pieces; only straight pieces can hold a badge.
 * @param edges The authoritative routes.
 * @returns Runs and corner obstacles in drawing coordinates.
 */
function piecesOf(edges: readonly DrawingEdge[]): RoutePiece[] {
	return edges.flatMap(({ edge, curve }) => {
		let from = curve.from;
		return curve.segments.map((segment, index) => {
			const box = curveBounds({ from, segments: [segment] });
			from = segment.to;
			return {
				edgeId: edge.id,
				index,
				box,
				axis:
					segment.kind !== "line"
						? undefined
						: box.height <= 0.01
							? "x"
							: box.width <= 0.01
								? "y"
								: undefined,
			};
		});
	});
}

/**
 * Remove the positions where a badge would enter an obstacle's clearance.
 *
 * A badge is seeded exactly the room it needs beside a corridor, so the last
 * position the run allows and the first the corridor allows can be the same
 * number computed two ways; a blocked span that overshoots the run's end by
 * no more than the route snap still leaves that end position.
 * @param intervals Currently available positions for the badge's leading edge.
 * @param blocked The forbidden positions along the same axis.
 * @returns The remaining disjoint intervals, in coordinate order.
 */
function without(intervals: readonly Interval[], blocked: Interval): readonly Interval[] {
	const [low, high] = blocked;
	// Most obstacles miss every interval; those leave the intervals as they are.
	if (intervals.every(([start, end]) => high <= start || low >= end)) return intervals;
	return intervals.flatMap(([start, end]): Interval[] => {
		if (high <= start || low >= end) return [[start, end]];
		return [
			...(low + ROUTE_SNAP >= start
				? ([[start, Math.max(start, Math.min(low, end))]] as const)
				: []),
			...(high <= end + ROUTE_SNAP ? ([[Math.min(end, Math.max(high, start)), end]] as const) : []),
		];
	});
}

/**
 * What is left of a run once every obstacle beside it has taken its span.
 * @param run The badge's leading-edge positions the run allows.
 * @param obstacles The obstacles, in the order they are applied.
 * @param label The badge.
 * @param axis The run's axis.
 * @param across Where the badge's leading edge sits across the run.
 * @returns The clear intervals, in coordinate order.
 */
function clearIntervals(
	run: readonly Interval[],
	obstacles: Obstacles,
	label: Box,
	axis: "x" | "y",
	across: number,
): readonly Interval[] {
	const { length } = DIMENSIONS[axis];
	let intervals = run;
	for (const group of obstacles.groups) {
		for (let index = 0; index < group.length; index += 1) {
			const box = group[index]!;
			const own = group === obstacles.pieces && index === obstacles.ownPiece;
			if (!own && levelWith(box, label, axis, across)) {
				intervals = without(intervals, [box[axis] - label[length], box[axis] + box[length]]);
			}
		}
	}
	return intervals;
}

/**
 * Whether an obstacle is level with a badge's line, so that it takes a span of
 * the run; one entirely beside the line takes nothing.
 * @param box The obstacle.
 * @param label The badge.
 * @param axis The run's axis.
 * @param across Where the badge's leading edge sits across the run.
 * @returns True when it overlaps the badge across the run.
 */
function levelWith(box: Box, label: Box, axis: "x" | "y", across: number): boolean {
	const { cross, breadth } = DIMENSIONS[axis];
	return (
		across + label[breadth] > box[cross] + ROUTE_SNAP &&
		across + ROUTE_SNAP < box[cross] + box[breadth]
	);
}

/**
 * Find the centers of clear spans on one horizontal or vertical straight run.
 * @param piece A piece of this badge's own route.
 * @param label Its measured dimensions.
 * @param obstacles Boxes already enlarged by their required clearance, in the order they are applied.
 * @param ends Where the route leaves its source and reaches its target.
 * @param air How much of the run stays clear at each end.
 * @returns Feasible boxes, each as near an end of the route as its interval allows.
 */
function candidatesOf(
	piece: RoutePiece,
	label: Box,
	obstacles: Obstacles,
	ends: readonly [Point, Point],
	air: number,
): Candidate[] {
	const axis = piece.axis;
	if (axis === undefined) return [];
	const { cross, length, breadth } = DIMENSIONS[axis];
	const start = piece.box[axis] + air;
	const end = piece.box[axis] + piece.box[length] - label[length] - air;
	if (end < start) return [];
	const across = piece.box[cross] - label[breadth] / 2;
	const intervals = clearIntervals([[start, end]], obstacles, label, axis, across);
	return intervals.map(([low, high]) => {
		// A badge belongs where a reader tracing the line from either card finds
		// it soonest: as near the nearer end as its clear interval allows.
		const { along } = nearestPlacement(low, high, label, axis, ends);
		return {
			box: { ...label, [axis]: along, [cross]: across },
			length: high - low + label[length],
			index: piece.index,
			reach: reachOf({ ...label, [axis]: along, [cross]: across }, ends),
		};
	});
}

/**
 * The distance from a badge's centre to the nearer end of its route.
 * @param box The badge.
 * @param ends The route's ends.
 * @returns The smaller distance.
 */
function reachOf(box: Box, ends: readonly [Point, Point]): number {
	const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	return Math.min(...ends.map((end) => Math.hypot(centre.x - end.x, centre.y - end.y)));
}

/**
 * Where along a clear interval a badge sits nearest an end of its route.
 * @param low The lowest leading coordinate the interval allows.
 * @param high The highest.
 * @param label The badge.
 * @param axis The run's axis.
 * @param ends The route's ends.
 * @returns The leading coordinate to use.
 */
function nearestPlacement(
	low: number,
	high: number,
	label: Box,
	axis: "x" | "y",
	ends: readonly [Point, Point],
): { readonly along: number } {
	const half = label[DIMENSIONS[axis].length] / 2;
	// Each end pulls the badge as close as the interval allows; the closer pull wins.
	const choices = ends.map((end) => Math.max(low, Math.min(high, end[axis] - half)));
	const reaches = choices.map((along) =>
		Math.min(...ends.map((end) => Math.abs(along + half - end[axis]))),
	);
	const best = reaches.indexOf(Math.min(...reaches));
	return { along: choices[best] ?? (low + high) / 2 };
}

/**
 * Keep badges within the engine's existing page and its quiet outside margin.
 * @param box The current or proposed label box.
 * @param drawing The unchanged engine extent.
 * @returns Whether this box can move without shifting or growing the canvas.
 */
function insidePage(box: Box, drawing: ArchitectureDrawing): boolean {
	return (
		box.x >= DIAGRAM_MARGIN &&
		box.y >= DIAGRAM_MARGIN &&
		box.x + box.width <= drawing.width - DIAGRAM_MARGIN &&
		box.y + box.height <= drawing.height - DIAGRAM_MARGIN
	);
}

/**
 * Protect card bodies and frame ink while leaving each frame's interior usable.
 * @param drawing The engine's cards and measured container headings.
 * @param header Where a frame's title band sits in the solving frame.
 * @returns Obstacles before the common label-to-node clearance is added.
 */
function nodeObstacles(drawing: ArchitectureDrawing, header: HeaderSide): Box[] {
	const extent = headerAxis(header) === "y" ? "height" : "width";
	return [
		...drawing.cards.map(({ box }) => box),
		...drawing.containers.flatMap(({ box, measured }) => [
			{ ...box, [extent]: measured.headerHeight },
			{ ...box, width: 0 },
			{ ...box, x: box.x + box.width, width: 0 },
			{ ...box, y: box.y + box.height, height: 0 },
		]),
	];
}

/**
 * Place labels on clear runs near their route endpoints.
 *
 * Reserved engine boxes remain a fallback when no clear alternative fits.
 * @param drawing Solved cards and routes, with any reserved label boxes.
 * @param measured Measured labels, including those awaiting their first placement.
 * @param header Where a frame's title band sits in the solving frame.
 * @returns The one final drawing, with only eligible label boxes replaced.
 */
function placeLabelsOnRuns(
	drawing: ArchitectureDrawing,
	measured: MeasuredArchitecture["labels"],
	header: HeaderSide,
): ArchitectureDrawing {
	const pieces = piecesOf(drawing.edges);
	const labels = new Map(
		drawing.edges.flatMap(({ edge, label }) =>
			label === undefined ? [] : [[edge.id, label.box] as const],
		),
	);
	const nodeAir = Number(COMPOUND_OPTIONS["elk.spacing.labelNode"]);
	const labelAir = Number(COMPOUND_OPTIONS["elk.spacing.labelLabel"]);
	const routeAir = Number(COMPOUND_OPTIONS["elk.spacing.edgeLabel"]);
	const cards = nodeObstacles(drawing, header);
	// Grown once: the cards at each clearance asked for, every route piece, and
	// each label as it is placed, kept in the order the labels map holds them.
	const grownCards = new Map<number, Box[]>();
	/**
	 * The cards grown by a clearance, grown once for each clearance asked for.
	 * @param air The clearance.
	 * @returns The grown cards.
	 */
	const cardsAt = (air: number): Box[] => {
		let grown = grownCards.get(air);
		if (grown === undefined) {
			grown = cards.map((box) => inflate(box, air));
			grownCards.set(air, grown);
		}
		return grown;
	};
	const grownPieces = pieces.map(({ box }) => inflate(box, routeAir));
	const grownLabels = new Map([...labels].map(([id, box]) => [id, inflate(box, labelAir)]));
	for (const edge of drawing.edges.toSorted((one, other) =>
		one.edge.id < other.edge.id ? -1 : one.edge.id > other.edge.id ? 1 : 0,
	)) {
		const label = measured.get(edge.edge.id);
		if (label === undefined) continue;
		const ends: readonly [Point, Point] = [edge.curve.from, pointAt(edge.curve, 1)];
		const otherLabels = [...grownLabels]
			.filter(([id]) => id !== edge.edge.id)
			.map(([, box]) => box);
		const size = { x: 0, y: 0, width: label.width, height: label.height };
		/**
		 * The places this label can sit with a given clearance from cards and run ends.
		 * @param air The clearance.
		 * @returns The candidates.
		 */
		const candidatesWith = (air: number) => {
			const found: Candidate[] = [];
			for (const [index, piece] of pieces.entries()) {
				if (piece.edgeId !== edge.edge.id) continue;
				const obstacles = {
					groups: [cardsAt(air), otherLabels, grownPieces],
					pieces: grownPieces,
					ownPiece: index,
				};
				for (const candidate of candidatesOf(piece, size, obstacles, ends, air)) {
					if (insidePage(candidate.box, drawing)) found.push(candidate);
				}
			}
			return found;
		};
		// A run between two rows is short: with the node spacing clear at both
		// ends it holds nothing, and a label the runs cannot hold is reserved with
		// the engine, which gives it a layer of its own and makes the page taller
		// by a row. A tighter second pass keeps the label on its own line first.
		const roomy = candidatesWith(nodeAir);
		const candidates = roomy.length > 0 ? roomy : candidatesWith(TIGHT_AIR);
		const chosen = candidates.toSorted(
			(one, other) =>
				// Nearest an end first: a reader traces a line from a card and should
				// meet its words soon; the longest run only breaks the tie.
				one.reach - other.reach || other.length - one.length || one.index - other.index,
		)[0];
		if (chosen !== undefined) {
			labels.set(edge.edge.id, chosen.box);
			grownLabels.set(edge.edge.id, inflate(chosen.box, labelAir));
		}
	}
	return {
		...drawing,
		edges: drawing.edges.map((edge) => {
			const box = labels.get(edge.edge.id);
			const label = measured.get(edge.edge.id);
			return box === undefined || label === undefined
				? edge
				: { ...edge, label: { measured: label, box } };
		}),
	};
}

export { placeLabelsOnRuns };

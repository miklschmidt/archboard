import { packChannels } from "@/transformers/semantic-renderer/lib/layout/label-channels";
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
 * @param anchoring Whether a native waypoint needs an open corridor around its buffered box.
 * @returns Feasible boxes, near an endpoint or inside an open anchoring interval.
 */
function candidatesOf(
	piece: RoutePiece,
	label: Box,
	obstacles: Obstacles,
	ends: readonly [Point, Point],
	air: number,
	anchoring = false,
): Candidate[] {
	const axis = piece.axis;
	if (axis === undefined) return [];
	const { cross, length, breadth } = DIMENSIONS[axis];
	const start = piece.box[axis] + air;
	const end = piece.box[axis] + piece.box[length] - label[length] - air;
	if (end < start) return [];
	const across = piece.box[cross] - label[breadth] / 2;
	const intervals = clearIntervals([[start, end]], obstacles, label, axis, across);
	return intervals
		.filter(([low, high]) => !anchoring || high > low)
		.map(([low, high]) => {
			// A badge belongs where a reader tracing the line from either card finds
			// it soonest: as near the nearer end as its clear interval allows.
			const along = anchoring
				? (low + high) / 2
				: nearestPlacement(low, high, label, axis, ends).along;
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
 * @returns Obstacles before the common label-to-node clearance is added.
 */
function nodeObstacles(drawing: ArchitectureDrawing): Box[] {
	return [
		...drawing.cards.map(({ box }) => box),
		...drawing.containers.flatMap(({ box, measured }) => [
			{ ...box, height: measured.headerHeight },
			{ ...box, width: 0 },
			{ ...box, x: box.x + box.width, width: 0 },
			{ ...box, y: box.y + box.height, height: 0 },
		]),
	];
}

/** One placement pass shares inflated obstacles and accepted label boxes. */
class LabelPlacement {
	private readonly pieces: RoutePiece[];
	private readonly labels: Map<string, Box>;
	private readonly original: ReadonlyMap<string, Box>;
	private readonly accepted = new Set<string>();
	private readonly bounds = new Map<string, Interval>();
	private readonly nodeAir = Number(COMPOUND_OPTIONS["elk.spacing.labelNode"]);
	private readonly labelAir = Number(COMPOUND_OPTIONS["elk.spacing.labelLabel"]);
	private readonly grownCards: Box[];
	private readonly grownPieces: Box[];
	private readonly grownLabels: Map<string, Box>;

	/**
	 * Prepare the unchanged drawing and its measured obstacles.
	 * @param drawing Current native routes and available reservations.
	 * @param measured Measured semantic labels.
	 * @param eligible When present, propose waypoints only for these relationships.
	 */
	constructor(
		private readonly drawing: ArchitectureDrawing,
		private readonly measured: MeasuredArchitecture["labels"],
		private readonly eligible?: ReadonlySet<string>,
	) {
		this.pieces = piecesOf(drawing.edges);
		this.labels = new Map(
			drawing.edges.flatMap(({ edge, label }) =>
				label === undefined ? [] : [[edge.id, label.box] as const],
			),
		);
		this.original = new Map(this.labels);
		this.grownCards = nodeObstacles(drawing).map((box) => inflate(box, this.nodeAir));
		const routeAir = Number(COMPOUND_OPTIONS["elk.spacing.edgeLabel"]);
		this.grownPieces = this.pieces.map(({ box }) => inflate(box, routeAir));
		this.grownLabels = new Map(
			[...this.labels].map(([id, box]) => [id, inflate(box, this.labelAir)]),
		);
	}

	/** Place eligible labels in stable semantic order. */
	place(): void {
		for (const edge of this.drawing.edges.toSorted((one, other) =>
			one.edge.id < other.edge.id ? -1 : one.edge.id > other.edge.id ? 1 : 0,
		))
			this.placeEdge(edge);
		if (this.eligible === undefined) return;
		packChannels(this.drawing, this.labels, this.accepted, this.original, this.bounds);
		if (this.invalid()) {
			this.labels.clear();
			for (const [id, box] of this.original) this.labels.set(id, box);
			this.accepted.clear();
		}
	}

	/**
	 * Natural labels may use any run; an anchor preserves an already straight connection.
	 * @param edge Current native route.
	 * @returns Whether this pass may move its label.
	 */
	private allows(edge: DrawingEdge): boolean {
		return (
			this.eligible === undefined ||
			(this.eligible.has(edge.edge.id) &&
				edge.curve.segments.length === 1 &&
				edge.curve.segments[0]?.kind === "line")
		);
	}

	/**
	 * Select a clear label box without changing any native route.
	 * @param edge One relationship and its solved curve.
	 */
	private placeEdge(edge: DrawingEdge): void {
		const measured = this.measured.get(edge.edge.id);
		if (measured === undefined || !this.allows(edge)) return;
		const size = { x: 0, y: 0, width: measured.width, height: measured.height };
		const chosen = this.candidates(edge, size).toSorted(
			(one, other) =>
				one.reach - other.reach || other.length - one.length || one.index - other.index,
		)[0];
		if (chosen === undefined || !this.boundChannel(edge, chosen.box)) return;
		this.accepted.add(edge.edge.id);
		this.labels.set(edge.edge.id, chosen.box);
		this.grownLabels.set(edge.edge.id, inflate(chosen.box, this.labelAir));
	}

	/**
	 * Reuse the same obstacle-free horizontal interval when balancing adjacent channels.
	 * @param edge Relationship whose straight channel may shift.
	 * @param box Proposed badge on that channel.
	 * @returns Whether its original connected free interval exists.
	 */
	private boundChannel(edge: DrawingEdge, box: Box): boolean {
		if (this.eligible === undefined || edge.curve.from.x !== pointAt(edge.curve, 1).x) return true;
		const intervals = clearIntervals(
			[[DIAGRAM_MARGIN, this.drawing.width - DIAGRAM_MARGIN - box.width]],
			{ groups: [this.grownCards], pieces: [], ownPiece: -1 },
			box,
			"x",
			box.y,
		);
		const interval = intervals.find(([low, high]) => box.x >= low && box.x <= high);
		if (interval === undefined) return false;
		this.bounds.set(edge.edge.id, [interval[0] + box.width / 2, interval[1] + box.width / 2]);
		return true;
	}

	/**
	 * Find clear intervals on this relationship's own runs.
	 * @param edge Native route and semantic identity.
	 * @param size Measured badge size.
	 * @returns Candidate boxes ordered later by endpoint proximity.
	 */
	private candidates(edge: DrawingEdge, size: Box): Candidate[] {
		const ends: readonly [Point, Point] = [edge.curve.from, pointAt(edge.curve, 1)];
		const found: Candidate[] = [];
		const obstacles = this.obstacles(edge.edge.id);
		for (const [index, piece] of this.pieces.entries()) {
			if (piece.edgeId !== edge.edge.id) continue;
			const ownPiece = obstacles.pieces.indexOf(this.grownPieces[index]!);
			for (const candidate of candidatesOf(
				piece,
				size,
				{ ...obstacles, ownPiece },
				ends,
				this.nodeAir,
				this.eligible !== undefined,
			)) {
				if (insidePage(candidate.box, this.drawing)) found.push(candidate);
			}
		}
		return found;
	}

	/**
	 * Anchors become native obstacles, so other routes may move around them.
	 * @param id Relationship whose own label and run are excluded.
	 * @returns Shared obstacle groups for this relationship.
	 */
	private obstacles(id: string): Omit<Obstacles, "ownPiece"> {
		const natural = this.eligible === undefined;
		const pieces = natural
			? this.grownPieces
			: this.grownPieces.filter((_, index) => this.pieces[index]!.edgeId === id);
		const labels = natural
			? [...this.grownLabels].filter(([other]) => other !== id).map(([, box]) => box)
			: [];
		return { groups: [this.grownCards, labels, pieces], pieces };
	}

	/**
	 * Reject the complete proposal if an accepted anchor enters a reserved clearance.
	 * @returns Whether any proposed anchor violates the unchanged obstacle set.
	 */
	private invalid(): boolean {
		const labels = [...this.labels];
		return labels.some(
			([id, box]) =>
				this.accepted.has(id) &&
				(this.grownCards.some((other) => overlaps(box, other)) ||
					labels.some(
						([otherId, other]) => otherId !== id && overlaps(box, inflate(other, this.labelAir)),
					)),
		);
	}

	/**
	 * Publish label placement without changing solved geometry.
	 * @returns Drawing with natural labels and preserved fallbacks.
	 */
	drawn(): ArchitectureDrawing {
		return {
			...this.drawing,
			edges: this.drawing.edges.map((edge) => {
				const box = this.labels.get(edge.edge.id);
				const measured = this.measured.get(edge.edge.id);
				return box === undefined || measured === undefined
					? edge
					: { ...edge, label: { measured, box } };
			}),
		};
	}

	/**
	 * Return only proposals that passed complete reservation-set validation.
	 * @returns Accepted native waypoint boxes, with rejected proposals absent.
	 */
	anchors(): ReadonlyMap<string, Box> {
		return new Map([...this.accepted].map((id) => [id, this.labels.get(id)!]));
	}
}

/**
 * Test meaningful overlap while tolerating floating-point addition at an exact clearance.
 * @param one First box.
 * @param two Second box, already inflated by the declared clearance.
 * @returns Whether the interiors overlap beyond numerical noise.
 */
function overlaps(one: Box, two: Box): boolean {
	return (
		one.x < two.x + two.width - 0.000001 &&
		one.x + one.width > two.x + 0.000001 &&
		one.y < two.y + two.height - 0.000001 &&
		one.y + one.height > two.y + 0.000001
	);
}

/**
 * Place measured labels on clear runs near their endpoints, preserving reserved fallbacks.
 * @param drawing Solved cards and routes.
 * @param measured Measured semantic labels.
 * @returns Complete drawing with every naturally fitting label placed.
 */
function placeLabelsOnRuns(
	drawing: ArchitectureDrawing,
	measured: MeasuredArchitecture["labels"],
): ArchitectureDrawing {
	const placement = new LabelPlacement(drawing, measured);
	placement.place();
	return placement.drawn();
}

/**
 * Propose clear waypoints along existing straight routes before accepting off-route reservations.
 * @param drawing Native routes with all reserved label boxes retained.
 * @param measured Measured semantic labels.
 * @param eligible Relationships now requiring a waypoint.
 * @returns An atomic set of feasible anchors, or no changes when the proposal is invalid.
 */
function anchorLabelsOnRuns(
	drawing: ArchitectureDrawing,
	measured: MeasuredArchitecture["labels"],
	eligible: ReadonlySet<string>,
): ReadonlyMap<string, Box> {
	const placement = new LabelPlacement(drawing, measured, eligible);
	placement.place();
	return placement.anchors();
}

export { placeLabelsOnRuns, anchorLabelsOnRuns };

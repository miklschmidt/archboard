// Two routes that end on one row, each turning toward the other's side, cross
// inside their rounded corners, where no bridge fits and neither can be
// followed. Exchanging their lanes moves that crossing onto straight runs,
// where crossing treatment bridges it like any other.
import {
	LABEL_CARD_CLEARANCE,
	LABEL_LABEL_CLEARANCE,
	LABEL_ROUTE_CLEARANCE,
	ROUTE_LANE,
	ROUTE_OBSTACLE_CLEARANCE,
} from "@/transformers/semantic-renderer/config";
import type {
	ArchitectureDrawing,
	DrawingEdge,
} from "@/transformers/semantic-renderer/lib/drawing";
import { inflate, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	curveClearanceIssue,
	curveThrough,
	EPSILON,
	pathOf,
	verticesOf,
} from "@/transformers/semantic-renderer/lib/layout/curves";

type Axis = "x" | "y";

/** A route's end: the row at its card, the lane off that row, and the run after the lane. */
interface Leg {
	readonly edgeIndex: number;
	/** Vertex indices of the port, the row's corner, the lane's far corner and the vertex beyond. */
	readonly at: readonly [number, number, number, number];
	/** The axis the row runs along. */
	readonly axis: Axis;
	readonly port: Point;
	readonly corner: Point;
	readonly far: Point;
	readonly beyond: Point;
}

/** The drawing one pair of lanes is exchanged in. */
interface Scene {
	readonly drawing: ArchitectureDrawing;
	/** Each route's vertices, or undefined for a route that is not its rounded vertices. */
	readonly vertices: readonly (readonly Point[] | undefined)[];
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
 * Which axis a nonzero orthogonal piece runs along.
 * @param from Its start.
 * @param to Its end.
 * @returns The axis, or undefined for a point or a diagonal.
 */
function axisOf(from: Point, to: Point): Axis | undefined {
	const dx = Math.abs(to.x - from.x);
	const dy = Math.abs(to.y - from.y);
	if (dy < EPSILON && dx >= EPSILON) return "x";
	if (dx < EPSILON && dy >= EPSILON) return "y";
	return undefined;
}

/**
 * Whether a value lies strictly between two others, in either order.
 * @param value The value.
 * @param a One bound.
 * @param b The other bound.
 * @returns True when inside and not at either bound.
 */
function between(value: number, a: number, b: number): boolean {
	return value > Math.min(a, b) + EPSILON && value < Math.max(a, b) - EPSILON;
}

/**
 * Whether a straight piece, or a box given by two corners, reaches into a box's interior.
 * @param box The box.
 * @param from One end or corner.
 * @param to The other.
 * @returns True when they share interior area or ink.
 */
function enters(box: Box, from: Point, to: Point): boolean {
	return (
		Math.max(from.x, to.x) > box.x + EPSILON &&
		Math.min(from.x, to.x) < box.x + box.width - EPSILON &&
		Math.max(from.y, to.y) > box.y + EPSILON &&
		Math.min(from.y, to.y) < box.y + box.height - EPSILON
	);
}

/**
 * Whether one box reaches into another.
 * @param box The box.
 * @param other The other box.
 * @returns True when their interiors meet.
 */
function meets(box: Box, other: Box): boolean {
	return enters(box, other, { x: other.x + other.width, y: other.y + other.height });
}

/**
 * Both end legs of one route whose row, lane and following run alternate axes.
 * @param points The route's vertices.
 * @param edgeIndex Its paint position.
 * @returns Legs at the source end and the target end.
 */
function legsOf(points: readonly Point[], edgeIndex: number): Leg[] {
	const last = points.length - 1;
	if (last < 3) return [];
	const ends: (readonly [number, number, number, number])[] = [
		[0, 1, 2, 3],
		[last, last - 1, last - 2, last - 3],
	];
	return ends.flatMap((at) => {
		const [port, corner, far, beyond] = [
			points[at[0]]!,
			points[at[1]]!,
			points[at[2]]!,
			points[at[3]]!,
		];
		const axis = axisOf(port, corner);
		if (axis === undefined || axisOf(corner, far) !== across(axis) || axisOf(far, beyond) !== axis)
			return [];
		return [{ edgeIndex, at, axis, port, corner, far, beyond }];
	});
}

/**
 * The straight pieces of every route, each named by its route and lower vertex index.
 * @param vertices Every route's vertices.
 * @returns The pieces.
 */
function piecesOf(vertices: Scene["vertices"]) {
	return vertices.flatMap((points, edgeIndex) =>
		(points ?? []).slice(1).map((to, index) => ({
			edgeIndex,
			index,
			from: points![index]!,
			to,
		})),
	);
}

/**
 * The pieces a leg moves: its row, its lane and the run after the lane.
 * @param leg The leg.
 * @returns Lower vertex indices of those pieces.
 */
function movingPieces(leg: Leg): ReadonlySet<number> {
	return new Set(leg.at.slice(1).map((vertex, index) => Math.min(vertex, leg.at[index]!)));
}

/**
 * Whether a label sits on a leg's lane, so it moves with it.
 * @param label The label box.
 * @param leg The leg.
 * @returns True when the lane runs through the box.
 */
function ridesLane(label: Box, leg: Leg): boolean {
	return enters(label, leg.corner, leg.far);
}

/**
 * Everything the given routes and their labels are closer to than routing and
 * label placement allow, as pairs of identities.
 * @param scene The drawing and route vertices.
 * @param moving The routes whose ink and labels are checked.
 * @returns One entry per crowded pair.
 */
function crowding(scene: Scene, moving: readonly number[]): ReadonlySet<string> {
	const { drawing } = scene;
	const pieces = piecesOf(scene.vertices);
	// What ink and a label must each keep their distance from.
	const obstacles = [
		...drawing.cards.map(({ box }, index) => ({
			id: `card ${index}`,
			edgeIndex: undefined,
			box,
			ink: ROUTE_OBSTACLE_CLEARANCE,
			label: LABEL_CARD_CLEARANCE,
		})),
		...drawing.edges.flatMap(({ label }, edgeIndex) =>
			label === undefined
				? []
				: [
						{
							id: `label ${edgeIndex}`,
							edgeIndex,
							box: label.box,
							ink: LABEL_ROUTE_CLEARANCE,
							label: LABEL_LABEL_CLEARANCE,
						},
					],
		),
	];
	return new Set(
		moving.flatMap((edgeIndex) => {
			const ink = pieces.filter((piece) => piece.edgeIndex === edgeIndex);
			const label = drawing.edges[edgeIndex]!.label?.box;
			const inkNear = obstacles
				.filter(
					(obstacle) =>
						obstacle.edgeIndex !== edgeIndex &&
						ink.some(({ from, to }) => enters(inflate(obstacle.box, obstacle.ink), from, to)),
				)
				.map((obstacle) => `${edgeIndex} ink ${obstacle.id}`);
			if (label === undefined) return inkNear;
			const labelNear = obstacles
				.filter(
					(obstacle) =>
						obstacle.edgeIndex !== edgeIndex && meets(inflate(label, obstacle.label), obstacle.box),
				)
				.map((obstacle) => `${edgeIndex} label ${obstacle.id}`);
			const routesNear = pieces
				.filter(
					(piece) =>
						piece.edgeIndex !== edgeIndex &&
						enters(inflate(label, LABEL_ROUTE_CLEARANCE), piece.from, piece.to),
				)
				.map((piece) => `${edgeIndex} label route ${piece.edgeIndex}`);
			return [...inkNear, ...labelNear, ...routesNear];
		}),
	);
}

/**
 * Routes of one kind may share a trunk at a common endpoint on purpose.
 * @param a One relationship.
 * @param b Another.
 * @returns Whether an apparent contact between them is intended.
 */
function sharedTrunk(a: DrawingEdge["edge"], b: DrawingEdge["edge"]): boolean {
	return a.kind === b.kind && [a.from, a.to].some((id) => id === b.from || id === b.to);
}

/**
 * Whether two legs fold one crossing into their corners: their rows lie on one
 * line, each runs from its corner past the other's corner, and their far runs
 * lie on separate lines, so exchanging the lanes leaves no overlap.
 * @param one A leg of one route.
 * @param other A leg of another route on the same axis.
 * @returns True when the pair's rows overlap in opposite directions.
 */
function opposed(one: Leg, other: Leg): boolean {
	const axis = one.axis;
	const row = across(axis);
	return (
		Math.abs(one.corner[row] - other.corner[row]) < EPSILON &&
		between(other.corner[axis], one.corner[axis], one.port[axis]) &&
		between(one.corner[axis], other.corner[axis], other.port[axis]) &&
		Math.abs(one.far[row] - other.far[row]) >= EPSILON
	);
}

/**
 * Whether the lane exchange applies to two legs of different routes.
 * @param scene The drawing and route vertices.
 * @param one A leg of one route.
 * @param other A leg of another route.
 * @returns True when they fold a crossing between unrelated routes.
 */
function folded(scene: Scene, one: Leg, other: Leg): boolean {
	if (one.edgeIndex === other.edgeIndex || one.axis !== other.axis) return false;
	const { edges } = scene.drawing;
	return (
		opposed(one, other) && !sharedTrunk(edges[one.edgeIndex]!.edge, edges[other.edgeIndex]!.edge)
	);
}

/**
 * The area both lanes and their far runs move within.
 * @param legs The two legs.
 * @returns The box between the two lanes, from the row to the farther far run.
 */
function sweptBy(legs: readonly [Leg, Leg]): Box {
	const axis = legs[0].axis;
	const row = across(axis);
	const lanes = legs.map(({ corner }) => corner[axis]);
	const rows = legs.flatMap(({ corner, far }) => [corner[row], far[row]]);
	const [low, high] = [Math.min(...lanes), Math.max(...lanes)];
	const [top, bottom] = [Math.min(...rows), Math.max(...rows)];
	return axis === "x"
		? { x: low, y: top, width: high - low, height: bottom - top }
		: { x: top, y: low, width: bottom - top, height: high - low };
}

/**
 * Whether anything but the two legs and the labels on their lanes is in the swept area.
 * Frames may hold the area whole; their border may not pass through it.
 * @param scene The drawing and route vertices.
 * @param legs The two legs.
 * @returns True when a card, frame border, other label or other route is there.
 */
function occupied(scene: Scene, legs: readonly [Leg, Leg]): boolean {
	const { drawing, vertices } = scene;
	const swept = sweptBy(legs);
	const borders = drawing.containers.flatMap(({ box }) => {
		const corners = [
			{ x: box.x, y: box.y },
			{ x: box.x + box.width, y: box.y },
			{ x: box.x + box.width, y: box.y + box.height },
			{ x: box.x, y: box.y + box.height },
		];
		return corners.map((corner, index) => ({ from: corner, to: corners[(index + 1) % 4]! }));
	});
	const pieces = piecesOf(vertices).filter(
		(piece) =>
			!legs.some((leg) => leg.edgeIndex === piece.edgeIndex && movingPieces(leg).has(piece.index)),
	);
	const labels = drawing.edges.flatMap(({ label }, edgeIndex) => {
		if (label === undefined) return [];
		const leg = legs.find((candidate) => candidate.edgeIndex === edgeIndex);
		return leg !== undefined && ridesLane(label.box, leg) ? [] : [label.box];
	});
	return (
		drawing.cards.some(({ box }) => meets(swept, box)) ||
		labels.some((box) => meets(swept, box)) ||
		[...borders, ...pieces].some(({ from, to }) => enters(swept, from, to))
	);
}

/**
 * A route's label, moved along with its lane when it rides it.
 * @param edge The route.
 * @param leg The leg whose lane moves.
 * @param shift How far the lane moves along its row.
 * @returns The label as it stands after the move, if the route has one.
 */
function ridingLabel(edge: DrawingEdge, leg: Leg, shift: number): DrawingEdge["label"] {
	if (edge.label === undefined || !ridesLane(edge.label.box, leg)) return edge.label;
	const { box } = edge.label;
	return { ...edge.label, box: { ...box, [leg.axis]: box[leg.axis] + shift } };
}

/**
 * Redraw one leg's route with its lane at another coordinate along its row,
 * taking a label that rides the lane along.
 * @param scene The drawing and route vertices.
 * @param leg The leg.
 * @param to The new lane coordinate.
 * @returns The redrawn edge and its vertices, or undefined when the route would not be sound.
 */
function movedLane(
	scene: Scene,
	leg: Leg,
	to: number,
): { readonly edge: DrawingEdge; readonly points: Point[] } | undefined {
	const { axis } = leg;
	const shift = to - leg.far[axis];
	// The run after the lane keeps its direction.
	if (Math.sign(to - leg.beyond[axis]) !== Math.sign(leg.far[axis] - leg.beyond[axis]))
		return undefined;
	const points = scene.vertices[leg.edgeIndex]!.map((point, index) =>
		index === leg.at[1] || index === leg.at[2] ? { ...point, [axis]: to } : point,
	);
	const edge = scene.drawing.edges[leg.edgeIndex]!;
	const label = ridingLabel(edge, leg, shift);
	const curve = curveThrough(points);
	if (curveClearanceIssue(curve, label?.box) !== undefined) return undefined;
	return { edge: { ...edge, curve, path: pathOf(curve), ...(label && { label }) }, points };
}

/**
 * Exchange two legs' lanes when the rule applies and the result is sound.
 * @param scene The drawing and route vertices.
 * @param legs The two legs.
 * @returns The scene with both routes redrawn, or undefined to leave them as they are.
 */
function exchange(scene: Scene, legs: readonly [Leg, Leg]): Scene | undefined {
	if (!folded(scene, ...legs) || occupied(scene, legs)) return undefined;
	const edges = [...scene.drawing.edges];
	const vertices = [...scene.vertices];
	for (const [side, leg] of legs.entries()) {
		const move = movedLane(scene, leg, legs[1 - side]!.corner[leg.axis]);
		if (move === undefined) return undefined;
		edges[leg.edgeIndex] = move.edge;
		vertices[leg.edgeIndex] = move.points;
	}
	const after = { drawing: { ...scene.drawing, edges }, vertices };
	// The moved ink and any label riding it may come no closer to anything new.
	const moving = legs.map(({ edgeIndex }) => edgeIndex);
	const was = crowding(scene, moving);
	return [...crowding(after, moving)].every((pair) => was.has(pair)) ? after : undefined;
}

/**
 * Whether two legs leave one port along one row, with both lanes off the same
 * side of it.
 * @param one A leg.
 * @param other Another route's leg.
 * @returns True when they fan out of one trunk.
 */
function fanned(one: Leg, other: Leg): boolean {
	const row = across(one.axis);
	return (
		one.edgeIndex !== other.edgeIndex &&
		one.axis === other.axis &&
		Math.hypot(one.port.x - other.port.x, one.port.y - other.port.y) < EPSILON &&
		Math.abs(one.corner[row] - other.corner[row]) < EPSILON &&
		Math.sign(one.far[row] - one.corner[row]) === Math.sign(other.far[row] - other.corner[row])
	);
}

/**
 * Whether a fan's leg drops on the outer lane and then turns back across its
 * sibling's lane, which runs on past that turn: the crossing a fan draws only
 * because the two lanes stand in the wrong order.
 * @param one The leg that turns.
 * @param other Its sibling.
 * @returns True when the lanes cross.
 */
function crossedFan(one: Leg, other: Leg): boolean {
	const { axis } = one;
	const row = across(axis);
	const turn = Math.sign(one.beyond[axis] - one.far[axis]);
	return (
		turn === Math.sign(other.corner[axis] - one.corner[axis]) &&
		Math.abs(other.far[row] - other.corner[row]) > Math.abs(one.far[row] - one.corner[row]) &&
		between(other.corner[axis], one.far[axis], one.beyond[axis])
	);
}

/**
 * The area a lane sweeps moving along its row, from the row to its far corner.
 * @param leg The leg.
 * @param to Where the lane moves.
 * @returns The box.
 */
function laneSweep(leg: Leg, to: number): Box {
	const { axis } = leg;
	const row = across(axis);
	const [low, high] = [Math.min(leg.corner[axis], to), Math.max(leg.corner[axis], to)];
	const [top, bottom] = [
		Math.min(leg.corner[row], leg.far[row]),
		Math.max(leg.corner[row], leg.far[row]),
	];
	return axis === "x"
		? { x: low, y: top, width: high - low, height: bottom - top }
		: { x: top, y: low, width: bottom - top, height: high - low };
}

/**
 * Where a fan's leg that turns across its sibling's lane should drop instead:
 * a lane before that lane, when the two lines share a trunk and nothing else
 * stands where the lane moves.
 * @param scene The drawing and route vertices.
 * @param one The leg that turns.
 * @param other Its sibling.
 * @returns The new lane coordinate, or undefined when the fan is in order.
 */
function fanLane(scene: Scene, one: Leg, other: Leg): number | undefined {
	const { edges } = scene.drawing;
	if (!fanned(one, other) || !crossedFan(one, other)) return undefined;
	if (!sharedTrunk(edges[one.edgeIndex]!.edge, edges[other.edgeIndex]!.edge)) return undefined;
	const turn = Math.sign(one.beyond[one.axis] - one.far[one.axis]);
	const to = other.corner[one.axis] + turn * ROUTE_LANE;
	return fanBlocked(scene, [one, other], laneSweep(one, to)) ? undefined : to;
}

/**
 * Put a fan's crossed lanes in order, when the moved line's label stays on it
 * and nothing comes closer to anything new.
 * @param scene The drawing and route vertices.
 * @param one The leg that turns.
 * @param other Its sibling.
 * @returns The scene with the leg redrawn, or undefined to leave it as it is.
 */
function orderFan(scene: Scene, one: Leg, other: Leg): Scene | undefined {
	const to = fanLane(scene, one, other);
	const move = to === undefined ? undefined : movedLane(scene, one, to);
	if (move === undefined || !labelOnLine(move.edge, move.points)) return undefined;
	const after = {
		drawing: { ...scene.drawing, edges: scene.drawing.edges.with(one.edgeIndex, move.edge) },
		vertices: scene.vertices.with(one.edgeIndex, move.points),
	};
	const was = crowding(scene, [one.edgeIndex]);
	return [...crowding(after, [one.edgeIndex])].every((pair) => was.has(pair)) ? after : undefined;
}

/**
 * Whether a card, a label or another route stands where a fan's lane moves.
 * @param scene The drawing and route vertices.
 * @param legs The fan's two legs, whose own pieces may be there.
 * @param swept The area the lane sweeps.
 * @returns True when something else is there.
 */
function fanBlocked(scene: Scene, legs: readonly [Leg, Leg], swept: Box): boolean {
	const { drawing } = scene;
	const own = new Set(legs.map(({ edgeIndex }) => edgeIndex));
	return (
		drawing.cards.some(({ box }) => meets(swept, box)) ||
		drawing.edges.some(({ label }, index) => !own.has(index) && label && meets(swept, label.box)) ||
		piecesOf(scene.vertices).some(
			({ edgeIndex, from, to }) => !own.has(edgeIndex) && enters(swept, from, to),
		)
	);
}

/**
 * Whether a redrawn route's label still sits on one of its pieces.
 * @param edge The redrawn route.
 * @param points Its vertices.
 * @returns True when it has no label or the label is on its line.
 */
function labelOnLine(edge: DrawingEdge, points: readonly Point[]): boolean {
	const box = edge.label?.box;
	return box === undefined || points.slice(1).some((to, index) => enters(box, points[index]!, to));
}

/**
 * Put every fan whose lanes cross in order, before exchanging folded lanes.
 * @param scene The drawing and route vertices.
 * @param legs Every route's end legs.
 * @param moved The routes redrawn, added to here.
 * @returns The scene with such fans redrawn.
 */
function orderFans(scene: Scene, legs: readonly Leg[], moved: Set<number>): Scene {
	let current = scene;
	for (const one of legs)
		for (const other of legs) {
			if (moved.has(one.edgeIndex) || moved.has(other.edgeIndex)) continue;
			const next = orderFan(current, one, other);
			if (next === undefined) continue;
			current = next;
			moved.add(one.edgeIndex).add(other.edgeIndex);
		}
	return current;
}

/**
 * Exchange the lanes of route pairs whose rows fold a crossing into their corners.
 * Cards and every other route keep their geometry; a label on a moved lane moves with it.
 * @param drawing The drawing after routing, rounding and label placement.
 * @returns The same drawing, with any such crossing moved onto straight runs.
 */
function unfoldCrossings(drawing: ArchitectureDrawing): ArchitectureDrawing {
	// Only a route that is exactly its rounded vertices can be redrawn through new ones.
	const vertices = drawing.edges.map(({ curve }) => {
		const points = verticesOf(curve);
		return pathOf(curveThrough(points)) === pathOf(curve) ? points : undefined;
	});
	const legs = vertices.flatMap((points, edgeIndex) =>
		points === undefined ? [] : legsOf(points, edgeIndex),
	);
	const moved = new Set<number>();
	let scene: Scene = orderFans({ drawing, vertices }, legs, moved);
	for (const [index, one] of legs.entries()) {
		for (const other of legs.slice(index + 1)) {
			if (moved.has(one.edgeIndex) || moved.has(other.edgeIndex)) continue;
			const next = exchange(scene, [one, other]);
			if (next === undefined) continue;
			scene = next;
			moved.add(one.edgeIndex).add(other.edgeIndex);
		}
	}
	return scene.drawing;
}

export { unfoldCrossings };

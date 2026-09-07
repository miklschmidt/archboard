// Where a bound end of an arrow belongs.
//
// An Excalidraw arrow that touches a shape records a binding: which shape,
// how far round it the arrow attaches (`focus`), and how far short of its
// outline the path stops (`gap`). The browser recomputes the endpoint from
// those three numbers every time either the arrow or the shape moves. The
// server has to recompute it too, because an agent can move a shape with no
// browser attached, and until TASK-088 it did that by ignoring the binding:
// it read the agent's own `start`/`end` refs, drew a line between the two
// shapes' centres, and stopped 8px short — a distance the binding it had just
// written said was 4.
//
// So this is the routing, expressed in the binding's own numbers. It is a port
// of `determineFocusPoint` and `updateBoundPoint` from the pinned Excalidraw
// 0.18.1 build, rather than an interpretation of what `focus` might mean. The
// plane geometry it works in is `lib/arrow-binding-geometry.ts` and the
// outlines it stops short of are `lib/arrow-binding-outline.ts`.
//
// Pure and dependency-free, like `geometry.ts` and `labels.ts`, because the
// browser imports the modules that need it.

import {
	type Bindable,
	type Point,
	type Segment,
	centreOf,
	cross,
	minus,
	num,
	rotate,
} from "@/runtime/engine/lib/arrow-binding-geometry";
import {
	crossings,
	inside,
	rectangleCornerRadius,
	roundedRectangleIntersections,
} from "@/runtime/engine/lib/arrow-binding-outline";
import { isRecord } from "@/runtime/engine/lib/unknown-record";
import type { ElementBinding } from "@/shared/board-elements";

/** Excalidraw's ordinary point binding, used by the non-elbow router. */
type ArrowBinding = ElementBinding;

/**
 * How far short of a shape a bound arrow stops.
 *
 * Defined once and read twice: by the conversion that turns an agent's `start`
 * ref into a binding, and by the routing that puts the endpoint where that
 * binding says. Two numbers for one distance is what TASK-089's first instance
 * was, and what let TASK-088 record 4 and draw 8.
 */
const BOUND_ARROW_GAP = 4;

/**
 * One agent `start`/`end` ref, as the binding Excalidraw stores.
 *
 * Centred and at the standard gap, because a ref says which shape and nothing
 * else. A person who drags the same end somewhere specific writes their own
 * `focus` and `gap` over these, and the routing reads theirs.
 * @param ref The ref as written.
 * @returns The binding, or null when the ref names no shape.
 */
function bindingFromRef(ref: unknown): ArrowBinding | null {
	const id = refId(ref);
	return id === undefined ? null : { elementId: id, focus: 0, gap: BOUND_ARROW_GAP };
}

/**
 * The shape a ref names.
 * @param ref The ref as written.
 * @returns The id, or undefined when the ref is not one.
 */
function refId(ref: unknown): string | undefined {
	const id = fieldOf(ref, "id");
	return typeof id === "string" && id.length > 0 ? id : undefined;
}

/**
 * A stored binding, completed with the defaults a partially written one
 * leaves out.
 * @param value The stored `startBinding` or `endBinding`.
 * @returns The binding, or null for an end that touches nothing.
 */
function bindingOf(value: unknown): ArrowBinding | null {
	const elementId = fieldOf(value, "elementId");
	if (typeof elementId !== "string" || elementId.length === 0) {
		return null;
	}
	return {
		elementId,
		focus: num(fieldOf(value, "focus"), 0),
		gap: num(fieldOf(value, "gap"), BOUND_ARROW_GAP),
	};
}

/**
 * One field of a value that may be anything, read without asserting a shape
 * the value has not been checked to have.
 * @param value The value.
 * @param key The field.
 * @returns The field, or undefined when the value is not an object with it.
 */
function fieldOf(value: unknown, key: string): unknown {
	return isRecord(value) ? value[key] : undefined;
}

/**
 * The four corners of a shape, which are the vertices of a diamond and the
 * box corners of everything else, in clockwise order from the top left.
 * @param shape The shape.
 * @param centre Its centre.
 * @returns The corners in scene coordinates.
 */
function cornersOf(shape: Bindable, centre: Point): Point[] {
	const x = num(shape.x);
	const y = num(shape.y);
	const width = num(shape.width);
	const height = num(shape.height);
	if (shape.type === "diamond") {
		return [
			{ x, y: centre.y },
			{ x: centre.x, y },
			{ x: x + width, y: centre.y },
			{ x: centre.x, y: y + height },
		];
	}
	return [
		{ x, y },
		{ x: x + width, y },
		{ x: x + width, y: y + height },
		{ x, y: y + height },
	];
}

/**
 * Which of the four sides of the scaled shape the adjacent point is beyond,
 * counting from the top-left corner. The sign of `focus` decides which end of
 * that side the arrow aims at, so each side is also tested against the one
 * ahead of or behind it.
 * @param scaled The scaled shape's corners.
 * @param adjacent The point the arrow arrives from.
 * @param focus The binding's focus.
 * @returns The side's index, or 3 when the point is beyond none of them.
 */
function sideFacing(scaled: readonly Point[], adjacent: Point, focus: number): number {
	/**
	 * Whether the adjacent point is on the outer side of one edge.
	 * @param from The edge's first corner.
	 * @param to Its second.
	 * @returns True when the point is beyond the edge.
	 */
	const beyond = (from: number, to: number): boolean =>
		cross(minus(adjacent, scaled[from]!), minus(scaled[to]!, scaled[from]!)) > 0;
	/**
	 * Whether the adjacent point has not yet passed the far end of one edge.
	 * @param from The edge's first corner.
	 * @param to Its second.
	 * @returns True when the point is on the inner side of the edge.
	 */
	const before = (from: number, to: number): boolean =>
		cross(minus(adjacent, scaled[from]!), minus(scaled[to]!, scaled[from]!)) < 0;
	// Each side is the edge from corner i to i+1, and the far end it must not
	// have passed is the next edge for a positive focus and the previous one
	// for a negative focus.
	const positive = focus > 0;
	const sides = [0, 1, 2].map(
		(i) => beyond(i, i + 1) && before(...(positive ? nextEdge(i) : previousEdge(i))),
	);
	const found = sides.indexOf(true);
	return found === -1 ? 3 : found;
}

/**
 * The edge after one, as its two corners.
 * @param i The edge's index.
 * @returns The next edge's corners.
 */
function nextEdge(i: number): [number, number] {
	return [(i + 1) % 4, (i + 2) % 4];
}

/**
 * The edge before one, as its two corners.
 * @param i The edge's index.
 * @returns The previous edge's corners.
 */
function previousEdge(i: number): [number, number] {
	return [(i + 3) % 4, (i + 4) % 4];
}

/**
 * The point on the shape the arrow is aimed at.
 *
 * `focus` is an oriented ratio between -1 and 1: the shape scaled about its
 * own centre by `|focus|` has a corner on every focus point, and the sign says
 * which side of that scaled shape the arrow passes. At 0 it is the centre,
 * which is why a centred arrow runs centre to centre. Off 0 the aim is one of
 * the scaled shape's four corners, chosen by which of them the adjacent point
 * sits beyond.
 * @param shape The shape the arrow binds to.
 * @param focus The binding's focus.
 * @param adjacent The arrow's next point, which is what it aims from.
 * @returns The aim in scene coordinates.
 */
function focusPointOf(shape: Bindable, focus: number, adjacent: Point): Point {
	const centre = centreOf(shape);
	if (focus === 0) {
		return centre;
	}
	const angle = num(shape.angle);
	const scaled = cornersOf(shape, centre)
		.map((p) => ({
			x: centre.x + (p.x - centre.x) * Math.abs(focus),
			y: centre.y + (p.y - centre.y) * Math.abs(focus),
		}))
		.map((p) => rotate(p, centre, angle));
	const side = sideFacing(scaled, adjacent, focus);
	// Each side aims at its far corner when focus is positive and its near one
	// when it is negative, which is what the sign of focus means.
	const corner = focus > 0 ? (side + 1) % scaled.length : side;
	return scaled[corner]!;
}

/**
 * A ray from the arrow's adjacent point toward the aim, long enough to reach
 * past the shape whatever the arrow's own length is.
 * @param shape The shape.
 * @param adjacent Where the arrow arrives from.
 * @param aim Where it is aimed.
 * @param current Where the end sits now.
 * @param centre The shape's centre.
 * @returns The interceptor segment.
 */
function interceptorTo(
	shape: Bindable,
	adjacent: Point,
	aim: Point,
	current: Point,
	centre: Point,
): Segment {
	const towardAim = minus(aim, adjacent);
	const magnitude = Math.sqrt(towardAim.x * towardAim.x + towardAim.y * towardAim.y);
	const length =
		Math.hypot(current.x - adjacent.x, current.y - adjacent.y) +
		Math.hypot(centre.x - adjacent.x, centre.y - adjacent.y) +
		Math.max(num(shape.width), num(shape.height)) * 2;
	return [
		adjacent,
		{
			x: adjacent.x + (towardAim.x / magnitude) * length,
			y: adjacent.y + (towardAim.y / magnitude) * length,
		},
	];
}

/**
 * Where a rounded rectangle's outline stops the arrow. Two crossings means
 * the ray passes through the shape and the first one is the endpoint; one
 * means it only grazes the outline, which the pinned build answers with the
 * aim; none leaves the end where it is.
 * @param shape The shape.
 * @param binding The binding.
 * @param adjacent Where the arrow arrives from.
 * @param aim Where it is aimed.
 * @param current Where the end sits now.
 * @returns The endpoint.
 */
function roundedRectangleEndpoint(
	shape: Bindable,
	binding: ArrowBinding,
	adjacent: Point,
	aim: Point,
	current: Point,
): Point {
	const interceptor = interceptorTo(shape, adjacent, aim, current, centreOf(shape));
	const intersections = roundedRectangleIntersections(shape, interceptor, binding.gap).toSorted(
		(left, right) =>
			Math.hypot(left.x - adjacent.x, left.y - adjacent.y) -
			Math.hypot(right.x - adjacent.x, right.y - adjacent.y),
	);
	if (intersections.length > 1) {
		return intersections[0]!;
	}
	return intersections.length === 1 ? aim : current;
}

/**
 * Whether the arrow reaches the shape at all: it must have a gap to stop
 * short of, a direction to travel in, and start outside the outline.
 * @param shape The shape.
 * @param binding The binding.
 * @param localFrom Where the arrow arrives from, in the shape's own frame.
 * @param direction The direction it travels, in that frame.
 * @returns True when an outline lies between the arrow and its aim.
 */
function crossesOutline(
	shape: Bindable,
	binding: ArrowBinding,
	localFrom: Point,
	direction: Point,
): boolean {
	if (binding.gap === 0 || (direction.x === 0 && direction.y === 0)) {
		return false;
	}
	return !inside(shape, localFrom, binding.gap);
}

/**
 * Where an arrow's bound end belongs, given the shape it names, the binding it
 * carries, and the point the path arrives from.
 * @param shape The shape the arrow binds to.
 * @param binding The binding it carries.
 * @param adjacent The arrow's own next point — its other end on a two-point
 * arrow — because that is what Excalidraw aims from, and it is what makes a
 * bend in a user-drawn arrow decide where the arrow meets the shape.
 * @param current Where the end is now, returned unchanged when the ray misses,
 * which happens when the adjacent point is on the far side of the shape from
 * the aim.
 * @returns The endpoint in scene coordinates.
 */
function boundEndpoint(
	shape: Bindable,
	binding: ArrowBinding,
	adjacent: Point,
	current: Point,
): Point {
	const centre = centreOf(shape);
	const angle = num(shape.angle);
	const aim = focusPointOf(shape, binding.focus, adjacent);
	const localFrom = minus(rotate(adjacent, centre, -angle), centre);
	const direction = minus(minus(rotate(aim, centre, -angle), centre), localFrom);
	// No gap, no direction, or a path that starts inside: there is no outline
	// between the two, and Excalidraw puts the end on the aim itself.
	if (!crossesOutline(shape, binding, localFrom, direction)) {
		return aim;
	}
	if (shape.type === "rectangle" && rectangleCornerRadius(shape) > 0) {
		return roundedRectangleEndpoint(shape, binding, adjacent, aim, current);
	}
	const nearest = crossings(shape, localFrom, direction, binding.gap)[0];
	if (nearest === undefined) {
		return current;
	}
	return rotate(
		{
			x: centre.x + localFrom.x + direction.x * nearest,
			y: centre.y + localFrom.y + direction.y * nearest,
		},
		centre,
		angle,
	);
}

export {
	type Bindable,
	type ArrowBinding,
	type Point,
	BOUND_ARROW_GAP,
	centreOf,
	bindingFromRef,
	bindingOf,
	focusPointOf,
	boundEndpoint,
};

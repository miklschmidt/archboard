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
// 0.18.1 build, rather than an interpretation of what `focus` might mean.
//
// Pure and dependency-free, like `geometry.ts` and `labels.ts`, because the
// browser imports the modules that need it.
//
// Rounded rectangles use that build's corner-radius, diagonal gap offsets,
// cubic corners, and re-hung sides. The sharp rectangle, diamond, and ellipse
// branches remain the small analytic forms that already match their outlines.

/** As much of a shape as routing an arrow to it requires. */
export interface Bindable {
	type?: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	angle?: number;
	roundness?: { type?: number; value?: number } | null;
}

/** Excalidraw's own record of an arrow end that touches a shape. */
export interface ArrowBinding {
	elementId: string;
	focus: number;
	gap: number;
	fixedPoint: [number, number] | null;
}

export interface Point {
	x: number;
	y: number;
}

/**
 * How far short of a shape a bound arrow stops.
 *
 * Defined once and read twice: by the conversion that turns an agent's `start`
 * ref into a binding, and by the routing that puts the endpoint where that
 * binding says. Two numbers for one distance is what TASK-089's first instance
 * was, and what let TASK-088 record 4 and draw 8.
 */
export const BOUND_ARROW_GAP = 4;

const num = (v: unknown, fallback = 0): number =>
	typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** The centre of a shape, which is what `focus: 0` means. */
export function centreOf(shape: Bindable): Point {
	return {
		x: num(shape.x) + num(shape.width) / 2,
		y: num(shape.y) + num(shape.height) / 2,
	};
}

function rotate(point: Point, about: Point, angle: number): Point {
	if (angle === 0) return point;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const dx = point.x - about.x;
	const dy = point.y - about.y;
	return {
		x: about.x + dx * cos - dy * sin,
		y: about.y + dx * sin + dy * cos,
	};
}

const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

/**
 * One agent `start`/`end` ref, as the binding Excalidraw stores.
 *
 * Centred and at the standard gap, because a ref says which shape and nothing
 * else. A person who drags the same end somewhere specific writes their own
 * `focus` and `gap` over these, and the routing reads theirs.
 */
export function bindingFromRef(ref: unknown): ArrowBinding | null {
	const id = (ref as { id?: unknown } | null)?.id;
	if (typeof id !== "string" || id.length === 0) return null;
	return { elementId: id, focus: 0, gap: BOUND_ARROW_GAP, fixedPoint: null };
}

/** A stored binding, or null for an end that touches nothing. */
export function bindingOf(value: unknown): ArrowBinding | null {
	const raw = value as Partial<ArrowBinding> | null | undefined;
	if (!raw || typeof raw.elementId !== "string" || raw.elementId.length === 0) return null;
	return {
		elementId: raw.elementId,
		focus: num(raw.focus, 0),
		gap: num(raw.gap, BOUND_ARROW_GAP),
		fixedPoint:
			Array.isArray(raw.fixedPoint) && raw.fixedPoint.length === 2
				? [num(raw.fixedPoint[0]), num(raw.fixedPoint[1])]
				: null,
	};
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
 */
export function focusPointOf(shape: Bindable, focus: number, adjacent: Point): Point {
	const centre = centreOf(shape);
	if (focus === 0) return centre;

	const x = num(shape.x);
	const y = num(shape.y);
	const width = num(shape.width);
	const height = num(shape.height);
	const angle = num(shape.angle);

	const corners: Point[] =
		shape.type === "diamond"
			? [
					{ x, y: centre.y },
					{ x: centre.x, y },
					{ x: x + width, y: centre.y },
					{ x: centre.x, y: y + height },
				]
			: [
					{ x, y },
					{ x: x + width, y },
					{ x: x + width, y: y + height },
					{ x, y: y + height },
				];

	const c = corners
		.map((p) => ({
			x: centre.x + (p.x - centre.x) * Math.abs(focus),
			y: centre.y + (p.y - centre.y) * Math.abs(focus),
		}))
		.map((p) => rotate(p, centre, angle)) as [Point, Point, Point, Point];

	// Which of the four sides of the scaled shape the adjacent point is beyond,
	// and — for the sign of `focus` — whether it has passed the far end of it.
	const beyond = (from: number, to: number): boolean =>
		cross(minus(adjacent, c[from]!), minus(c[to]!, c[from]!)) > 0;
	const before = (from: number, to: number): boolean =>
		cross(minus(adjacent, c[from]!), minus(c[to]!, c[from]!)) < 0;

	const side = [
		beyond(0, 1) && (focus > 0 ? before(1, 2) : before(3, 0)),
		beyond(1, 2) && (focus > 0 ? before(2, 3) : before(0, 1)),
		beyond(2, 3) && (focus > 0 ? before(3, 0) : before(1, 2)),
		beyond(3, 0) && (focus > 0 ? before(0, 1) : before(2, 3)),
	];

	if (side[0]) return focus > 0 ? c[1] : c[0];
	if (side[1]) return focus > 0 ? c[2] : c[1];
	if (side[2]) return focus > 0 ? c[3] : c[2];
	return focus > 0 ? c[0] : c[3];
}

/** Half of a shape's width and height, each grown by the binding's gap. */
function halfExtents(shape: Bindable, gap: number): { a: number; b: number } {
	return {
		a: Math.abs(num(shape.width)) / 2 + gap,
		b: Math.abs(num(shape.height)) / 2 + gap,
	};
}

const PROPORTIONAL_CORNER_RADIUS = 0.25;
const ADAPTIVE_CORNER_RADIUS = 32;

/** The radius rules used by Excalidraw's three rectangle roundness records. */
function rectangleCornerRadius(shape: Bindable): number {
	const size = Math.min(Math.abs(num(shape.width)), Math.abs(num(shape.height)));
	const type = shape.roundness?.type;
	if (type === 1 || type === 2) return size * PROPORTIONAL_CORNER_RADIUS;
	if (type !== 3) return 0;
	const fixed = num(shape.roundness?.value, ADAPTIVE_CORNER_RADIUS);
	return size <= fixed / PROPORTIONAL_CORNER_RADIUS ? size * PROPORTIONAL_CORNER_RADIUS : fixed;
}

type Cubic = readonly [Point, Point, Point, Point];

function shifted(point: Point, offset: Point): Point {
	return { x: point.x + offset.x, y: point.y + offset.y };
}

/** Move one rounded corner out along its own diagonal by the binding gap. */
function cornerOffset(corner: Point, gap: number): Point {
	const length = Math.hypot(corner.x, corner.y);
	if (length === 0) return { x: 0, y: 0 };
	return { x: (corner.x / length) * gap, y: (corner.y / length) * gap };
}

function pointOnCubic(curve: Cubic, t: number): Point {
	const [p0, p1, p2, p3] = curve;
	const u = 1 - t;
	return {
		x: u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x,
		y: u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y,
	};
}

/** Ray distances where one rounded corner crosses the ray's supporting line. */
function roundedCornerCrossings(curve: Cubic, origin: Point, direction: Point): number[] {
	const [p0, p1, p2, p3] = curve;
	const coefficients = [
		cross(minus(p0, origin), direction),
		cross({ x: 3 * (p1.x - p0.x), y: 3 * (p1.y - p0.y) }, direction),
		cross({ x: 3 * (p2.x - 2 * p1.x + p0.x), y: 3 * (p2.y - 2 * p1.y + p0.y) }, direction),
		cross(
			{
				x: p3.x - 3 * p2.x + 3 * p1.x - p0.x,
				y: p3.y - 3 * p2.y + 3 * p1.y - p0.y,
			},
			direction,
		),
	] as const;
	const valueAt = (t: number): number =>
		coefficients[0] + t * (coefficients[1] + t * (coefficients[2] + t * coefficients[3]));

	// The derivative partitions the cubic into monotone intervals. Every root
	// is therefore either a stationary zero or the sole sign change in one
	// interval, which a short bisection resolves deterministically.
	const stops = [0, 1];
	const qa = 3 * coefficients[3];
	const qb = 2 * coefficients[2];
	const qc = coefficients[1];
	if (Math.abs(qa) < 1e-12) {
		if (Math.abs(qb) >= 1e-12) stops.push(-qc / qb);
	} else {
		const discriminant = qb * qb - 4 * qa * qc;
		if (discriminant >= 0) {
			const root = Math.sqrt(discriminant);
			stops.push((-qb - root) / (2 * qa), (-qb + root) / (2 * qa));
		}
	}
	const intervals = stops.filter((t) => t >= 0 && t <= 1).toSorted((a, b) => a - b);
	const curveParameters: number[] = [];
	const keepParameter = (t: number) => {
		if (!curveParameters.some((known) => Math.abs(known - t) <= 1e-10)) curveParameters.push(t);
	};
	for (const t of intervals) {
		if (Math.abs(valueAt(t)) <= 1e-9) keepParameter(t);
	}
	for (let index = 0; index < intervals.length - 1; index++) {
		let low = intervals[index]!;
		let high = intervals[index + 1]!;
		let lowValue = valueAt(low);
		const highValue = valueAt(high);
		if (lowValue === 0 || highValue === 0 || Math.sign(lowValue) === Math.sign(highValue)) continue;
		for (let step = 0; step < 60; step++) {
			const middle = (low + high) / 2;
			const middleValue = valueAt(middle);
			if (middleValue === 0) {
				low = middle;
				high = middle;
				break;
			}
			if (Math.sign(lowValue) === Math.sign(middleValue)) {
				low = middle;
				lowValue = middleValue;
			} else {
				high = middle;
			}
		}
		keepParameter((low + high) / 2);
	}

	return curveParameters
		.map((t) => pointOnCubic(curve, t))
		.map((point) =>
			Math.abs(direction.x) >= Math.abs(direction.y)
				? (point.x - origin.x) / direction.x
				: (point.y - origin.y) / direction.y,
		)
		.filter((t) => Number.isFinite(t) && t >= 0);
}

/** Crossings of Excalidraw's rounded rectangle outline, in its local frame. */
function roundedRectangleCrossings(
	shape: Bindable,
	origin: Point,
	direction: Point,
	gap: number,
): number[] {
	const halfWidth = Math.abs(num(shape.width)) / 2;
	const halfHeight = Math.abs(num(shape.height)) / 2;
	const radius = rectangleCornerRadius(shape);
	const x0 = -halfWidth;
	const y0 = -halfHeight;
	const x1 = halfWidth;
	const y1 = halfHeight;
	const offsets = [
		cornerOffset({ x: x0 - gap, y: y0 - gap }, gap),
		cornerOffset({ x: x1 + gap, y: y0 - gap }, gap),
		cornerOffset({ x: x1 + gap, y: y1 + gap }, gap),
		cornerOffset({ x: x0 - gap, y: y1 + gap }, gap),
	] as const;
	const corners: Cubic[] = [
		[
			shifted({ x: x0, y: y0 + radius }, offsets[0]),
			shifted({ x: x0, y: y0 + radius / 3 }, offsets[0]),
			shifted({ x: x0 + radius / 3, y: y0 }, offsets[0]),
			shifted({ x: x0 + radius, y: y0 }, offsets[0]),
		],
		[
			shifted({ x: x1 - radius, y: y0 }, offsets[1]),
			shifted({ x: x1 - radius / 3, y: y0 }, offsets[1]),
			shifted({ x: x1, y: y0 + radius / 3 }, offsets[1]),
			shifted({ x: x1, y: y0 + radius }, offsets[1]),
		],
		[
			shifted({ x: x1, y: y1 - radius }, offsets[2]),
			shifted({ x: x1, y: y1 - radius / 3 }, offsets[2]),
			shifted({ x: x1 - radius / 3, y: y1 }, offsets[2]),
			shifted({ x: x1 - radius, y: y1 }, offsets[2]),
		],
		[
			shifted({ x: x0 + radius, y: y1 }, offsets[3]),
			shifted({ x: x0 + radius / 3, y: y1 }, offsets[3]),
			shifted({ x: x0, y: y1 - radius / 3 }, offsets[3]),
			shifted({ x: x0, y: y1 - radius }, offsets[3]),
		],
	];
	const sides = corners.map(
		(corner, index) => [corner[3], corners[(index + 1) % corners.length]![0]] as const,
	);
	return [
		...sides
			.map(([from, to]) => alongSegment(origin, direction, from, to))
			.filter((t) => t !== null),
		...corners.flatMap((corner) => roundedCornerCrossings(corner, origin, direction)),
	];
}

/** Is this point inside the shape's outline, grown by `gap`? */
function inside(shape: Bindable, local: Point, gap: number): boolean {
	const { a, b } = halfExtents(shape, gap);
	if (a <= 0 || b <= 0) return false;
	const px = Math.abs(local.x);
	const py = Math.abs(local.y);
	if (shape.type === "ellipse") return (px / a) ** 2 + (py / b) ** 2 <= 1;
	if (shape.type === "diamond") return px / a + py / b <= 1;
	return px <= a && py <= b;
}

/**
 * How far along the ray the outline is, for every crossing in front of the
 * origin. Distances are in units of the ray's direction vector.
 *
 * Everything is in the shape's own unrotated frame with its centre at the
 * origin, which is how a rotated shape is handled: the ray is rotated back
 * instead of the shape being turned.
 */
function crossings(shape: Bindable, origin: Point, direction: Point, gap: number): number[] {
	const { a, b } = halfExtents(shape, gap);
	if (a <= 0 || b <= 0) return [];
	const found: number[] = [];
	const keep = (t: number) => {
		if (Number.isFinite(t) && t >= 0) found.push(t);
	};

	if (shape.type === "rectangle" && rectangleCornerRadius(shape) > 0) {
		for (const t of roundedRectangleCrossings(shape, origin, direction, gap)) keep(t);
	} else if (shape.type === "ellipse") {
		// (ox + t·dx)² / a² + (oy + t·dy)² / b² = 1
		const qa = (direction.x / a) ** 2 + (direction.y / b) ** 2;
		const qb = 2 * ((origin.x * direction.x) / a ** 2 + (origin.y * direction.y) / b ** 2);
		const qc = (origin.x / a) ** 2 + (origin.y / b) ** 2 - 1;
		if (qa === 0) return [];
		const disc = qb * qb - 4 * qa * qc;
		if (disc < 0) return [];
		const root = Math.sqrt(disc);
		keep((-qb - root) / (2 * qa));
		keep((-qb + root) / (2 * qa));
	} else if (shape.type === "diamond") {
		const vertices: Point[] = [
			{ x: 0, y: -b },
			{ x: a, y: 0 },
			{ x: 0, y: b },
			{ x: -a, y: 0 },
		];
		for (let i = 0; i < 4; i++) {
			const t = alongSegment(origin, direction, vertices[i]!, vertices[(i + 1) % 4]!);
			if (t !== null) keep(t);
		}
	} else {
		// A rectangle, and everything Excalidraw treats as one: an image, a frame,
		// a standalone text, an embed. Slabs, so a ray parallel to an edge simply
		// misses it.
		for (const [o, d, half, otherO, otherD, otherHalf] of [
			[origin.x, direction.x, a, origin.y, direction.y, b],
			[origin.y, direction.y, b, origin.x, direction.x, a],
		] as const) {
			if (d === 0) continue;
			for (const edge of [-half, half]) {
				const t = (edge - o) / d;
				if (Math.abs(otherO + t * otherD) <= otherHalf + 1e-9) keep(t);
			}
		}
	}

	return found.toSorted((p, q) => p - q);
}

/** Where a ray meets one segment, as a distance along the ray, or null. */
function alongSegment(origin: Point, direction: Point, from: Point, to: Point): number | null {
	const edge = minus(to, from);
	const denominator = cross(direction, edge);
	if (Math.abs(denominator) < 1e-12) return null;
	const offset = minus(from, origin);
	const t = cross(offset, edge) / denominator;
	const u = cross(offset, direction) / denominator;
	if (u < -1e-9 || u > 1 + 1e-9) return null;
	return t;
}

/**
 * Where an arrow's bound end belongs, given the shape it names, the binding it
 * carries, and the point the path arrives from.
 *
 * `adjacent` is the arrow's own next point — its other end on a two-point
 * arrow — because that is what Excalidraw aims from, and it is what makes a
 * bend in a user-drawn arrow decide where the arrow meets the shape.
 * `current` is where the end is now, returned unchanged when the ray misses,
 * which happens when the adjacent point is on the far side of the shape from
 * the aim.
 */
export function boundEndpoint(
	shape: Bindable,
	binding: ArrowBinding,
	adjacent: Point,
	current: Point,
): Point {
	const centre = centreOf(shape);
	const angle = num(shape.angle);
	const aim = focusPointOf(shape, binding.focus, adjacent);

	// The arrow was never pointing into the shape, so it stops at the aim rather
	// than short of an outline it does not cross.
	if (binding.gap === 0) return aim;

	const localFrom = minus(rotate(adjacent, centre, -angle), centre);
	const localAim = minus(rotate(aim, centre, -angle), centre);
	const direction = minus(localAim, localFrom);
	if (direction.x === 0 && direction.y === 0) return aim;

	// The path starts inside the shape, so there is no outline between the two
	// and Excalidraw puts the end on the aim itself.
	if (inside(shape, localFrom, binding.gap)) return aim;

	const hits = crossings(shape, localFrom, direction, binding.gap);
	const nearest = hits[0];
	if (nearest === undefined) return current;

	return rotate(
		{
			x: centre.x + localFrom.x + direction.x * nearest,
			y: centre.y + localFrom.y + direction.y * nearest,
		},
		centre,
		angle,
	);
}

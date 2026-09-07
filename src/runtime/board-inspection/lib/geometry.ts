import type { SceneBBox, ScenePoint } from "@/runtime/board-inspection/schemas";

interface ExactPoint {
	x: number;
	y: number;
}
interface ExactBox {
	x: number;
	y: number;
	width: number;
	height: number;
}
interface Segment {
	connectorId: string;
	sourceIndex: number;
	index: number;
	a: ExactPoint;
	b: ExactPoint;
}

/**
 * Whether a value is a finite number.
 * @param value any value
 * @returns true for finite numbers only
 */
const finite = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);

/**
 * Round a report coordinate to a thousandth, leaving huge magnitudes exact and never emitting -0.
 * @param value the exact coordinate
 * @returns the reportable coordinate
 */
function normalizeNumber(value: number): number {
	const rounded =
		Math.abs(value) > Number.MAX_VALUE / 1000 ? value : Math.round(value * 1000) / 1000;
	return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Normalize an exact point for a report.
 * @param value the exact point
 * @returns the scene point with rounded coordinates
 */
const point = (value: ExactPoint): ScenePoint => ({
	x: normalizeNumber(value.x),
	y: normalizeNumber(value.y),
});

/**
 * Normalize an exact box for a report, clamping negative extents to zero.
 * @param value the exact box
 * @returns the scene box with rounded, non-negative extents
 */
const box = (value: ExactBox): SceneBBox => ({
	x: normalizeNumber(value.x),
	y: normalizeNumber(value.y),
	width: normalizeNumber(Math.max(0, value.width)),
	height: normalizeNumber(Math.max(0, value.height)),
});

type FocusDelta = "x-minus-16" | "y-minus-16" | "width-plus-32" | "height-plus-32";
type FocusBoxResult =
	| { kind: "absent" }
	| { kind: "representable"; box: SceneBBox }
	| { kind: "unrepresentable"; failedDeltas: FocusDelta[] };

/**
 * Whether padding one coordinate by an exact delta is finite and round-trips exactly.
 * @param original the coordinate before padding
 * @param padded the coordinate after padding
 * @param delta the exact delta that was applied
 * @returns true when the padded value is finite and differs by exactly the delta
 */
const exactDelta = (original: number, padded: number, delta: number): boolean =>
	finite(padded) && padded - original === delta;

/**
 * Exact 16px finding-focus padding, including the representability of each required delta.
 * @param value the affected box, or null when the finding has no box
 * @returns the padded box, or which deltas could not be represented exactly
 */
function focusBox(value: SceneBBox | null): FocusBoxResult {
	if (value === null) {
		return { kind: "absent" };
	}
	const padded = {
		x: value.x - 16,
		y: value.y - 16,
		width: value.width + 32,
		height: value.height + 32,
	};
	const checks: ReadonlyArray<readonly [FocusDelta, boolean]> = [
		["x-minus-16", exactDelta(value.x, padded.x, -16)],
		["y-minus-16", exactDelta(value.y, padded.y, -16)],
		["width-plus-32", exactDelta(value.width, padded.width, 32)],
		["height-plus-32", exactDelta(value.height, padded.height, 32)],
	];
	const failedDeltas = checks.filter(([, exact]) => !exact).map(([delta]) => delta);
	if (failedDeltas.length > 0) {
		return { kind: "unrepresentable", failedDeltas };
	}
	return { kind: "representable", box: box(padded) };
}

type AggregateBoxResult =
	| { kind: "empty" }
	| { kind: "representable"; box: ExactBox }
	| { kind: "unrepresentable"; representative: ExactBox };

/**
 * Field-by-field order over boxes: x, then y, then width, then height.
 * @param a the first box
 * @param b the second box
 * @returns negative, zero or positive as a sorts before, with or after b
 */
const boxOrder = (a: ExactBox, b: ExactBox): number => {
	for (const field of ["x", "y", "width", "height"] as const) {
		if (a[field] !== b[field]) {
			return a[field] < b[field] ? -1 : 1;
		}
	}
	return 0;
};

/**
 * The exact union of nonempty boxes, whether or not it is finite.
 * @param values at least one box
 * @returns the union's origin and extents
 */
function unionExtent(values: readonly ExactBox[]): ExactBox {
	let minX = values[0]!.x;
	let minY = values[0]!.y;
	let maxX = values[0]!.x + values[0]!.width;
	let maxY = values[0]!.y + values[0]!.height;
	for (let index = 1; index < values.length; index += 1) {
		const value = values[index]!;
		minX = Math.min(minX, value.x);
		minY = Math.min(minY, value.y);
		maxX = Math.max(maxX, value.x + value.width);
		maxY = Math.max(maxY, value.y + value.height);
	}
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Whether every field of a box is finite.
 * @param value the box
 * @returns true when origin and extents are all finite
 */
const finiteBox = (value: ExactBox): boolean =>
	finite(value.x) && finite(value.y) && finite(value.width) && finite(value.height);

/**
 * Classify an exact union without conflating no input with an unrepresentable finite span.
 * @param values the boxes to unite
 * @returns the union, or the field-order-first box when the union is not finite
 */
function aggregateBoxes(values: readonly ExactBox[]): AggregateBoxResult {
	if (values.length === 0) {
		return { kind: "empty" };
	}
	const union = unionExtent(values);
	if (finiteBox(union)) {
		return { kind: "representable", box: union };
	}
	let representative = values[0]!;
	for (let index = 1; index < values.length; index += 1) {
		if (boxOrder(values[index]!, representative) < 0) {
			representative = values[index]!;
		}
	}
	return { kind: "unrepresentable", representative };
}

/**
 * The finite bounding box of a point list.
 * @param points the points
 * @returns their bounding box, or null when there are none or the span is not finite
 */
function pointBox(points: readonly ExactPoint[]): ExactBox | null {
	if (points.length === 0) {
		return null;
	}
	let minX = points[0]!.x;
	let minY = points[0]!.y;
	let maxX = minX;
	let maxY = minY;
	for (let index = 1; index < points.length; index += 1) {
		const value = points[index]!;
		minX = Math.min(minX, value.x);
		minY = Math.min(minY, value.y);
		maxX = Math.max(maxX, value.x);
		maxY = Math.max(maxY, value.y);
	}
	const candidate = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
	return finiteBox(candidate) ? candidate : null;
}

/**
 * The strictly positive intersection of two boxes.
 * @param a the first box
 * @param b the second box
 * @returns the overlap box, or null when the boxes only touch or are apart
 */
function overlap(a: ExactBox, b: ExactBox): ExactBox | null {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	const right = Math.min(a.x + a.width, b.x + b.width);
	const bottom = Math.min(a.y + a.height, b.y + b.height);
	return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/**
 * Whether one box contains another, edges included.
 * @param outer the containing box
 * @param inner the contained box
 * @returns true when inner lies within outer
 */
function contains(outer: ExactBox, inner: ExactBox): boolean {
	return (
		outer.x <= inner.x &&
		outer.y <= inner.y &&
		outer.x + outer.width >= inner.x + inner.width &&
		outer.y + outer.height >= inner.y + inner.height
	);
}

/**
 * Narrow the Liang-Barsky parameter range by one clip edge.
 * @param range the current [low, high] parameter range, updated in place
 * @param p the edge's direction component
 * @param q the edge's distance component
 * @returns false when the edge excludes the segment entirely
 */
function clipEdge(range: [number, number], p: number, q: number): boolean {
	if (p === 0) {
		return q > 0;
	}
	const ratio = q / p;
	if (p < 0) {
		range[0] = Math.max(range[0], ratio);
	} else {
		range[1] = Math.min(range[1], ratio);
	}
	return range[0] < range[1];
}

/**
 * Liang-Barsky clipping. Null means no interior span beyond tolerance.
 * @param a the segment start
 * @param b the segment end
 * @param target the box to clip against
 * @param tolerance the inset applied to the box before clipping
 * @returns the entry and exit points of the interior span, or null
 */
function segmentInsideBox(
	a: ExactPoint,
	b: ExactPoint,
	target: ExactBox,
	tolerance: number,
): { entry: ExactPoint; exit: ExactPoint } | null {
	const left = target.x + tolerance;
	const top = target.y + tolerance;
	const right = target.x + target.width - tolerance;
	const bottom = target.y + target.height - tolerance;
	if (right <= left || bottom <= top) {
		return null;
	}
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const range: [number, number] = [0, 1];
	const edges: ReadonlyArray<readonly [number, number]> = [
		[-dx, a.x - left],
		[dx, right - a.x],
		[-dy, a.y - top],
		[dy, bottom - a.y],
	];
	for (const [p, q] of edges) {
		if (!clipEdge(range, p, q)) {
			return null;
		}
	}
	const [low, high] = range;
	if (high <= 0 || low >= 1) {
		return null;
	}
	const entry = { x: a.x + dx * Math.max(0, low), y: a.y + dy * Math.max(0, low) };
	const exit = { x: a.x + dx * Math.min(1, high), y: a.y + dy * Math.min(1, high) };
	return { entry, exit };
}

type SegmentIntersection =
	| { kind: "none" | "contact" }
	| { kind: "proper"; point: ExactPoint }
	| { kind: "collinear"; points: [ExactPoint, ExactPoint] };

/**
 * The 2D cross product of two vectors.
 * @param u the first vector
 * @param v the second vector
 * @returns the signed area they span
 */
const cross = (u: ExactPoint, v: ExactPoint): number => u.x * v.y - u.y * v.x;

/**
 * Classify two segments that lie on parallel lines.
 * @param a the first segment's start
 * @param b the first segment's end
 * @param c the second segment's start
 * @param d the second segment's end
 * @param r the first segment's direction vector
 * @param ca the vector from a to c
 * @param tolerance the shared-span length under which overlap counts as contact
 * @returns none, contact, or the collinear shared span
 */
function parallelIntersection(
	a: ExactPoint,
	b: ExactPoint,
	c: ExactPoint,
	d: ExactPoint,
	r: ExactPoint,
	ca: ExactPoint,
	tolerance: number,
): SegmentIntersection {
	if (Math.abs(cross(ca, r)) > Number.EPSILON) {
		return { kind: "none" };
	}
	const axis = Math.abs(r.x) >= Math.abs(r.y) ? "x" : "y";
	const values = [a[axis], b[axis]].toSorted((x, y) => x - y);
	const other = [c[axis], d[axis]].toSorted((x, y) => x - y);
	const lo = Math.max(values[0]!, other[0]!);
	const hi = Math.min(values[1]!, other[1]!);
	if (hi - lo <= tolerance) {
		return hi >= lo ? { kind: "contact" } : { kind: "none" };
	}
	const at = (value: number): ExactPoint => {
		const ratio = Math.abs(r[axis]) <= Number.EPSILON ? 0 : (value - a[axis]) / r[axis];
		return { x: a.x + ratio * r.x, y: a.y + ratio * r.y };
	};
	return { kind: "collinear", points: [at(lo), at(hi)] };
}

/**
 * The distance from a point to the nearest of four segment endpoints.
 * @param hit the point
 * @param a the first segment's start
 * @param b the first segment's end
 * @param c the second segment's start
 * @param d the second segment's end
 * @returns the smallest Euclidean distance
 */
const nearestEndpointDistance = (
	hit: ExactPoint,
	a: ExactPoint,
	b: ExactPoint,
	c: ExactPoint,
	d: ExactPoint,
): number =>
	Math.min(
		Math.hypot(hit.x - a.x, hit.y - a.y),
		Math.hypot(hit.x - b.x, hit.y - b.y),
		Math.hypot(hit.x - c.x, hit.y - c.y),
		Math.hypot(hit.x - d.x, hit.y - d.y),
	);

/**
 * Classify how two segments meet: not at all, at an endpoint, properly, or collinearly.
 * @param a the first segment's start
 * @param b the first segment's end
 * @param c the second segment's start
 * @param d the second segment's end
 * @param tolerance the distance under which a crossing counts as endpoint contact
 * @returns the intersection kind with its point or shared span
 */
function intersectSegments(
	a: ExactPoint,
	b: ExactPoint,
	c: ExactPoint,
	d: ExactPoint,
	tolerance: number,
): SegmentIntersection {
	const r = { x: b.x - a.x, y: b.y - a.y };
	const s = { x: d.x - c.x, y: d.y - c.y };
	const ca = { x: c.x - a.x, y: c.y - a.y };
	const denominator = cross(r, s);
	if (Math.abs(denominator) <= Number.EPSILON) {
		return parallelIntersection(a, b, c, d, r, ca, tolerance);
	}
	const t = cross(ca, s) / denominator;
	const u = cross(ca, r) / denominator;
	if (t < 0 || t > 1 || u < 0 || u > 1) {
		return { kind: "none" };
	}
	const hit = { x: a.x + t * r.x, y: a.y + t * r.y };
	return nearestEndpointDistance(hit, a, b, c, d) <= tolerance
		? { kind: "contact" }
		: { kind: "proper", point: hit };
}

export {
	type ExactPoint,
	type ExactBox,
	type Segment,
	finite,
	normalizeNumber,
	point,
	box,
	type FocusBoxResult,
	focusBox,
	type AggregateBoxResult,
	aggregateBoxes,
	pointBox,
	overlap,
	contains,
	segmentInsideBox,
	type SegmentIntersection,
	intersectSegments,
};

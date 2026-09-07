// The plane geometry the bound-arrow router works in: points, rotation,
// cubics, and the segment and curve intersections ported from the pinned
// Excalidraw 0.18.1 build.
//
// Pure and dependency-free, like `geometry.ts` and `labels.ts`, because the
// browser imports the modules that need it.

/** As much of a shape as routing an arrow to it requires. */
interface Bindable {
	type?: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	angle?: number;
	roundness?: { type?: number; value?: number } | null;
}

interface Point {
	x: number;
	y: number;
}

/** Two points, as the straight run between them. */
type Segment = readonly [Point, Point];

/** A cubic Bézier: two endpoints with a control point beside each. */
type Cubic = readonly [Point, Point, Point, Point];

/** How close two points must be before the router counts them as one. */
const INTERSECTION_PRECISION = 1e-4;

/**
 * A stored number a caller can compute with, rejecting the NaN, Infinity and
 * absent fields a half-repaired board carries.
 * @param v The stored value.
 * @param fallback What an unusable value counts as.
 * @returns The number.
 */
const num = (v: unknown, fallback = 0): number =>
	typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * The centre of a shape, which is what `focus: 0` means.
 * @param shape The shape.
 * @returns Its centre in scene coordinates.
 */
function centreOf(shape: Bindable): Point {
	return {
		x: num(shape.x) + num(shape.width) / 2,
		y: num(shape.y) + num(shape.height) / 2,
	};
}

/**
 * Rotate a point about another, short-circuiting the angle-zero case so an
 * unrotated shape's arithmetic is exact.
 * @param point The point to move.
 * @param about The centre of rotation.
 * @param angle The angle in radians.
 * @returns The rotated point.
 */
function rotate(point: Point, about: Point, angle: number): Point {
	if (angle === 0) {
		return point;
	}
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const dx = point.x - about.x;
	const dy = point.y - about.y;
	return {
		x: about.x + dx * cos - dy * sin,
		y: about.y + dx * sin + dy * cos,
	};
}

/**
 * Excalidraw's own rotation arithmetic, including the angle-zero round trip
 * its rounded-rectangle router depends on for its intersection tolerances.
 * @param point The point to move.
 * @param about The centre of rotation.
 * @param angle The angle in radians.
 * @returns The rotated point.
 */
function rotatePinned(point: Point, about: Point, angle: number): Point {
	return {
		x: (point.x - about.x) * Math.cos(angle) - (point.y - about.y) * Math.sin(angle) + about.x,
		y: (point.x - about.x) * Math.sin(angle) + (point.y - about.y) * Math.cos(angle) + about.y,
	};
}

/**
 * The z component of the cross product, whose sign says which side of one
 * vector the other falls.
 * @param a One vector.
 * @param b The other.
 * @returns The signed area of the parallelogram they span.
 */
const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;

/**
 * The vector from one point to another.
 * @param a The head.
 * @param b The tail.
 * @returns The difference.
 */
const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

/**
 * Half of a shape's width and height, each grown by the binding's gap.
 * @param shape The shape.
 * @param gap How far short of it the arrow stops.
 * @returns The half-extents along each axis.
 */
function halfExtents(shape: Bindable, gap: number): { a: number; b: number } {
	return {
		a: Math.abs(num(shape.width)) / 2 + gap,
		b: Math.abs(num(shape.height)) / 2 + gap,
	};
}

/**
 * A point moved by an offset.
 * @param point The point.
 * @param offset How far to move it.
 * @returns The moved point.
 */
function shifted(point: Point, offset: Point): Point {
	return { x: point.x + offset.x, y: point.y + offset.y };
}

/**
 * One rounded corner as a cubic, with both control points two thirds of the
 * way toward the sharp corner, which is the curve Excalidraw draws.
 * @param from Where the corner starts.
 * @param corner The sharp corner it rounds.
 * @param to Where the corner ends.
 * @param offset How far the whole curve is pushed out.
 * @returns The cubic.
 */
function roundedCorner(from: Point, corner: Point, to: Point, offset: Point): Cubic {
	/**
	 * Two thirds of the way from a point toward the sharp corner.
	 * @param point The endpoint.
	 * @returns The control point.
	 */
	const toward = (point: Point): Point => ({
		x: point.x + (2 / 3) * (corner.x - point.x),
		y: point.y + (2 / 3) * (corner.y - point.y),
	});
	return [
		shifted(from, offset),
		shifted(toward(from), offset),
		shifted(toward(to), offset),
		shifted(to, offset),
	];
}

/**
 * Move one rounded corner out along its own diagonal by the binding gap.
 * @param corner The corner.
 * @param centre The shape's centre.
 * @param gap How far out to move it.
 * @returns The offset, zero for a corner at the centre.
 */
function cornerOffset(corner: Point, centre: Point, gap: number): Point {
	const x = corner.x - centre.x;
	const y = corner.y - centre.y;
	const length = Math.sqrt(x * x + y * y);
	if (length === 0) {
		return { x: 0, y: 0 };
	}
	return { x: (x / length) * gap, y: (y / length) * gap };
}

/**
 * The point at parameter `t` along a cubic.
 * @param curve The cubic.
 * @param t A parameter from 0 to 1.
 * @returns The point.
 */
function pointOnCubic(curve: Cubic, t: number): Point {
	const [p0, p1, p2, p3] = curve;
	return {
		x:
			(1 - t) ** 3 * p0.x +
			3 * (1 - t) ** 2 * t * p1.x +
			3 * (1 - t) * t ** 2 * p2.x +
			t ** 3 * p3.x,
		y:
			(1 - t) ** 3 * p0.y +
			3 * (1 - t) ** 2 * t * p1.y +
			3 * (1 - t) * t ** 2 * p2.y +
			t ** 3 * p3.y,
	};
}

/**
 * The distance from a point to the nearest place on a segment.
 * @param point The point.
 * @param segment The segment.
 * @returns The distance.
 */
function distanceToSegment(point: Point, segment: Segment): number {
	const [from, to] = segment;
	const x = point.x - from.x;
	const y = point.y - from.y;
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const lengthSquared = dx * dx + dy * dy;
	const along = lengthSquared === 0 ? -1 : (x * dx + y * dy) / lengthSquared;
	const nearest =
		along < 0 ? from : along > 1 ? to : { x: from.x + along * dx, y: from.y + along * dy };
	const awayX = point.x - nearest.x;
	const awayY = point.y - nearest.y;
	return Math.sqrt(awayX * awayX + awayY * awayY);
}

/**
 * Where two finite segments cross, if they do. The lines are solved and the
 * solution is then checked to lie on both segments, which is how the pinned
 * build rejects a crossing of the infinite lines.
 * @param first One segment.
 * @param second The other.
 * @returns The crossing, or null.
 */
function segmentIntersection(first: Segment, second: Segment): Point | null {
	const a1 = first[1].y - first[0].y;
	const b1 = first[0].x - first[1].x;
	const a2 = second[1].y - second[0].y;
	const b2 = second[0].x - second[1].x;
	const determinant = a1 * b2 - a2 * b1;
	if (determinant === 0) {
		return null;
	}
	const c1 = a1 * first[0].x + b1 * first[0].y;
	const c2 = a2 * second[0].x + b2 * second[0].y;
	const candidate = {
		x: (c1 * b2 - c2 * b1) / determinant,
		y: (a1 * c2 - a2 * c1) / determinant,
	};
	return distanceToSegment(candidate, first) < INTERSECTION_PRECISION &&
		distanceToSegment(candidate, second) < INTERSECTION_PRECISION
		? candidate
		: null;
}

/**
 * Whether a line reaches the box a cubic lies in, which is the cheap test
 * that keeps the Newton solve off curves it cannot meet.
 * @param curve The cubic.
 * @param line The segment.
 * @returns True when the line crosses the curve's bounding box.
 */
function curveIntersectsBounds(curve: Cubic, line: Segment): boolean {
	const xs = curve.map((point) => point.x);
	const ys = curve.map((point) => point.y);
	const left = Math.min(...xs);
	const top = Math.min(...ys);
	const right = Math.max(...xs);
	const bottom = Math.max(...ys);
	const edges: Segment[] = [
		[
			{ x: left, y: top },
			{ x: right, y: top },
		],
		[
			{ x: right, y: top },
			{ x: right, y: bottom },
		],
		[
			{ x: right, y: bottom },
			{ x: left, y: bottom },
		],
		[
			{ x: left, y: bottom },
			{ x: left, y: top },
		],
	];
	return edges.some((edge) => segmentIntersection(line, edge) !== null);
}

/** A 2x2 Jacobian, as its two gradient rows. */
type Jacobian = readonly [readonly [number, number], readonly [number, number]];

/**
 * The Newton step that solves one residual against a Jacobian.
 * @param jacobian The partial derivatives at the current guess.
 * @param value The residual there.
 * @returns The step in each parameter, or null when the Jacobian is singular.
 */
function newtonStep(jacobian: Jacobian, value: Point): readonly [number, number] | null {
	const determinant = jacobian[0][0] * jacobian[1][1] - jacobian[0][1] * jacobian[1][0];
	if (determinant === 0) {
		return null;
	}
	const inverse = [
		[jacobian[1][1] / determinant, -jacobian[0][1] / determinant],
		[-jacobian[1][0] / determinant, jacobian[0][0] / determinant],
	] as const;
	return [
		inverse[0][0] * -value.x + inverse[0][1] * -value.y,
		inverse[1][0] * -value.x + inverse[1][1] * -value.y,
	];
}

/**
 * Solve the curve and the line for one starting guess.
 * @param valueAt The residual between the curve at `t` and the line at `s`.
 * @param initialT The curve parameter to start from.
 * @param initialS The line parameter to start from.
 * @returns The parameters, or null when it neither converges nor can step.
 */
function newtonSolve(
	valueAt: (t: number, s: number) => Point,
	initialT: number,
	initialS: number,
): readonly [number, number] | null {
	/**
	 * The partial derivatives of one component, by central difference.
	 * @param component Which component of the residual.
	 * @param t The curve parameter.
	 * @param s The line parameter.
	 * @returns The derivative in each parameter.
	 */
	const gradient = (
		component: (value: Point) => number,
		t: number,
		s: number,
	): readonly [number, number] => {
		const delta = 1e-6;
		return [
			(component(valueAt(t + delta, s)) - component(valueAt(t - delta, s))) / (2 * delta),
			(component(valueAt(t, s + delta)) - component(valueAt(t, s - delta))) / (2 * delta),
		];
	};
	let t = initialT;
	let s = initialS;
	let error = Infinity;
	let iteration = 0;
	while (error >= 1e-3) {
		if (iteration >= 10) {
			return null;
		}
		const step = newtonStep(
			[gradient((point) => point.x, t, s), gradient((point) => point.y, t, s)],
			valueAt(t, s),
		);
		if (!step) {
			return null;
		}
		t += step[0];
		s += step[1];
		const residual = valueAt(t, s);
		error = Math.max(Math.abs(residual.x), Math.abs(residual.y));
		iteration += 1;
	}
	return [t, s];
}

/**
 * The pinned two-variable Newton solve for one cubic and one finite segment.
 * @param curve The cubic.
 * @param line The segment.
 * @returns The crossing, or null when none of the starting guesses lands on both.
 */
function curveSegmentIntersection(curve: Cubic, line: Segment): Point | null {
	if (!curveIntersectsBounds(curve, line)) {
		return null;
	}
	/**
	 * How far the curve at `t` is from the line at `s`.
	 * @param t The curve parameter.
	 * @param s The line parameter.
	 * @returns The residual.
	 */
	const valueAt = (t: number, s: number): Point => {
		const onCurve = pointOnCubic(curve, t);
		return {
			x: onCurve.x - (line[0].x + s * (line[1].x - line[0].x)),
			y: onCurve.y - (line[0].y + s * (line[1].y - line[0].y)),
		};
	};
	for (const [initialT, initialS] of [
		[0.5, 0],
		[0.2, 0],
		[0.8, 0],
	] as const) {
		const solution = newtonSolve(valueAt, initialT, initialS);
		if (solution && onBoth(solution)) {
			return pointOnCubic(curve, solution[0]);
		}
	}
	return null;
}

/**
 * Whether a solution lands within both the curve and the segment rather than
 * on their infinite extensions.
 * @param solution The curve and line parameters.
 * @returns True when both are between 0 and 1.
 */
function onBoth(solution: readonly [number, number]): boolean {
	const [t, s] = solution;
	return t >= 0 && t <= 1 && s >= 0 && s <= 1;
}

/**
 * Where a ray meets one segment, as a distance along the ray.
 * @param origin Where the ray starts.
 * @param direction The ray's direction; distances are in units of it.
 * @param from One end of the segment.
 * @param to The other end.
 * @returns The distance, or null when they are parallel or the ray misses.
 */
function alongSegment(origin: Point, direction: Point, from: Point, to: Point): number | null {
	const edge = minus(to, from);
	const denominator = cross(direction, edge);
	if (Math.abs(denominator) < 1e-12) {
		return null;
	}
	const offset = minus(from, origin);
	const t = cross(offset, edge) / denominator;
	const u = cross(offset, direction) / denominator;
	if (u < -1e-9 || u > 1 + 1e-9) {
		return null;
	}
	return t;
}

export {
	type Bindable,
	type Cubic,
	type Point,
	type Segment,
	INTERSECTION_PRECISION,
	alongSegment,
	centreOf,
	cornerOffset,
	cross,
	curveSegmentIntersection,
	halfExtents,
	minus,
	num,
	roundedCorner,
	rotate,
	rotatePinned,
	segmentIntersection,
};

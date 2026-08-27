import type { SceneBBox, ScenePoint } from "../schemas.js";

export interface ExactPoint {
	x: number;
	y: number;
}
export interface ExactBox {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface Segment {
	connectorId: string;
	sourceIndex: number;
	index: number;
	a: ExactPoint;
	b: ExactPoint;
}

export const finite = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);

export function normalizeNumber(value: number): number {
	const rounded =
		Math.abs(value) > Number.MAX_VALUE / 1000 ? value : Math.round(value * 1000) / 1000;
	return Object.is(rounded, -0) ? 0 : rounded;
}

export const point = (value: ExactPoint): ScenePoint => ({
	x: normalizeNumber(value.x),
	y: normalizeNumber(value.y),
});
export const box = (value: ExactBox): SceneBBox => ({
	x: normalizeNumber(value.x),
	y: normalizeNumber(value.y),
	width: normalizeNumber(Math.max(0, value.width)),
	height: normalizeNumber(Math.max(0, value.height)),
});

export type FocusBoxResult =
	| { kind: "absent" }
	| { kind: "representable"; box: SceneBBox }
	| {
			kind: "unrepresentable";
			failedDeltas: Array<"x-minus-16" | "y-minus-16" | "width-plus-32" | "height-plus-32">;
	  };

/** Exact schema-v1 focus padding, including the representability of each required delta. */
export function focusBox(value: SceneBBox | null): FocusBoxResult {
	if (value === null) return { kind: "absent" };
	const x = value.x - 16;
	const y = value.y - 16;
	const width = value.width + 32;
	const height = value.height + 32;
	const failedDeltas: Extract<FocusBoxResult, { kind: "unrepresentable" }>["failedDeltas"] = [];
	if (!finite(x) || value.x - x !== 16) failedDeltas.push("x-minus-16");
	if (!finite(y) || value.y - y !== 16) failedDeltas.push("y-minus-16");
	if (!finite(width) || width - value.width !== 32) failedDeltas.push("width-plus-32");
	if (!finite(height) || height - value.height !== 32) failedDeltas.push("height-plus-32");
	if (failedDeltas.length > 0) return { kind: "unrepresentable", failedDeltas };
	return { kind: "representable", box: box({ x, y, width, height }) };
}

export type AggregateBoxResult =
	| { kind: "empty" }
	| { kind: "representable"; box: ExactBox }
	| { kind: "unrepresentable"; representative: ExactBox };

const boxOrder = (a: ExactBox, b: ExactBox): number => {
	for (const field of ["x", "y", "width", "height"] as const) {
		if (a[field] < b[field]) return -1;
		if (a[field] > b[field]) return 1;
	}
	return 0;
};

/** Classify an exact union without conflating no input with an unrepresentable finite span. */
export function aggregateBoxes(values: readonly ExactBox[]): AggregateBoxResult {
	if (values.length === 0) return { kind: "empty" };
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
	const width = maxX - minX;
	const height = maxY - minY;
	if (finite(minX) && finite(minY) && finite(width) && finite(height))
		return { kind: "representable", box: { x: minX, y: minY, width, height } };
	let representative = values[0]!;
	for (let index = 1; index < values.length; index += 1)
		if (boxOrder(values[index]!, representative) < 0) representative = values[index]!;
	return { kind: "unrepresentable", representative };
}

export function pointBox(points: readonly ExactPoint[]): ExactBox | null {
	if (points.length === 0) return null;
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
	const width = maxX - minX;
	const height = maxY - minY;
	return finite(minX) && finite(minY) && finite(width) && finite(height)
		? { x: minX, y: minY, width, height }
		: null;
}

export function overlap(a: ExactBox, b: ExactBox): ExactBox | null {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	const right = Math.min(a.x + a.width, b.x + b.width);
	const bottom = Math.min(a.y + a.height, b.y + b.height);
	return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

export function contains(outer: ExactBox, inner: ExactBox): boolean {
	return (
		outer.x <= inner.x &&
		outer.y <= inner.y &&
		outer.x + outer.width >= inner.x + inner.width &&
		outer.y + outer.height >= inner.y + inner.height
	);
}

/** Liang-Barsky clipping. Null means no interior span beyond tolerance. */
export function segmentInsideBox(
	a: ExactPoint,
	b: ExactPoint,
	target: ExactBox,
	tolerance: number,
): { entry: ExactPoint; exit: ExactPoint } | null {
	const left = target.x + tolerance;
	const top = target.y + tolerance;
	const right = target.x + target.width - tolerance;
	const bottom = target.y + target.height - tolerance;
	if (right <= left || bottom <= top) return null;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	let low = 0;
	let high = 1;
	for (const [p, q] of [
		[-dx, a.x - left],
		[dx, right - a.x],
		[-dy, a.y - top],
		[dy, bottom - a.y],
	] as const) {
		if (p === 0) {
			if (q < 0) return null;
			continue;
		}
		const ratio = q / p;
		if (p < 0) low = Math.max(low, ratio);
		else high = Math.min(high, ratio);
		if (low >= high) return null;
	}
	if (high <= 0 || low >= 1) return null;
	const entry = { x: a.x + dx * Math.max(0, low), y: a.y + dy * Math.max(0, low) };
	const exit = { x: a.x + dx * Math.min(1, high), y: a.y + dy * Math.min(1, high) };
	return { entry, exit };
}

export type SegmentIntersection =
	| { kind: "none" | "contact" }
	| { kind: "proper"; point: ExactPoint }
	| { kind: "collinear"; points: [ExactPoint, ExactPoint] };

const cross = (u: ExactPoint, v: ExactPoint) => u.x * v.y - u.y * v.x;

export function intersectSegments(
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
		if (Math.abs(cross(ca, r)) > Number.EPSILON) return { kind: "none" };
		const axis = Math.abs(r.x) >= Math.abs(r.y) ? "x" : "y";
		const values = [a[axis], b[axis]].toSorted((x, y) => x - y);
		const other = [c[axis], d[axis]].toSorted((x, y) => x - y);
		const lo = Math.max(values[0]!, other[0]!);
		const hi = Math.min(values[1]!, other[1]!);
		if (hi - lo <= tolerance) return hi >= lo ? { kind: "contact" } : { kind: "none" };
		const at = (value: number): ExactPoint => {
			const ratio = Math.abs(r[axis]) <= Number.EPSILON ? 0 : (value - a[axis]) / r[axis];
			return { x: a.x + ratio * r.x, y: a.y + ratio * r.y };
		};
		return { kind: "collinear", points: [at(lo), at(hi)] };
	}
	const t = cross(ca, s) / denominator;
	const u = cross(ca, r) / denominator;
	if (t < 0 || t > 1 || u < 0 || u > 1) return { kind: "none" };
	const hit = { x: a.x + t * r.x, y: a.y + t * r.y };
	const endpointDistance = Math.min(
		Math.hypot(hit.x - a.x, hit.y - a.y),
		Math.hypot(hit.x - b.x, hit.y - b.y),
		Math.hypot(hit.x - c.x, hit.y - c.y),
		Math.hypot(hit.x - d.x, hit.y - d.y),
	);
	return endpointDistance <= tolerance ? { kind: "contact" } : { kind: "proper", point: hit };
}

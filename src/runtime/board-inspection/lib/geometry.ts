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
	const rounded = Math.round(value * 1000) / 1000;
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
export const focus = (value: SceneBBox | null): SceneBBox | null =>
	value === null
		? null
		: box({ x: value.x - 16, y: value.y - 16, width: value.width + 32, height: value.height + 32 });

export function unionBoxes(values: readonly ExactBox[]): ExactBox | null {
	if (values.length === 0) return null;
	const minX = Math.min(...values.map((value) => value.x));
	const minY = Math.min(...values.map((value) => value.y));
	const maxX = Math.max(...values.map((value) => value.x + value.width));
	const maxY = Math.max(...values.map((value) => value.y + value.height));
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function pointBox(points: readonly ExactPoint[]): ExactBox | null {
	if (points.length === 0) return null;
	const minX = Math.min(...points.map((value) => value.x));
	const minY = Math.min(...points.map((value) => value.y));
	const maxX = Math.max(...points.map((value) => value.x));
	const maxY = Math.max(...points.map((value) => value.y));
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
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
	if (Math.hypot(exit.x - entry.x, exit.y - entry.y) <= tolerance) return null;
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

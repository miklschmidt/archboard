// Where an element actually is, and how big it actually is.
//
// For a box shape those two questions are answered by `x, y, width, height`,
// and every reader in this repo used to assume that was true of everything.
// It is not true of an arrow. Excalidraw stores a linear element as an origin
// plus a path: `x, y` is its FIRST POINT, and `points` are offsets from that
// point which are free to be negative. An arrow drawn right-to-left has its
// origin on the right, so `x .. x + width` is the stretch of board the arrow
// came from rather than the stretch it occupies, and for an arrow running up
// and to the left the two ranges do not overlap at all (TASK-038).
//
// The same shape of bug bit bound labels: TASK-034's `boundTextDrift` was
// immune only because it measured arrows from their points. This module is
// that measurement, pulled out so every reader can share it.
//
// Two things follow from being the shared home:
//
//   · it is pure and dependency-free, like `labels.ts`, because the browser
//     imports the modules that need it and cannot have winston or a fetch
//     client dragged in behind them. The canvas operations that used to live
//     in this file (align, distribute, group, duplicate) are in
//     `element-ops.ts`.
//   · it decides by `points`, not by `type`. Anything carrying a path is
//     measured from that path — arrows, lines, and freedraw, whose strokes are
//     stored the same way — so a new linear type is right by default rather
//     than wrong until somebody remembers this file.

/** As much of an element as placing it requires. */
export interface Measurable {
	x?: unknown;
	y?: unknown;
	width?: unknown;
	height?: unknown;
	points?: unknown;
}

export interface RenderGeometryElement extends Measurable {
	id?: unknown;
	type?: unknown;
	isDeleted?: unknown;
}

export interface InvalidRenderGeometry {
	id: string;
	type: string;
	fields: Array<"x" | "y" | "width" | "height">;
}

/** A complete document cannot be handed to Excalidraw safely. */
export class RenderGeometryError extends Error {
	constructor(readonly invalid: InvalidRenderGeometry[]) {
		const details = invalid
			.map((element) => `${element.id} (${element.type}): ${element.fields.join(", ")}`)
			.join("; ");
		super(
			`Invalid render geometry: ${details}. ` +
				"Every live element needs finite x, y, width and height. Correct the element geometry and try again.",
		);
		this.name = "RenderGeometryError";
	}
}

/** An axis-aligned box in scene coordinates, in the element's own vocabulary. */
export interface Extent {
	x: number;
	y: number;
	width: number;
	height: number;
}

const finite = (v: unknown): number | undefined =>
	typeof v === "number" && Number.isFinite(v) ? v : undefined;

/**
 * Refuse a document Excalidraw cannot render without producing a non-finite
 * camera. Report the whole document in one pass so a caller can repair every
 * offending element rather than discovering one field per write.
 *
 * Tombstones are intentionally ignored. Excalidraw does not render them, and
 * malformed history must not prevent a valid live document from being saved.
 */
export function validateRenderGeometry(elements: Iterable<RenderGeometryElement>): void {
	const invalid = collectInvalidRenderGeometry(elements);
	if (invalid.length > 0) throw new RenderGeometryError(invalid);
}

/** The pure collection used by strict ingest and read-only inspection alike. */
export function collectInvalidRenderGeometry(
	elements: Iterable<RenderGeometryElement>,
): InvalidRenderGeometry[] {
	const invalid: InvalidRenderGeometry[] = [];
	for (const element of elements) {
		if (element.isDeleted === true) continue;
		const fields = (["x", "y", "width", "height"] as const).filter(
			(field) => finite(element[field]) === undefined,
		);
		if (fields.length === 0) continue;
		invalid.push({
			id: typeof element.id === "string" && element.id ? element.id : "<unnamed>",
			type: typeof element.type === "string" && element.type ? element.type : "<unknown>",
			fields,
		});
	}
	return invalid;
}

/** The default local path for a new straight linear element. */
export const DEFAULT_LINEAR_POINTS = [
	[0, 0],
	[100, 0],
] as const;

/** Valid point tuples or objects, in one normalized shape. */
export function pointsOf(points: unknown): { x: number; y: number }[] | undefined {
	if (!Array.isArray(points) || points.length === 0) return undefined;
	const normalized: { x: number; y: number }[] = [];
	for (const point of points) {
		const pointRecord =
			point && typeof point === "object" && !Array.isArray(point)
				? (point as Record<string, unknown>)
				: null;
		const x = finite(Array.isArray(point) ? point[0] : pointRecord?.x);
		const y = finite(Array.isArray(point) ? point[1] : pointRecord?.y);
		if (x !== undefined && y !== undefined) normalized.push({ x, y });
	}
	return normalized.length === 0 ? undefined : normalized;
}

/** The offsets of a path, dropping anything that is not a pair of numbers. */
function pathOffsets(points: unknown): { xs: number[]; ys: number[] } | undefined {
	const normalized = pointsOf(points);
	return normalized
		? { xs: normalized.map((point) => point.x), ys: normalized.map((point) => point.y) }
		: undefined;
}

/**
 * How big a path is. Not a second opinion about the element's size — for a
 * linear element this *is* its size, which is why the server has to state it
 * again every time it writes new points.
 *
 * Undefined when the path says nothing measurable, because a guessed size is
 * worse than the stale one it would replace.
 */
export function measureLinear(points: unknown): { width: number; height: number } | undefined {
	const offsets = pathOffsets(points);
	if (!offsets) return undefined;
	return {
		width: Math.max(...offsets.xs) - Math.min(...offsets.xs),
		height: Math.max(...offsets.ys) - Math.min(...offsets.ys),
	};
}

/** Does this element carry a path, and therefore keep its size in it? */
export function isPathElement(element: Measurable | null | undefined): boolean {
	return pathOffsets(element?.points) !== undefined;
}

/**
 * The box this element occupies: top-left corner, and size.
 *
 * For an element with a path this is measured from the path, so an arrow that
 * runs leftwards or upwards reports the board it covers rather than the board
 * to the right of where it started. For everything else it is the stored
 * `x, y, width, height`, which for those elements is already the answer.
 *
 * A missing coordinate reads as 0 rather than as undefined: every caller here
 * is placing an element on a board next to its neighbours, and one element
 * excusing itself from the frame is a worse answer than one drawn at the
 * origin.
 */
export function extentOf(element: Measurable | null | undefined): Extent {
	const x = finite(element?.x) ?? 0;
	const y = finite(element?.y) ?? 0;
	const offsets = pathOffsets(element?.points);
	if (offsets) {
		const minX = Math.min(...offsets.xs);
		const minY = Math.min(...offsets.ys);
		return {
			x: x + minX,
			y: y + minY,
			width: Math.max(...offsets.xs) - minX,
			height: Math.max(...offsets.ys) - minY,
		};
	}
	return { x, y, width: finite(element?.width) ?? 0, height: finite(element?.height) ?? 0 };
}

/** A region of board to ask a question about. Any side may be unbounded. */
export interface Region {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
}

/**
 * Is any part of this element inside the region?
 *
 * Overlap, not containment, and measured rather than read off `x, y`. An
 * arrow's origin is its first point, so asking whether that one point is in
 * range answers a question nobody asked: an arrow that crosses the region is
 * missed if it started outside, and one that merely starts there is caught
 * whatever it does next (TASK-044). Both are the same element judged by where
 * it happens to begin.
 *
 * Inclusive on every edge, so an element flush against a boundary is inside
 * it, and a point-sized element is judged the same way a box is.
 */
export function overlapsRegion(element: Measurable | null | undefined, region: Region): boolean {
	const extent = extentOf(element);
	return (
		extent.x <= region.xMax &&
		extent.x + extent.width >= region.xMin &&
		extent.y <= region.yMax &&
		extent.y + extent.height >= region.yMin
	);
}

/**
 * The element's `width`/`height` restated from its path, when the two have
 * drifted apart. Undefined when there is nothing to correct, so a caller can
 * use the answer as "is there an update to make" without a second comparison.
 *
 * Half a pixel of tolerance, matching the rest of the repo: a rounding error
 * is not a resize, and bumping an element's version for one wakes the change
 * feed over nothing.
 */
export function remeasureLinear(
	element: Measurable | null | undefined,
): { width: number; height: number } | undefined {
	const measured = measureLinear(element?.points);
	if (!measured) return undefined;
	const width = finite(element?.width);
	const height = finite(element?.height);
	if (
		width !== undefined &&
		height !== undefined &&
		Math.abs(width - measured.width) < 0.5 &&
		Math.abs(height - measured.height) < 0.5
	) {
		return undefined;
	}
	return measured;
}

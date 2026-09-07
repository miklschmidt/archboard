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
interface Measurable {
	x?: unknown;
	y?: unknown;
	width?: unknown;
	height?: unknown;
	points?: unknown;
}

interface RenderGeometryElement extends Measurable {
	id?: unknown;
	type?: unknown;
	isDeleted?: unknown;
}

interface InvalidRenderGeometry {
	id: string;
	type: string;
	fields: ("x" | "y" | "width" | "height")[];
}

/** A complete document cannot be handed to Excalidraw safely. */
class RenderGeometryError extends Error {
	public readonly invalid: InvalidRenderGeometry[];

	/**
	 * Refuse a document, naming every element that is wrong rather than the
	 * first one, so one repair pass can fix all of them.
	 * @param invalid The elements whose geometry cannot be rendered.
	 */
	public constructor(invalid: InvalidRenderGeometry[]) {
		const details = invalid
			.map((element) => `${element.id} (${element.type}): ${element.fields.join(", ")}`)
			.join("; ");
		super(
			`Invalid render geometry: ${details}. ` +
				"Every live element needs finite x, y, width and height. Correct the element geometry and try again.",
		);
		this.name = "RenderGeometryError";
		this.invalid = invalid;
	}
}

/** An axis-aligned box in scene coordinates, in the element's own vocabulary. */
interface Extent {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** One point of a path, as offsets from the element's origin. */
interface PathPoint {
	x: number;
	y: number;
}

/** The corners of a path, as offsets from the element's origin. */
interface PathExtrema {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/**
 * A number a shape can actually be drawn with.
 * @param v Whatever the element carried.
 * @returns The number, or undefined for anything that is not a finite one.
 */
const finite = (v: unknown): number | undefined =>
	typeof v === "number" && Number.isFinite(v) ? v : undefined;

/**
 * A coordinate, reading a missing one as 0.
 *
 * Every caller here is placing an element on a board next to its neighbours,
 * and one element excusing itself from the frame is a worse answer than one
 * drawn at the origin.
 * @param value Whatever the element carried.
 * @returns The coordinate.
 */
function coordinate(value: unknown): number {
	return finite(value) ?? 0;
}

/**
 * A name an error message can use.
 * @param value Whatever the element carried.
 * @param placeholder What to say when it carries nothing usable.
 * @returns The name.
 */
function nameOrPlaceholder(value: unknown, placeholder: string): string {
	return typeof value === "string" && value ? value : placeholder;
}

/**
 * What is wrong with one element's geometry, when anything is.
 * @param element The element.
 * @returns The report, or undefined when every field is finite.
 */
function invalidGeometryOf(element: RenderGeometryElement): InvalidRenderGeometry | undefined {
	const fields = (["x", "y", "width", "height"] as const).filter(
		(field) => finite(element[field]) === undefined,
	);
	if (fields.length === 0) {
		return undefined;
	}
	return {
		id: nameOrPlaceholder(element.id, "<unnamed>"),
		type: nameOrPlaceholder(element.type, "<unknown>"),
		fields,
	};
}

/**
 * Every live element Excalidraw could not render without producing a
 * non-finite camera.
 *
 * The whole document in one pass, so a caller can repair every offending
 * element rather than discovering one field per write. Tombstones are
 * intentionally ignored: Excalidraw does not render them, and malformed
 * history must not prevent a valid live document from being saved.
 * @param elements The elements to inspect.
 * @returns All live elements with invalid render geometry.
 */
function collectInvalidRenderGeometry(
	elements: Iterable<RenderGeometryElement>,
): InvalidRenderGeometry[] {
	const invalid: InvalidRenderGeometry[] = [];
	for (const element of elements) {
		if (element.isDeleted === true) {
			continue;
		}
		const found = invalidGeometryOf(element);
		if (found) {
			invalid.push(found);
		}
	}
	return invalid;
}

/**
 * Refuse a document Excalidraw cannot render without producing a non-finite
 * camera.
 * @param elements The complete document to validate.
 * @throws {RenderGeometryError} When any live element's geometry is not
 * finite, naming every one of them.
 */
function validateRenderGeometry(elements: Iterable<RenderGeometryElement>): void {
	const invalid = collectInvalidRenderGeometry(elements);
	if (invalid.length > 0) {
		throw new RenderGeometryError(invalid);
	}
}

/** The default local path for a new straight linear element. */
const DEFAULT_LINEAR_POINTS = [
	[0, 0],
	[100, 0],
] as const;

/**
 * One point of a path, when it is one.
 * @param point The candidate point.
 * @returns The pair, or undefined when it is not a pair of finite numbers.
 */
function pointOf(point: unknown): PathPoint | undefined {
	if (!Array.isArray(point) || point.length !== 2) {
		return undefined;
	}
	const x = finite(point[0]);
	const y = finite(point[1]);
	if (x === undefined || y === undefined) {
		return undefined;
	}
	return { x, y };
}

/**
 * Valid native point tuples, in the shape used by geometry consumers.
 * @param points The candidate native points.
 * @returns The valid ones, or undefined when there are none.
 */
function pointsOf(points: unknown): PathPoint[] | undefined {
	if (!Array.isArray(points) || points.length === 0) {
		return undefined;
	}
	const normalized: PathPoint[] = points.flatMap((point) => pointOf(point) ?? []);
	return normalized.length === 0 ? undefined : normalized;
}

/**
 * The corners of a path.
 * @param points The candidate path.
 * @returns The offsets, dropping anything that is not a pair of numbers, or
 * undefined when nothing measurable is left.
 */
function pathExtrema(points: unknown): PathExtrema | undefined {
	const normalized = pointsOf(points);
	if (!normalized) {
		return undefined;
	}
	const first = normalized[0];
	if (first === undefined) {
		return undefined;
	}
	let minX = first.x;
	let maxX = first.x;
	let minY = first.y;
	let maxY = first.y;
	for (const current of normalized) {
		minX = Math.min(minX, current.x);
		maxX = Math.max(maxX, current.x);
		minY = Math.min(minY, current.y);
		maxY = Math.max(maxY, current.y);
	}
	return { minX, minY, maxX, maxY };
}

/**
 * How big a path is. Not a second opinion about the element's size — for a
 * linear element this *is* its size, which is why the server has to state it
 * again every time it writes new points.
 * @param points The candidate linear path.
 * @returns The measured size, or undefined when the path says nothing
 * measurable: a guessed size is worse than the stale one it would replace.
 */
function measureLinear(points: unknown): { width: number; height: number } | undefined {
	const offsets = pathExtrema(points);
	if (!offsets) {
		return undefined;
	}
	return {
		width: offsets.maxX - offsets.minX,
		height: offsets.maxY - offsets.minY,
	};
}

/**
 * Does this element carry a path, and therefore keep its size in it?
 * @param element The element to inspect.
 * @returns Whether it carries a measurable path.
 */
function isPathElement(element: Measurable | null | undefined): boolean {
	return pathExtrema(element?.points) !== undefined;
}

/**
 * The box this element occupies: top-left corner, and size.
 *
 * For an element with a path this is measured from the path, so an arrow that
 * runs leftwards or upwards reports the board it covers rather than the board
 * to the right of where it started. For everything else it is the stored
 * `x, y, width, height`, which for those elements is already the answer.
 * @param element The element to measure.
 * @returns Its axis-aligned scene extent.
 */
function extentOf(element: Measurable | null | undefined): Extent {
	const el: Measurable = element ?? {};
	const x = coordinate(el.x);
	const y = coordinate(el.y);
	const offsets = pathExtrema(el.points);
	if (offsets) {
		return {
			x: x + offsets.minX,
			y: y + offsets.minY,
			width: offsets.maxX - offsets.minX,
			height: offsets.maxY - offsets.minY,
		};
	}
	return { x, y, width: coordinate(el.width), height: coordinate(el.height) };
}

/** A region of board to ask a question about. Any side may be unbounded. */
interface Region {
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
 * @param element The element to measure.
 * @param region The region to compare with.
 * @returns Whether any part of the element overlaps the region.
 */
function overlapsRegion(element: Measurable | null | undefined, region: Region): boolean {
	const extent = extentOf(element);
	return (
		extent.x <= region.xMax &&
		extent.x + extent.width >= region.xMin &&
		extent.y <= region.yMax &&
		extent.y + extent.height >= region.yMin
	);
}

// Half a pixel, matching the rest of the repo: a rounding error is not a
// resize, and bumping an element's version for one wakes the change feed over
// nothing.
const REMEASURE_TOLERANCE = 0.5;

/**
 * Whether a stored dimension still agrees with the measured one.
 * @param stored What the element says its size is.
 * @param measured What its path says.
 * @returns True when the two agree within tolerance. A dimension the element
 * does not carry never agrees: there is nothing there to be right.
 */
function withinTolerance(stored: number | undefined, measured: number): boolean {
	return stored !== undefined && Math.abs(stored - measured) < REMEASURE_TOLERANCE;
}

/**
 * The element's `width`/`height` restated from its path, when the two have
 * drifted apart.
 * @param element The path element to remeasure.
 * @returns The corrected dimensions, or undefined when there is nothing to
 * correct — so a caller can use the answer as "is there an update to make"
 * without a second comparison.
 */
function remeasureLinear(
	element: Measurable | null | undefined,
): { width: number; height: number } | undefined {
	const el: Measurable = element ?? {};
	const measured = measureLinear(el.points);
	if (!measured) {
		return undefined;
	}
	if (
		withinTolerance(finite(el.width), measured.width) &&
		withinTolerance(finite(el.height), measured.height)
	) {
		return undefined;
	}
	return measured;
}

export {
	type Measurable,
	type RenderGeometryElement,
	type InvalidRenderGeometry,
	RenderGeometryError,
	type Extent,
	validateRenderGeometry,
	collectInvalidRenderGeometry,
	DEFAULT_LINEAR_POINTS,
	pointsOf,
	measureLinear,
	isPathElement,
	extentOf,
	type Region,
	overlapsRegion,
	remeasureLinear,
};

// Test vocabulary for positions along and across a downward architecture drawing.

import type { DiagramBox } from "@/shared/semantic-board/index";
import type { ReadingDirection, RenderedDiagram } from "@/runtime/semantic-renderer/index";

/** A position or a box on the page. */
interface OnPage {
	readonly x: number;
	readonly y: number;
}

/**
 * Whether two coordinates are within a unit of each other: on the same face.
 * @param a One coordinate.
 * @param b The other.
 * @returns True when they are within a unit.
 */
function near(a: number, b: number): boolean {
	return Math.abs(a - b) < 1;
}

/**
 * The direction a drawn architecture reads, as the document records it.
 * @param drawing The rendered board.
 * @returns Down the page.
 */
function readingOf(drawing: RenderedDiagram): ReadingDirection {
	const found = /<svg [^>]*data-reading-direction="(down)"/.exec(drawing.svg);
	if (found === null) throw new Error("the document does not say which way it reads");
	return "down";
}

/**
 * How far down the page a point or box sits.
 * @param at The point or box.
 * @returns The coordinate along the reading.
 */
function along(at: OnPage): number {
	return at.y;
}

/**
 * How far across the page a point or box sits.
 * @param at The point or box.
 * @returns The coordinate across the reading.
 */
function across(at: OnPage): number {
	return at.x;
}

/** A width and a height: a box, or a page. */
interface Extent {
	readonly width: number;
	readonly height: number;
}

/**
 * A box's or page's extent along the reading.
 * @param box The box or page.
 * @returns Its height.
 */
function depth(box: Extent): number {
	return box.height;
}

/**
 * A box's or page's extent across the reading.
 * @param box The box or page.
 * @returns Its width.
 */
function breadth(box: Extent): number {
	return box.width;
}

/**
 * The face of a box a point lies on, named by the reading: ahead (the face a
 * forward step leaves by), behind (the face it enters by), or one of the
 * two flanks, the return flank and the flank beside it.
 * @param point The point.
 * @param box The box.
 * @returns The face, or "off" when the point is on no face.
 */
function faceOf(point: OnPage, box: DiagramBox): "ahead" | "behind" | "return" | "beside" | "off" {
	const alongStart = along(box);
	const alongEnd = alongStart + depth(box);
	const acrossStart = across(box);
	const acrossEnd = acrossStart + breadth(box);
	if (near(along(point), alongStart)) return "behind";
	if (near(along(point), alongEnd)) return "ahead";
	if (near(across(point), acrossStart)) return "beside";
	if (near(across(point), acrossEnd)) return "return";
	return "off";
}

export { across, along, breadth, depth, faceOf, readingOf };

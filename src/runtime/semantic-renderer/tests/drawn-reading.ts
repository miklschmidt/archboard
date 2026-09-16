// Reading a drawn architecture the way its page reads, so a test says "ahead"
// and "beside" rather than "below" and "to the right" and holds whichever way
// the renderer chose to read the board (ADR 0028).

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
 * @returns Down the page, or left to right.
 */
function readingOf(drawing: RenderedDiagram): ReadingDirection {
	const found = /<svg [^>]*data-reading-direction="(down|right)"/.exec(drawing.svg);
	if (found === null) throw new Error("the document does not say which way it reads");
	return found[1] as ReadingDirection;
}

/**
 * How far along the reading a point or box sits: its y when the page reads
 * down, its x when it reads left to right.
 * @param at The point or box.
 * @param direction The way the page reads.
 * @returns The coordinate along the reading.
 */
function along(at: OnPage, direction: ReadingDirection): number {
	return direction === "down" ? at.y : at.x;
}

/**
 * How far across the reading a point or box sits: its x when the page reads
 * down, its y when it reads left to right.
 * @param at The point or box.
 * @param direction The way the page reads.
 * @returns The coordinate across the reading.
 */
function across(at: OnPage, direction: ReadingDirection): number {
	return direction === "down" ? at.x : at.y;
}

/** A width and a height: a box, or a page. */
interface Extent {
	readonly width: number;
	readonly height: number;
}

/**
 * A box's or page's extent along the reading.
 * @param box The box or page.
 * @param direction The way the page reads.
 * @returns Its height when the page reads down, its width when it reads right.
 */
function depth(box: Extent, direction: ReadingDirection): number {
	return direction === "down" ? box.height : box.width;
}

/**
 * A box's or page's extent across the reading.
 * @param box The box or page.
 * @param direction The way the page reads.
 * @returns Its width when the page reads down, its height when it reads right.
 */
function breadth(box: Extent, direction: ReadingDirection): number {
	return direction === "down" ? box.width : box.height;
}

/**
 * The face of a box a point lies on, named by the reading: ahead (the face a
 * forward step leaves by), behind (the face it enters by), or one of the
 * two flanks, the return flank and the flank beside it.
 * @param point The point.
 * @param box The box.
 * @param direction The way the page reads.
 * @returns The face, or "off" when the point is on no face.
 */
function faceOf(
	point: OnPage,
	box: DiagramBox,
	direction: ReadingDirection,
): "ahead" | "behind" | "return" | "beside" | "off" {
	const alongStart = along(box, direction);
	const alongEnd = alongStart + depth(box, direction);
	const acrossStart = across(box, direction);
	const acrossEnd = acrossStart + breadth(box, direction);
	if (near(along(point, direction), alongStart)) return "behind";
	if (near(along(point, direction), alongEnd)) return "ahead";
	if (near(across(point, direction), acrossStart)) return "beside";
	if (near(across(point, direction), acrossEnd)) return "return";
	return "off";
}

export { across, along, breadth, depth, faceOf, readingOf };

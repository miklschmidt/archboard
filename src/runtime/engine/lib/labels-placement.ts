// Where a label sits.
//
// A bound label has no opinion about where it is. Its container decides, and
// the stored coordinates have to say so.
//
// Excalidraw recomputes a bound text's position from its container every time
// it draws one, so a label whose stored x/y is nonsense still *looks* right.
// That is what made this hide: moving a box through the API updated the box
// and left its text element where it was, the board redrew perfectly, and
// nothing complained. What is wrong is the record, and every reader that works
// from coordinates rather than pixels inherits it — the scene bounding box,
// and therefore zoom-to-fit and the crop of an image export, and the relative
// position signals in layout.ts that `describe` and `compare` are built on. On
// one real board a label had been left 1170px from the arrow it belongs to,
// pushing the scene box out by a phantom 630x203 region of empty canvas that
// every screenshot then framed (TASK-034).
//
// So the rule Excalidraw draws by is written down here, in the same module as
// the rest of the seed/bound-text model, and the server applies it whenever it
// moves a container itself. A change report coming the other way does not need
// it: there Excalidraw has already placed the label, and it is the authority.

import { measureLinear } from "@/runtime/engine/geometry";
import {
	type BoundTextPlacement,
	type LabelledElement,
	isLinear,
	num,
} from "@/runtime/engine/lib/labels-model";

/** Excalidraw 0.18.1's inset between a container and its bound text box. */
const BOUND_TEXT_PADDING = 5;

/**
 * A point of an arrow's path, in scene coordinates.
 * @param container The arrow.
 * @param origin The arrow's own top-left.
 * @param i Which point.
 * @returns The point, or undefined when it has no finite coordinates.
 */
function pathPointAt(
	container: LabelledElement,
	origin: BoundTextPlacement,
	i: number,
): BoundTextPlacement | undefined {
	const point = container.points?.[i];
	const px = num(point?.[0]);
	const py = num(point?.[1]);
	return px === undefined || py === undefined ? undefined : { x: origin.x + px, y: origin.y + py };
}

/**
 * The midpoint of an arrow's path, following Excalidraw: the middle vertex of
 * an odd-length path, the midpoint of the middle segment of an even one, so a
 * two-point arrow labels itself halfway along.
 * @param container The arrow.
 * @param origin The arrow's own top-left.
 * @returns The midpoint, or undefined when the path is too short or unreadable.
 */
function pathMidpoint(
	container: LabelledElement,
	origin: BoundTextPlacement,
): BoundTextPlacement | undefined {
	const points = container.points;
	if (!Array.isArray(points) || points.length < 2) {
		return undefined;
	}
	if (points.length % 2 === 1) {
		return pathPointAt(container, origin, (points.length - 1) / 2);
	}
	const a = pathPointAt(container, origin, points.length / 2 - 1);
	const b = pathPointAt(container, origin, points.length / 2);
	return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : undefined;
}

/**
 * The point a container hangs its label from: the centre of a shape, the
 * midpoint of an arrow.
 *
 * An arrow measures itself from its own `points` rather than from the stored
 * width and height, because those are the bounding box of a path the server
 * re-routes without re-measuring — stale on exactly the arrows this matters
 * for.
 * @param container The container.
 * @returns The anchor, or undefined when the container has no readable geometry.
 */
function labelAnchorOf(container: LabelledElement): BoundTextPlacement | undefined {
	const origin = originOf(container);
	if (!origin) {
		return undefined;
	}
	if (isLinear(container)) {
		return pathMidpoint(container, origin);
	}
	return {
		x: origin.x + (num(container.width) ?? 0) / 2,
		y: origin.y + (num(container.height) ?? 0) / 2,
	};
}

/**
 * How far from its anchor a label may honestly sit, and still be that label.
 *
 * Half the container's own diagonal: enough for a top-aligned or left-aligned
 * label, which Excalidraw parks against an edge rather than in the middle, and
 * nowhere near enough for a label the board has forgotten about. Plus a few
 * pixels so bound-text padding and rounding are never the thing that fails a
 * board.
 * @param container The container.
 * @returns The distance in px.
 */
function anchorSlack(container: LabelledElement): number {
	const SLACK = 8;
	// An arrow measures itself from its own path, for the reason labelAnchorOf
	// gives: its stored width and height are the box of a route the server
	// re-draws without re-measuring.
	const size = isLinear(container) ? measureLinear(container.points) : container;
	return halfDiagonal(size) + SLACK;
}

/**
 * Half the diagonal of something with a size, treating a missing or
 * unreadable extent as zero.
 * @param size Anything carrying a width and height.
 * @returns The half-diagonal in px.
 */
function halfDiagonal(size: { width?: unknown; height?: unknown } | undefined): number {
	return Math.hypot(num(size?.width) ?? 0, num(size?.height) ?? 0) / 2;
}

/** The padded box inside a container that its label is laid out in. */
interface InnerBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * The inner box of a shape: its padded bounds, narrowed for an ellipse or a
 * diamond so the label fits inside their edges rather than their bounding box.
 * @param container The shape.
 * @param x The shape's left.
 * @param y The shape's top.
 * @returns The box the label is aligned within.
 */
function innerBoxOf(container: LabelledElement, x: number, y: number): InnerBox {
	const width = num(container.width) ?? 0;
	const height = num(container.height) ?? 0;
	if (container.type === "ellipse") {
		return {
			x: x + BOUND_TEXT_PADDING + (width / 2) * (1 - Math.SQRT1_2),
			y: y + BOUND_TEXT_PADDING + (height / 2) * (1 - Math.SQRT1_2),
			width: Math.round((width / 2) * Math.SQRT2) - BOUND_TEXT_PADDING * 2,
			height: Math.round((height / 2) * Math.SQRT2) - BOUND_TEXT_PADDING * 2,
		};
	}
	if (container.type === "diamond") {
		return {
			x: x + BOUND_TEXT_PADDING + width / 4,
			y: y + BOUND_TEXT_PADDING + height / 4,
			width: Math.round(width / 2) - BOUND_TEXT_PADDING * 2,
			height: Math.round(height / 2) - BOUND_TEXT_PADDING * 2,
		};
	}
	return {
		x: x + BOUND_TEXT_PADDING,
		y: y + BOUND_TEXT_PADDING,
		width: width - BOUND_TEXT_PADDING * 2,
		height: height - BOUND_TEXT_PADDING * 2,
	};
}

/**
 * Where one axis of the label sits inside the inner box.
 * @param start The box's edge.
 * @param usable The box's extent along the axis.
 * @param size The label's extent along the axis.
 * @param alignment Which end the label is aligned to, if either.
 * @returns The label's coordinate on that axis.
 */
function alignedAt(
	start: number,
	usable: number,
	size: number,
	alignment: "start" | "end" | "centre",
): number {
	if (alignment === "start") {
		return start;
	}
	if (alignment === "end") {
		return start + usable - size;
	}
	return start + (usable - size) / 2;
}

/**
 * Where this container's label belongs under Excalidraw's placement rules.
 * Linear labels sit on the path midpoint. Other containers place the label
 * within their padded inner box according to its horizontal and vertical
 * alignment.
 *
 * Undefined when the answer is not knowable — a container with no coordinates,
 * an arrow with no path, a text with no measurements — because moving a label
 * to a guess is worse than leaving it where it is.
 * @param container The container.
 * @param text The label.
 * @returns The label's top-left, or undefined.
 */
function boundTextPlacement(
	container: LabelledElement,
	text: LabelledElement,
): BoundTextPlacement | undefined {
	const anchor = labelAnchorOf(container);
	const size = measuredSize(text);
	if (!anchor || !size) {
		return undefined;
	}
	if (isLinear(container)) {
		return { x: anchor.x - size.width / 2, y: anchor.y - size.height / 2 };
	}
	const origin = originOf(container);
	if (!origin) {
		return undefined;
	}
	const box = innerBoxOf(container, origin.x, origin.y);
	return {
		x: alignedAt(box.x, box.width, size.width, horizontalAlignment(text)),
		y: alignedAt(box.y, box.height, size.height, verticalAlignment(text)),
	};
}

/**
 * A label's own size, when it has been measured.
 * @param text The label.
 * @returns The size, or undefined when either extent is unreadable.
 */
function measuredSize(text: LabelledElement): { width: number; height: number } | undefined {
	const width = num(text.width);
	const height = num(text.height);
	return width === undefined || height === undefined ? undefined : { width, height };
}

/**
 * A container's top-left, when it has one.
 * @param container The container.
 * @returns The point, or undefined when either coordinate is unreadable.
 */
function originOf(container: LabelledElement): BoundTextPlacement | undefined {
	const x = num(container.x);
	const y = num(container.y);
	return x === undefined || y === undefined ? undefined : { x, y };
}

/**
 * Which end of the inner box a label's `textAlign` puts it against.
 * @param text The label.
 * @returns The alignment.
 */
function horizontalAlignment(text: LabelledElement): "start" | "end" | "centre" {
	if (text.textAlign === "left") {
		return "start";
	}
	return text.textAlign === "right" ? "end" : "centre";
}

/**
 * Which end of the inner box a label's `verticalAlign` puts it against.
 * @param text The label.
 * @returns The alignment.
 */
function verticalAlignment(text: LabelledElement): "start" | "end" | "centre" {
	if (text.verticalAlign === "top") {
		return "start";
	}
	return text.verticalAlign === "bottom" ? "end" : "centre";
}

export { anchorSlack, boundTextPlacement, labelAnchorOf };

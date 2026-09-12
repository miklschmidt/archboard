// Points, boxes and the one place a coordinate is rounded.
//
// Forked from PR Lens's `geometry.ts` and `bounds.ts`, unchanged in behaviour.

/** A position in the diagram's own units. */
interface Point {
	/** Distance from the left edge. */
	readonly x: number;
	/** Distance from the top edge. */
	readonly y: number;
}

/** A rectangle in the diagram's own units. */
interface Box {
	/** The left edge. */
	readonly x: number;
	/** The top edge. */
	readonly y: number;
	/** How wide. */
	readonly width: number;
	/** How tall. */
	readonly height: number;
}

/** Which face of a box a line meets. */
type Side = "top" | "right" | "bottom" | "left";

/**
 * Every coordinate the renderer writes goes through here. Floating point
 * arithmetic that differs in the last bit would otherwise change the bytes of
 * the document without changing the picture, and two renders of one board
 * would stop being the same file.
 * @param value The raw coordinate.
 * @returns The coordinate to two decimal places, with negative zero flattened.
 */
function roundCoord(value: number): number {
	const rounded = Math.round(value * 100) / 100;
	return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * A coordinate as it is written into the document.
 * @param value The raw coordinate.
 * @returns Its rounded decimal spelling.
 */
function coord(value: number): string {
	return String(roundCoord(value));
}

/**
 * The middle of a box.
 * @param box The box.
 * @returns Its centre.
 */
function boxCentre(box: Box): Point {
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * The smallest box containing both of them.
 * @param a One box.
 * @param b The other.
 * @returns The box covering both.
 */
function covering(a: Box, b: Box): Box {
	const left = Math.min(a.x, b.x);
	const top = Math.min(a.y, b.y);
	const right = Math.max(a.x + a.width, b.x + b.width);
	const bottom = Math.max(a.y + a.height, b.y + b.height);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * A box grown by the same amount on every side.
 * @param box The box.
 * @param by How much to grow it by on each side.
 * @returns The grown box.
 */
function inflate(box: Box, by: number): Box {
	return {
		x: box.x - by,
		y: box.y - by,
		width: box.width + by * 2,
		height: box.height + by * 2,
	};
}

/**
 * The smallest box containing all of them, or nothing when there are none.
 * @param boxes The boxes.
 * @returns The covering box, or undefined for an empty list.
 */
function union(boxes: readonly Box[]): Box | undefined {
	let grown: Box | undefined;
	for (const box of boxes) {
		grown = grown === undefined ? box : covering(grown, box);
	}
	return grown;
}

/** How big something is, with no opinion about where it is. */
interface Size {
	/** How wide. */
	readonly width: number;
	/** How tall. */
	readonly height: number;
}

/** The page a picture is drawn on, and how far its content had to move onto it. */
interface Canvas {
	/** The page width. */
	readonly width: number;
	/** The page height. */
	readonly height: number;
	/** How far everything drawn moved right to clear the left edge. */
	readonly shiftX: number;
	/** How far everything drawn moved down to clear the top edge. */
	readonly shiftY: number;
}

/**
 * A canvas big enough for everything that was drawn.
 *
 * Edge routes deliberately leave their region, and a label pill can be pushed
 * past the last card in search of clear air, so the space the regions occupy
 * is a floor rather than the answer. The canvas only ever grows: the margins
 * the design leaves above and beside the regions are part of the design, not
 * slack to be reclaimed.
 * @param laid The size the region grid asked for.
 * @param drawn The box covering everything actually drawn, when anything was.
 * @param margin The air to keep around the drawing.
 * @returns The page, and the shift the drawing needs.
 */
function canvasFor(laid: Size, drawn: Box | undefined, margin: number): Canvas {
	if (drawn === undefined) {
		return { width: laid.width, height: laid.height, shiftX: 0, shiftY: 0 };
	}
	const shiftX = Math.max(0, margin - drawn.x);
	const shiftY = Math.max(0, margin - drawn.y);
	return {
		width: Math.ceil(Math.max(laid.width, drawn.x + drawn.width + margin) + shiftX),
		height: Math.ceil(Math.max(laid.height, drawn.y + drawn.height + margin) + shiftY),
		shiftX,
		shiftY,
	};
}

export {
	type Point,
	type Box,
	type Size,
	type Side,
	type Canvas,
	roundCoord,
	coord,
	boxCentre,
	covering,
	inflate,
	union,
	canvasFor,
};

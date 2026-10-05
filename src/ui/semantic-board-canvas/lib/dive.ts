// Where a board sits inside the card that opens it, and where the camera has to
// be to see it there.
//
// A card that opens a board is a window onto it. Put the board's picture inside
// the card, small enough to fit, in the parent's own coordinates, and the
// camera that flies into the card is flying into the board: at the end of the
// flight the picture inside the card stands exactly where the board stands when
// it is opened at its own fit, so nothing has to be matched by eye. Going back
// out is the same flight run the other way. Pure, like the rest of the camera.

import type { SemanticDrawing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import {
	cameraFor,
	type Camera,
	type Rect,
	type Size,
} from "@/ui/semantic-board-canvas/lib/camera";
import { subjectBox } from "@/ui/semantic-board-canvas/lib/subjects";

/** What a flight needs to know of a picture: where its cards are, and how big it is. */
type Seen = Pick<SemanticDrawing, "atlas" | "width" | "height">;

/** One flight between a board and the card that opens it, in the parent's picture units. */
interface Leg {
	/** Where the board's picture sits inside the card. */
	readonly inset: Rect;
	/** The camera over the parent the flight begins at, or null to begin where the camera is. */
	readonly from: Camera | null;
	/** The camera over the parent the flight ends at. */
	readonly to: Camera;
	/** The camera the board itself is seen through at its end of the flight: its own fit, or where it was left. */
	readonly through: Camera;
}

/** How much of the card the board's picture fills, so the card's frame still shows round it. */
const INSET_SHARE = 0.86;

/**
 * Where a board's picture sits inside the card that opens it: centred, as large
 * as the card allows, in the parent's picture units.
 * @param card The card's box in the parent's picture.
 * @param child How big the board's picture is.
 * @returns The inset.
 */
function insetOf(card: Rect, child: Size): Rect {
	const scale = Math.min(
		(card.width * INSET_SHARE) / child.width,
		(card.height * INSET_SHARE) / child.height,
	);
	const width = child.width * scale;
	const height = child.height * scale;
	return {
		x: card.x + (card.width - width) / 2,
		y: card.y + (card.height - height) / 2,
		width,
		height,
	};
}

/**
 * The camera over the parent's picture at which the inset stands exactly where
 * the board stands when it is seen through another camera.
 * @param inset Where the board's picture sits in the parent's picture.
 * @param child How big the board's picture is.
 * @param seenThrough The camera the board itself is seen through.
 * @returns The camera over the parent.
 */
function cameraAtInset(inset: Rect, child: Size, seenThrough: Camera): Camera {
	const scale = (seenThrough.scale * child.width) / inset.width;
	// The middle of the board on screen, and the middle of the inset over the parent: made one.
	const middleX = seenThrough.x + (seenThrough.scale * child.width) / 2;
	const middleY = seenThrough.y + (seenThrough.scale * child.height) / 2;
	return {
		scale,
		x: middleX - scale * (inset.x + inset.width / 2),
		y: middleY - scale * (inset.y + inset.height / 2),
	};
}

/**
 * How big a picture is.
 * @param picture The picture.
 * @returns Its size.
 */
function sizeOf(picture: Seen): Size {
	return { width: picture.width, height: picture.height };
}

/**
 * The flight into the board a card opens: from wherever the camera is, to the
 * camera at which the board inside the card stands where the board stands once
 * it is opened and fitted.
 * @param parent The picture the card is in.
 * @param card The card's id.
 * @param child The picture of the board it opens.
 * @param room How big the pane's window on the diagram is.
 * @returns The flight, or null when the card is not drawn or there is no room.
 */
function legInto(parent: Seen, card: string, child: Seen, room: Size): Leg | null {
	const box = subjectBox(parent.atlas, card);
	const fit = cameraFor(room, { kind: "whole", content: sizeOf(child) });
	if (box === null || fit === null) {
		return null;
	}
	const inset = insetOf(box, sizeOf(child));
	return { inset, from: null, to: cameraAtInset(inset, sizeOf(child), fit), through: fit };
}

/**
 * The flight back out of a board into the card that opened it: from the camera
 * at which the board inside the card stands where it was seen, to the whole
 * parent.
 * @param parent The picture the card is in.
 * @param card The card's id.
 * @param child The picture of the board that is being left.
 * @param room How big the pane's window on the diagram is.
 * @param seen The camera the board is seen through now.
 * @returns The flight, or null when the card is not drawn or there is no room.
 */
function legOut(parent: Seen, card: string, child: Seen, room: Size, seen: Camera): Leg | null {
	const box = subjectBox(parent.atlas, card);
	const fit = cameraFor(room, { kind: "whole", content: sizeOf(parent) });
	if (box === null || fit === null) {
		return null;
	}
	const inset = insetOf(box, sizeOf(child));
	return { inset, from: cameraAtInset(inset, sizeOf(child), seen), to: fit, through: seen };
}

/**
 * Whether the camera has come to the end of a flight, give or take a pixel and
 * a thousandth of the zoom. Something else may have moved it on the way.
 * @param camera Where the camera is.
 * @param end Where the flight was going.
 * @returns True when it is there.
 */
function reached(camera: Camera, end: Camera): boolean {
	return (
		Math.abs(camera.x - end.x) < 1 &&
		Math.abs(camera.y - end.y) < 1 &&
		Math.abs(camera.scale / end.scale - 1) < 0.001
	);
}

export { cameraAtInset, insetOf, legInto, legOut, reached, type Leg };

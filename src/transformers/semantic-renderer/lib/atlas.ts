// Where everything a render drew ended up, in the viewBox units of the file
// beside it.
//
// Forked from PR Lens's `atlas.ts`. The flow-step record went with the
// data-flow grammar; lanes became regions.
//
// A pane that wants to put a rim around a node, scroll to an edge, or tell
// which subject a click landed on needs geometry, and only the renderer knows
// where anything landed — it knows it while it is drawing. So the geometry
// travels with the picture rather than being measured back out of it by
// something that would have to guess.

import type { DiagramBox } from "@/shared/semantic-board/index";
import {
	covering,
	roundCoord,
	type Box,
	type Canvas,
} from "@/transformers/semantic-renderer/lib/geometry";

// The box and the atlas are the shared render contract's
// (`@/shared/semantic-board`), not this module's. Three areas of the
// repository read an atlas — the canvas that serves it, the command that writes
// it beside a file, and the pane that hit-tests against it — so the shape is
// written down once, where all three can reach it.

/** One subject, and where it was drawn. */
interface AtlasEntry {
	/** The subject's semantic id. */
	readonly id: string;
	/** Where it was drawn, before the canvas shift. */
	readonly box: Box;
}

/**
 * Boxes onto the canvas and into a record, in the order they were drawn.
 *
 * Each coordinate is rounded on its own, exactly as the one written into the
 * file beside it is, so a box here and the rectangle it stands for cannot
 * disagree in the last place. An id drawn more than once keeps the box covering
 * every drawing of it, because a reader sent to that subject is being sent to
 * all of them.
 * @param entries What was drawn.
 * @param canvas The page, for its shift.
 * @returns Each id's box, in the file's own units.
 */
function atlasBoxes(entries: readonly AtlasEntry[], canvas: Canvas): Record<string, DiagramBox> {
	const grown = new Map<string, Box>();
	for (const { id, box } of entries) {
		const current = grown.get(id);
		grown.set(id, current === undefined ? box : covering(current, box));
	}

	const boxes: Record<string, DiagramBox> = {};
	for (const [id, box] of grown) {
		boxes[id] = {
			x: roundCoord(box.x + canvas.shiftX),
			y: roundCoord(box.y + canvas.shiftY),
			width: roundCoord(box.width),
			height: roundCoord(box.height),
		};
	}
	return boxes;
}

export { type AtlasEntry, atlasBoxes };

// The page of a board nothing is built of.
//
// Whether an architecture exists is a fact about the board, never about one of
// its parts (ADR 0031): a board with no current variant describes something
// nobody has built. Every channel on a card or a line is already taken
// (ADR 0025), so the picture says it once, for the whole page: a dashed frame
// around the drawing, labelled. It is drawn into the document rather than laid
// over it by a viewer, so a file somebody exports says it too.

import type { DiagramAtlas, DiagramBox } from "@/shared/semantic-board/index";
import { PLANNED_FRAME_INSET, PLANNED_FRAME_MARGIN } from "@/transformers/semantic-renderer/config";
import { fontAttributes, PILL_FONT } from "@/transformers/semantic-renderer/lib/fonts";
import { roundCoord } from "@/transformers/semantic-renderer/lib/geometry";
import { measure } from "@/transformers/semantic-renderer/lib/text";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { lines, tag, textNode, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";

/** What the frame says. */
const PLANNED_LABEL = "Planned — nothing on this board is built";
/** The label's size; it sits on the frame's top edge. */
const LABEL_SIZE = 12;
/** Room the label's line takes above the frame's top edge. */
const LABEL_RISE = LABEL_SIZE / 2 + 2;
/** Where the label starts along the top edge, from the frame's corner. */
const LABEL_INDENT = 16;
/** Ground left clear either side of the label, so the dashes stop short of it. */
const LABEL_CLEARANCE = 6;

/** A painted page: its body, its size and where each subject landed on it. */
interface PaintedPage {
	readonly body: string;
	readonly width: number;
	readonly height: number;
	readonly atlas: DiagramAtlas;
}

/**
 * One atlas box, moved with the body.
 * @param box Where the subject was drawn.
 * @param dx How far the body moved right.
 * @param dy How far the body moved down.
 * @returns Where it is now.
 */
function moved(box: DiagramBox, dx: number, dy: number): DiagramBox {
	return { ...box, x: roundCoord(box.x + dx), y: roundCoord(box.y + dy) };
}

/**
 * Every box of one kind, moved with the body.
 * @param boxes The boxes by subject id.
 * @param dx How far the body moved right.
 * @param dy How far the body moved down.
 * @returns The moved boxes.
 */
function movedAll(
	boxes: Readonly<Record<string, DiagramBox>>,
	dx: number,
	dy: number,
): Record<string, DiagramBox> {
	return Object.fromEntries(Object.entries(boxes).map(([id, box]) => [id, moved(box, dx, dy)]));
}

/**
 * A page framed as planned: the drawing moved in by the margin, a dashed frame
 * around it and the label on the frame's top edge. The page grows to hold the
 * frame and the label; nothing already drawn changes size.
 * @param page The painted page.
 * @param palette The theme's colours.
 * @returns The framed page, its atlas moved with its body.
 */
function framedAsPlanned(page: PaintedPage, palette: Palette): PaintedPage {
	const labelWidth = measure(PLANNED_LABEL, PILL_FONT, LABEL_SIZE);
	const dx = PLANNED_FRAME_MARGIN;
	const dy = PLANNED_FRAME_MARGIN + LABEL_RISE;
	const needed = labelWidth + 2 * (PLANNED_FRAME_INSET + LABEL_INDENT + LABEL_CLEARANCE);
	const width = Math.max(page.width + 2 * dx, needed);
	const height = page.height + dx + dy;
	const top = PLANNED_FRAME_INSET + LABEL_RISE;
	const labelX = PLANNED_FRAME_INSET + LABEL_INDENT;
	const frame = tag("rect", {
		x: PLANNED_FRAME_INSET,
		y: roundCoord(top),
		width: roundCoord(width - 2 * PLANNED_FRAME_INSET),
		height: roundCoord(height - top - PLANNED_FRAME_INSET),
		rx: 10,
		fill: "none",
		stroke: palette.muted,
		"stroke-opacity": 0.6,
		"stroke-width": 1.5,
		"stroke-dasharray": "6 4",
	});
	const clearing = tag("rect", {
		x: labelX - LABEL_CLEARANCE,
		y: roundCoord(top - LABEL_SIZE / 2 - 1),
		width: roundCoord(labelWidth + 2 * LABEL_CLEARANCE),
		height: LABEL_SIZE + 2,
		fill: palette.background,
	});
	const label = textNode(
		{
			x: labelX,
			y: roundCoord(top),
			"dominant-baseline": "central",
			"font-size": LABEL_SIZE,
			fill: palette.muted,
			...fontAttributes(PILL_FONT),
		},
		PLANNED_LABEL,
	);
	return {
		body: lines([
			wrap("g", { "data-slot": "planned-frame" }, lines([frame, clearing, label])),
			wrap("g", { transform: `translate(${dx} ${roundCoord(dy)})` }, page.body),
		]),
		width,
		height,
		atlas: {
			nodes: movedAll(page.atlas.nodes, dx, dy),
			edges: movedAll(page.atlas.edges, dx, dy),
			regions: movedAll(page.atlas.regions, dx, dy),
		},
	};
}

export { framedAsPlanned, PLANNED_LABEL, type PaintedPage };

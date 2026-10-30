// Keeping a flow's head of participant cards in view while its rows are read.
//
// A participant is its card and the whole column of time under it, so a step
// that lit a flow's messages and the participants at their ends framed the
// flow from its head to its foot, and on a tall flow the rows came out too
// small to read. So a step about some of a flow's rows frames those rows, and
// the one before them, from the top of the room ({@link flowFocus}), and the
// flow's head stays in view above whatever rows the camera shows
// ({@link headDrop}): it slides down its lifelines to stand at the top of the
// room, never further down than its last row, the way a table keeps its column
// names in view as it scrolls. The picture draws the frame's own ground behind
// a moved head, so the rows it passes over are hidden under it.
//
// Every number comes from the atlas the server returned with the picture: the
// flow's frame, its columns and its rows. Nothing here reads the picture.

import type { SemanticVariant } from "@archboard/board/document";
import { FIT_MARGIN } from "@archboard/renderer/shell-geometry";
import type { SemanticAtlas } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import {
	unionRect,
	type Camera,
	type Rect,
} from "#ui/rules/semantic-board-canvas/camera/camera.ts";

/** Where one flow's head and rows are, as the picture drew them. */
interface FlowRows {
	/** The flow. */
	readonly flow: string;
	/** The flow's frame. */
	readonly frame: Rect;
	/** The top of its head of cards. */
	readonly headTop: number;
	/** The top of each of its rows, from the first down. */
	readonly rowTops: readonly number[];
}

/** Where to look during a step about some of a flow's rows. */
interface FlowFocus {
	/** The head, moved over the rows, and the rows, across the columns the step lights. */
	readonly rect: Rect;
	/** The same across the whole flow, which the camera shows when it reads nearly as large. */
	readonly context: Rect;
}

/**
 * Whether one box lies wholly inside another.
 * @param inner The box that should be inside.
 * @param outer The box that should hold it.
 * @returns True when it does.
 */
function within(inner: Rect, outer: Rect): boolean {
	return (
		outer.x <= inner.x &&
		outer.y <= inner.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

/**
 * Where one flow's head and rows are.
 * @param atlas Where the picture drew each subject.
 * @param flow The flow.
 * @returns Its head and rows, or null when the picture draws no frame, card or row of it.
 */
function flowRows(atlas: SemanticAtlas, flow: string): FlowRows | null {
	const frame = atlas.regions[flow];
	if (frame === undefined) {
		return null;
	}
	/**
	 * The tops of the boxes the frame holds, from the highest down.
	 * @param boxes The boxes.
	 * @returns Their tops.
	 */
	const tops = (boxes: Record<string, Rect>): number[] =>
		Object.values(boxes)
			.filter((box) => within(box, frame))
			.map((box) => box.y)
			.toSorted((one, other) => one - other);
	const [headTop] = tops(atlas.nodes);
	const rowTops = tops(atlas.edges);
	return headTop === undefined || rowTops.length === 0 ? null : { flow, frame, headTop, rowTops };
}

/**
 * How far a flow's head moves down to stay in view: to the top of the room
 * the camera shows, and never further than its last row.
 * @param rows The flow's head and rows.
 * @param camera Where the pane is looking.
 * @returns The distance, in the drawing's own units.
 */
function headDrop(rows: FlowRows, camera: Camera): number {
	const top = (FIT_MARGIN - camera.y) / camera.scale;
	const reach = rows.rowTops.at(-1)! - rows.rowTops[0]!;
	return Math.min(Math.max(0, top - rows.headTop), reach);
}

/**
 * The flow whose frame holds a box, as the picture drew it.
 * @param variant The variant being read, or null when none can be.
 * @param atlas Where the picture drew each subject.
 * @param box The box.
 * @returns The flow's head and rows, or undefined when no one flow holds the box.
 */
function flowHolding(
	variant: Pick<SemanticVariant, "content"> | null,
	atlas: SemanticAtlas,
	box: Rect,
): FlowRows | undefined {
	for (const { id } of variant?.content.flows ?? []) {
		const rows = flowRows(atlas, id);
		if (rows !== null && within(box, rows.frame)) {
			return rows;
		}
	}
	return undefined;
}

/**
 * Where to look during a step that lights some of a flow's messages: their
 * rows and the one row before them, with the head above where
 * {@link headDrop} will put it, as far above that row as the drawing sets it
 * above its own first row. The rows further up are not shown, however short
 * the flow: a step is about its rows, and every row above them is room they
 * could have been read in. The one before them stays, faded, because it is
 * usually why they happen: the call a reply answers, the step a check follows.
 * @param variant The variant being read, or null when none can be.
 * @param atlas Where the picture drew each subject.
 * @param lit The subjects the step lights: the ones it names and their ends.
 * @returns The focus, or null when the step lights no message of one flow.
 */
function flowFocus(
	variant: Pick<SemanticVariant, "content"> | null,
	atlas: SemanticAtlas,
	lit: readonly string[],
): FlowFocus | null {
	const rows = unionRect(lit.flatMap((id) => atlas.edges[id] ?? []));
	const flow = rows === null ? undefined : flowHolding(variant, atlas, rows);
	if (rows === null || flow === undefined) {
		return null;
	}
	const lead = flow.rowTops.findLast((one) => one < rows.y) ?? rows.y;
	const top = flow.headTop + (lead - flow.rowTops[0]!);
	const bottom = rows.y + rows.height;
	const columns = lit
		.flatMap((id) => atlas.nodes[id] ?? [])
		.filter((box) => within(box, flow.frame));
	const across = unionRect([rows, ...columns])!;
	return {
		rect: { x: across.x, width: across.width, y: top, height: bottom - top },
		context: { x: flow.frame.x, width: flow.frame.width, y: top, height: bottom - top },
	};
}

export { flowFocus, flowRows, headDrop };

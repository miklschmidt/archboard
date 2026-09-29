// Keeping a flow's head of participant cards in view while its rows are read.
//
// A participant is its card and the whole column of time under it, so a step
// that lit a flow's messages and the participants at their ends framed the
// flow from its head to its foot, and on a tall flow the rows came out too
// small to read. So a step about some of a flow's rows frames those rows from
// the top of the room ({@link flowFocus}), and the flow's head stays in view
// above whatever rows the camera shows ({@link headDrop}): it slides down its
// lifelines to stand at the top of the room, never further down than its last
// row, the way a table keeps its column names in view as it scrolls. The
// picture draws the frame's own ground behind a moved head, so the rows it
// passes over are hidden under it.
//
// Every number comes from the atlas the server returned with the picture: the
// flow's frame, its columns and its rows. Nothing here reads the picture.

import type { SemanticVariant } from "@/shared/semantic-board/index";
import { FIT_MARGIN } from "@/shared/shell-geometry/index";
import type { SemanticAtlas } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { unionRect, type Camera, type Rect } from "@/ui/semantic-board-canvas/lib/camera";

/** Where one flow's head and rows are, as the picture drew them. */
interface FlowRows {
	/** The flow. */
	readonly flow: string;
	/** The flow's frame. */
	readonly frame: Rect;
	/** The top of its head of cards. */
	readonly headTop: number;
	/** The top of its first row. */
	readonly firstRow: number;
	/** The top of its last row. */
	readonly lastRow: number;
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
 * The smallest and largest of a list of numbers, folded rather than spread: a
 * flow may hold any number of rows.
 * @param values The numbers.
 * @returns Both, or undefined for none.
 */
function extent(values: readonly number[]): { least: number; most: number } | undefined {
	let found: { least: number; most: number } | undefined;
	for (const value of values) {
		found = {
			least: Math.min(found?.least ?? value, value),
			most: Math.max(found?.most ?? value, value),
		};
	}
	return found;
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
	const head = extent(
		Object.values(atlas.nodes)
			.filter((box) => within(box, frame))
			.map((box) => box.y),
	);
	const rows = extent(
		Object.values(atlas.edges)
			.filter((box) => within(box, frame))
			.map((box) => box.y),
	);
	if (head === undefined || rows === undefined) {
		return null;
	}
	return { flow, frame, headTop: head.least, firstRow: rows.least, lastRow: rows.most };
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
	return Math.min(Math.max(0, top - rows.headTop), rows.lastRow - rows.firstRow);
}

/**
 * Where to look during a step that lights some of a flow's messages: their
 * rows, with the head above them where {@link headDrop} will put it, as far
 * above the first of them as the drawing sets it above its own first row. The
 * rows before them are not shown, however short the flow: a step is about its
 * rows, and every row above them is room they could have been read in.
 * @param variant The variant being read, or null when none can be.
 * @param atlas Where the picture drew each subject.
 * @param lit The subjects the step lights: the ones it names and their ends.
 * @returns The focus, or null when the step lights no message of one flow.
 */
function flowFocus(
	variant: SemanticVariant | null,
	atlas: SemanticAtlas,
	lit: readonly string[],
): FlowFocus | null {
	const rows = unionRect(lit.flatMap((id) => atlas.edges[id] ?? []));
	const flow = (variant?.content.flows ?? [])
		.map(({ id }) => flowRows(atlas, id))
		.find((one) => one !== null && rows !== null && within(rows, one.frame));
	if (rows === null || flow === null || flow === undefined) {
		return null;
	}
	const top = flow.headTop + (rows.y - flow.firstRow);
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

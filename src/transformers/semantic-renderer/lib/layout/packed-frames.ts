// A frame whose children are all unconnected cards is placed as one fixed
// collection: a grid of equal cells under its title. Its column count once
// ignored the title, so four cards under a tall title stood in one column a
// third of the page high, and the grid kept to the frame's left wall when the
// title made the frame wider than the grid.
import type { ElkNode } from "@archboard/elk-rs";
import { REFERENCE_PANE, type Size } from "@/shared/shell-geometry/index";
import { CARD_GAP, CONTAINER_INSET } from "@/transformers/semantic-renderer/config";
import { semanticOrder } from "@/transformers/semantic-renderer/lib/layout/semantic-order";

/** A packed child and its offset from its frame's origin. */
type Offset = { node: ElkNode; x: number; y: number };

/**
 * Read the measured dimensions, requiring no estimates for missing text.
 * @param node The measured shape.
 * @returns Its dimensions.
 */
function dimensions(node: Pick<ElkNode, "width" | "height">): Size {
	if (node.width === undefined || node.height === undefined)
		throw new Error("Layout requires measured shape dimensions");
	return { width: node.width, height: node.height };
}

/**
 * Pack disconnected children as a fixed measured collection before outer
 * placement: a grid whose frame, title and insets included, comes closest to
 * the reference pane's shape, centred in a frame its title made wider.
 * @param node The frame to pack.
 * @returns Child offsets from the resulting frame's origin.
 */
function pack(node: ElkNode): Offset[] {
	const size = Number(node.layoutOptions?.["archboard.header.size"] ?? 0);
	const children = node.children!.toSorted(
		(one, other) => semanticOrder(one) - semanticOrder(other),
	);
	const sizes = children.map(dimensions);
	const cell = {
		width: Math.max(...sizes.map((child) => child.width)),
		height: Math.max(...sizes.map((child) => child.height)),
	};
	const minimum = dimensions(node);
	const aspect = REFERENCE_PANE.width / REFERENCE_PANE.height;
	const grids = children.map((_, index) => gridOf(index + 1, children.length, cell));
	const grid = grids.reduce((best, next) =>
		shapeMiss(frameOf(next, size, minimum), aspect) <
		shapeMiss(frameOf(best, size, minimum), aspect)
			? next
			: best,
	);
	Object.assign(node, frameOf(grid, size, minimum));
	const x = Math.max(CONTAINER_INSET, (node.width! - grid.width) / 2);
	const y = size + CONTAINER_INSET;
	return children.map((child, index) => ({
		node: child,
		x: x + (index % grid.columns) * (cell.width + CARD_GAP),
		y: y + Math.floor(index / grid.columns) * (cell.height + CARD_GAP),
	}));
}

/** A packed grid: its column count and the size its cells span. */
interface Grid {
	readonly columns: number;
	readonly width: number;
	readonly height: number;
}

/**
 * The grid of a number of equal cells in a number of columns.
 * @param columns The columns.
 * @param count The cells.
 * @param cell One cell's size.
 * @returns The grid.
 */
function gridOf(columns: number, count: number, cell: Size): Grid {
	const rows = Math.ceil(count / columns);
	return {
		columns,
		width: columns * cell.width + (columns - 1) * CARD_GAP,
		height: rows * cell.height + (rows - 1) * CARD_GAP,
	};
}

/**
 * The frame that holds a grid under its title.
 * @param grid The grid.
 * @param size The title's height.
 * @param minimum The frame's measured minimum size.
 * @returns The frame's size.
 */
function frameOf(grid: Grid, size: number, minimum: Size): Size {
	return {
		width: Math.max(minimum.width, 2 * CONTAINER_INSET + grid.width),
		height: Math.max(minimum.height, size + 2 * CONTAINER_INSET + grid.height),
	};
}

/**
 * How far a frame's shape misses the pane's, as a ratio either way.
 * @param frame The frame's size.
 * @param aspect The pane's width over its height.
 * @returns The miss; zero for the pane's own shape.
 */
function shapeMiss(frame: Size, aspect: number): number {
	return Math.abs(Math.log(frame.width / frame.height / aspect));
}

export { dimensions, pack, type Offset };

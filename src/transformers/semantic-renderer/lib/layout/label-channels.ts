// Share a horizontal channel between relationship labels whose rows overlap.
// Candidate labels slide only within the space left by their endpoint cards
// and the obstacle-clear interval found by the caller. Fixed labels pin their
// existing centers. A bounded isotonic projection gives the nearest ordered
// arrangement with the required gap; an impossible row keeps its old boxes.

import {
	LABEL_LABEL_CLEARANCE,
	ROUTE_NUDGE_DISTANCE,
} from "@/transformers/semantic-renderer/config";
import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";

interface ChannelLabel {
	readonly id: string;
	readonly box: Box;
	readonly moving: boolean;
	readonly center: number;
	readonly low: number;
	readonly high: number;
}

interface LabelRow {
	bottom: number;
	items: ChannelLabel[];
}

interface BlockMember {
	readonly item: ChannelLabel;
	readonly offset: number;
}

interface ProjectionBlock {
	readonly items: readonly BlockMember[];
	readonly sum: number;
	readonly count: number;
	readonly low: number;
	readonly high: number;
	readonly value: number;
}

/** The data shared while determining which labels can slide in a channel. */
interface ChannelContext {
	readonly drawing: ArchitectureDrawing;
	readonly cards: ReadonlyMap<string, Box>;
	readonly movable: ReadonlySet<string>;
	readonly bounds: ReadonlyMap<string, readonly [number, number]>;
}

interface ChannelGeometry {
	readonly from: Box | undefined;
	readonly to: Box | undefined;
	readonly vertical: boolean;
}

/**
 * Find the endpoint cards and whether the route is one vertical segment.
 * @param context Drawing geometry and cards.
 * @param id The relationship identity.
 * @returns The geometry that permits channel movement.
 */
function geometryFor(context: ChannelContext, id: string): ChannelGeometry {
	const edge = context.drawing.edges.find((entry) => entry.edge.id === id);
	if (edge === undefined) return { from: undefined, to: undefined, vertical: false };
	return {
		from: context.cards.get(edge.edge.from),
		to: context.cards.get(edge.edge.to),
		vertical:
			edge.curve.segments.length === 1 && edge.curve.from.x === edge.curve.segments[0]?.to.x,
	};
}

/**
 * The leftmost center allowed by endpoint cards and obstacle clearance.
 * @param from The source card.
 * @param to The target card.
 * @param limits The obstacle-clear interval, if available.
 * @returns The lower center bound.
 */
function lowerCenter(from: Box, to: Box, limits: readonly [number, number] | undefined): number {
	return Math.max(Math.max(from.x, to.x) + ROUTE_NUDGE_DISTANCE, limits?.[0] ?? -Infinity);
}

/**
 * The rightmost center allowed by endpoint cards and obstacle clearance.
 * @param from The source card.
 * @param to The target card.
 * @param limits The obstacle-clear interval, if available.
 * @returns The upper center bound.
 */
function upperCenter(from: Box, to: Box, limits: readonly [number, number] | undefined): number {
	return Math.min(
		Math.min(from.x + from.width, to.x + to.width) - ROUTE_NUDGE_DISTANCE,
		limits?.[1] ?? Infinity,
	);
}

/**
 * Constrain one label's center by its endpoint cards and obstacle-clear channel.
 * @param context Drawing geometry and candidate bounds.
 * @param id The relationship identity.
 * @param box The current label box.
 * @returns The label and its permitted center interval.
 */
function channelLabel(context: ChannelContext, id: string, box: Box): ChannelLabel {
	const { from, to, vertical } = geometryFor(context, id);
	const moving = context.movable.has(id) && from !== undefined && to !== undefined && vertical;
	const center = box.x + box.width / 2;
	const limits = context.bounds.get(id);
	return {
		id,
		box,
		moving,
		center,
		low: moving ? lowerCenter(from, to, limits) : center,
		high: moving ? upperCenter(from, to, limits) : center,
	};
}

/**
 * Group labels whose vertical boxes touch after adding their clearance.
 * @param items All current label boxes.
 * @returns Rows ordered from top to bottom.
 */
function overlappingRows(items: readonly ChannelLabel[]): LabelRow[] {
	const rows: LabelRow[] = [];
	for (const item of items.toSorted((a, b) => a.box.y - b.box.y || a.center - b.center)) {
		const row = rows.at(-1);
		if (row !== undefined && item.box.y < row.bottom + LABEL_LABEL_CLEARANCE) {
			row.items.push(item);
			row.bottom = Math.max(row.bottom, item.box.y + item.box.height);
		} else {
			rows.push({ bottom: item.box.y + item.box.height, items: [item] });
		}
	}
	return rows;
}

/**
 * Clip an unconstrained projected center to its permitted interval.
 * @param value The unconstrained center.
 * @param low The interval's lower edge.
 * @param high The interval's upper edge.
 * @returns The clipped center.
 */
function clip(value: number, low: number, high: number): number {
	return Math.max(low, Math.min(high, value));
}

/**
 * Start a projection block for one label after accounting for preceding gaps.
 * @param item The label to add.
 * @param offset The accumulated center separation before this label.
 * @returns A one-label block.
 */
function initialBlock(item: ChannelLabel, offset: number): ProjectionBlock {
	const low = item.low - offset;
	const high = item.high - offset;
	const center = item.center - offset;
	return {
		items: [{ item, offset }],
		sum: center,
		count: 1,
		low,
		high,
		value: clip(center, low, high),
	};
}

/**
 * Pool adjacent blocks whose projected centers are out of order.
 * @param left The earlier block.
 * @param right The later block.
 * @returns Their common bounded projection.
 */
function mergedBlock(left: ProjectionBlock, right: ProjectionBlock): ProjectionBlock {
	const low = Math.max(left.low, right.low);
	const high = Math.min(left.high, right.high);
	const sum = left.sum + right.sum;
	const count = left.count + right.count;
	return {
		items: [...left.items, ...right.items],
		sum,
		count,
		low,
		high,
		value: clip(sum / count, low, high),
	};
}

/**
 * Add one label to the bounded isotonic projection of a row.
 * @param blocks The row's current pooled blocks.
 * @param item The next label from left to right.
 * @param offset Its required distance from the first center.
 */
function addBlock(blocks: ProjectionBlock[], item: ChannelLabel, offset: number): void {
	blocks.push(initialBlock(item, offset));
	while (blocks.length > 1 && blocks[blocks.length - 2]!.value > blocks[blocks.length - 1]!.value) {
		const right = blocks.pop()!;
		const left = blocks.pop()!;
		blocks.push(mergedBlock(left, right));
	}
}

/**
 * Project centers in their existing left-to-right order with room for every gap.
 * @param ordered The labels in center order.
 * @returns The pooled projection blocks.
 */
function projectRow(ordered: readonly ChannelLabel[]): ProjectionBlock[] {
	const blocks: ProjectionBlock[] = [];
	let offset = 0;
	let previous: ChannelLabel | undefined;
	for (const item of ordered) {
		if (previous !== undefined)
			offset += (previous.box.width + item.box.width) / 2 + LABEL_LABEL_CLEARANCE;
		addBlock(blocks, item, offset);
		previous = item;
	}
	return blocks;
}

/**
 * Restore every candidate in a row whose intervals cannot fit together.
 * @param ordered The row's labels.
 * @param labels Boxes to update.
 * @param movable Candidate identities to remove on failure.
 * @param originalLabels Boxes before channel packing.
 */
function restoreRow(
	ordered: readonly ChannelLabel[],
	labels: Map<string, Box>,
	movable: Set<string>,
	originalLabels: ReadonlyMap<string, Box>,
): void {
	for (const item of ordered) {
		if (!item.moving) continue;
		labels.set(item.id, originalLabels.get(item.id)!);
		movable.delete(item.id);
	}
}

/**
 * Commit a feasible row's projected centers to its candidate boxes.
 * @param blocks The row's feasible projection.
 * @param labels Boxes to update.
 */
function placeRow(blocks: readonly ProjectionBlock[], labels: Map<string, Box>): void {
	for (const block of blocks) {
		for (const { item, offset } of block.items) {
			if (item.moving)
				labels.set(item.id, { ...item.box, x: block.value + offset - item.box.width / 2 });
		}
	}
}

/**
 * Pack labels sharing a vertical row within their existing clear channels.
 * An infeasible row returns its candidates to their original boxes and removes
 * them from the candidate set. The caller validates the resulting whole set.
 * @param drawing The placed cards and routes.
 * @param labels Current label boxes, updated in place.
 * @param movable Candidate label identities, reduced on failure.
 * @param originalLabels Boxes to restore for an infeasible row.
 * @param bounds Obstacle-clear center bounds for each candidate.
 */
function packChannels(
	drawing: ArchitectureDrawing,
	labels: Map<string, Box>,
	movable: Set<string>,
	originalLabels: ReadonlyMap<string, Box>,
	bounds: ReadonlyMap<string, readonly [number, number]>,
): void {
	const cards = new Map(drawing.cards.map(({ measured, box }) => [measured.node.id, box]));
	const context: ChannelContext = { drawing, cards, movable, bounds };
	const items = [...labels].map(([id, box]) => channelLabel(context, id, box));
	for (const row of overlappingRows(items)) {
		const ordered = row.items.toSorted((a, b) => a.center - b.center || a.id.localeCompare(b.id));
		const blocks = projectRow(ordered);
		if (blocks.some((block) => block.low > block.high))
			restoreRow(ordered, labels, movable, originalLabels);
		else placeRow(blocks, labels);
	}
}

export { packChannels };

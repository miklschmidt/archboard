// Reserved labels moved onto the straight channel their two cards share.
// Graphviz fans the labels of one row out around their source, so a label can
// stand beside the span its cards share although a straight line between them
// was free. A route forced through it must then leave a card by its side and
// turn down (IIS Ingress Migration's "Today: DNS points here", Renderer
// layout's "the width of a painted line").
//
// Each row of labels in one frame slides, in its order and apart, so that a
// label whose cards are stacked with a clear channel between them stands on
// it. A row that would come near a card, a frame's title or another label
// stays where Graphviz put it; the page and every card stay as they are.
// Only the finishing pass that cures such side exits asks for it
// (finishing.ts): moved in every routing pass, labels would change which
// labels stay reserved, and so the placements.
import type { ElkExtendedEdge, ElkLabel, ElkNode } from "@archboard/elk-rs";
import {
	CONTAINER_INSET,
	LABEL_LABEL_CLEARANCE,
	ROUTE_NUDGE_DISTANCE,
} from "@/transformers/semantic-renderer/config";
import { boxesOverlap, boxOf } from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import {
	ANCHOR_CARD_CLEARANCE,
	CARD_ROUTE_CLEARANCE,
} from "@/transformers/semantic-renderer/lib/layout/routing-clearance";
import { inflate, type Box } from "@/transformers/semantic-renderer/lib/geometry";

/** Where a label may stand across the page: inside its frame's inset, or the page. */
interface Span {
	readonly left: number;
	readonly right: number;
}

/** A reserved label, its box, the relationship it names, the span it may move in and its row. */
interface Reserved {
	readonly edge: ElkExtendedEdge;
	readonly label: ElkLabel;
	readonly box: Box;
	readonly span: Span;
	readonly row: string;
}

/** The placed page a row is centred in. */
interface Page {
	readonly cards: ReadonlyMap<string, Box>;
	readonly frames: readonly (ElkNode & Box)[];
	readonly labels: readonly Reserved[];
}

/**
 * Every node of a placed hierarchy, frames before what they hold.
 * @param nodes The top-level nodes.
 * @returns Them and all their descendants.
 */
function everyNode(nodes: readonly ElkNode[]): ElkNode[] {
	return nodes.flatMap((node) => [node, ...everyNode(node.children ?? [])]);
}

/**
 * The innermost frame a label stands in.
 * @param frames Every frame, outermost first.
 * @param label The label's box.
 * @returns The frame, or nothing when it stands on the page.
 */
function frameOf(frames: readonly (ElkNode & Box)[], label: Box): (ElkNode & Box) | undefined {
	return frames.findLast(
		(frame) =>
			label.x >= frame.x &&
			label.x + label.width <= frame.x + frame.width &&
			label.y >= frame.y &&
			label.y + label.height <= frame.y + frame.height,
	);
}

/**
 * A relationship's reserved label, where placement put one.
 * @param edge The relationship.
 * @param frames Every frame, outermost first.
 * @param width The page's width.
 * @returns The label, its span and its row, or nothing when it has no reserved box.
 */
function reservedOf(
	edge: ElkExtendedEdge,
	frames: readonly (ElkNode & Box)[],
	width: number,
): Reserved[] {
	const label = edge.labels?.[0];
	if (label?.x === undefined || label.y === undefined) return [];
	const box = boxOf(label);
	const frame = frameOf(frames, box);
	return [{ edge, label, box, span: spanIn(frame, width), row: rowOf(frame, box) }];
}

/**
 * The row a label stands in: its frame and its rounded middle.
 * @param frame The frame it stands in, or nothing for the page.
 * @param box The label's box.
 * @returns The row's key.
 */
function rowOf(frame: ElkNode | undefined, box: Box): string {
	return `${frame?.id ?? ""}:${Math.round(box.y + box.height / 2)}`;
}

/**
 * Where a label may stand across the page.
 * @param frame The frame it stands in, or nothing for the page.
 * @param width The page's width.
 * @returns Inside the frame's inset, or the page.
 */
function spanIn(frame: Box | undefined, width: number): Span {
	return frame === undefined
		? { left: 0, right: width }
		: { left: frame.x + CONTAINER_INSET, right: frame.x + frame.width - CONTAINER_INSET };
}

/**
 * The placed page: its cards, its frames and its reserved labels in rows.
 * @param graph The placed graph.
 * @returns What the rows are centred against.
 */
function pageOf(graph: ElkNode): Page {
	const nodes = everyNode(graph.children ?? []);
	const frames = nodes
		.filter((node) => (node.children?.length ?? 0) > 0)
		.map((node) => ({ ...node, ...boxOf(node) }));
	const cards = new Map(
		nodes.filter((node) => !node.children?.length).map((node) => [node.id, boxOf(node)]),
	);
	const labels = (graph.edges ?? []).flatMap((edge) => reservedOf(edge, frames, graph.width ?? 0));
	return { cards, frames, labels };
}

/**
 * The vertical channel nearest a label's centre that two cards share: the
 * cards stand one above the other and their spans overlap.
 * @param from One card.
 * @param to The other card.
 * @param label The label's box.
 * @returns The channel and the gap it crosses, or nothing.
 */
function channelBetween(from: Box, to: Box, label: Box): Box | undefined {
	const low = Math.max(from.x, to.x) + ROUTE_NUDGE_DISTANCE;
	const high = Math.min(from.x + from.width, to.x + to.width) - ROUTE_NUDGE_DISTANCE;
	const [upper, lower] = from.y < to.y ? [from, to] : [to, from];
	const top = upper.y + upper.height;
	if (low > high || top >= lower.y) return undefined;
	const x = Math.max(low, Math.min(high, label.x + label.width / 2));
	return { x, y: top, width: 0, height: lower.y - top };
}

/**
 * The straight vertical channel a label's cards share, when one is clear: a
 * line there between them keeps a card's routing clearance from every other card.
 * @param page The placed page.
 * @param reserved The label.
 * @returns The channel's coordinate, or nothing.
 */
function sharedChannel(page: Page, reserved: Reserved): number | undefined {
	const { edge, box } = reserved;
	const [from, to] = [page.cards.get(edge.sources[0]!), page.cards.get(edge.targets[0]!)];
	const between = from && to && channelBetween(from, to, box);
	if (between === undefined) return undefined;
	const ends = new Set([...edge.sources, ...edge.targets]);
	const clear = [...page.cards].every(
		([id, card]) => ends.has(id) || !boxesOverlap(between, inflate(card, CARD_ROUTE_CLEARANCE)),
	);
	return clear ? between.x : undefined;
}

/**
 * Where each label of a row goes: centred on its shared channel, or where it
 * stands, and at least a label clearance right of the one before it.
 * @param page The placed page.
 * @param row The row, left to right.
 * @returns Each label's new left edge, in row order.
 */
function slid(page: Page, row: readonly Reserved[]): number[] {
	let right = -Infinity;
	return row.map((reserved) => {
		const { box } = reserved;
		const centre = sharedChannel(page, reserved) ?? box.x + box.width / 2;
		const x = Math.max(centre - box.width / 2, right + LABEL_LABEL_CLEARANCE);
		right = x + box.width;
		return x;
	});
}

/**
 * Whether a row's labels may stand where they slid: inside their span and an
 * anchor's clearance from every card, frame title and label of another row.
 * @param page The placed page.
 * @param row The row, left to right.
 * @param xs Each label's new left edge.
 * @returns True when the row may move.
 */
function fits(page: Page, row: readonly Reserved[], xs: readonly number[]): boolean {
	const solids = [
		...page.cards.values(),
		...page.frames.map((frame) => ({
			...frame,
			height: Number(frame.layoutOptions?.["archboard.header.size"] ?? 0),
		})),
		...page.labels.filter((other) => other.row !== row[0]!.row).map(({ box }) => box),
	].map((box) => inflate(box, ANCHOR_CARD_CLEARANCE));
	return row.every(({ box, span }, index) => {
		const moved = { ...box, x: xs[index]! };
		return (
			moved.x >= span.left &&
			moved.x + moved.width <= span.right &&
			solids.every((solid) => !boxesOverlap(moved, solid))
		);
	});
}

/**
 * Move each row of a placed graph's reserved labels onto the channels their
 * cards share, where the whole row fits.
 * @param graph The placed graph, changed in place.
 */
export function centreLabels(graph: ElkNode): void {
	const page = pageOf(graph);
	const rows = new Map<string, Reserved[]>();
	for (const label of page.labels) rows.set(label.row, [...(rows.get(label.row) ?? []), label]);
	for (const row of rows.values()) {
		row.sort((one, other) => one.box.x - other.box.x);
		const xs = slid(page, row);
		if (fits(page, row, xs)) row.forEach(({ label }, index) => (label.x = xs[index]!));
	}
}

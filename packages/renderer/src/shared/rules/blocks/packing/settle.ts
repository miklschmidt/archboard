// Where the ports on a block's top and bottom stand, settled where both ends
// of the trunk through them are known. Every block is laid out innermost
// first, so each first places its ports alone, before the block that routes
// the trunk between them exists, and the trunk then runs sideways from one
// to the other, or overshoots and doubles back. Once every block is laid
// out, the blocks are walked outermost first: in each block of blocks, the
// two ends of every trunk stand in one column where their edges share one,
// or else as near each other as their edges allow; each block inside is
// routed again with its ports there, and the block is packed again as it was.
import type { Box } from "#shared/rules/geometry.ts";
import type { Insets, Laid } from "#shared/rules/blocks/tree/laid.ts";
import { PACK_GAP, PackLayout, type Packing } from "#shared/rules/blocks/packing/pack.ts";
import { TRUNK_CLEARANCE } from "#shared/rules/blocks/packing/trunks.ts";
import { headerOf, type Block, type BlockTree, type Line } from "#shared/rules/blocks/tree/tree.ts";
import { openStretch, type Span } from "#shared/rules/blocks/packing/open-edge.ts";
import { LANE } from "#shared/rules/track/routes/chains.ts";
import { portReach } from "#shared/rules/track/channels/channels.ts";
import { separateFacingPorts, spread } from "#shared/rules/blocks/packing/port-columns.ts";
import { cardIn } from "#shared/rules/blocks/tree/lone.ts";

/** What settling reads and writes: every block laid out, and how each block of blocks is packed. */
interface Settling {
	readonly tree: BlockTree;
	/** Every block laid out; each block routed again replaces its own. */
	readonly laid: Map<string, Laid>;
	readonly packings: ReadonlyMap<string, Packing>;
	readonly insetsOf: (block: Block) => Insets;
}

/**
 * A box's middle across.
 * @param box The box.
 * @returns Its x.
 */
function middle(box: Box): number {
	return box.x + box.width / 2;
}

/**
 * The part two spans share, if any.
 * @param one A span.
 * @param other Another.
 * @returns The shared span, or nothing.
 */
function overlap(one: Span, other: Span): Span | undefined {
	const low = Math.max(one[0], other[0]);
	const high = Math.min(one[1], other[1]);
	return low <= high ? [low, high] : undefined;
}

/**
 * The point of a span nearest another span.
 * @param span The span.
 * @param other The other span.
 * @returns The x.
 */
function nearest(span: Span, other: Span): number {
	if (span[1] < other[0]) return span[1];
	if (span[0] > other[1]) return span[0];
	return (Math.max(span[0], other[0]) + Math.min(span[1], other[1])) / 2;
}

/**
 * Where two ends of one trunk stand: in one column where their spans share
 * one, as near where they stand now as that allows, or else each as near
 * the other as its span allows.
 * @param one One end's span.
 * @param other The other's.
 * @param now Where the two ends stand now, between them.
 * @returns Each end's x.
 */
function facing(one: Span, other: Span, now: number): [number, number] {
	const shared = overlap(one, other);
	if (shared !== undefined) {
		const x = Math.min(shared[1], Math.max(shared[0], now));
		return [x, x];
	}
	return [nearest(one, other), nearest(other, one)];
}

/** The top-down walk that settles every block's ports and routes each block again. */
class Settle {
	/**
	 * Start settling a laid-out board.
	 * @param settling The blocks, laid out.
	 */
	constructor(readonly settling: Settling) {}

	/**
	 * Whether a block can be routed again with its ports moved.
	 * @param block The block.
	 * @returns True for a block of blocks, or a block of cards that kept its placement.
	 */
	movable(block: Block): boolean {
		const { laid, packings } = this.settling;
		return packings.has(block.id) || laid.get(block.id)?.reroute !== undefined;
	}

	/**
	 * The stretch of a block's edge where one of its ports may stand, in the
	 * block's own coordinates: the edge within its insets, right of its
	 * header on the top, and over what the port's one line inside reaches
	 * when that is narrower, so the line runs straight in.
	 * @param block The block.
	 * @param port The port.
	 * @returns The span.
	 */
	spanOf(block: Block, port: string): Span {
		const { laid, insetsOf } = this.settling;
		const inner = laid.get(block.id)!;
		const header = inner.boxes.get(headerOf(block));
		const low =
			insetsOf(block).side +
			(block.ports.get(port) === "top" && header !== undefined ? header.width + LANE : 0);
		const edge: Span = [low, Math.max(low, inner.width - insetsOf(block).side)];
		const reach = this.reachOf(block, port) ?? this.openOf(block, port, edge);
		return overlap(edge, reach) ?? edge;
	}

	/**
	 * The stretch of a block of blocks' edge a trunk inside can reach a port
	 * on straight: clear of every block standing nearer the edge than packed
	 * blocks stand to each other, the free stretch nearest where the port
	 * stands. A port under a block is reached only along the gap between.
	 * @param block The block.
	 * @param port The port, on its top or bottom.
	 * @param edge The edge within the block's insets.
	 * @returns The stretch, or the whole edge for a block of cards.
	 */
	openOf(block: Block, port: string, edge: Span): Span {
		const { laid, packings } = this.settling;
		if (!packings.has(block.id)) return edge;
		const inner = laid.get(block.id)!;
		const top = block.ports.get(port) === "top";
		const face = top ? (inner.boxes.get(headerOf(block))?.height ?? 0) : inner.height;
		const against = block.items
			.map((item) => inner.boxes.get(item)!)
			.filter((box) => (top ? box.y - face : face - box.y - box.height) < PACK_GAP);
		return openStretch(edge, against, TRUNK_CLEARANCE, middle(inner.boxes.get(port)!));
	}

	/**
	 * What a port's one line inside its block reaches: the face of the card it
	 * runs to, or the span of the port it runs to on a block inside.
	 * @param block The block.
	 * @param port The port.
	 * @returns The span, or nothing when the port has more lines inside or none.
	 */
	reachOf(block: Block, port: string): Span | undefined {
		const lines = [...block.lines.values()].filter(({ from, to }) => from === port || to === port);
		return lines.length === 1 ? this.lineReach(block, port, lines[0]!) : undefined;
	}

	/**
	 * What a port's one line inside its block reaches: the face of the card it
	 * runs to, or the span of the port it runs to on a block inside.
	 * @param block The block.
	 * @param port The port.
	 * @param line Its one line.
	 * @returns The span, or nothing when the line runs to neither.
	 */
	lineReach(block: Block, port: string, line: Line): Span | undefined {
		const { tree, laid } = this.settling;
		const inner = laid.get(block.id)!;
		const other = line.from === port ? line.to : line.from;
		const pin = tree.pins.get(other);
		if (pin !== undefined) {
			const at = inner.boxes.get(pin.block.id)!.x;
			const [low, high] = this.endSpan(pin.block, pin.port);
			return [low + at, high + at];
		}
		const card = tree.cards.has(other) ? inner.boxes.get(other) : undefined;
		if (card === undefined) return undefined;
		const lone = tree.lone.get(other);
		return portReach(lone === undefined ? card : cardIn(card, lone));
	}

	/**
	 * Where a port may stand, as its block sees it: its span when the block
	 * can be routed again, else where it stands.
	 * @param block The block.
	 * @param port The port.
	 * @returns The span.
	 */
	endSpan(block: Block, port: string): Span {
		const side = block.ports.get(port);
		if (this.movable(block) && (side === "top" || side === "bottom"))
			return this.spanOf(block, port);
		const x = middle(this.settling.laid.get(block.id)!.boxes.get(port)!);
		return [x, x];
	}

	/**
	 * Where one end of a trunk in a block of blocks may stand, in the block's
	 * coordinates: a pin on a block inside, the block's own port where its
	 * parent settled it, or its header.
	 * @param block The block of blocks.
	 * @param end The end.
	 * @param own Where the block's own ports were settled.
	 * @returns The span.
	 */
	spanIn(block: Block, end: string, own: ReadonlyMap<string, number>): Span {
		const box = this.settling.laid.get(block.id)!.boxes.get(end);
		const pin = this.settling.tree.pins.get(end);
		if (pin !== undefined) {
			const at = this.settling.laid.get(block.id)!.boxes.get(pin.block.id)!.x;
			const [low, high] = this.endSpan(pin.block, pin.port);
			return [low + at, high + at];
		}
		if (end === headerOf(block)) return [box!.x, box!.x + box!.width];
		const x = own.get(end) ?? middle(box!);
		return [x, x];
	}

	/**
	 * Where one end of a trunk in a block of blocks stands now, in the block's
	 * coordinates.
	 * @param block The block of blocks.
	 * @param end The end.
	 * @param own Where the block's own ports were settled.
	 * @returns The x.
	 */
	nowIn(block: Block, end: string, own: ReadonlyMap<string, number>): number {
		const { tree, laid } = this.settling;
		const boxes = laid.get(block.id)!.boxes;
		const pin = tree.pins.get(end);
		if (pin === undefined) return own.get(end) ?? middle(boxes.get(end)!);
		return boxes.get(pin.block.id)!.x + middle(laid.get(pin.block.id)!.boxes.get(pin.port)!);
	}

	/**
	 * Whether where a trunk's end stands now means anything: all but a pin on
	 * a port no line inside its block runs through, the port a relationship
	 * to the container itself makes, which stands wherever its block put it.
	 * @param end The end.
	 * @returns True when it does.
	 */
	holds(end: string): boolean {
		const pin = this.settling.tree.pins.get(end);
		if (pin === undefined) return true;
		return [...pin.block.lines.values()].some(
			({ from, to }) => from === pin.port || to === pin.port,
		);
	}

	/**
	 * Where a trunk stands now: between its ends that hold where they stand
	 * ({@link Settle.holds}), or between both when neither does.
	 * @param block The block of blocks.
	 * @param ends The trunk's ends.
	 * @param own Where the block's own ports were settled.
	 * @returns The x.
	 */
	standing(block: Block, ends: readonly string[], own: ReadonlyMap<string, number>): number {
		const held = ends.filter((end) => this.holds(end));
		const standing = held.length > 0 ? held : ends;
		return standing.reduce((sum, end) => sum + this.nowIn(block, end, own), 0) / standing.length;
	}

	/**
	 * Where every port of the blocks inside a block of blocks is settled: for
	 * each trunk between two ends, where they face each other, and on each
	 * edge a lane apart in the order they want.
	 * @param block The block of blocks.
	 * @param own Where its own ports were settled.
	 * @returns Each inner block's ports' x, in its own coordinates, by block.
	 */
	settleIn(block: Block, own: ReadonlyMap<string, number>): Map<string, Map<string, number>> {
		const { tree } = this.settling;
		const wanted = new Map<string, number[]>();
		for (const line of block.lines.values()) {
			const ends = [line.tail, line.head];
			const now = this.standing(block, ends, own);
			const [one, other] = ends.map((end) => this.spanIn(block, end, own));
			const xs = facing(one!, other!, now);
			ends.forEach((end, index) => {
				if (tree.pins.has(end)) wanted.set(end, [...(wanted.get(end) ?? []), xs[index]!]);
			});
		}
		const settled = new Map<string, Map<string, number>>();
		for (const item of block.items) {
			const inner = tree.blocks.get(item);
			if (inner === undefined || !this.movable(inner)) continue;
			settled.set(item, this.edgesOf(block, inner, wanted));
		}
		separateFacingPorts(block, settled, { ...this.settling, spanOf: this.endSpan.bind(this) });
		return settled;
	}

	/**
	 * One inner block's top and bottom ports, each where its trunks want it,
	 * spread a lane apart along its edge.
	 * @param block The block of blocks.
	 * @param inner The block inside it.
	 * @param wanted Where each pin's trunks want it, in the outer block's coordinates.
	 * @returns Each port's x, in the inner block's coordinates.
	 */
	edgesOf(block: Block, inner: Block, wanted: ReadonlyMap<string, number[]>): Map<string, number> {
		const { tree, laid } = this.settling;
		const at = laid.get(block.id)!.boxes.get(inner.id)!.x;
		const own = laid.get(inner.id)!;
		const ports = new Map<string, number>();
		for (const face of ["top", "bottom"] as const) {
			const onFace = [...inner.ports]
				.filter(([, side]) => side === face)
				.map(([port]) => {
					const xs = wanted.get(tree.pin(inner, port)) ?? [middle(own.boxes.get(port)!) + at];
					return { port, x: xs.reduce((sum, x) => sum + x, 0) / xs.length - at };
				})
				.toSorted((one, other) => one.x - other.x);
			const spans = onFace.map(({ port }) => this.spanOf(inner, port));
			const span: Span = [
				Math.min(...spans.map(([low]) => low)),
				Math.max(...spans.map(([, high]) => high)),
			];
			const xs = spread(
				span,
				onFace.map(({ x }) => x),
			);
			onFace.forEach(({ port }, index) => ports.set(port, xs[index]!));
		}
		return ports;
	}

	/**
	 * Settle every block inside a block, where the block settles their ports.
	 * @param block The block.
	 * @param own Where its own ports were settled.
	 */
	inside(block: Block, own: ReadonlyMap<string, number>): void {
		for (const [item, ports] of this.settleIn(block, own))
			this.block(this.settling.tree.blocks.get(item)!, ports);
	}

	/**
	 * Route a block of cards again with its own ports where its parent settled them.
	 * @param block The block of cards.
	 * @param own Where its parent settled its ports.
	 */
	cards(block: Block, own: ReadonlyMap<string, number>): void {
		const { laid } = this.settling;
		const { reroute } = laid.get(block.id)!;
		if (reroute !== undefined && own.size > 0) laid.set(block.id, reroute(own));
	}

	/**
	 * Settle a block and everything inside it: route it again with its own
	 * ports where its parent settled them, after the blocks inside it.
	 * @param block The block.
	 * @param own Where its parent settled its ports, in its own coordinates.
	 */
	block(block: Block, own: ReadonlyMap<string, number>): void {
		const { tree, laid, packings, insetsOf } = this.settling;
		const before = laid.get(block.id)!;
		const packing = packings.get(block.id);
		if (packing === undefined) {
			this.cards(block, own);
			return;
		}
		this.inside(block, own);
		const again = new PackLayout(block, laid, tree, insetsOf(block));
		again.settled = own;
		again.held = before.width;
		laid.set(block.id, again.roomy(packing));
	}
}

/**
 * Where settling stands every movable inner block's ports, walked as it walks, routing nothing.
 * @param settling The blocks, laid out; nothing is changed.
 * @returns Each inner block's settled ports, by block.
 */
function settledPorts(settling: Settling): Map<string, Map<string, number>> {
	const settle = new Settle(settling);
	const out = new Map<string, Map<string, number>>();
	const walk: [Block, ReadonlyMap<string, number>][] = [[settling.tree.root, new Map()]];
	for (const [block, own] of walk) {
		if (!settling.packings.has(block.id)) continue;
		for (const [item, ports] of settle.settleIn(block, own)) {
			out.set(item, ports);
			walk.push([settling.tree.blocks.get(item)!, ports]);
		}
	}
	return out;
}

/**
 * Settle every port on a block's top and bottom where both ends of its
 * trunk are known, and route every block again with its ports there.
 * @param settling The blocks, laid out; their layouts are replaced.
 */
function settlePorts(settling: Settling): void {
	new Settle(settling).block(settling.tree.root, new Map());
}

export { settlePorts, settledPorts, type Settling };

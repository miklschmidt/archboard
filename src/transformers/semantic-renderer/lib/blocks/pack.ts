// A block of blocks. Its items are blocks alone (`tree.ts` gathers its loose
// cards into a cluster), and every line between them is a trunk between two
// ports that carries no label (the labels sit inside the blocks, next to the
// cards they name). So this level is a packing problem and a sparse routing
// problem: the blocks are packed in rows or columns in the order their lines
// run, whichever fits the reference pane best, and libavoid routes the trunks
// around them.
import { fitIn } from "@/shared/shell-geometry/index";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { SAME, type Insets, type Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import {
	headerOf,
	type Block,
	type BlockTree,
	type Side,
	type Size,
} from "@/transformers/semantic-renderer/lib/blocks/tree";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import { spreadPorts } from "@/transformers/semantic-renderer/lib/track/channels";
import { TrunkRouter, packedScore } from "@/transformers/semantic-renderer/lib/blocks/trunks";

/** Room between two packed blocks, for the trunks that pass between them. */
const PACK_GAP = 72;
/** Room between a block's header or top ports and the blocks under it. */
const HEAD_GAP = 48;
/** The side of a port's square. */
const PORT = 1;
/** The most blocks whose every packing is tried. */
const EVERY_PACKING = 9;
/** How nearly a packing's estimated fit must reach the best one's to be laid out and weighed. */
const WORTH_LAYING = 0.8;
/** How a block's items are packed: in rows read left to right, or in columns read down. */
interface Packing {
	readonly across: boolean;
	readonly groups: readonly (readonly number[])[];
}

/**
 * Every way to cut a sequence into consecutive groups.
 * @param count How many items are left.
 * @param sizes The group sizes chosen so far.
 * @returns Each cut as its group sizes.
 */
function everyCut(count: number, sizes: readonly number[] = []): number[][] {
	if (count === 0) return [[...sizes]];
	return Array.from({ length: count }, (_, index) =>
		everyCut(count - index - 1, [...sizes, index + 1]),
	).flat();
}

/**
 * The cuts of a sequence worth trying: every one for a few items, else one
 * to four even groups.
 * @param count How many items.
 * @returns Each cut as its group sizes.
 */
function cutsOf(count: number): number[][] {
	if (count <= EVERY_PACKING) return everyCut(count);
	return [1, 2, 3, 4].map((groups) =>
		Array.from(
			{ length: groups },
			(_, group) =>
				Math.floor(((group + 1) * count) / groups) - Math.floor((group * count) / groups),
		),
	);
}

/**
 * How long and how thick one group is: along the way it is read, and across it.
 * @param sizes Its items' sizes.
 * @param across Whether it is a row.
 * @returns Its length and thickness.
 */
function extentOf(sizes: readonly Size[], across: boolean): { long: number; thick: number } {
	const along = sizes.map(({ width, height }) => (across ? width : height));
	const breadth = sizes.map(({ width, height }) => (across ? height : width));
	return {
		long: along.reduce((sum, value) => sum + value, 0) + (sizes.length - 1) * PACK_GAP,
		thick: Math.max(...breadth),
	};
}

/** A block of blocks laid out: packed, and its trunks routed. */
class PackLayout {
	readonly boxes = new Map<string, Box>();
	readonly lines = new Map<string, Point[]>();
	/** Where its parent settled its own ports on the top and bottom, by port. */
	settled: ReadonlyMap<string, number> = new Map();
	/** The width it keeps, once its parent has placed it. */
	held = 0;

	/**
	 * Start the layout of a block of blocks.
	 * @param block The block.
	 * @param laid Every block laid out, its items included.
	 * @param tree The blocks.
	 * @param insets Its insets.
	 */
	constructor(
		readonly block: Block,
		readonly laid: ReadonlyMap<string, Laid>,
		readonly tree: BlockTree,
		readonly insets: Insets,
	) {}

	/**
	 * The item a line end stands on.
	 * @param end The line end.
	 * @returns The item's index, or -1 for the block's own header or port.
	 */
	itemOf(end: string): number {
		const pin = this.tree.pins.get(end);
		return pin === undefined ? -1 : this.block.items.indexOf(pin.block.id);
	}

	/**
	 * The items in the order their lines run: by the longest run of lines
	 * that leads to each, then in the board's order.
	 * @returns The item indices, in order.
	 */
	sequence(): number[] {
		const count = this.block.items.length;
		const rank = Array.from({ length: count }, () => 0);
		const pairs = [...this.block.lines.values()]
			.map((line) => [this.itemOf(line.tail), this.itemOf(line.head)] as const)
			.filter(([tail, head]) => tail >= 0 && head >= 0 && tail !== head);
		for (let round = 0; round < count; round += 1)
			for (const [tail, head] of pairs) rank[head] = Math.max(rank[head]!, rank[tail]! + 1);
		return rank
			.map((value, index) => ({ value, index }))
			.toSorted((one, other) => one.value - other.value || one.index - other.index)
			.map(({ index }) => index);
	}

	/**
	 * The items' sizes, by index.
	 * @param group Some item indices.
	 * @returns Their sizes.
	 */
	sizesOf(group: readonly number[]): Size[] {
		return group.map((index) => this.laid.get(this.block.items[index]!)!);
	}

	/**
	 * The size of the items packed one way.
	 * @param packing The packing.
	 * @returns Its size, without the block's own header, ports and insets.
	 */
	sizeOf(packing: Packing): Size {
		const extents = packing.groups.map((group) => extentOf(this.sizesOf(group), packing.across));
		const long = Math.max(...extents.map((extent) => extent.long));
		const deep =
			extents.reduce((sum, extent) => sum + extent.thick, 0) + (extents.length - 1) * PACK_GAP;
		return packing.across ? { width: long, height: deep } : { width: deep, height: long };
	}

	/**
	 * The packings worth laying out: every one whose estimated size fits the
	 * reference pane nearly as well as the best.
	 * @returns The packings.
	 */
	packings(): Packing[] {
		const order = this.sequence();
		const candidates = [true, false].flatMap((across) =>
			cutsOf(order.length).map((sizes) => ({
				across,
				groups: sizes.map((size, index) => {
					const start = sizes.slice(0, index).reduce((sum, value) => sum + value, 0);
					return order.slice(start, start + size);
				}),
			})),
		);
		const fits = candidates.map((packing) => {
			const { width, height } = this.sizeOf(packing);
			const around = this.headRoom() + this.insets.top + this.insets.bottom;
			return fitIn({ width: width + 2 * this.insets.side, height: height + around });
		});
		const best = Math.max(...fits);
		return candidates.filter((_, index) => fits[index]! >= best * WORTH_LAYING);
	}

	/**
	 * The room above the packed items: the header and top ports, and the gap under them.
	 * @returns The room.
	 */
	headRoom(): number {
		const header = this.block.header?.height ?? 0;
		const ports = [...this.block.ports.values()].includes("top") ? PORT : 0;
		return header > 0 || ports > 0 ? Math.max(header, ports) + HEAD_GAP : 0;
	}

	/**
	 * Place the items packed one way, each group centred along its row or column and aligned across it.
	 * @param packing The packing.
	 */
	place(packing: Packing): void {
		const top = this.insets.top + this.headRoom();
		const size = this.sizeOf(packing);
		const length = packing.across ? size.width : size.height;
		let deep = 0;
		for (const group of packing.groups) {
			const sizes = this.sizesOf(group);
			const { long, thick } = extentOf(sizes, packing.across);
			let along = (length - long) / 2;
			group.forEach((index, at) => {
				const { width, height } = sizes[at]!;
				// Rows stand on one top line and columns on one left edge, so their ports line up.
				const cross = deep;
				const [x, y] = packing.across ? [along, cross] : [cross, along];
				this.boxes.set(this.block.items[index]!, {
					x: this.insets.side + x,
					y: top + y,
					width,
					height,
				});
				along += (packing.across ? width : height) + PACK_GAP;
			});
			deep += thick + PACK_GAP;
		}
	}

	/**
	 * The x of a pin: its port's middle on its block.
	 * @param end The pin.
	 * @returns Its x.
	 */
	pinX(end: string): number {
		const { block, port } = this.tree.pins.get(end)!;
		const at = this.laid.get(block.id)!.boxes.get(port)!;
		return this.boxes.get(block.id)!.x + at.x + at.width / 2;
	}

	/**
	 * Place the block's own ports on one edge: each over or under the pins its
	 * lines reach, clear of the header, a lane apart.
	 * @param side The edge.
	 * @param width The block's width.
	 * @param y The height the ports stand at.
	 */
	placePorts(side: Side, width: number, y: number): void {
		const { block, insets } = this;
		const lines = [...block.lines.values()];
		const ports = [...block.ports].filter(([, at]) => at === side).map(([port]) => port);
		const wanted = ports
			.map((port) => {
				const reached = lines
					.flatMap((line) =>
						line.tail === port ? [line.head] : line.head === port ? [line.tail] : [],
					)
					.filter((end) => this.tree.pins.has(end))
					.map((end) => this.pinX(end));
				return { port, x: reached.reduce((sum, x) => sum + x, 0) / Math.max(1, reached.length) };
			})
			.toSorted((one, other) => one.x - other.x);
		const header = block.header;
		const low = insets.side + (side === "top" && header !== undefined ? header.width + LANE : 0);
		const high = Math.max(width - insets.side, low + LANE * (ports.length + 1));
		const xs = spreadPorts(
			{ x: low, y: 0, width: high - low, height: 0 },
			wanted.map(({ x }) => x),
		);
		wanted.forEach(({ port }, index) =>
			this.boxes.set(port, {
				x: (this.settled.get(port) ?? xs[index]!) - PORT / 2,
				y,
				width: PORT,
				height: PORT,
			}),
		);
	}

	/**
	 * Place the block's own ports on its side walls: each level with the
	 * middle of the blocks its lines reach, within the block.
	 * @param width The block's width.
	 * @param span Where the packed items start and end.
	 * @param span.top Where they start.
	 * @param span.bottom Where they end.
	 */
	placeWalls(width: number, span: { top: number; bottom: number }): void {
		const lines = [...this.block.lines.values()];
		for (const [port, side] of this.block.ports) {
			if (side !== "left" && side !== "right") continue;
			const reached = lines
				.flatMap((line) => (line.to === port ? [line.from] : line.from === port ? [line.to] : []))
				.flatMap((end) => {
					const pin = this.tree.pins.get(end);
					const owner = pin === undefined ? undefined : this.boxes.get(pin.block.id);
					return owner === undefined ? [] : [owner.y + owner.height / 2];
				});
			const middle = reached.reduce((sum, y) => sum + y, 0) / Math.max(1, reached.length);
			const y = Math.min(span.bottom, Math.max(span.top, middle));
			const x = side === "left" ? 0 : width;
			this.boxes.set(port, { x: x - PORT / 2, y: y - PORT / 2, width: PORT, height: PORT });
		}
	}

	/**
	 * Route every trunk around the packed blocks.
	 * @param avoid The initialized libavoid module.
	 */
	route(avoid: AvoidEngine): void {
		const trunks = new TrunkRouter(this.block, this.laid, this.tree, this.boxes).route(avoid);
		for (const [key, points] of trunks) this.lines.set(key, points);
	}

	/**
	 * Lay the block of blocks out: packed the way an earlier layout chose, or
	 * each promising way, keeping the one that reads best once its trunks
	 * are routed. An estimate of the packed size cannot tell a compact packing
	 * from one whose trunks run round the page.
	 * @param avoid The initialized libavoid module.
	 * @param kept The packing an earlier layout chose, to keep.
	 * @returns The laid-out block, and the packing it used.
	 */
	lay(avoid: AvoidEngine, kept?: Packing): Laid & { packing: Packing } {
		if (kept !== undefined) return this.layOut(avoid, kept);
		const laid = this.packings().map((packing) =>
			new PackLayout(this.block, this.laid, this.tree, this.insets).layOut(avoid, packing),
		);
		const scores = laid.map((one) => packedScore(one));
		return laid[scores.indexOf(Math.max(...scores))]!;
	}

	/**
	 * Lay the block of blocks out packed one way.
	 * @param avoid The initialized libavoid module.
	 * @param packing The packing.
	 * @returns The laid-out block, and the packing it used.
	 */
	layOut(avoid: AvoidEngine, packing: Packing): Laid & { packing: Packing } {
		this.place(packing);
		const size = this.sizeOf(packing);
		const { side, top } = this.insets;
		const width = Math.max(
			Math.max(size.width, this.block.header?.width ?? 0) + 2 * side,
			this.held,
		);
		const ended = [...this.block.ports.values()].includes("bottom");
		const items = top + this.headRoom();
		const low = items + size.height + (ended ? HEAD_GAP : 0);
		this.placeEdges(width, { top, bottom: low });
		this.route(avoid);
		const bottom = this.closeStrips(items, low, ended);
		const reach = [...this.boxes.values()].flatMap((one) => [
			{ x: one.x + one.width, y: one.y + one.height },
		]);
		const all = [...reach, ...[...this.lines.values()].flat()];
		return {
			width: Math.max(width, ...all.map(({ x }) => x + side)),
			height: Math.max(bottom, ...all.map(({ y }) => y)) + (ended ? 0 : this.insets.bottom),
			boxes: this.boxes,
			lines: this.lines,
			bands: [],
			packing,
		};
	}

	/**
	 * Close the gaps kept for trunks that turn under the header or over the
	 * bottom ports to the block's inset, where no trunk turns.
	 * @param items Where the packed items start.
	 * @param bottom Where the bottom ports stand.
	 * @param ended Whether the block has bottom ports.
	 * @returns Where the bottom ports stand now.
	 */
	closeStrips(items: number, bottom: number, ended: boolean): number {
		const head = this.headRoom() > 0 ? this.close(items - HEAD_GAP, items) : 0;
		const low = bottom - head;
		return ended ? low - this.close(low - HEAD_GAP, low) : low;
	}

	/**
	 * Close a strip across the block to the block's inset when no trunk turns
	 * in it: everything at or below its foot moves up, and the trunks that
	 * only cross it get shorter.
	 * @param from Where the strip starts.
	 * @param to Where it ends.
	 * @returns How far everything below it moved up.
	 */
	close(from: number, to: number): number {
		const by = to - from - this.insets.side;
		const lines = [...this.lines.values()];
		const turns = lines.some((points) =>
			points
				.slice(1)
				.some(
					(point, index) =>
						Math.abs(point.y - points[index]!.y) < SAME &&
						point.y > from + SAME &&
						point.y < to - SAME,
				),
		);
		if (by <= 0 || turns) return 0;
		for (const [id, one] of this.boxes)
			if (one.y >= to - SAME) this.boxes.set(id, { ...one, y: one.y - by });
		for (const [key, points] of this.lines)
			this.lines.set(
				key,
				points.map((point) => (point.y >= to - SAME ? { x: point.x, y: point.y - by } : point)),
			);
		return by;
	}

	/**
	 * Place the block's header and its own ports on every edge.
	 * @param width The block's width.
	 * @param span Where its top and bottom ports stand.
	 * @param span.top The top ports' height.
	 * @param span.bottom The bottom ports' height.
	 */
	placeEdges(width: number, span: { top: number; bottom: number }): void {
		if (this.block.header !== undefined)
			this.boxes.set(headerOf(this.block), {
				x: this.insets.side,
				y: span.top,
				...this.block.header,
			});
		this.placePorts("top", width, span.top);
		this.placePorts("bottom", width, span.bottom);
		this.placeWalls(width, span);
	}
}

export { PACK_GAP, PackLayout, type Packing };

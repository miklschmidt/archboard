// A block of blocks. Its items are blocks alone (`tree.ts` gathers its loose
// cards into a cluster), and every line between them is a trunk between two
// ports that carries no label (the labels sit inside the blocks, next to the
// cards they name). So this level is a packing problem and a sparse routing
// problem: the blocks are packed in rows or columns in the order their lines
// run, whichever fits the reference pane best, and libavoid routes the trunks
// around them.
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { BEND_RADIUS } from "@/transformers/semantic-renderer/config";
import {
	SAME,
	moved,
	leftShortOf,
	type Insets,
	type Laid,
} from "@/transformers/semantic-renderer/lib/blocks/laid";
import {
	headerOf,
	type Block,
	type BlockTree,
	type Side,
	type Size,
} from "@/transformers/semantic-renderer/lib/blocks/tree";
import { PORT } from "@/transformers/semantic-renderer/lib/blocks/leaves";
import {
	extentOf,
	packingsOf,
	type Packing,
} from "@/transformers/semantic-renderer/lib/blocks/packings";
import { openStretch, type Span } from "@/transformers/semantic-renderer/lib/blocks/open-edge";
import { slideToTrunks } from "@/transformers/semantic-renderer/lib/blocks/slides";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import { spreadPorts } from "@/transformers/semantic-renderer/lib/track/channels";
import {
	TRUNK_CLEARANCE,
	TrunkRouter,
	packedScore,
	roomNeeded,
} from "@/transformers/semantic-renderer/lib/blocks/trunks";

/** Room between two packed blocks, for the trunks that pass between them. */
const PACK_GAP = 72;
/** Room between a block's header or top ports and the blocks under it. */
const HEAD_GAP = 48;
/** How far apart two ends may be and still be one straight run. */
const STRAIGHT = 0.5;
/** The pairs of edges two pins stand on when they face each other, over and under or side by side. */
const FACING = {
	upright: new Set(["bottom>top", "top>bottom"]),
	level: new Set(["right>left", "left>right"]),
};
/** A block of blocks laid out: packed, and its trunks routed. */
class PackLayout {
	readonly boxes = new Map<string, Box>();
	readonly lines = new Map<string, Point[]>();
	/** Where its parent settled its own ports on the top and bottom, by port. */
	settled: ReadonlyMap<string, number> = new Map();
	/** The width it keeps, once its parent has placed it. */
	held = 0;
	/** Room between two packed blocks, for the trunks that pass between them. */
	gap = PACK_GAP;
	/** Room left of the packed blocks, for trunks that run round the leftmost. */
	margin = 0;

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
		const extents = packing.groups.map((group) =>
			extentOf(this.sizesOf(group), packing.across, this.gap),
		);
		const long = Math.max(...extents.map((extent) => extent.long));
		const deep =
			extents.reduce((sum, extent) => sum + extent.thick, 0) + (extents.length - 1) * this.gap;
		return packing.across ? { width: long, height: deep } : { width: deep, height: long };
	}

	/**
	 * The packings worth laying out: every one whose estimated size fits the
	 * reference pane nearly as well as the best.
	 * @returns The packings.
	 */
	packings(): Packing[] {
		const around = this.headRoom() + this.insets.top + this.insets.bottom;
		return packingsOf(this.sequence(), (packing) => {
			const { width, height } = this.sizeOf(packing);
			return { width: width + 2 * this.insets.side, height: height + around };
		});
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
	 * Place the items packed one way, with its room, each group centred along its row or column and aligned across it.
	 * @param packing The packing.
	 */
	place(packing: Packing): void {
		[this.gap, this.margin] = [packing.gap ?? PACK_GAP, packing.margin ?? 0];
		const top = this.insets.top + this.headRoom();
		const size = this.sizeOf(packing);
		const length = packing.across ? size.width : size.height;
		let deep = 0;
		for (const group of packing.groups) {
			const sizes = this.sizesOf(group);
			const { long, thick } = extentOf(sizes, packing.across, this.gap);
			let along = (length - long) / 2;
			group.forEach((index, at) => {
				const { width, height } = sizes[at]!;
				// Rows stand on one top line and columns on one left edge, so their ports line up.
				const cross = deep;
				const [x, y] = packing.across ? [along, cross] : [cross, along];
				this.boxes.set(this.block.items[index]!, {
					x: this.insets.side + this.margin + x,
					y: top + y,
					width,
					height,
				});
				along += (packing.across ? width : height) + this.gap;
			});
			deep += thick + this.gap;
		}
	}

	/**
	 * Where a pin stands in the block, and the edge of its own block it is on.
	 * @param end The pin.
	 * @returns Its point and edge.
	 */
	pinAt(end: string): Point & { side: Side } {
		const { block, port } = this.tree.pins.get(end)!;
		const at = this.laid.get(block.id)!.boxes.get(port)!;
		const box = this.boxes.get(block.id)!;
		const side = block.ports.get(port)!;
		return { x: box.x + at.x + at.width / 2, y: box.y + at.y + at.height / 2, side };
	}

	/**
	 * Move a packed block by a little where a trunk between two pins facing
	 * each other steps sideways by less than its two bends need, when the
	 * block keeps its room from every other: the step would be drawn as a
	 * notch. Each block moves once.
	 */
	alignPins(): void {
		const done = new Set<string>();
		for (const line of this.block.lines.values()) {
			const [tail, head] = [this.tree.pins.get(line.tail), this.tree.pins.get(line.head)];
			const by = this.stepOf(line.tail, line.head);
			if (tail === undefined || head === undefined || by === undefined) continue;
			const back = { x: -by.x, y: -by.y };
			const choice = [
				{ id: head.block.id, by },
				{ id: tail.block.id, by: back },
			].find(({ id, by: offset }) => !done.has(id) && this.roomFor(id, offset));
			if (choice === undefined) continue;
			this.boxes.set(choice.id, moved(this.boxes.get(choice.id)!, choice.by));
			done.add(choice.id);
		}
	}

	/**
	 * How far a trunk steps sideways between two pins facing each other, on
	 * blocks of their own, when the step is too short for its two bends.
	 * @param tail The trunk's upper end.
	 * @param head Its lower end.
	 * @returns The move that brings the lower end's block in line, or nothing.
	 */
	stepOf(tail: string, head: string): Point | undefined {
		const facing = this.facing(tail, head);
		if (facing === undefined) return undefined;
		const { one, other, upright } = facing;
		const step = upright ? one.x - other.x : one.y - other.y;
		if (Math.abs(step) < STRAIGHT || Math.abs(step) >= 2 * BEND_RADIUS) return undefined;
		return upright ? { x: step, y: 0 } : { x: 0, y: step };
	}

	/**
	 * Two pins on blocks of their own that face each other.
	 * @param tail One pin.
	 * @param head The other.
	 * @returns Where both stand, and whether one stands over the other, or nothing.
	 */
	facing(tail: string, head: string): { one: Point; other: Point; upright: boolean } | undefined {
		const [a, b] = [this.tree.pins.get(tail), this.tree.pins.get(head)];
		if (a === undefined || b === undefined || a.block === b.block) return undefined;
		const [one, other] = [this.pinAt(tail), this.pinAt(head)];
		const sides = `${one.side}>${other.side}`;
		if (FACING.upright.has(sides)) return { one, other, upright: true };
		return FACING.level.has(sides) ? { one, other, upright: false } : undefined;
	}

	/**
	 * Whether a packed block, moved, keeps the room trunks need between it and every other.
	 * @param id The block.
	 * @param by How far it moves.
	 * @returns True when it does.
	 */
	roomFor(id: string, by: Point): boolean {
		const room = this.gap - 2 * LANE;
		const box = moved(this.boxes.get(id)!, by);
		return this.block.items
			.filter((item) => item !== id)
			.map((item) => this.boxes.get(item)!)
			.every(
				(other) =>
					box.x + box.width + room <= other.x ||
					other.x + other.width + room <= box.x ||
					box.y + box.height + room <= other.y ||
					other.y + other.height + room <= box.y,
			);
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
		const ports = [...block.ports].filter(([, at]) => at === side).map(([port]) => port);
		const header = block.header;
		const low = insets.side + (side === "top" && header !== undefined ? header.width + LANE : 0);
		const high = Math.max(width - insets.side, low + LANE * (ports.length + 1));
		const wanted = ports
			.map((port) => ({ port, x: this.wantedX(port, { side, y, edge: [low, high] }) }))
			.toSorted((one, other) => one.x - other.x);
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
	 * Where one of the block's own ports wants to stand: over or under the pins its lines reach,
	 * on a stretch of its edge that no other packed block stands against, a lane clear of their
	 * sides, since a trunk reaches a port under a block only round it.
	 * @param port The port.
	 * @param at Its edge, the height it stands at, and the stretch it may stand on.
	 * @param at.side The edge.
	 * @param at.y The height.
	 * @param at.edge The stretch.
	 * @returns Its x.
	 */
	wantedX(port: string, at: { side: Side; y: number; edge: Span }): number {
		const pins = [...this.block.lines.values()]
			.flatMap((line) => (line.tail === port ? [line.head] : line.head === port ? [line.tail] : []))
			.filter((end) => this.tree.pins.has(end));
		const x = pins.reduce((sum, end) => sum + this.pinX(end), 0) / Math.max(1, pins.length);
		const reached = new Set(pins.map((end) => this.tree.pins.get(end)!.block.id));
		const against = this.block.items
			.filter((item) => !reached.has(item))
			.map((item) => this.boxes.get(item)!)
			.filter(
				(box) =>
					(at.side === "top" ? box.y - at.y : at.y - box.y - box.height) < HEAD_GAP + this.gap,
			);
		const [low, high] = openStretch(at.edge, against, TRUNK_CLEARANCE + LANE, x);
		return Math.min(high, Math.max(low, x));
	}

	/**
	 * Place the block's own ports on its side walls, within the block: each level
	 * with the pins its lines reach on that wall of their blocks, else their middle.
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
					const owner = this.boxes.get(this.tree.pins.get(end)?.block.id ?? "");
					if (owner === undefined) return [];
					const at = this.pinAt(end);
					return [at.side === side ? at.y : owner.y + owner.height / 2];
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
		if (kept !== undefined) return this.roomy(avoid, kept);
		const tried = this.packings()
			.flatMap((packing) =>
				this.slid(packing) ? [packing, { ...packing, aligned: true }] : [packing],
			)
			.map((packing) => {
				const layout = new PackLayout(this.block, this.laid, this.tree, this.insets);
				return { layout, laid: layout.layOut(avoid, packing) };
			});
		const scores = tried.map(({ laid }) => packedScore(laid));
		const { layout, laid } = tried[scores.indexOf(Math.max(...scores))]!;
		return layout.widened(avoid, laid);
	}

	/**
	 * Where the packed items stand, packed one way.
	 * @param packing The packing.
	 * @returns Their extent.
	 */
	extentOf(packing: Packing): Box {
		const { width, height } = this.sizeOf(packing);
		const [x, y] = [this.insets.side + this.margin, this.insets.top + this.headRoom()];
		return { x, y, width, height };
	}

	/**
	 * Whether some block of a packing would slide in line with the blocks its
	 * lines reach: only then is the packing laid out that way as well.
	 * @param packing The packing.
	 * @returns True when one would.
	 */
	slid(packing: Packing): boolean {
		const probe = new PackLayout(this.block, this.laid, this.tree, this.insets);
		probe.place(packing);
		probe.alignPins();
		return slideToTrunks(probe, packing.across, probe.extentOf(packing));
	}

	/**
	 * Lay the block of blocks out packed one way, its gaps widened where
	 * its trunks crowd them.
	 * @param avoid The initialized libavoid module.
	 * @param packing The packing.
	 * @returns The laid-out block, and the packing it used.
	 */
	roomy(avoid: AvoidEngine, packing: Packing): Laid & { packing: Packing } {
		return this.widened(avoid, this.layOut(avoid, packing));
	}

	/**
	 * The block as laid out, or again with wider gaps where its trunks crowd one
	 * closer than a lane apart, and room on its left where one runs nearer its left wall than its inset.
	 * @param avoid The initialized libavoid module.
	 * @param laid The block as this layout laid it out.
	 * @returns The laid-out block.
	 */
	widened(avoid: AvoidEngine, laid: Laid & { packing: Packing }): Laid & { packing: Packing } {
		const boxes = this.block.items.map((id) => this.boxes.get(id)!);
		const room = roomNeeded(boxes, [...this.lines.values()], this.gap);
		const short = leftShortOf(this.lines.values(), this.insets.side);
		if (room <= this.gap && short === 0) return laid;
		const again = new PackLayout(this.block, this.laid, this.tree, this.insets);
		[again.settled, again.held] = [this.settled, this.held];
		const margin = (laid.packing.margin ?? 0) + short;
		return again.layOut(avoid, { ...laid.packing, gap: Math.max(room, this.gap), margin });
	}

	/**
	 * Lay the block of blocks out packed one way.
	 * @param avoid The initialized libavoid module.
	 * @param packing The packing.
	 * @returns The laid-out block, and the packing it used.
	 */
	layOut(avoid: AvoidEngine, packing: Packing): Laid & { packing: Packing } {
		this.place(packing);
		this.alignPins();
		if (packing.aligned === true) slideToTrunks(this, packing.across, this.extentOf(packing));
		const size = this.sizeOf(packing);
		const { side, top } = this.insets;
		const width = Math.max(
			Math.max(size.width, this.block.header?.width ?? 0) + 2 * side + this.margin,
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

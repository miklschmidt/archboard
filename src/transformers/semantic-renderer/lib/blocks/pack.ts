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

/** Room between two packed blocks, for the trunks that pass between them. */
const PACK_GAP = 72;
/** Room between a block's header or top ports and the blocks under it. */
const HEAD_GAP = 48;
/** How far a trunk keeps from a block it passes. */
const TRUNK_CLEARANCE = 16;
/** How much a trunk pays for each turn, in diagram points. */
const TRUNK_TURN = 60;
/** How much a trunk pays for crossing another, in diagram points. */
const TRUNK_CROSSING = 300;
/** The side of a port's square. */
const PORT = 1;
/** The most blocks whose every packing is tried. */
const EVERY_PACKING = 9;
/** libavoid's pin directions: a port is left the way its edge faces. */
const DIRECTION: Readonly<Record<Side, number>> = { top: 1, bottom: 2, left: 4, right: 8 };

/** A router, its ends and its connectors, as the module makes them. */
type Router = InstanceType<AvoidEngine["Router"]>;
type End = InstanceType<AvoidEngine["ConnEnd"]>;

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

/**
 * Whether a route runs only across and down, never on a slant.
 * @param points The route.
 * @returns True when every run is horizontal or vertical.
 */
function orthogonal(points: readonly Point[]): boolean {
	return (
		points.length >= 2 &&
		points
			.slice(1)
			.every(
				(point, index) =>
					Math.abs(point.x - points[index]!.x) < 0.5 || Math.abs(point.y - points[index]!.y) < 0.5,
			)
	);
}

/**
 * A plain dogleg between two ends: across then down for ends that face
 * sideways, down then across for ends that face up or down.
 * @param from The first end and the edge it faces.
 * @param from.point Where it stands.
 * @param from.side The edge it faces.
 * @param to The second end.
 * @param to.point Where it stands.
 * @returns The route.
 */
function dogleg(from: { point: Point; side: Side }, to: { point: Point }): Point[] {
	const a = from.point;
	const b = to.point;
	if (from.side === "left" || from.side === "right") {
		const middle = (a.x + b.x) / 2;
		return [a, { x: middle, y: a.y }, { x: middle, y: b.y }, b];
	}
	const middle = (a.y + b.y) / 2;
	return [a, { x: a.x, y: middle }, { x: b.x, y: middle }, b];
}

/** A block of blocks laid out: packed, and its trunks routed. */
class PackLayout {
	readonly boxes = new Map<string, Box>();
	readonly lines = new Map<string, Point[]>();

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
	 * The packing that fits the reference pane best.
	 * @returns The packing.
	 */
	packing(): Packing {
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
		return candidates[fits.indexOf(Math.max(...fits))]!;
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
			this.boxes.set(port, { x: xs[index]! - PORT / 2, y, width: PORT, height: PORT }),
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
	 * Add one obstacle.
	 * @param avoid The initialized libavoid module.
	 * @param router The router.
	 * @param box Its box.
	 * @returns The router's shape.
	 */
	shape(avoid: AvoidEngine, router: Router, box: Box): object {
		const from = new avoid.Point(box.x, box.y);
		const to = new avoid.Point(box.x + box.width, box.y + box.height);
		const rectangle = new avoid.Rectangle(from, to);
		try {
			return new avoid.ShapeRef(router, rectangle);
		} finally {
			rectangle.delete();
			from.delete();
			to.delete();
		}
	}

	/**
	 * A free end: the middle of one of the block's own ports.
	 * @param avoid The initialized libavoid module.
	 * @param at The port.
	 * @returns The router's end.
	 */
	point(avoid: AvoidEngine, at: string): End {
		const box = this.boxes.get(at)!;
		const point = new avoid.Point(box.x + box.width / 2, box.y + box.height / 2);
		try {
			return new avoid.ConnEnd(point);
		} finally {
			point.delete();
		}
	}

	/**
	 * Where on its obstacle a pinned end stands, and which way it leaves.
	 * @param at The pin or the header.
	 * @returns The obstacle, the proportional x, and the edge it leaves by.
	 */
	pinOn(at: string): { owner: string; x: number; y: number; side: Side } {
		const pin = this.tree.pins.get(at);
		if (pin === undefined) return { owner: at, x: 0.5, y: 1, side: "bottom" };
		const inner = this.laid.get(pin.block.id)!;
		const port = inner.boxes.get(pin.port)!;
		const side = pin.block.ports.get(pin.port)!;
		const x = (port.x + port.width / 2) / inner.width;
		const y = (port.y + port.height / 2) / inner.height;
		const onWall = { top: [x, 0], bottom: [x, 1], left: [0, y], right: [1, y] }[side];
		return { owner: pin.block.id, x: onWall[0]!, y: onWall[1]!, side };
	}

	/**
	 * Where a trunk's end stands and which way it leaves: a pin on its block's
	 * edge, or the middle of the block's own port or header.
	 * @param at The line end.
	 * @returns The point and the edge it faces.
	 */
	pinPoint(at: string): { point: Point; side: Side } {
		if (!this.tree.pins.has(at) && at !== headerOf(this.block)) {
			const box = this.boxes.get(at)!;
			const side = this.block.ports.get(at) ?? "bottom";
			return { point: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, side };
		}
		const { owner, x, y, side } = this.pinOn(at);
		const box = this.boxes.get(owner)!;
		return { point: { x: box.x + x * box.width, y: box.y + y * box.height }, side };
	}

	/**
	 * One end of a trunk: a pin on a packed block's port, a point on the
	 * block's own port, or the bottom of its header.
	 * @param avoid The initialized libavoid module.
	 * @param at The line end.
	 * @param shapes Every obstacle's shape.
	 * @param classes The pin class each end was given.
	 * @returns The router's end.
	 */
	end(
		avoid: AvoidEngine,
		at: string,
		shapes: ReadonlyMap<string, object>,
		classes: Map<string, number>,
	): End {
		if (!this.tree.pins.has(at) && at !== headerOf(this.block)) return this.point(avoid, at);
		const { owner, x, y, side } = this.pinOn(at);
		const shape = shapes.get(owner)!;
		const known = classes.get(at);
		const pinClass = known ?? classes.size + 1;
		if (known === undefined) {
			classes.set(at, pinClass);
			const made = new avoid.ShapeConnectionPin(shape, pinClass, x, y, true, 0, DIRECTION[side]);
			made.setExclusive(false);
		}
		return new avoid.ConnEnd(shape, pinClass);
	}

	/**
	 * Route every trunk around the packed blocks.
	 * @param avoid The initialized libavoid module.
	 */
	route(avoid: AvoidEngine): void {
		const router = new avoid.Router(avoid.RouterFlag.OrthogonalRouting.value);
		try {
			router.setRoutingParameter(avoid.RoutingParameter.shapeBufferDistance, TRUNK_CLEARANCE);
			router.setRoutingParameter(avoid.RoutingParameter.idealNudgingDistance, LANE);
			router.setRoutingParameter(avoid.RoutingParameter.segmentPenalty, TRUNK_TURN);
			router.setRoutingParameter(avoid.RoutingParameter.crossingPenalty, TRUNK_CROSSING);
			const header = this.block.header === undefined ? [] : [headerOf(this.block)];
			const shapes = new Map(
				[...this.block.items, ...header].map((id) => [
					id,
					this.shape(avoid, router, this.boxes.get(id)!),
				]),
			);
			const classes = new Map<string, number>();
			const connections = [...this.block.lines.values()].map((line) => {
				const from = this.end(avoid, line.tail, shapes, classes);
				const to = this.end(avoid, line.head, shapes, classes);
				try {
					const connection = new avoid.ConnRef(router, from, to);
					connection.setRoutingType(avoid.ConnType.ConnType_Orthogonal);
					return { line, connection };
				} finally {
					from.delete();
					to.delete();
				}
			});
			router.processTransaction();
			for (const { line, connection } of connections) {
				const route = connection.displayRoute();
				const routed = Array.from({ length: route.size() }, (_, index) => {
					const { x, y } = route.at(index);
					return { x, y };
				});
				// libavoid answers a straight line between the blocks' middles when it finds
				// no route; the trunk then takes a plain dogleg between its pins.
				const points =
					connection.hasValidRoute() && orthogonal(routed)
						? routed
						: dogleg(this.pinPoint(line.tail), this.pinPoint(line.head));
				this.lines.set(line.key, line.from === line.tail ? points : points.toReversed());
			}
		} finally {
			router.delete();
		}
	}

	/**
	 * Lay the block of blocks out.
	 * @param avoid The initialized libavoid module.
	 * @param kept The packing an earlier layout chose, to keep.
	 * @returns The laid-out block, and the packing it used.
	 */
	lay(avoid: AvoidEngine, kept?: Packing): Laid & { packing: Packing } {
		const packing = kept ?? this.packing();
		this.place(packing);
		const size = this.sizeOf(packing);
		const { side, top } = this.insets;
		const width = Math.max(size.width, this.block.header?.width ?? 0) + 2 * side;
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

export { PackLayout, type Packing };

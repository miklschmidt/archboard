// What Graphviz answers, read into diagram coordinates: the JSON a layout
// returns, its boxes in inches, and its polylines and centres in points.
import type { Graph } from "@viz-js/viz";
import { z } from "zod";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { closeSlots, type Holds } from "@/transformers/semantic-renderer/lib/track/hold-slots";
import { clearWrap, type Wrap } from "@/transformers/semantic-renderer/lib/track/wrap-columns";

/** A point in diagram coordinates. */
type Point = { readonly x: number; readonly y: number };
/** A Graphviz node. */
type VendorNode = NonNullable<Graph["nodes"]>[number];

const objectSchema = z.object({
	name: z.string(),
	bb: z.string().optional(),
	pos: z.string().optional(),
});
const edgeSchema = z.object({
	id: z.string().optional(),
	tail: z.number(),
	head: z.number(),
	pos: z.string().optional(),
});
const outputSchema = z.object({
	bb: z.string(),
	objects: z.array(objectSchema).default([]),
	edges: z.array(edgeSchema).default([]),
});
type Output = z.infer<typeof outputSchema>;

/**
 * A fixed-size Graphviz box in its inch units.
 * @param name The vendor identity.
 * @param width Its width in diagram points.
 * @param height Its height in diagram points.
 * @returns The vendor node.
 */
function box(name: string, width: number, height: number): VendorNode {
	return { name, attributes: { width: width / 72, height: height / 72 } };
}

/**
 * Finite numbers from Graphviz's comma-separated geometry.
 * @param value The serialized point or bounds.
 * @returns The numbers.
 * @throws {Error} When Graphviz answered a coordinate that is not a number.
 */
function numbers(value: string): number[] {
	const parsed = value.split(",").map(Number);
	if (parsed.some((number) => !Number.isFinite(number)))
		throw new Error("Graphviz returned non-finite geometry");
	return parsed;
}

/**
 * The polyline points of a Graphviz edge, without its arrow markers.
 * @param pos The edge's serialized spline.
 * @param origin Where the drawing starts.
 * @returns Its points in diagram coordinates.
 */
function polylinePoints(pos: string, origin: Point): string[] {
	return pos
		.split(" ")
		.filter((token) => !token.startsWith("e,") && !token.startsWith("s,"))
		.map((token) => {
			const [x, y] = numbers(token);
			return `${x! - origin.x},${y! - origin.y}`;
		});
}

/**
 * Every vendor node's centre in diagram coordinates.
 * @param output What Graphviz answered.
 * @param origin Where the drawing starts.
 * @returns The centres by vendor name.
 */
function centresOf(output: Output, origin: Point): Map<string, Point> {
	const centres = new Map<string, Point>();
	for (const object of output.objects) {
		if (object.pos === undefined) continue;
		const [x, y] = numbers(object.pos);
		centres.set(object.name, { x: x! - origin.x, y: y! - origin.y });
	}
	return centres;
}

/**
 * Every node in a Graphviz graph and all its subgraphs.
 * @param graph The graph.
 * @param graph.nodes Its nodes.
 * @param graph.subgraphs Its subgraphs.
 * @returns The nodes.
 */
function nodesIn(graph: {
	nodes?: readonly VendorNode[];
	subgraphs?: readonly NonNullable<Graph["subgraphs"]>[number][];
}): VendorNode[] {
	return [
		...(graph.nodes ?? []),
		...(graph.subgraphs ?? []).flatMap((subgraph) => nodesIn(subgraph)),
	];
}

/**
 * Every node's box where Graphviz placed it, from its centre and its size.
 * @param nodes The nodes, each sized in inches.
 * @param centres Every node's centre.
 * @returns The boxes, by name.
 */
function boxesOf(
	nodes: readonly VendorNode[],
	centres: ReadonlyMap<string, Point>,
): Map<string, Box> {
	const boxes = new Map<string, Box>();
	for (const { name, attributes } of nodes) {
		const centre = centres.get(name);
		if (centre === undefined) continue;
		const [width, height] = [
			Number(attributes?.["width"]) * 72,
			Number(attributes?.["height"]) * 72,
		];
		boxes.set(name, { x: centre.x - width / 2, y: centre.y - height / 2, width, height });
	}
	return boxes;
}

/** How far apart two joined cards stacked in a column may stand and still be lined up. */
const NEAR_MISS = 16;

/** A line between two items, upper end first, through its label's box when it has one. */
interface Join {
	readonly tail: string;
	readonly head: string;
	readonly label?: string;
	/** The ids of the Graphviz edges that draw it. */
	readonly legs?: readonly string[];
}

/** What an item moved sideways must keep to. */
interface Room {
	/** How far it keeps from every other item. */
	readonly gap: number;
	/** Every Graphviz edge's polyline, by id, which a moved item must stay clear of. */
	readonly polylines?: ReadonlyMap<string, readonly string[]>;
	/**
	 * Where an item may stand: inside its container.
	 * @param name The item.
	 * @returns The span it must stay within, or nothing for one that stays where it is.
	 */
	readonly within: (name: string) => { left: number; right: number } | undefined;
	/**
	 * Whether an item is a card, whose width may be evened with the card over
	 * or under it; without it no item is.
	 * @param name The item.
	 * @returns True for a card.
	 */
	readonly card?: (name: string) => boolean;
	/** The wrap the block's rank was placed by, whose lowered cards may step out of a line's way. */
	readonly wrap?: Wrap;
	/** The invisible holds the block's containers keep their members with, which may stand a member a slot off its wall. */
	readonly holds?: Holds;
}

/**
 * Whether two boxes on one rank come closer than a gap.
 * @param one A box.
 * @param other Another.
 * @param gap The room kept between them.
 * @returns True when they do.
 */
function crowds(one: Box, other: Box, gap: number): boolean {
	return (
		one.x < other.x + other.width + gap &&
		other.x < one.x + one.width + gap &&
		one.y < other.y + other.height &&
		other.y < one.y + one.height
	);
}

/**
 * Whether one box holds another whole, as a container holds its members.
 * @param outer The outer box.
 * @param inner The inner box.
 * @returns True when it does.
 */
function holds(outer: Box, inner: Box): boolean {
	return (
		outer.x <= inner.x &&
		outer.y <= inner.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

/**
 * Whether a straight run passes through a box.
 * @param from Where the run starts.
 * @param to Where it ends.
 * @param at The box.
 * @returns True when some of the run is inside the box.
 */
function through(from: Point, to: Point, at: Box): boolean {
	let [low, high] = [0, 1];
	for (const [start, end, min, max] of [
		[from.x, to.x, at.x, at.x + at.width],
		[from.y, to.y, at.y, at.y + at.height],
	] as const) {
		const step = end - start;
		if (Math.abs(step) < 1e-9) {
			if (start <= min || start >= max) return false;
			continue;
		}
		const [one, other] = [(min - start) / step, (max - start) / step];
		low = Math.max(low, Math.min(one, other));
		high = Math.min(high, Math.max(one, other));
	}
	return low < high;
}

/**
 * The horizontal centre of a box.
 * @param at The box.
 * @returns Its centre.
 */
function middle(at: Box): number {
	return at.x + at.width / 2;
}

/** The lines between items Graphviz placed, and the items lined up so far. */
class Columns {
	/** The items standing in line with another over or under them: they stay. */
	readonly held = new Set<string>();
	/** Every line as Graphviz drew it, and what it joins. */
	readonly paths: { ends: ReadonlySet<string>; points: Point[] }[];

	/**
	 * Read what the items stand in.
	 * @param boxes Every item Graphviz placed; the moved ones are replaced.
	 * @param joins Every line between two items, upper end first.
	 * @param room What a moved item must keep to.
	 */
	constructor(
		readonly boxes: Map<string, Box>,
		readonly joins: readonly Join[],
		readonly room: Room,
	) {
		this.paths = joins.map(({ tail, head, label, legs }) => ({
			ends: new Set([tail, head, label ?? tail]),
			points: (legs ?? [])
				.flatMap((leg) => room.polylines?.get(leg) ?? [])
				.map((point) => ({ x: numbers(point)[0]!, y: numbers(point)[1]! })),
		}));
		for (const join of this.stacked())
			if (Math.abs(this.offset(join)) < 0.5) this.held.add(join.tail).add(join.head);
	}

	/**
	 * The lines whose upper end stands wholly above their lower end.
	 * @returns The lines.
	 */
	stacked(): Join[] {
		return this.joins.filter(({ tail, head }) => {
			const [one, other] = [this.boxes.get(tail), this.boxes.get(head)];
			return one !== undefined && other !== undefined && one.y + one.height <= other.y;
		});
	}

	/**
	 * How far a line's upper end stands right of its lower end.
	 * @param join The line.
	 * @returns The offset between their centres.
	 */
	offset(join: Join): number {
		return middle(this.boxes.get(join.tail)!) - middle(this.boxes.get(join.head)!);
	}

	/**
	 * An item's box centred on another x.
	 * @param name The item.
	 * @param centre Its new centre.
	 * @returns The box.
	 */
	moved(name: string, centre: number): Box {
		const at = this.boxes.get(name)!;
		return { ...at, x: centre - at.width / 2 };
	}

	/**
	 * Whether an item may stand at a box, whatever lines Graphviz drew there:
	 * inside its span, and crowding nothing but what holds it.
	 * @param name The item.
	 * @param at Where it would stand.
	 * @returns True when it may.
	 */
	roomy(name: string, at: Box): boolean {
		const span = this.room.within(name);
		if (span === undefined || at.x < span.left || at.x + at.width > span.right) return false;
		const was = this.boxes.get(name)!;
		return ![...this.boxes].some(
			([other, placed]) =>
				other !== name && !holds(placed, was) && crowds(at, placed, this.room.gap),
		);
	}

	/**
	 * Whether an item may stand at a box: inside its span, crowding nothing
	 * but what holds it, and clear of every line it is not an end of.
	 * @param name The item.
	 * @param at Where it would stand.
	 * @returns True when it may.
	 */
	free(name: string, at: Box): boolean {
		return (
			this.roomy(name, at) &&
			this.paths.every(
				({ ends, points }) =>
					ends.has(name) || points.slice(1).every((to, index) => !through(points[index]!, to, at)),
			)
		);
	}

	/**
	 * The cards stacked on one centre with an item that moves, which move with
	 * it so the column stays one: every card over or under it on its centre
	 * that is not lined up with another and may stand on the new centre. A
	 * label on that centre belongs to some other line, and stays.
	 * @param name The item that moves.
	 * @param centre Its new centre.
	 * @returns The cards.
	 */
	carried(name: string, centre: number): string[] {
		const was = this.boxes.get(name)!;
		return [...this.boxes]
			.filter(
				([other, at]) =>
					other !== name &&
					this.room.card?.(other) === true &&
					!this.held.has(other) &&
					Math.abs(middle(at) - middle(was)) < 0.5 &&
					apart(at, was),
			)
			.map(([other]) => other)
			.filter((other) => this.free(other, this.moved(other, centre)));
	}

	/**
	 * The narrower of two joined cards stacked on one centre, when their
	 * widths differ by no more than a near miss, and the other's width.
	 * @param join The line between them.
	 * @returns The narrower card and the width it would take, or nothing.
	 */
	uneven(join: Join): [string, number] | undefined {
		const { tail, head } = join;
		if (!this.cards(join) || Math.abs(this.offset(join)) >= 0.5) return undefined;
		const [one, other] = [this.boxes.get(tail)!, this.boxes.get(head)!];
		const short = Math.abs(one.width - other.width);
		if (short < 0.5 || short > NEAR_MISS) return undefined;
		return one.width < other.width ? [tail, other.width] : [head, one.width];
	}

	/**
	 * Whether both ends of a line are cards.
	 * @param join The line.
	 * @returns True when they are.
	 */
	cards(join: Join): boolean {
		return this.room.card?.(join.tail) === true && this.room.card(join.head);
	}

	/**
	 * Widen the narrower of two joined cards stacked on one centre to the
	 * other's width, when their edges miss each other by no more than a near
	 * miss between them, so the column's edges run straight down.
	 * @param join The line between them.
	 * @returns True when a card was widened.
	 */
	even(join: Join): boolean {
		const [narrow, width] = this.uneven(join) ?? [];
		if (narrow === undefined) return false;
		const at = this.boxes.get(narrow)!;
		const widened = { ...at, x: middle(at) - width! / 2, width: width! };
		if (!this.free(narrow, widened)) return false;
		this.boxes.set(narrow, widened);
		return true;
	}

	/**
	 * Whether an item is a card not yet lined up with another.
	 * @param name The item.
	 * @returns True when it is.
	 */
	loose(name: string): boolean {
		return this.room.card?.(name) === true && !this.held.has(name);
	}

	/**
	 * The cards a card's lines join, when they make a fan of it: two or more
	 * cards, and nothing else, all on one rank above it or below it. A card
	 * already lined up with another has no fan.
	 * @param name The item.
	 * @returns Their boxes, or nothing.
	 */
	fanOf(name: string): Box[] | undefined {
		const ends = new Set(
			this.joins.flatMap(({ tail, head }) =>
				tail === name ? [head] : head === name ? [tail] : [],
			),
		);
		if (!this.loose(name) || [...ends].some((end) => this.room.card?.(end) !== true))
			return undefined;
		const fan = [...ends].map((end) => this.boxes.get(end)!);
		return fans(this.boxes.get(name)!, fan) ? fan : undefined;
	}

	/**
	 * Centre a card on the fan its lines make, midway between the fan's outer
	 * centres, where it may stand there. Graphviz draws each line through its
	 * label's box as two legs it weighs alike, which add up to the same
	 * wherever the card stands between two cards it joins, so it leaves the
	 * card at any point of that stretch.
	 * @param name The item.
	 */
	centre(name: string): void {
		const centres = this.fanOf(name)?.map((end) => middle(end));
		if (centres === undefined) return;
		const at = this.moved(name, (Math.min(...centres) + Math.max(...centres)) / 2);
		if (Math.abs(middle(at) - middle(this.boxes.get(name)!)) >= 0.5 && this.free(name, at))
			this.boxes.set(name, at);
	}

	/**
	 * Line one line's ends up, when one of them may move under or over the
	 * other, and its label onto the line.
	 * @param join The line.
	 */
	lineUp(join: Join): void {
		const { tail, head, label } = join;
		const choice = (
			[
				[head, middle(this.boxes.get(tail)!)],
				[tail, middle(this.boxes.get(head)!)],
			] as const
		).find(([name, centre]) => !this.held.has(name) && this.free(name, this.moved(name, centre)));
		if (choice === undefined) return;
		const [name, centre] = choice;
		for (const other of this.carried(name, centre))
			this.boxes.set(other, this.moved(other, centre));
		this.boxes.set(name, this.moved(name, centre));
		this.held.add(tail).add(head);
		if (label === undefined || !this.boxes.has(label)) return;
		const onto = this.moved(label, centre);
		if (this.free(label, onto)) this.boxes.set(label, onto);
	}
}

/**
 * Whether one box stands wholly above or below another.
 * @param one A box.
 * @param other Another.
 * @returns True when they share no height.
 */
function apart(one: Box, other: Box): boolean {
	return one.y + one.height <= other.y || other.y + other.height <= one.y;
}

/**
 * Whether cards make a fan of a card: two or more, all on one rank, and
 * all above it or all below it.
 * @param at The card.
 * @param fan The cards its lines join.
 * @returns True when they do.
 */
function fans(at: Box, fan: readonly Box[]): boolean {
	if (fan.length < 2) return false;
	const rank = fan[0]!.y + fan[0]!.height / 2;
	return (
		fan.every((end) => Math.abs(end.y + end.height / 2 - rank) < 0.5) &&
		(fan.every((end) => end.y + end.height <= at.y) ||
			fan.every((end) => at.y + at.height <= end.y))
	);
}

/**
 * Line up the joined cards Graphviz stacked a few points out of one column.
 * First, where the room names the holds, a member a hold stood a slot in from
 * its container's wall moves onto it.
 * A line through its label's box pulls its two ends into line no harder than
 * it lets them stand apart, so each end leans toward its other lines and the
 * line jogs. One end is moved under or over the other, and the label onto the
 * line, where that crowds nothing and stays clear of every other line; never
 * an end already lined up with another card, whose straight line would bend.
 * The cards stacked on the moved end's centre move with it. Last, where the
 * room names the cards, two joined cards on one centre whose widths differ
 * by no more than a near miss are made one width, and where it names a wrap,
 * its lowered cards stand out of the way of the lines through it.
 * @param boxes Every item Graphviz placed; the moved ones are replaced.
 * @param joins Every line between two items, upper end first.
 * @param room What a moved item must keep to.
 */
function alignColumns(boxes: Map<string, Box>, joins: readonly Join[], room: Room): void {
	const columns = new Columns(boxes, joins, room);
	closeSlots(columns, room.holds);
	for (const join of columns.stacked()) {
		const shift = Math.abs(columns.offset(join));
		if (shift >= 0.5 && shift <= NEAR_MISS) columns.lineUp(join);
	}
	for (const name of boxes.keys()) columns.centre(name);
	// Widening one card can line its edges up with a third's.
	while (columns.stacked().some((join) => columns.even(join)));
	clearWrap(columns, room.wrap);
}

export {
	alignColumns,
	box,
	boxesOf,
	centresOf,
	nodesIn,
	numbers,
	outputSchema,
	polylinePoints,
	type Columns,
	type Join,
	type Output,
};

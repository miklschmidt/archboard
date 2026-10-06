// A folded block: its header and ports, its columns side by side, and the
// lines between them. What continues from one column into a later one leaves
// the bottom of its column, runs along the channel under the columns, rises
// in the gutter left of the column it enters, and comes down into that column
// from the channel above them: every such line keeps to the same corridors,
// so the fold reads as one bus from the end of a column to the start of the
// next. The block's own ports stand over or under what their lines reach.
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { MIN_GUTTER } from "@/transformers/semantic-renderer/lib/blocks/fold";
import type { Insets, Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import { rimOf } from "@/transformers/semantic-renderer/lib/blocks/leaves";
import {
	headerOf,
	type Block,
	type BlockTree,
	type Line,
	type Face,
} from "@/transformers/semantic-renderer/lib/blocks/tree";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import { spreadPorts } from "@/transformers/semantic-renderer/lib/track/channels";
import { TRACK_TOP, channelHeight } from "@/transformers/semantic-renderer/lib/track/spacing";
import {
	stackUnits,
	unitAcross,
	type Unit,
} from "@/transformers/semantic-renderer/lib/track/tracks";

/** Room a gutter keeps either side of its lanes. */
const GUTTER_MARGIN = 20;
/** The side of a port's square. */
const PORT = 1;
/** How far apart two ends may be and still be one straight drop. */
const STRAIGHT = 0.5;

/**
 * How far down a laid-out column the first thing it shows stands: its first
 * card, or a container or region it draws around its first cards.
 * @param laid The column laid out.
 * @returns The top of its first card, container or region.
 */
function firstCardTop(laid: Laid): number {
	const card = laid.bands.find(({ items }) => items.length > 0)?.top ?? 0;
	const shapes = [...(laid.frames ?? []), ...(laid.regions ?? [])].map(({ box }) => box.y);
	return Math.min(card, ...shapes);
}

/**
 * Where a line of the folded block runs: down from the block's header or top
 * port into a column, out of a column to its bottom port, or over from one
 * column to a later one through the gutter left of the later one.
 */
interface Course {
	readonly kind: "down" | "out" | "over";
	readonly line: Line;
	/** The column it leaves, or -1. */
	readonly from: number;
	/** The column it enters, or -1. */
	readonly to: number;
	/** Its lane in the gutter, for a line over. */
	lane: number;
}

/** A channel's stacked runs: each course's unit, each unit's track, and how many tracks. */
interface Stacked {
	readonly units: ReadonlyMap<Course, Unit>;
	readonly tracks: ReadonlyMap<Unit, number>;
	readonly count: number;
}

/** Where the channels above and below the columns start. */
interface Rows {
	readonly top: number;
	readonly bottom: number;
}

/**
 * The run a line down into a column, or out of one, makes in a channel: in
 * its own channel, when its ends are not in line.
 * @param course The course.
 * @param channel The channel.
 * @param at Its ends' x and its order.
 * @param at.tail Its upper end's x.
 * @param at.head Its lower end's x.
 * @param at.order Its tie-break.
 * @returns Its unit, if it turns there.
 */
function turning(
	course: Course,
	channel: Face,
	at: { tail: number; head: number; order: number },
): Unit | undefined {
	const own = (course.kind === "down") === (channel === "top");
	return own && Math.abs(at.tail - at.head) > STRAIGHT
		? unitAcross([at.tail], [at.head], at.order)
		: undefined;
}

/** A folded block's own layout. */
class FoldLayout {
	readonly boxes = new Map<string, Box>();
	readonly lines = new Map<string, Point[]>();
	/** Each own port's x. */
	readonly portX = new Map<string, number>();
	/** Each column's x. */
	readonly columnX: number[] = [];

	/**
	 * Start the layout of a folded block.
	 * @param block The block.
	 * @param columns Its columns, in order.
	 * @param laid Every block laid out, the columns included.
	 * @param tree The blocks.
	 * @param insets Its insets.
	 */
	constructor(
		readonly block: Block,
		readonly columns: readonly Block[],
		readonly laid: ReadonlyMap<string, Laid>,
		readonly tree: BlockTree,
		readonly insets: Insets,
	) {}

	/**
	 * The block's own ports on one side.
	 * @param side The side.
	 * @returns Their ids.
	 */
	portsOn(side: Face): string[] {
		return [...this.block.ports].filter(([, at]) => at === side).map(([port]) => port);
	}

	/**
	 * The column a pin stands on.
	 * @param end A line end.
	 * @returns The column's index, or -1 when the end is the block's own.
	 */
	columnOf(end: string): number {
		const pin = this.tree.pins.get(end);
		return pin === undefined ? -1 : this.columns.indexOf(pin.block);
	}

	/**
	 * Where one line of the block runs.
	 * @param line The line.
	 * @returns Its course.
	 */
	courseOf(line: Line): Course {
		const from = this.columnOf(line.tail);
		const to = this.columnOf(line.head);
		const kind = from < 0 ? "down" : to < 0 ? "out" : "over";
		return { kind, line, from, to, lane: 0 };
	}

	/**
	 * The x of a line end: a pin's port, an own port, or the header's middle.
	 * @param end The line end.
	 * @returns Its x.
	 */
	endX(end: string): number {
		const pin = this.tree.pins.get(end);
		if (pin !== undefined) {
			const at = this.laid.get(pin.block.id)!.boxes.get(pin.port)!;
			return this.columnX[this.columns.indexOf(pin.block)]! + at.x + at.width / 2;
		}
		const header = this.boxes.get(end);
		return this.portX.get(end) ?? header!.x + header!.width / 2;
	}

	/**
	 * Every gutter's width, left of each column: room for the lanes that rise in it.
	 * @param courses Every line's course.
	 * @returns Each column's gutter width, the first one nothing.
	 */
	gutters(courses: readonly Course[]): number[] {
		return this.columns.map((_, index) => {
			const lanes = courses.filter(({ kind, to }) => kind === "over" && to === index).length;
			if (index === 0) return 0;
			return Math.max(MIN_GUTTER, 2 * GUTTER_MARGIN + Math.max(0, lanes - 1) * LANE);
		});
	}

	/**
	 * Give every line over a gutter its lane: the line leaving furthest right
	 * rises nearest its source column, so the runs under the columns nest.
	 * @param courses Every line's course.
	 * @param gutters Every gutter's width.
	 */
	lanes(courses: readonly Course[], gutters: readonly number[]): void {
		for (const [index, width] of gutters.entries()) {
			const over = courses
				.filter(({ kind, to }) => kind === "over" && to === index)
				.toSorted((one, other) => this.endX(other.line.tail) - this.endX(one.line.tail));
			const room = width - 2 * GUTTER_MARGIN;
			const step = over.length > 1 ? Math.min(LANE, room / (over.length - 1)) : 0;
			const start =
				this.columnX[index]! - width + GUTTER_MARGIN + (room - step * (over.length - 1)) / 2;
			over.forEach((course, lane) => {
				course.lane = start + lane * step;
			});
		}
	}

	/**
	 * Where the block's own ports stand: over or under the pins their lines
	 * reach, clear of the header, a lane apart.
	 * @param courses Every line's course.
	 * @param side Which edge.
	 * @param right Where the last column ends.
	 */
	placePorts(courses: readonly Course[], side: Face, right: number): void {
		const ports = this.portsOn(side);
		const end = side === "top" ? "tail" : "head";
		const wanted = ports
			.map((port) => {
				const reached = courses
					.filter(({ line }) => line[end] === port)
					.map(({ line }) => this.endX(end === "tail" ? line.head : line.tail));
				return { port, x: reached.reduce((sum, x) => sum + x, 0) / Math.max(1, reached.length) };
			})
			.toSorted((one, other) => one.x - other.x);
		const header = this.block.header;
		const clear = this.insets.side + (header === undefined ? 0 : header.width + LANE);
		const low = side === "top" ? clear : this.insets.side;
		const high = Math.max(right, low + LANE * (ports.length + 1));
		const xs = spreadPorts(
			{ x: low, y: 0, width: high - low, height: 0 },
			wanted.map(({ x }) => x),
		);
		wanted.forEach(({ port }, index) => this.portX.set(port, xs[index]!));
	}

	/**
	 * The run one course makes in one channel, if it turns there.
	 * @param course The course.
	 * @param channel Which channel: above the columns, or below them.
	 * @returns Its unit.
	 */
	unitOf(course: Course, channel: Face): Unit | undefined {
		const order = Number(course.line.edge.layoutOptions?.["archboard.order"] ?? 0);
		const tail = this.endX(course.line.tail);
		const head = this.endX(course.line.head);
		if (course.kind !== "over") return turning(course, channel, { tail, head, order });
		return channel === "top"
			? unitAcross([], [course.lane, head], order)
			: unitAcross([tail, course.lane], [], order);
	}

	/**
	 * Stack the runs of one channel.
	 * @param courses Every line's course.
	 * @param channel Which channel.
	 * @returns The stacked runs.
	 */
	stack(courses: readonly Course[], channel: Face): Stacked {
		const units = new Map<Course, Unit>();
		for (const course of courses) {
			const unit = this.unitOf(course, channel);
			if (unit !== undefined) units.set(course, unit);
		}
		const tracks = stackUnits([...units.values()]);
		return { units, tracks, count: tracks.size === 0 ? 0 : Math.max(...tracks.values()) + 1 };
	}

	/**
	 * Place the header and the columns side by side.
	 * @param gutters Every gutter's width.
	 * @returns Where the last column ends.
	 */
	placeColumns(gutters: readonly number[]): number {
		const header = this.block.header;
		if (header !== undefined)
			this.boxes.set(headerOf(this.block), { x: this.insets.side, y: this.insets.top, ...header });
		let x = this.insets.side;
		for (const [index, column] of this.columns.entries()) {
			x += gutters[index]!;
			this.columnX.push(x);
			x += this.laid.get(column.id)!.width;
		}
		return x;
	}

	/**
	 * The room above the columns: the channel its runs need, or where no line
	 * turns under the header, the block's own inset, as at its sides (`rimOf`).
	 * @param top The runs above the columns.
	 * @returns The room.
	 */
	headRoom(top: Stacked): number {
		const rim = top.count === 0 ? rimOf(this.block, this.insets) : undefined;
		return rim?.head ?? channelHeight(top.count);
	}

	/**
	 * Put every column, own port and channel at its height.
	 * @param top The runs above the columns.
	 * @param bottom The runs below them.
	 * @returns The tops of both channels.
	 */
	stackRows(top: Stacked, bottom: Stacked): Rows {
		const tops = this.portsOn("top");
		const row = Math.max(this.block.header?.height ?? 0, tops.length > 0 ? PORT : 0);
		const channelTop = this.insets.top + row;
		const columnsTop = channelTop + this.headRoom(top);
		// Every column's first card stands on one line, as newspaper columns do,
		// whatever ports and channel a column keeps above it.
		const heads = this.columns.map((column) => firstCardTop(this.laid.get(column.id)!));
		const lowest = Math.max(...heads);
		this.columns.forEach((column, index) => {
			const { width, height } = this.laid.get(column.id)!;
			const y = columnsTop + lowest - heads[index]!;
			this.boxes.set(column.id, { x: this.columnX[index]!, y, width, height });
		});
		const channelBottom = Math.max(
			...this.columns.map((column) => {
				const box = this.boxes.get(column.id)!;
				return box.y + box.height;
			}),
		);
		for (const port of tops) this.boxes.set(port, this.portBox(port, this.insets.top + row / 2));
		this.placeBottomPorts(channelBottom, bottom);
		return { top: channelTop, bottom: channelBottom };
	}

	/**
	 * Put the bottom ports under the channel below the columns.
	 * @param channelTop Where that channel starts.
	 * @param bottom The runs in it.
	 */
	placeBottomPorts(channelTop: number, bottom: Stacked): void {
		const ports = this.portsOn("bottom");
		const needed = bottom.count > 0 || ports.length > 0;
		const portsTop = channelTop + (needed ? channelHeight(bottom.count) : 0);
		for (const port of ports) this.boxes.set(port, this.portBox(port, portsTop));
	}

	/**
	 * An own port's box.
	 * @param port The port.
	 * @param y Its top.
	 * @returns Its box.
	 */
	portBox(port: string, y: number): Box {
		return { x: this.portX.get(port)! - PORT / 2, y, width: PORT, height: PORT };
	}

	/**
	 * The box a line end stands on: its own box, or its column's.
	 * @param end The line end.
	 * @param column Its column, or -1.
	 * @returns The box.
	 */
	standOn(end: string, column: number): Box {
		return this.boxes.get(end) ?? this.boxes.get(this.columns[column]!.id)!;
	}

	/**
	 * The height of a course's track in one channel, if it turns there.
	 * @param course The course.
	 * @param stacked That channel's runs.
	 * @param top Where that channel starts.
	 * @returns The height.
	 */
	trackOf(course: Course, stacked: Stacked, top: number): number | undefined {
		const unit = stacked.units.get(course);
		return unit === undefined ? undefined : top + TRACK_TOP + stacked.tracks.get(unit)! * LANE;
	}

	/**
	 * Draw one line of the folded block, from its source-side end.
	 * @param course Its course.
	 * @param top The runs above the columns.
	 * @param bottom The runs below them.
	 * @param rows Where each channel starts.
	 */
	draw(course: Course, top: Stacked, bottom: Stacked, rows: Rows): void {
		const { line } = course;
		const upper = this.standOn(line.tail, course.from);
		const leaves = { x: this.endX(line.tail), y: upper.y + upper.height };
		const enters = { x: this.endX(line.head), y: this.standOn(line.head, course.to).y };
		const high = this.trackOf(course, top, rows.top);
		const low = this.trackOf(course, bottom, rows.bottom);
		const points =
			course.kind === "over"
				? overPoints(leaves, enters, course.lane, low!, high!)
				: turnPoints(leaves, enters, course.kind === "down" ? high : low);
		this.lines.set(line.key, line.from === line.tail ? points : points.toReversed());
	}

	/**
	 * Lay the folded block out.
	 * @returns The laid-out block.
	 */
	lay(): Laid {
		const courses = [...this.block.lines.values()].map((line) => this.courseOf(line));
		const gutters = this.gutters(courses);
		const right = this.placeColumns(gutters);
		this.lanes(courses, gutters);
		this.placePorts(courses, "top", right);
		this.placePorts(courses, "bottom", right);
		const top = this.stack(courses, "top");
		const bottom = this.stack(courses, "bottom");
		const rows = this.stackRows(top, bottom);
		for (const course of courses) this.draw(course, top, bottom, rows);
		const boxes = [...this.boxes.values()];
		const header = this.block.header?.width ?? 0;
		const ended = this.portsOn("bottom").length > 0;
		return {
			width: Math.max(header, ...boxes.map((one) => one.x + one.width)) + this.insets.side,
			height:
				Math.max(...boxes.map((one) => one.y + one.height)) + (ended ? 0 : this.insets.bottom),
			boxes: this.boxes,
			lines: this.lines,
			bands: [],
		};
	}
}

/**
 * A line from one column over to a later one: down to its track under the
 * columns, along to its lane, up the gutter, along the channel above the
 * columns, and down into the later column.
 * @param leaves Where it leaves its column.
 * @param enters Where it enters the later one.
 * @param lane Its lane's x.
 * @param low Its track under the columns.
 * @param high Its track above them.
 * @returns Its points.
 */
function overPoints(
	leaves: Point,
	enters: Point,
	lane: number,
	low: number,
	high: number,
): Point[] {
	return [
		leaves,
		{ x: leaves.x, y: low },
		{ x: lane, y: low },
		{ x: lane, y: high },
		{ x: enters.x, y: high },
		enters,
	];
}

/**
 * A line that drops, turning once on its track when its ends are not in line.
 * @param leaves Where it leaves.
 * @param enters Where it enters.
 * @param track Its track, if it turns.
 * @returns Its points.
 */
function turnPoints(leaves: Point, enters: Point, track: number | undefined): Point[] {
	if (track === undefined) return [leaves, enters];
	return [leaves, { x: leaves.x, y: track }, { x: enters.x, y: track }, enters];
}

export { FoldLayout };

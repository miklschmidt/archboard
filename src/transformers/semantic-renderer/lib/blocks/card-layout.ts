// A block of cards laid out on its own. Graphviz ranks and orders its cards,
// its labels, its header and its ports; the track router then draws every
// line inside it on tracks in the channels between its ranks, growing each
// channel to fit, so the block's size is final when this answers.
import type { ElkExtendedEdge, ElkLabel, ElkNode } from "@archboard/elk-rs";
import type { Graph, Subgraph, Viz } from "@viz-js/viz";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import type { Band, Insets, Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import {
	headerOf,
	type Block,
	type BlockTree,
	type Line,
	type Size,
} from "@/transformers/semantic-renderer/lib/blocks/tree";
import {
	box,
	centresOf,
	numbers,
	outputSchema,
	polylinePoints,
} from "@/transformers/semantic-renderer/lib/track/graphviz";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import { TRACK_POLYLINE } from "@/transformers/semantic-renderer/lib/track/placement";
import { routeScene, trunkKind } from "@/transformers/semantic-renderer/lib/track/route";
import { Scene } from "@/transformers/semantic-renderer/lib/track/scene";

/** Horizontal room Graphviz keeps between neighbours in a rank. */
const NODE_GAP = 40;
/** Vertical room Graphviz keeps between ranks; the router spaces ranks again from its tracks. */
const RANK_GAP = 28;
/** The side of a port's square. */
const PORT = 1;

/** A Graphviz node. */
type VendorNode = NonNullable<Graph["nodes"]>[number];

/**
 * An empty Graphviz graph with the block settings.
 * @returns The vendor graph.
 */
function emptyGraph(): Graph & Required<Pick<Graph, "nodes" | "edges" | "subgraphs">> {
	return {
		directed: true,
		graphAttributes: {
			rankdir: "TB",
			splines: "polyline",
			nodesep: NODE_GAP / 72,
			ranksep: RANK_GAP / 72,
			pad: 0,
			margin: 0,
		},
		nodeAttributes: { shape: "box", fixedsize: true, label: "", margin: 0 },
		edgeAttributes: { dir: "none" },
		nodes: [],
		edges: [],
		subgraphs: [],
	};
}

/**
 * A line's label box, where Graphviz put it.
 * @param id The line's id.
 * @param label The measured label.
 * @param centre Where Graphviz centred its box.
 * @returns The placed label.
 */
function placedLabel(id: string, label: ElkLabel, centre: Point): ElkLabel {
	const width = label.width!;
	const height = label.height!;
	return { id: `${id}:label`, width, height, x: centre.x - width / 2, y: centre.y - height / 2 };
}

/**
 * A line's points run onto the block's wall: its last point when it leaves
 * by a wall, its first when it enters by one.
 * @param points The line's points, from its source.
 * @param walls The walls it leaves or enters by.
 * @param walls.leaves The wall it leaves by, if any.
 * @param walls.enters The wall it enters by, if any.
 * @param width The block's width.
 * @returns The moved points, or nothing when the line meets no wall.
 */
function walledPoints(
	points: readonly Point[],
	walls: { leaves: "left" | "right" | undefined; enters: "left" | "right" | undefined },
	width: number,
): Point[] | undefined {
	if (walls.leaves !== undefined)
		return [
			...points.slice(0, -1),
			{ x: walls.leaves === "left" ? 0 : width, y: points.at(-1)!.y },
		];
	if (walls.enters !== undefined)
		return [{ x: walls.enters === "left" ? 0 : width, y: points[0]!.y }, ...points.slice(1)];
	return undefined;
}

/** One block of cards' layout, from its Graphviz graph to its routed lines. */
class CardLayout {
	readonly graph = emptyGraph();

	/**
	 * Start a block's layout.
	 * @param block The block.
	 * @param laid The blocks laid out so far; a folded block's columns hold the ones inside them.
	 * @param tree The blocks.
	 * @param insets The block's insets.
	 * @param lowered How many rows each item a wide rank wraps is set below its place.
	 */
	constructor(
		readonly block: Block,
		readonly laid: ReadonlyMap<string, Laid>,
		readonly tree: BlockTree,
		readonly insets: Insets,
		readonly lowered: ReadonlyMap<string, number> = new Map(),
	) {}

	/**
	 * The vendor node a line end stands on: a pin stands on its child block.
	 * @param end The line end.
	 * @returns The vendor node's name.
	 */
	vendorOf(end: string): string {
		if (this.walled(end)) return `stub:${end}`;
		return this.tree.pins.get(end)?.block.id ?? end;
	}

	/**
	 * Whether a line end is one of the block's ports on a side wall.
	 * @param end The line end.
	 * @returns True for a port on the left or right wall.
	 */
	walled(end: string): boolean {
		const side = this.block.ports.get(end);
		return side === "left" || side === "right";
	}

	/**
	 * Where a line end stands in the scene: a port a line enters by from a
	 * wall stands on its stub, one rank above.
	 * @param end The line end.
	 * @returns The scene item's id.
	 */
	sceneEnd(end: string): string {
		return this.walled(end) ? `stub:${end}` : end;
	}

	/**
	 * The size of a vendor node.
	 * @param name The vendor node.
	 * @returns Its size.
	 */
	sizeOf(name: string): Size {
		if (name === headerOf(this.block)) return this.block.header!;
		if (name.startsWith("port:") || name.startsWith("stub:")) return { width: PORT, height: PORT };
		return this.laid.get(name) ?? this.tree.cards.get(name)!;
	}

	/**
	 * A vendor node of the size its item has.
	 * @param name The vendor node.
	 * @returns The vendor node.
	 */
	nodeOf(name: string): VendorNode {
		const { width, height } = this.sizeOf(name);
		return box(name, width, height);
	}

	/**
	 * Build the block's Graphviz graph: its items, its header and top ports
	 * alone on the first rank with the header leftmost, its bottom ports alone
	 * on the last, and every line through its label's box.
	 */
	build(): void {
		const { block, graph } = this;
		graph.nodes.push(...block.items.map((item) => this.nodeOf(item)));
		const header = block.header === undefined ? [] : [headerOf(block)];
		const tops = [...block.ports].filter(([, side]) => side === "top").map(([port]) => port);
		const bottoms = [...block.ports].filter(([, side]) => side === "bottom").map(([port]) => port);
		const first: Subgraph = {
			graphAttributes: { rank: "source" },
			nodes: [...header, ...tops].map((name) => this.nodeOf(name)),
			edges: header.flatMap((tail) =>
				tops.map((head) => ({ tail, head, attributes: { style: "invis" } })),
			),
		};
		const last: Subgraph = {
			graphAttributes: { rank: "sink" },
			nodes: bottoms.map((name) => this.nodeOf(name)),
		};
		graph.subgraphs.push(...[first, last].filter(({ nodes }) => nodes!.length > 0));
		const entering = [...block.lines.values()].filter((line) => this.entersBy(line) !== undefined);
		const stubs = new Set(entering.map(({ from }) => this.vendorOf(from)));
		graph.nodes.push(...[...stubs].map((stub) => box(stub, PORT, PORT)));
		for (const line of block.lines.values())
			if (this.wallOf(line) === undefined) this.connect(line);
	}

	/**
	 * The wall a line leaves the block by, when its port is on one.
	 * @param line The line.
	 * @returns The wall, or nothing for a line Graphviz ranks.
	 */
	wallOf(line: Line): "left" | "right" | undefined {
		const side = this.block.ports.get(line.to);
		return side === "left" || side === "right" ? side : undefined;
	}

	/**
	 * The wall a line enters the block by, when its port is on one.
	 * @param line The line.
	 * @returns The wall, or nothing.
	 */
	entersBy(line: Line): "left" | "right" | undefined {
		const side = this.block.ports.get(line.from);
		return side === "left" || side === "right" ? side : undefined;
	}

	/**
	 * Connect one line, through its label's box when it carries the label here.
	 * @param line The line.
	 */
	connect(line: Line): void {
		const tail = this.vendorOf(line.tail);
		const head = this.vendorOf(line.head);
		const label = line.labelled ? line.edge.labels?.[0] : undefined;
		const id = line.key;
		// A wrapped item sits a row of cards and its labels lower for each row it is lowered.
		const minlen = 1 + 2 * (this.lowered.get(head) ?? 0);
		if (label === undefined) {
			this.graph.edges.push({ tail, head, attributes: { id, minlen } });
			return;
		}
		const name = `label:${line.edge.id}`;
		this.graph.nodes.push(box(name, label.width!, label.height!));
		this.graph.edges.push(
			{ tail, head: name, attributes: { id: `${id}:1`, minlen } },
			{ tail: name, head, attributes: { id: `${id}:2` } },
		);
	}

	/**
	 * Lay the block out and route its lines.
	 * @param viz The initialized Graphviz instance.
	 * @returns The laid-out block.
	 */
	lay(viz: Viz): Laid {
		this.build();
		const output = outputSchema.parse(viz.renderJSON(this.graph, { yInvert: true }));
		const [left, low, right, high] = numbers(output.bb);
		const origin = { x: Math.min(left!, right!), y: Math.min(low!, high!) };
		const polylines = new Map<string, string[]>();
		for (const { id, pos } of output.edges)
			if (id !== undefined && pos !== undefined) polylines.set(id, polylinePoints(pos, origin));
		const placed = this.placed(centresOf(output, origin), polylines);
		const scene = new Scene(placed);
		const lines = routeScene(
			scene,
			placed.edges.map((edge) => {
				const line = this.block.lines.get(edge.id)!;
				const wall = this.wallOf(line);
				const enters = this.entersBy(line);
				return {
					id: edge.id,
					order: Number(edge.layoutOptions?.["archboard.order"] ?? 0),
					kind: trunkKind(edge),
					placed: edge,
					...(wall === undefined ? {} : { wall }),
					...(enters === undefined ? {} : { enters }),
				};
			}),
			this.insets.side,
			this.insets.top,
		);
		return this.read(scene, lines);
	}

	/**
	 * Read the routed scene back into the laid-out block.
	 * @param scene The routed scene.
	 * @param lines Every line's points.
	 * @returns The laid-out block.
	 */
	read(scene: Scene, lines: ReadonlyMap<string, Point[]>): Laid {
		const { side, bottom } = this.insets;
		const boxes = new Map<string, Box>();
		for (const [id, item] of scene.cards) boxes.set(id, scene.moved(item, side));
		for (const [id, item] of scene.labels) boxes.set(`label:${id}`, scene.moved(item, side));
		const bands: Band[] = scene.bands.map((band, index) => ({
			top: band.newTop,
			bottom: band.newTop + band.bottom - band.top,
			items: this.block.items.filter((item) => scene.cards.get(item)?.band === index),
		}));
		const all = [...boxes.values()];
		const width = Math.max(
			this.block.header?.width ?? 0,
			...all.map((one) => one.x + one.width + side),
		);
		const walled = new Map(lines);
		const tracks = this.wallLines(walled, boxes, width);
		return {
			width,
			height: Math.max(...all.map((one) => one.y + one.height), ...tracks) + bottom,
			boxes,
			lines: walled,
			bands,
		};
	}

	/**
	 * Run every line to a wall onto the block's own wall, and stand its port there.
	 * @param lines Every line's points, the lines to a wall ending on their tracks; those are replaced.
	 * @param boxes Every box, to which the side ports are added.
	 * @param width The block's width.
	 * @returns The height of every such line's track, which the block must hold.
	 */
	wallLines(lines: Map<string, Point[]>, boxes: Map<string, Box>, width: number): number[] {
		return [...this.block.lines.values()].flatMap((line) => {
			const points = lines.get(line.key);
			const leaves = this.wallOf(line);
			const enters = this.entersBy(line);
			if (points === undefined) return [];
			const moved = walledPoints(points, { leaves, enters }, width);
			if (moved === undefined) return [];
			lines.set(line.key, moved);
			const end = leaves === undefined ? moved[0]! : moved.at(-1)!;
			const port = leaves === undefined ? line.from : line.to;
			boxes.set(port, { x: end.x - PORT / 2, y: end.y - PORT / 2, width: PORT, height: PORT });
			return [end.y + LANE];
		});
	}

	/**
	 * The block as the track scene reads it: its items, header, ports and pins
	 * as cards, and its lines as placed relationships.
	 * @param centres Every vendor node's centre.
	 * @param polylines Every vendor edge's polyline, by id.
	 * @returns The placed block.
	 */
	placed(
		centres: ReadonlyMap<string, Point>,
		polylines: ReadonlyMap<string, string[]>,
	): ElkNode & { edges: ElkExtendedEdge[] } {
		const named = [
			...this.graph.nodes.map(({ name }) => name).filter((name) => !name.startsWith("label:")),
			...this.graph.subgraphs.flatMap(({ nodes }) => (nodes ?? []).map(({ name }) => name)),
		];
		const children: ElkNode[] = named.map((id) => {
			const { width, height } = this.sizeOf(id);
			const centre = centres.get(id)!;
			return { id, x: centre.x - width / 2, y: centre.y - height / 2, width, height };
		});
		const ends = [...this.block.lines.values()].flatMap(({ from, to }) => [from, to]);
		for (const pin of new Set(ends.filter((end) => this.tree.pins.has(end))))
			children.push(this.pinned(pin, centres));
		const edges = [...this.block.lines.values()].map((line) =>
			this.placedLine(line, centres, polylines),
		);
		return { id: this.block.id, children, edges };
	}

	/**
	 * A pin as the scene reads it: a sliver as tall as its child block, at its port's x.
	 * @param pin The pin.
	 * @param centres Every vendor node's centre.
	 * @returns The placed pin.
	 */
	pinned(pin: string, centres: ReadonlyMap<string, Point>): ElkNode {
		const { block: child, port } = this.tree.pins.get(pin)!;
		const inner = this.laid.get(child.id)!;
		const at = inner.boxes.get(port)!;
		const centre = centres.get(child.id)!;
		const x = centre.x - inner.width / 2 + at.x + at.width / 2;
		const y = centre.y - inner.height / 2;
		return { id: pin, x: x - PORT / 2, y, width: PORT, height: inner.height };
	}

	/**
	 * One line as a placed relationship.
	 * @param line The line.
	 * @param centres Every vendor node's centre.
	 * @param polylines Every vendor edge's polyline, by id.
	 * @returns The placed relationship.
	 */
	placedLine(
		line: Line,
		centres: ReadonlyMap<string, Point>,
		polylines: ReadonlyMap<string, string[]>,
	): ElkExtendedEdge {
		const id = line.key;
		const label = line.labelled ? line.edge.labels?.[0] : undefined;
		const legs = label === undefined ? [id] : [`${id}:1`, `${id}:2`];
		const through = legs.flatMap((leg) => polylines.get(leg) ?? []);
		return {
			id,
			sources: [this.sceneEnd(line.from)],
			targets: [this.sceneEnd(line.to)],
			labels:
				label === undefined ? [] : [placedLabel(id, label, centres.get(`label:${line.edge.id}`)!)],
			layoutOptions: { ...line.edge.layoutOptions, [TRACK_POLYLINE]: through.join(" ") },
		};
	}
}

export { CardLayout };

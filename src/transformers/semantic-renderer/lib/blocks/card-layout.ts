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
import { TRACK_POLYLINE } from "@/transformers/semantic-renderer/lib/track/placement";
import { routeScene } from "@/transformers/semantic-renderer/lib/track/route";
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
 * The kind two lines must share to share a trunk: kind and standing.
 * @param edge The relationship a line draws.
 * @returns The kind.
 */
function trunkKind(edge: ElkExtendedEdge): string {
	const options = edge.layoutOptions ?? {};
	const kind = options["archboard.relationship.kind"] ?? "";
	return `${kind}|${options["archboard.relationship.standing"] ?? "unchanged"}`;
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

/** One block of cards' layout, from its Graphviz graph to its routed lines. */
class CardLayout {
	readonly graph = emptyGraph();

	/**
	 * Start a block's layout.
	 * @param block The block.
	 * @param laid The blocks laid out so far; a folded block's columns hold the ones inside them.
	 * @param tree The blocks.
	 * @param insets The block's insets.
	 */
	constructor(
		readonly block: Block,
		readonly laid: ReadonlyMap<string, Laid>,
		readonly tree: BlockTree,
		readonly insets: Insets,
	) {}

	/**
	 * The vendor node a line end stands on: a pin stands on its child block.
	 * @param end The line end.
	 * @returns The vendor node's name.
	 */
	vendorOf(end: string): string {
		return this.tree.pins.get(end)?.block.id ?? end;
	}

	/**
	 * The size of a vendor node.
	 * @param name The vendor node.
	 * @returns Its size.
	 */
	sizeOf(name: string): Size {
		if (name === headerOf(this.block)) return this.block.header!;
		if (name.startsWith("port:")) return { width: PORT, height: PORT };
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
		for (const line of block.lines.values()) this.connect(line);
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
		if (label === undefined) {
			this.graph.edges.push({ tail, head, attributes: { id } });
			return;
		}
		const name = `label:${line.edge.id}`;
		this.graph.nodes.push(box(name, label.width!, label.height!));
		this.graph.edges.push(
			{ tail, head: name, attributes: { id: `${id}:1` } },
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
			placed.edges.map((edge) => ({
				id: edge.id,
				order: Number(edge.layoutOptions?.["archboard.order"] ?? 0),
				kind: trunkKind(edge),
				placed: edge,
			})),
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
		return {
			width: Math.max(this.block.header?.width ?? 0, ...all.map((one) => one.x + one.width + side)),
			height: Math.max(...all.map((one) => one.y + one.height)) + bottom,
			boxes,
			lines,
			bands,
		};
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
			sources: [line.from],
			targets: [line.to],
			labels:
				label === undefined ? [] : [placedLabel(id, label, centres.get(`label:${line.edge.id}`)!)],
			layoutOptions: { ...line.edge.layoutOptions, [TRACK_POLYLINE]: through.join(" ") },
		};
	}
}

export { CardLayout };

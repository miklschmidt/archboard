// A block of cards laid out on its own. Graphviz ranks and orders its cards,
// its labels, its header and its ports; the track router then draws every
// line inside it on tracks in the channels between its ranks, growing each
// channel to fit, so the block's size is final when this answers.
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { Edge, Subgraph, Viz } from "@viz-js/viz";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	emptyGraph,
	placedLabel,
	walledPoints,
	type VendorNode,
} from "@/transformers/semantic-renderer/lib/blocks/card-graph";
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
	boxesOf,
	centresOf,
	nodesIn,
	numbers,
	outputSchema,
	polylinePoints,
	type Join,
} from "@/transformers/semantic-renderer/lib/track/graphviz";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import { routeScene, trunkKind } from "@/transformers/semantic-renderer/lib/track/route";
import { frameShapes, regionShapes } from "@/transformers/semantic-renderer/lib/track/containers";
import { Clusters, isTitle, titleOf } from "@/transformers/semantic-renderer/lib/blocks/clusters";
import { gridEdges, wrapEdges } from "@/transformers/semantic-renderer/lib/track/grid";
import { anchored } from "@/transformers/semantic-renderer/lib/track/score";
import {
	Scene,
	TRACK_POLYLINE,
	TRACK_REGIONS,
} from "@/transformers/semantic-renderer/lib/track/scene";

/** The side of a port's square. */
const PORT = 1;

/** How a block is arranged beyond Graphviz's own ranking. */
interface Arrangement {
	/** How many rows each item a wide rank wraps is set below its place. */
	readonly lowered?: ReadonlyMap<string, number>;
	/** Whether the cards no line touches are set out as a grid. */
	readonly grid?: boolean;
	/** Whether a wrap's rows keep their columns, each lowered card under the one above it. */
	readonly columns?: boolean;
	/**
	 * Whether a container a line from another container enters is held below
	 * the line's source, so containers in a chain stack.
	 */
	readonly stacked?: boolean;
}

/** One block of cards' layout, from its Graphviz graph to its routed lines. */
class CardLayout {
	readonly graph = emptyGraph();
	/** The containers and regions the block draws inline. */
	readonly clusters: Clusters;
	/** How the block is arranged beyond Graphviz's own ranking. */
	readonly arranged: Required<Arrangement>;

	/**
	 * Start a block's layout.
	 * @param block The block.
	 * @param laid The blocks laid out so far; a folded block's columns hold the ones inside them.
	 * @param tree The blocks.
	 * @param insets The block's insets.
	 * @param options How the block is arranged beyond Graphviz's own ranking.
	 */
	constructor(
		readonly block: Block,
		readonly laid: ReadonlyMap<string, Laid>,
		readonly tree: BlockTree,
		readonly insets: Insets,
		options: Arrangement = {},
	) {
		this.arranged = { lowered: new Map(), grid: false, columns: false, stacked: false, ...options };
		this.clusters = new Clusters(block, this.graph);
		// Ranks cross the clusters a block draws inline, as one board; a block
		// without any keeps Graphviz's own ranking, which holds its header alone
		// on the first rank.
		if (block.clusters.size > 0)
			this.graph.graphAttributes = { ...this.graph.graphAttributes, newrank: true };
	}

	/**
	 * The vendor node a line end stands on: a pin stands on its child block.
	 * @param end The line end.
	 * @returns The vendor node's name.
	 */
	vendorOf(end: string): string {
		if (this.walled(end)) return `stub:${end}`;
		if (this.block.clusters.has(end)) return titleOf(end);
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
		const title = this.clusters.sizeOf(name);
		if (title !== undefined) return title;
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
		// The header is ranked as a sliver: it stands in the corner once placed.
		return box(name, name === headerOf(this.block) ? PORT : width, height);
	}

	/**
	 * Build the block's Graphviz graph: its items, its header and top ports
	 * alone on the first rank with the header leftmost, its bottom ports alone
	 * on the last, and every line through its label's box.
	 */
	build(): void {
		const { block, graph } = this;
		for (const item of block.items) this.clusters.holderOf(item).nodes.push(this.nodeOf(item));
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
		for (const line of this.boardOrder()) this.connect(line);
		this.arrange();
	}

	/**
	 * Every line Graphviz ranks, by where its ends stand in the board's order,
	 * a container at its first member. Graphviz meets cards in the order it
	 * meets their lines, and keeps that order where no other reads better:
	 * interchangeable cards then stand as the board lists them.
	 * @returns The lines.
	 */
	boardOrder(): Line[] {
		const place = new Map(this.block.items.map((item, index) => [item, index]));
		for (const [index, item] of this.block.items.entries())
			for (let around = this.block.clusterOf.get(item); around !== undefined;) {
				const title = titleOf(around);
				place.set(title, Math.min(place.get(title) ?? index, index));
				around = this.block.clusterOf.get(around);
			}
		return [...this.block.lines.values()]
			.filter((line) => this.wallOf(line) === undefined)
			.map((line) => ({
				line,
				tail: place.get(this.vendorOf(line.tail)) ?? -1,
				head: place.get(this.vendorOf(line.head)) ?? -1,
			}))
			.toSorted((one, other) => one.tail - other.tail || one.head - other.head)
			.map(({ line }) => line);
	}

	/**
	 * Hold the block's items where its clusters, a grid or a wrap put them:
	 * every title above its cluster's members, loose cards in a grid, and a
	 * wrapped item a row of cards and its labels below the rank's first row for
	 * each row it is lowered.
	 */
	arrange(): void {
		const { graph } = this;
		const { grid: gridded, stacked } = this.arranged;
		const grid = gridded ? this.looseCards().flatMap((cards) => gridEdges(cards)) : [];
		const links = this.links();
		const lower = new Set(grid.map(({ head }) => head));
		graph.edges.push(
			...grid,
			...this.clusters.titleEdges(lower, links),
			...(stacked ? this.clusters.enteringEdges(links) : []),
			...this.wrapHolds(),
		);
	}

	/**
	 * The invisible edges that hold a wrap's lowered cards down: each under
	 * the card above it in its column when the rows keep their columns, and
	 * one no line or column reaches by the first card of the rank's first row.
	 * @returns The edges.
	 */
	wrapHolds(): Edge[] {
		const { lowered, columns } = this.arranged;
		const held = columns ? wrapEdges(lowered) : [];
		const arriving = new Set(
			[...this.block.lines.values()].map((line) => this.vendorOf(line.head)),
		);
		for (const { head } of held) arriving.add(head);
		return [
			...held,
			...anchored(lowered, arriving).map(({ card, rows, anchor }) => ({
				tail: anchor,
				head: card,
				attributes: { style: "invis", minlen: 2 * rows, weight: 0 },
			})),
		];
	}

	/**
	 * Every line Graphviz ranks, between the vendor nodes it joins.
	 * @returns Each line's upper end, lower end, whether a label sits between,
	 * its label's box and the edges that draw it.
	 */
	links(): (Join & { labelled: boolean })[] {
		return [...this.block.lines.values()]
			.filter((line) => this.wallOf(line) === undefined)
			.map((line) => ({
				tail: this.vendorOf(line.tail),
				head: this.vendorOf(line.head),
				labelled: line.labelled && (line.edge.labels?.length ?? 0) > 0,
				label: `label:${line.edge.id}`,
				legs: [line.key, `${line.key}:1`, `${line.key}:2`],
			}));
	}

	/**
	 * Whether stacking would change the block: some line runs from one inline
	 * container into another.
	 * @returns True when it would.
	 */
	stacks(): boolean {
		return this.clusters.enteringEdges(this.links()).length > 0;
	}

	/**
	 * The block's cards no line touches, in the board's order, with their
	 * sizes, by the cluster that holds them.
	 * @returns Each cluster's loose cards.
	 */
	looseCards(): { id: string; width: number; height: number }[][] {
		const touched = new Set(
			[...this.block.lines.values()].flatMap((line) => [
				this.vendorOf(line.tail),
				this.vendorOf(line.head),
			]),
		);
		const loose = new Map<string | undefined, { id: string; width: number; height: number }[]>();
		for (const item of this.block.items) {
			if (this.tree.blocks.has(item) || touched.has(item)) continue;
			const around = this.block.clusterOf.get(item);
			loose.set(around, [...(loose.get(around) ?? []), { id: item, ...this.sizeOf(item) }]);
		}
		return [...loose.values()];
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
		const minlen = 1 + 2 * (this.arranged.lowered.get(head) ?? 0);
		const weight = this.clusters.weightOf(tail, head);
		if (label === undefined) {
			this.graph.edges.push({ tail, head, attributes: { id, minlen, weight } });
			return;
		}
		const name = `label:${line.edge.id}`;
		this.graph.edges.push(
			...this.clusters.holdLabel(tail, head, box(name, label.width!, label.height!)),
			{ tail, head: name, attributes: { id: `${id}:1`, minlen, weight } },
			{ tail: name, head, attributes: { id: `${id}:2`, weight } },
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
		const [centres, clusters] = [centresOf(output, origin), this.clusters.boxes(output, origin)];
		this.clusters.lineUp(this.links(), centres, {
			boxes: boxesOf(nodesIn(this.graph), centres),
			clusters,
			polylines,
			width: Math.abs(right! - left!),
		});
		const placed = this.placed(centres, polylines, clusters);
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
		return this.read(scene, lines, new Map(placed.edges.map((edge) => [edge.id, edge])));
	}

	/**
	 * Read the routed scene back into the laid-out block.
	 * @param scene The routed scene.
	 * @param lines Every line's points.
	 * @param edges Every placed line, by key.
	 * @returns The laid-out block.
	 */
	read(
		scene: Scene,
		lines: ReadonlyMap<string, Point[]>,
		edges: ReadonlyMap<string, ElkExtendedEdge>,
	): Laid {
		const { side, bottom } = this.insets;
		const boxes = new Map<string, Box>();
		for (const [id, item] of scene.cards) boxes.set(id, scene.moved(item, side));
		for (const [id, item] of scene.labels) boxes.set(`label:${id}`, scene.moved(item, side));
		const bands: Band[] = scene.bands.map((band, index) => ({
			top: band.newTop,
			bottom: band.newTop + band.bottom - band.top,
			items: this.block.items.filter((item) => scene.cards.get(item)?.band === index),
		}));
		const frames = frameShapes(scene, edges, side);
		const regions = regionShapes(scene, edges, side);
		const walled = new Map(lines);
		const reach = [
			...boxes.values(),
			...frames.map((frame) => frame.box),
			...regions.map((region) => region.box),
			...this.innerPoints(walled).map(({ x, y }) => ({ x, y, width: 0, height: 0 })),
		];
		const width = Math.max(
			this.block.header?.width ?? 0,
			...reach.map((one) => one.x + one.width + side),
		);
		const tracks = this.wallLines(walled, boxes, width);
		return {
			width,
			height: Math.max(...reach.map((one) => one.y + one.height), ...tracks) + bottom,
			boxes,
			lines: walled,
			bands,
			frames,
			regions,
		};
	}

	/**
	 * Every point the lines of a block inside the board draw, which its parent
	 * must route around: all but the end where a line to or from a wall meets
	 * the wall, which stands where the block ends. The board's own lines are
	 * fitted on the page when it is drawn.
	 * @param lines Every line's points.
	 * @returns The points.
	 */
	innerPoints(lines: ReadonlyMap<string, Point[]>): Point[] {
		if (this.block.kind === "root") return [];
		return [...this.block.lines.values()].flatMap((line) => {
			const points = lines.get(line.key) ?? [];
			if (this.wallOf(line) !== undefined) return points.slice(0, -1);
			return this.entersBy(line) === undefined ? points : points.slice(1);
		});
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
	 * @param clusters Every inline cluster's box.
	 * @returns The placed block.
	 */
	placed(
		centres: ReadonlyMap<string, Point>,
		polylines: ReadonlyMap<string, string[]>,
		clusters: ReadonlyMap<string, Box>,
	): ElkNode & { edges: ElkExtendedEdge[] } {
		const named = nodesIn(this.graph)
			.map(({ name }) => name)
			.filter((name) => !name.startsWith("label:") && !isTitle(name));
		const leaves: ElkNode[] = named.map((id) => {
			const { width, height } = this.sizeOf(id);
			const centre = centres.get(id)!;
			return { id, x: centre.x - width / 2, y: centre.y - height / 2, width, height };
		});
		const ends = [...this.block.lines.values()].flatMap(({ from, to }) => [from, to]);
		for (const pin of new Set(ends.filter((end) => this.tree.pins.has(end))))
			leaves.push(this.pinned(pin, centres));
		this.cornerHeader(leaves);
		const edges = [...this.block.lines.values()].map((line) =>
			this.placedLine(line, centres, polylines),
		);
		const { children, regions } = this.clusters.nest(leaves, centres, clusters);
		return { id: this.block.id, children, edges, layoutOptions: { [TRACK_REGIONS]: regions } };
	}

	/**
	 * Stand the header in the block's top-left corner, over what the block
	 * holds, and every port on its rank right of it a lane apart. Graphviz ranks the
	 * header as a sliver, so it pushes neither the ports nor the cards under
	 * them right by its width.
	 * @param leaves Every placed leaf; the header's and the top ports' move in place.
	 */
	cornerHeader(leaves: ElkNode[]): void {
		const header = leaves.find(({ id }) => id === headerOf(this.block));
		if (header === undefined) return;
		header.x = Math.min(...leaves.filter((leaf) => leaf !== header).map(({ x }) => x!));
		/**
		 * Whether a leaf stands on the header's rank.
		 * @param leaf The leaf.
		 * @returns True when some of its height is the header's.
		 */
		const beside = (leaf: ElkNode): boolean =>
			leaf !== header && leaf.y! < header.y! + header.height! && header.y! < leaf.y! + leaf.height!;
		const tops = leaves.filter(beside).toSorted((one, other) => one.x! - other.x!);
		let free = header.x + header.width! + LANE;
		for (const port of tops) {
			port.x = Math.max(port.x!, free);
			free = port.x + port.width! + LANE;
		}
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

export { CardLayout, type Arrangement };

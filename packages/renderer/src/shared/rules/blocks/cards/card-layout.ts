// A block of cards laid out on its own. Graphviz ranks and orders its cards,
// its labels, its header and its ports; the track router then draws every
// line inside it on tracks in the channels between its ranks, growing each
// channel to fit, so the block's size is final when this answers.
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { Edge, Subgraph } from "@viz-js/viz";
import type { Graphviz } from "#shared/rules/blocks/cards/graphviz-once.ts";
import type { Box, Point } from "#shared/rules/geometry.ts";
import {
	emptyGraph,
	heldEdges,
	holdSinks,
	holdSources,
	placedLabel,
	type VendorNode,
} from "#shared/rules/blocks/cards/card-graph.ts";
import type { Band, Insets, Laid } from "#shared/rules/blocks/tree/laid.ts";
import {
	PORT,
	cornerHeader,
	leavesOf,
	markRegions,
	pinnedLeaf,
	rimOf,
	settledLeaf,
} from "#shared/rules/blocks/folds/leaves.ts";
import {
	headerOf,
	type Block,
	type BlockTree,
	type Line,
	type Size,
} from "#shared/rules/blocks/tree/tree.ts";
import {
	box,
	boxesOf,
	centresOf,
	nodesIn,
	numbers,
	outputSchema,
	polylinePoints,
	type Join,
} from "#shared/rules/track/scene/graphviz.ts";
import { FROM_POINTS } from "#shared/rules/layout/compound-graph.ts";
import { routeScene, trunkKind } from "#shared/rules/track/routes/route.ts";
import { fitSides } from "#shared/rules/track/routes/sides.ts";
import { Clusters, isTitle, titleOf } from "#shared/rules/blocks/cards/clusters.ts";
import { frameShape } from "#shared/rules/blocks/tree/lone.ts";
import { takenIndex, type TakenHeader } from "#shared/rules/blocks/cards/headers.ts";
import { leavingPull } from "#shared/rules/blocks/cards/leaving.ts";
import { gridEdges, wrapEdges } from "#shared/rules/track/channels/grid.ts";
import { anchored, lapsOf } from "#shared/rules/track/scene/score.ts";
import {
	besidePoints,
	besideWalls,
	entersBy,
	innerPoints,
	labelledOut,
	markBesides,
	ranks,
	itemsOf,
	wallLines,
	wallsOf,
} from "#shared/rules/blocks/packing/walls.ts";
import { Scene, TRACK_POLYLINE, TRACK_REGIONS } from "#shared/rules/track/scene/scene.ts";

/** How a block is arranged beyond Graphviz's own ranking. */
interface Arrangement {
	/** How many rows each item a wide rank wraps is set below its place. */
	readonly lowered?: ReadonlyMap<string, number>;
	/** Whether the cards no line touches are set out as a grid. */
	readonly grid?: boolean;
	/**
	 * Whether a wrap's rows keep their columns, each lowered card under the
	 * one above it: always for a wrap of three rows or more on the track engine.
	 */
	readonly columns?: boolean;
	/**
	 * Whether a container a line from another container enters is held below
	 * the line's source, so containers in a chain stack.
	 */
	readonly stacked?: boolean;
}

/**
 * The Graphviz port a line asks to leave its source by: a line out of a
 * flowchart's decision asks to stand under its own point of the card
 * (`shared/rules/track/routes/points.ts`).
 * @param line The line.
 * @param tail Where Graphviz starts it.
 * @returns The attribute, or none.
 */
function leavingPoint(line: Line, tail: string): { tailport?: string } {
	const point = line.edge.layoutOptions?.[FROM_POINTS];
	return point === undefined || tail !== line.edge.sources[0] ? {} : { tailport: point };
}

/** One block of cards' layout, from its Graphviz graph to its routed lines. */
class CardLayout {
	readonly graph = emptyGraph();
	/** The containers and regions the block draws inline. */
	readonly clusters: Clusters;
	/** How the block is arranged beyond Graphviz's own ranking. */
	readonly arranged: Required<Arrangement>;
	/** The size its header took once Graphviz laid it out, if it has one (`headers.ts`). */
	taken: TakenHeader | undefined;

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
		// Ranks cross the clusters a block draws inline, as one board; a block without
		// any keeps Graphviz's own ranking, which holds its header alone on the first rank.
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
		for (const item of itemsOf(this.tree, block))
			this.clusters.holderOf(item).nodes.push(this.nodeOf(item));
		const header = block.header === undefined ? [] : [headerOf(block)];
		const tops = [...block.ports].filter(([, side]) => side === "top").map(([port]) => port);
		const bottoms = [...block.ports].filter(([, side]) => side === "bottom").map(([port]) => port);
		const first: Subgraph = {
			graphAttributes: { rank: "source" },
			nodes: [...header, ...tops].map((name) => this.nodeOf(name)),
			edges: [
				...header.flatMap((tail) =>
					tops.map((head) => ({ tail, head, attributes: { style: "invis" } })),
				),
				...heldEdges(this.tree, block, "top"),
			],
		};
		const last: Subgraph = {
			graphAttributes: { rank: "sink" },
			nodes: bottoms.map((name) => this.nodeOf(name)),
			edges: heldEdges(this.tree, block, "bottom"),
		};
		graph.subgraphs.push(...[first, last].filter(({ nodes }) => nodes!.length > 0));
		// Ranked across clusters, an outermost title held by nothing shared the
		// header's rank, and a region's caption stood over its containers' titles.
		for (const { id, parent } of block.clusters.values())
			if (parent === undefined)
				graph.edges.push(
					...header.map((tail) => ({ tail, head: titleOf(id), attributes: { style: "invis" } })),
				);
		const stubs = new Set(
			[...block.lines.values()].flatMap((line) => [
				...(entersBy(block, line) === undefined ? [] : [this.vendorOf(line.from)]),
				...(labelledOut(block, line) === undefined ? [] : [this.vendorOf(line.to)]),
			]),
		);
		graph.nodes.push(...[...stubs].map((stub) => box(stub, PORT, PORT)));
		for (const line of this.clusters.boardOrder((end) => this.vendorOf(end))) this.connect(line);
		this.arrange();
	}

	/**
	 * Hold the block's items where its clusters, a grid, a wrap or an interface put
	 * them: titles above their members, loose cards in a grid, a wrapped item a row
	 * of cards and its labels lower per row, hidden parts below entry points.
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
		this.clusters.untie(graph.edges);
		holdSources(this.block, this.graph, (name) => this.nodeOf(name));
		holdSinks(this.block, this.graph);
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
	 * @param endOf What an end is named by: its vendor node, unless told otherwise.
	 * @returns Each line's upper end, lower end, whether a label sits between,
	 * its label's box and the edges that draw it.
	 */
	links(endOf = (end: string): string => this.vendorOf(end)): (Join & { labelled: boolean })[] {
		return [...this.block.lines.values()]
			.filter((line) => ranks(this.block, line))
			.map((line) => ({
				tail: endOf(line.tail),
				head: endOf(line.head),
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
		const leaves = leavingPoint(line, tail);
		if (label === undefined) {
			this.graph.edges.push({ tail, head, attributes: { id, minlen, weight, ...leaves } });
			return;
		}
		const name = `label:${line.edge.id}`;
		const down = weight + leavingPull(this.clusters, tail, head);
		this.graph.edges.push(
			...this.clusters.holdLabel(tail, head, box(name, label.width!, label.height!), this.links()),
			{ tail, head: name, attributes: { id: `${id}:1`, minlen, weight, ...leaves } },
			{ tail: name, head, attributes: { id: `${id}:2`, weight: down } },
		);
	}

	/**
	 * Lay the block out and route its lines.
	 * @param viz The initialized Graphviz instance.
	 * @returns The laid-out block.
	 */
	lay(viz: Graphviz): Laid {
		const { placed, centres } = this.lined(viz);
		const laid = this.routed(placed, 0);
		return { ...laid, reroute: this.rerouted.bind(this, placed, laid.width, centres) };
	}

	/**
	 * The block ranked by Graphviz and lined up, its lines not yet routed:
	 * where every item stands across the block is settled here, and routing
	 * only opens the room between its ranks.
	 * @param viz The initialized Graphviz instance.
	 * @returns The placed block, every vendor node's centre, and every vendor node's box.
	 */
	lined(viz: Graphviz): {
		placed: ElkNode & { edges: ElkExtendedEdge[] };
		centres: ReadonlyMap<string, Point>;
		boxes: ReadonlyMap<string, Box>;
	} {
		this.build();
		// JSON without the drawing operations Graphviz's `json` format adds,
		// which nothing reads: the same layout in about a seventh less time.
		const answer = viz.renderString(this.graph, { yInvert: true, format: "json0" });
		const output = outputSchema.parse(JSON.parse(answer));
		const [left, low, right, high] = numbers(output.bb);
		const origin = { x: Math.min(left!, right!), y: Math.min(low!, high!) };
		const polylines = new Map<string, string[]>();
		for (const { id, pos } of output.edges)
			if (id !== undefined && pos !== undefined) polylines.set(id, polylinePoints(pos, origin));
		const [centres, clusters] = [centresOf(output, origin), this.clusters.boxes(output, origin)];
		const boxes = boxesOf(nodesIn(this.graph), centres);
		for (const pin of this.pins()) boxes.set(pin, pinnedLeaf(this.tree, this.laid, pin, centres));
		// A line from a child block is lined up where it leaves the block, at its pin.
		const atPins = this.links((end) => (this.tree.pins.has(end) ? end : this.vendorOf(end)));
		const width = Math.abs(right! - left!);
		this.clusters.lineUp(atPins, centres, {
			boxes,
			clusters,
			polylines,
			width,
			cards: this.tree.cards,
			lowered: this.arranged.lowered,
		});
		return { placed: this.placed(centres, polylines, clusters), centres, boxes };
	}

	/**
	 * Route the placed block's lines on tracks and read it back.
	 * @param placed The placed block.
	 * @param held The width the block keeps at least.
	 * @returns The laid-out block.
	 */
	routed(placed: ElkNode & { edges: ElkExtendedEdge[] }, held: number): Laid {
		const scene = new Scene(placed);
		markRegions(scene, this.block, this.tree);
		const beside = besideWalls(this.block, this.tree, scene);
		const straight = new Set(beside.map(({ key }) => key));
		markBesides(scene, beside);
		const lines = routeScene(
			scene,
			placed.edges
				.filter((edge) => !straight.has(edge.id))
				.map((edge) => {
					const line = this.block.lines.get(edge.id)!;
					return {
						id: edge.id,
						order: Number(edge.layoutOptions?.["archboard.order"] ?? 0),
						kind: trunkKind(edge),
						placed: edge,
						...wallsOf(this.block, line),
					};
				}),
			this.insets.side,
			this.insets.top,
			rimOf(this.block, this.insets),
		);
		for (const [key, points] of besidePoints(scene, beside, this.insets.side))
			lines.set(key, points);
		return this.read(scene, lines, new Map(placed.edges.map((edge) => [edge.id, edge])), held);
	}

	/**
	 * The block routed again with some of its ports moved along their edges,
	 * where its parent settled them, and every pin on a block inside it where
	 * that block's settled port now stands, and every block inside it as large
	 * as it was routed again ({@link settledLeaf}); Graphviz does not rank it
	 * again, and it keeps its width.
	 * @param placed The placed block; its ports', pins' and blocks' leaves move in place.
	 * @param held The block's width.
	 * @param centres Every vendor node's centre.
	 * @param ports Each moved port's x, in the block's own coordinates.
	 * @returns The laid-out block.
	 */
	rerouted(
		placed: ElkNode & { edges: ElkExtendedEdge[] },
		held: number,
		centres: ReadonlyMap<string, Point>,
		ports: ReadonlyMap<string, number>,
	): Laid {
		for (const leaf of leavesOf(placed.children ?? [])) {
			const x = ports.get(leaf.id);
			if (x !== undefined) leaf.x = x - this.insets.side - leaf.width! / 2;
			else Object.assign(leaf, settledLeaf(this.tree, this.laid, leaf.id, centres));
		}
		return this.routed(placed, held);
	}

	/**
	 * Read the routed scene back into the laid-out block.
	 * @param scene The routed scene.
	 * @param lines Every line's points.
	 * @param edges Every placed line, by key.
	 * @param held The width the block keeps at least.
	 * @returns The laid-out block.
	 */
	read(
		scene: Scene,
		lines: ReadonlyMap<string, Point[]>,
		edges: ReadonlyMap<string, ElkExtendedEdge>,
		held: number,
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
		const { frames: drawn, regions } = fitSides(scene, edges, lines, side);
		const walled = new Map(lines);
		const reach = [
			...boxes.values(),
			...drawn.map((frame) => frame.box),
			...regions.map((region) => region.box),
			...innerPoints(this.block, walled).map(({ x, y }) => ({ x, y, width: 0, height: 0 })),
		];
		const width = Math.max(
			held,
			this.block.header?.width ?? 0,
			...reach.map((one) => one.x + one.width + side),
		);
		const tracks = wallLines(this.block, walled, boxes, width);
		const laps = lapsOf(walled.values(), [...boxes.values()]);
		return {
			laps,
			width,
			height: Math.max(...reach.map((one) => one.y + one.height), ...tracks) + bottom,
			boxes,
			lines: walled,
			bands,
			frames: drawn.map((shape) => frameShape(shape, this.block.clusters.get(shape.id)?.lone)),
			regions,
			...takenIndex(this.taken),
		};
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
			const { height } = this.sizeOf(id);
			const width = this.clusters.widths.get(id) ?? this.sizeOf(id).width;
			const centre = centres.get(id)!;
			return { id, x: centre.x - width / 2, y: centre.y - height / 2, width, height };
		});
		for (const pin of this.pins()) leaves.push(pinnedLeaf(this.tree, this.laid, pin, centres));
		this.taken = cornerHeader(leaves, this.block, this.insets.side);
		const edges = [...this.block.lines.values()].map((line) =>
			this.placedLine(line, centres, polylines),
		);
		const { children, regions } = this.clusters.nest(leaves, centres, clusters);
		return { id: this.block.id, children, edges, layoutOptions: { [TRACK_REGIONS]: regions } };
	}

	/**
	 * Every pin a line of the block ends on.
	 * @returns The pins.
	 */
	pins(): Set<string> {
		const ends = [...this.block.lines.values()].flatMap(({ from, to }) => [from, to]);
		return new Set(ends.filter((end) => this.tree.pins.has(end)));
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

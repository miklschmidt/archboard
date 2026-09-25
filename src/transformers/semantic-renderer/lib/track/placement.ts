// Placement for the track engine (TASK-349), run where the layout engines run.
//
// Graphviz ranks and orders every card across containers and places it; every
// relationship label is a box of its own in the rank between its ends, so a
// label always has room on its line; each relationship's polyline says where
// it passes the ranks between its ends. Relationships that close a cycle are
// handed over reversed, in the board's own order, so Graphviz never breaks a
// cycle itself and never puts a label box beyond the card it stands before.
// Nothing here routes: the track router (`route.ts`) draws every line.
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { Graph, Subgraph, Viz } from "@viz-js/viz";
import { z } from "zod";
import { CONTAINER_INSET } from "@/transformers/semantic-renderer/config";
import {
	GROUP_CAPTIONS,
	PLACING_GROUP,
} from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import { semanticOrder } from "@/transformers/semantic-renderer/lib/layout/semantic-order";
import {
	box,
	centresOf,
	numbers,
	outputSchema,
	polylinePoints,
	type Output,
} from "@/transformers/semantic-renderer/lib/track/graphviz";

/** Horizontal room Graphviz keeps between neighbours in a rank, in diagram points. */
const TRACK_NODE_GAP = 40;
/** Vertical room Graphviz keeps between ranks; the router spaces ranks again from its tracks. */
const TRACK_RANK_GAP = 28;

/** The layout option that carries a relationship's polyline, as `x,y` pairs separated by spaces. */
const TRACK_POLYLINE = "archboard.track.polyline";
/** The layout option on a frame that carries its title row's box, as `x,y,width,height`. */
const TRACK_TITLE = "archboard.track.title";
/** The root layout option that carries every group region, as JSON `PlacedRegion` rows. */
const TRACK_REGIONS = "archboard.track.regions";
/** Room a group region keeps around its members. */
const REGION_INSET = 14;

const BoxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
/** A group region as placement answers it. */
const PlacedRegionSchema = z.object({
	group: z.string(),
	parent: z.string().optional(),
	members: z.array(z.string()),
	box: BoxSchema,
	caption: BoxSchema,
});
type PlacedRegion = z.infer<typeof PlacedRegionSchema>;
/** Each placing group's caption size, as `[id, width, height]` rows. */
const CaptionsSchema = z.array(z.tuple([z.string(), z.number(), z.number()]));

type Cluster = Subgraph & Required<Pick<Subgraph, "nodes" | "edges" | "subgraphs">>;
type Point = { readonly x: number; readonly y: number };

/**
 * The header height a frame asked for.
 * @param node The frame.
 * @returns Its header height.
 */
function headerOf(node: ElkNode): number {
	return Number(node.layoutOptions?.["archboard.header.size"] ?? 0);
}

/**
 * An empty graph with the track engine's placement settings.
 * @returns The vendor graph.
 */
function emptyGraph(): Graph & Cluster {
	return {
		directed: true,
		graphAttributes: {
			newrank: true,
			compound: true,
			rankdir: "TB",
			splines: "polyline",
			nodesep: TRACK_NODE_GAP / 72,
			ranksep: TRACK_RANK_GAP / 72,
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

/** A depth-first walk that finds the relationships closing a cycle. */
class CycleWalk {
	readonly back = new Set<string>();
	readonly state = new Map<string, "open" | "done">();

	/**
	 * A walk over the relationships leaving each vendor node.
	 * @param out The relationships leaving each vendor node.
	 * @param vendorName The vendor node standing for a semantic endpoint.
	 */
	constructor(
		readonly out: ReadonlyMap<string, readonly ElkExtendedEdge[]>,
		readonly vendorName: (id: string) => string,
	) {}

	/**
	 * Walk from one vendor node, unless the walk has been there.
	 * @param name The vendor node.
	 */
	from(name: string): void {
		if (this.state.has(name)) return;
		this.state.set(name, "open");
		for (const edge of this.out.get(name) ?? []) {
			const head = this.vendorName(edge.targets[0]!);
			if (this.state.get(head) === "open") this.back.add(edge.id);
			else this.from(head);
		}
		this.state.set(name, "done");
	}
}

/** One conversion of the measured hierarchy into a Graphviz graph and back. */
class TrackPlacement {
	readonly result: ElkNode;
	readonly graph = emptyGraph();
	/** Semantic node by id. */
	readonly nodes = new Map<string, ElkNode>();
	/** The cluster each vendor node sits in. */
	readonly parents = new Map<string, Cluster>();
	/** The cluster each cluster sits in. */
	readonly enclosing = new Map<Cluster, Cluster>();
	/** Frames by id. */
	readonly frames = new Map<string, ElkNode>();
	/** Group regions by their vendor key, with their members and caption size. */
	readonly regions = new Map<
		string,
		{
			group: string;
			parent: string | undefined;
			members: string[];
			size: readonly [number, number];
		}
	>();
	/** Each placing group's caption size. */
	readonly captions: ReadonlyMap<string, readonly [number, number]>;
	/** Group region clusters by vendor name. */
	readonly regionClusters = new Map<string, Cluster>();

	/**
	 * Start from a copy, so the caller's graph is never changed.
	 * @param input The measured hierarchy with every label measured.
	 * @param lowered How many rows each card a wide rank wraps is set below its place.
	 */
	constructor(
		input: ElkNode,
		readonly lowered: ReadonlyMap<string, number> = new Map(),
	) {
		this.result = structuredClone(input);
		const rows = CaptionsSchema.parse(JSON.parse(input.layoutOptions?.[GROUP_CAPTIONS] ?? "[]"));
		this.captions = new Map(rows.map(([id, width, height]) => [id, [width, height] as const]));
	}

	/**
	 * Add one parent's children, gathering those a group places into its region.
	 * @param children The children, in the board's order.
	 * @param parent The cluster they sit in.
	 * @param parentId The container they sit in; absent on the board.
	 */
	visitChildren(children: readonly ElkNode[], parent: Cluster, parentId: string | undefined): void {
		for (const child of children) {
			const group = child.layoutOptions?.[PLACING_GROUP];
			this.visit(
				child,
				group === undefined ? parent : this.regionFor(group, parent, parentId, child),
			);
		}
	}

	/**
	 * The region cluster a group has in one parent, made on first use with a
	 * caption row held above every member.
	 * @param group The placing group.
	 * @param parent The parent's cluster.
	 * @param parentId The container; absent on the board.
	 * @param member The member being placed.
	 * @returns The region's cluster.
	 */
	regionFor(
		group: string,
		parent: Cluster,
		parentId: string | undefined,
		member: ElkNode,
	): Cluster {
		const key = `${parentId ?? "board"}__${group}`;
		const name = `cluster_region_${key}`;
		let cluster = this.regionClusters.get(name);
		if (cluster === undefined) {
			cluster = {
				name,
				graphAttributes: { margin: REGION_INSET },
				nodes: [],
				edges: [],
				subgraphs: [],
			};
			this.regionClusters.set(name, cluster);
			parent.subgraphs.push(cluster);
			this.enclosing.set(cluster, parent);
			const size = this.captions.get(group) ?? [1, 1];
			this.regions.set(key, { group, parent: parentId, members: [], size });
			this.parents.set(`caption_${key}`, cluster);
			cluster.nodes.push(box(`caption_${key}`, size[0], size[1]));
		}
		this.regions.get(key)!.members.push(member.id);
		this.graph.edges.push({
			tail: `caption_${key}`,
			head: member.children?.length ? `title_${member.id}` : member.id,
			attributes: { style: "invis", weight: 10 },
		});
		return cluster;
	}

	/**
	 * Add a card, or a frame with its children.
	 * @param node The measured node.
	 * @param parent The cluster it sits in.
	 */
	visit(node: ElkNode, parent: Cluster): void {
		this.nodes.set(node.id, node);
		if (node.children?.length) this.addFrame(node, parent);
		else this.addCard(node, parent);
	}

	/**
	 * Add a card as a fixed-size box.
	 * @param node The card.
	 * @param parent The cluster it sits in.
	 */
	addCard(node: ElkNode, parent: Cluster): void {
		this.parents.set(node.id, parent);
		parent.nodes.push(box(node.id, node.width!, node.height!));
	}

	/**
	 * Add a frame as a cluster whose title row stands above every child.
	 * @param node The frame.
	 * @param parent The cluster it sits in.
	 */
	addFrame(node: ElkNode, parent: Cluster): void {
		const cluster: Cluster = {
			name: `cluster_${node.id}`,
			graphAttributes: { margin: CONTAINER_INSET },
			nodes: [],
			edges: [],
			subgraphs: [],
		};
		parent.subgraphs.push(cluster);
		this.enclosing.set(cluster, parent);
		this.frames.set(node.id, node);
		const title = `title_${node.id}`;
		this.parents.set(title, cluster);
		cluster.nodes.push(box(title, node.width!, Math.max(1, headerOf(node))));
		const children = node.children!.toSorted(
			(one, other) => semanticOrder(one) - semanticOrder(other),
		);
		this.visitChildren(children, cluster, node.id);
		const captions = [...this.regions]
			.filter(([, region]) => region.parent === node.id)
			.map(([key]) => `caption_${key}`);
		for (const head of [...children.map((child) => this.vendorName(child.id)), ...captions]) {
			this.graph.edges.push({ tail: title, head, attributes: { style: "invis", weight: 10 } });
		}
	}

	/**
	 * The vendor node standing for a semantic endpoint: a frame is reached at its title row.
	 * @param id The semantic node.
	 * @returns Its vendor name.
	 */
	vendorName(id: string): string {
		return this.frames.has(id) ? `title_${id}` : id;
	}

	/**
	 * The clusters a vendor node sits in, innermost first.
	 * @param name The vendor node.
	 * @returns Its clusters, below the root.
	 */
	clustersOf(name: string): Cluster[] {
		const clusters: Cluster[] = [];
		let at = this.parents.get(name);
		while (at !== undefined && at !== this.graph) {
			clusters.push(at);
			at = this.enclosing.get(at);
		}
		return clusters;
	}

	/**
	 * The innermost cluster holding both vendor nodes.
	 * @param one A vendor node.
	 * @param other Another vendor node.
	 * @returns Their common cluster.
	 */
	common(one: string, other: string): Cluster {
		const theirs = new Set(this.clustersOf(other));
		return this.clustersOf(one).find((cluster) => theirs.has(cluster)) ?? this.graph;
	}

	/**
	 * The relationships that close a cycle, found depth-first from the cards
	 * nothing points at, in the board's own order.
	 * @param edges Every relationship to place.
	 * @returns The ids of the relationships to hand over reversed.
	 */
	backEdges(edges: readonly ElkExtendedEdge[]): Set<string> {
		const out = new Map<string, ElkExtendedEdge[]>();
		const incoming = new Set<string>();
		for (const edge of edges) {
			const tail = this.vendorName(edge.sources[0]!);
			out.set(tail, [...(out.get(tail) ?? []), edge]);
			incoming.add(this.vendorName(edge.targets[0]!));
		}
		const ordered = [...this.nodes.keys()].map((id) => this.vendorName(id));
		const walk = new CycleWalk(out, (id) => this.vendorName(id));
		for (const root of ordered.filter((name) => !incoming.has(name))) walk.from(root);
		for (const rest of ordered) walk.from(rest);
		return walk.back;
	}

	/**
	 * The vendor ends of a relationship, reversed when it closes a cycle.
	 * @param edge The relationship.
	 * @param back The relationships that close a cycle.
	 * @returns Its tail and head.
	 */
	endsOf(edge: ElkExtendedEdge, back: ReadonlySet<string>): [string, string] {
		const from = this.vendorName(edge.sources[0]!);
		const to = this.vendorName(edge.targets[0]!);
		return back.has(edge.id) ? [to, from] : [from, to];
	}

	/**
	 * Connect a relationship, through its label's own box when it has words.
	 * @param edge The measured relationship.
	 * @param back The relationships that close a cycle.
	 */
	connect(edge: ElkExtendedEdge, back: ReadonlySet<string>): void {
		const [tail, head] = this.endsOf(edge, back);
		const label = edge.labels?.[0];
		// A wrapped card sits a row of cards and its labels lower for each row it is lowered.
		const rows = this.lowered.get(head) ?? 0;
		const attributes = rows === 0 ? {} : { attributes: { minlen: 1 + 2 * rows } };
		if (label === undefined) {
			this.graph.edges.push({ tail, head, ...attributes });
			return;
		}
		const name = `label_${edge.id}`;
		this.common(tail, head).nodes.push(box(name, label.width!, label.height!));
		this.graph.edges.push({ tail, head: name, ...attributes }, { tail: name, head });
	}

	/**
	 * Lay the graph out and write every position back.
	 * @param viz The initialized Graphviz instance.
	 * @returns The placed hierarchy.
	 */
	place(viz: Viz): ElkNode {
		this.visitChildren(
			(this.result.children ?? []).toSorted(
				(one, other) => semanticOrder(one) - semanticOrder(other),
			),
			this.graph,
			undefined,
		);
		const edges = (this.result.edges ?? []).filter((edge) => edge.sources[0] !== edge.targets[0]);
		const back = this.backEdges(edges);
		for (const edge of edges) this.connect(edge, back);
		const output = outputSchema.parse(viz.renderJSON(this.graph, { yInvert: true }));
		const [left, top, right, bottom] = numbers(output.bb);
		const origin = { x: Math.min(left!, right!), y: Math.min(top!, bottom!) };
		const centres = centresOf(output, origin);
		this.writeNodes(centres);
		this.writeFrames(output, centres, origin);
		this.writeRegions(output, centres, origin);
		this.writeEdges(edges, back, { output, centres, origin });
		return {
			...this.result,
			x: 0,
			y: 0,
			width: Math.abs(right! - left!),
			height: Math.abs(bottom! - top!),
		};
	}

	/**
	 * Give every card its box.
	 * @param centres Every vendor node's centre.
	 */
	writeNodes(centres: ReadonlyMap<string, Point>): void {
		for (const [id, node] of this.nodes) {
			const centre = centres.get(id);
			if (centre !== undefined)
				Object.assign(node, { x: centre.x - node.width! / 2, y: centre.y - node.height! / 2 });
		}
	}

	/**
	 * Give every frame Graphviz's cluster box and its title row.
	 * @param output What Graphviz answered.
	 * @param centres Every vendor node's centre.
	 * @param origin Where the drawing starts.
	 */
	writeFrames(output: Output, centres: ReadonlyMap<string, Point>, origin: Point): void {
		for (const [id, node] of this.frames) {
			const cluster = output.objects.find((object) => object.name === `cluster_${id}`);
			if (cluster?.bb !== undefined) {
				const [x1, y1, x2, y2] = numbers(cluster.bb);
				Object.assign(node, {
					x: Math.min(x1!, x2!) - origin.x,
					y: Math.min(y1!, y2!) - origin.y,
					width: Math.abs(x2! - x1!),
					height: Math.abs(y2! - y1!),
				});
			}
			// The title row spans the frame, whatever the title node's own centre.
			const centre = centres.get(`title_${id}`)!;
			const header = headerOf(node);
			node.layoutOptions = {
				...node.layoutOptions,
				[TRACK_TITLE]: [node.x, centre.y - header / 2, node.width!, header].join(","),
			};
		}
	}

	/**
	 * Write every group region's box and caption onto the root.
	 * @param output What Graphviz answered.
	 * @param centres Every vendor node's centre.
	 * @param origin Where the drawing starts.
	 */
	writeRegions(output: Output, centres: ReadonlyMap<string, Point>, origin: Point): void {
		const regions: PlacedRegion[] = [...this.regions].flatMap(([key, region]) => {
			const cluster = output.objects.find((object) => object.name === `cluster_region_${key}`);
			const centre = centres.get(`caption_${key}`);
			if (cluster?.bb === undefined || centre === undefined) return [];
			const [x1, y1, x2, y2] = numbers(cluster.bb);
			const [width, height] = region.size;
			return [
				{
					group: region.group,
					...(region.parent === undefined ? {} : { parent: region.parent }),
					members: region.members,
					box: [
						Math.min(x1!, x2!) - origin.x,
						Math.min(y1!, y2!) - origin.y,
						Math.abs(x2! - x1!),
						Math.abs(y2! - y1!),
					],
					caption: [centre.x - width / 2, centre.y - height / 2, width, height],
				},
			];
		});
		this.result.layoutOptions = {
			...this.result.layoutOptions,
			[TRACK_REGIONS]: JSON.stringify(regions),
		};
	}

	/**
	 * Give every relationship its label box and its polyline.
	 * @param edges Every placed relationship.
	 * @param back The relationships handed over reversed.
	 * @param answered What Graphviz answered, read into centres and an origin.
	 * @param answered.output What Graphviz answered.
	 * @param answered.centres Every vendor node's centre.
	 * @param answered.origin Where the drawing starts.
	 */
	writeEdges(
		edges: readonly ElkExtendedEdge[],
		back: ReadonlySet<string>,
		answered: { output: Output; centres: ReadonlyMap<string, Point>; origin: Point },
	): void {
		const polylines = polylinesOf(answered.output, answered.origin);
		for (const edge of edges) {
			const [tail, head] = this.endsOf(edge, back);
			const label = edge.labels?.[0];
			const name = `label_${edge.id}`;
			const legs =
				label === undefined
					? [[tail, head]]
					: [
							[tail, name],
							[name, head],
						];
			if (label !== undefined) {
				const centre = answered.centres.get(name)!;
				Object.assign(label, { x: centre.x - label.width! / 2, y: centre.y - label.height! / 2 });
			}
			const through = legs.flatMap(([from, to]) => polylines.get(`${from}>${to}`) ?? []);
			edge.layoutOptions = { ...edge.layoutOptions, [TRACK_POLYLINE]: through.join(" ") };
		}
	}
}

/**
 * Every Graphviz edge's polyline, by its vendor ends.
 * @param output What Graphviz answered.
 * @param origin Where the drawing starts.
 * @returns The polylines, keyed `tail>head`.
 */
function polylinesOf(output: Output, origin: Point): Map<string, string[]> {
	const polylines = new Map<string, string[]>();
	for (const edge of output.edges) {
		if (edge.pos === undefined) continue;
		const tail = output.objects[edge.tail]!.name;
		const head = output.objects[edge.head]!.name;
		polylines.set(`${tail}>${head}`, polylinePoints(edge.pos, origin));
	}
	return polylines;
}

export { PlacedRegionSchema, TRACK_POLYLINE, TRACK_REGIONS, TRACK_TITLE, TrackPlacement };

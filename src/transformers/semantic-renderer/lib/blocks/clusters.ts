// Containers and group regions a block of cards draws inline (TASK-349). Each
// is a Graphviz cluster of the block's own layout, headed by its title row or
// its region's caption, which invisible edges hold above every member no line
// inside the cluster already holds; so the board's cards are ranked across
// containers, as the track engine ranks them.
// After Graphviz answers, the clusters are read back into the shape the track
// scene reads: every frame a node around its members with its title row, and
// every region on the block's root.
import type { ElkNode } from "@archboard/elk-rs";
import type { Edge, Graph, Subgraph } from "@viz-js/viz";
import {
	ARCHITECTURE_HEADER_PADDING,
	CONTAINER_INSET,
} from "@/transformers/semantic-renderer/config";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import type { Block, Size } from "@/transformers/semantic-renderer/lib/blocks/tree";
import {
	anchorOf,
	enteredFrame,
	type Link,
} from "@/transformers/semantic-renderer/lib/blocks/anchors";
import { NODE_GAP, titleOf } from "@/transformers/semantic-renderer/lib/blocks/card-graph";
import {
	alignColumns,
	box,
	numbers,
	type Join,
	type Output,
} from "@/transformers/semantic-renderer/lib/track/graphviz";
import { TRACK_TITLE } from "@/transformers/semantic-renderer/lib/track/scene";

/** Room a group region keeps around its members. */
const REGION_INSET = 14;
/** The room a card moved into line keeps from its neighbours: half what Graphviz keeps. */
const LINED_UP_GAP = 20;
/** How strongly a title row holds each member below it. */
const TITLE_WEIGHT = 10;

/** A Graphviz node. */
type VendorNode = NonNullable<Graph["nodes"]>[number];

/** A Graphviz cluster that holds nodes and further clusters. */
type Nested = Subgraph & Required<Pick<Subgraph, "nodes" | "subgraphs">>;

/** Something nodes can be put in: the block's graph or one of its clusters. */
interface Holder {
	readonly nodes: VendorNode[];
}

/**
 * Whether a vendor node heads a cluster.
 * @param name The vendor node.
 * @returns True for a title row or caption.
 */
function isTitle(name: string): boolean {
	return name.startsWith("title:");
}

/**
 * How much harder a graph's edges pull each vendor node down than up: the
 * weight of its edges down less the weight of its edges up.
 * @param edges The graph's edges.
 * @returns The pull, by vendor node.
 */
function pullsDown(edges: readonly Edge[]): Map<string, number> {
	const pulls = new Map<string, number>();
	for (const { tail, head, attributes } of edges) {
		const weight = Number(attributes?.["weight"] ?? 1);
		pulls.set(tail, (pulls.get(tail) ?? 0) + weight);
		pulls.set(head, (pulls.get(head) ?? 0) - weight);
	}
	return pulls;
}

/** Which vendor nodes Graphviz must rank below which, as edges are added. */
class Below {
	readonly next = new Map<string, string[]>();

	/**
	 * Record that one vendor node ranks below another.
	 * @param tail The upper node.
	 * @param head The lower node.
	 */
	add(tail: string, head: string): void {
		this.next.set(tail, [...(this.next.get(tail) ?? []), head]);
	}

	/**
	 * Whether one vendor node leads down to another.
	 * @param from Where to start.
	 * @param target Where to arrive.
	 * @returns True when it does.
	 */
	reaches(from: string, target: string): boolean {
		const seen = new Set<string>();
		const open = [from];
		while (open.length > 0) {
			const at = open.pop()!;
			if (at === target) return true;
			if (!seen.has(at)) open.push(...(this.next.get(at) ?? []));
			seen.add(at);
		}
		return false;
	}
}

/** A block's inline clusters, in its Graphviz graph and read back from it. */
class Clusters {
	readonly graphs = new Map<string, Nested>();
	/** Each Graphviz cluster's name, by the cluster it draws. */
	readonly names = new Map<string, string>();
	/** The width of each card evened with the card over or under it. */
	readonly widths = new Map<string, number>();
	/** Whether a title pulled up as hard as down is left tied, for Graphviz to break. */
	keepTies = false;
	/** Whether some title was pulled up as hard as down. */
	tied = false;
	/** Whether the label of a line leaving a container is pulled onto its lower end. */
	pullsLeaving = false;
	/** Whether the label of a line entering a container is held below a line from inside it. */
	anchorsLabels = false;

	/**
	 * Make every cluster of a block in its graph, each headed by its title.
	 * @param block The block.
	 * @param graph Its Graphviz graph.
	 */
	constructor(
		readonly block: Block,
		readonly graph: Holder & { readonly subgraphs: Subgraph[] },
	) {
		for (const [index, cluster] of [...block.clusters.values()].entries()) {
			const name = `cluster_${index}`;
			const inset = cluster.kind === "frame" ? CONTAINER_INSET : REGION_INSET;
			const title = box(titleOf(cluster.id), cluster.header.width, cluster.header.height);
			const made: Nested = {
				name,
				graphAttributes: { margin: inset },
				nodes: [title],
				subgraphs: [],
			};
			this.graphs.set(cluster.id, made);
			this.names.set(name, cluster.id);
			const parent = cluster.parent === undefined ? graph : this.graphs.get(cluster.parent)!;
			parent.subgraphs.push(made);
		}
	}

	/**
	 * The size of a cluster's title node.
	 * @param name The vendor node.
	 * @returns Its size, or nothing when it heads no cluster.
	 */
	sizeOf(name: string): Size | undefined {
		return isTitle(name) ? this.block.clusters.get(name.slice("title:".length))?.header : undefined;
	}

	/**
	 * Where a member's node goes: its innermost cluster, or the block's graph.
	 * @param member A card or other item of the block.
	 * @returns The holder.
	 */
	holderOf(member: string): Holder {
		const around = this.block.clusterOf.get(member);
		return around === undefined ? this.graph : this.graphs.get(around)!;
	}

	/**
	 * The clusters around a vendor node, innermost first: a title stands inside
	 * its own cluster, and ports, pins and headers inside none.
	 * @param vendor The vendor node.
	 * @returns The clusters' ids.
	 */
	around(vendor: string): string[] {
		const start = isTitle(vendor)
			? vendor.slice("title:".length)
			: this.block.clusterOf.get(vendor);
		const chain: string[] = [];
		for (let at = start; at !== undefined; at = this.block.clusters.get(at)?.parent) chain.push(at);
		return chain;
	}

	/**
	 * Where a label between two vendor nodes goes: their innermost shared cluster.
	 * @param one A vendor node.
	 * @param other Another.
	 * @returns The holder.
	 */
	common(one: string, other: string): Holder {
		const theirs = new Set(this.around(other));
		const shared = this.around(one).find((id) => theirs.has(id));
		return shared === undefined ? this.graph : this.graphs.get(shared)!;
	}

	/**
	 * Stand a line's label in its cluster: inside the innermost container its
	 * lower end stands in and its upper end does not, held below that
	 * container's title, so the label stands over the card it leads into
	 * rather than beside the container on a rank the container spans; else in
	 * the innermost cluster around both ends. A group region is no boundary a
	 * line must go round, so a label never moves into one. Where labels are
	 * anchored, it is held below a labelled line into the same card from
	 * inside the container instead (anchors.ts).
	 * @param tail The line's upper end.
	 * @param head Its lower end.
	 * @param label The label's node.
	 * @param links Every line Graphviz ranks.
	 * @returns The edge holding the label below its cluster's title, if it needs one.
	 */
	holdLabel(tail: string, head: string, label: VendorNode, links: readonly Link[]): Edge[] {
		const entered = enteredFrame(this, tail, head);
		if (entered === undefined) {
			this.common(tail, head).nodes.push(label);
			return [];
		}
		this.graphs.get(entered)!.nodes.push(label);
		const attributes = { style: "invis", weight: TITLE_WEIGHT };
		const upper = this.anchorsLabels ? anchorOf(this, tail, head, entered, links) : undefined;
		return [{ tail: upper ?? titleOf(entered), head: label.name, attributes }];
	}

	/**
	 * The vendor node a member of a cluster stands at: a nested cluster at its title.
	 * @param member The member.
	 * @returns Its vendor node.
	 */
	vendorOf(member: string): string {
		return this.block.clusters.has(member) ? titleOf(member) : member;
	}

	/**
	 * Whether a line holds its lower end below the title of the cluster that
	 * end is a member of: its upper end stands inside that cluster too.
	 * @param tail The line's upper end.
	 * @param head Its lower end.
	 * @returns True when it does.
	 */
	holds(tail: string, head: string): boolean {
		const member = isTitle(head) ? head.slice("title:".length) : head;
		const around = this.block.clusterOf.get(member);
		return around !== undefined && this.around(tail).includes(around);
	}

	/**
	 * Pull every title a little harder onto its members where it is pulled up
	 * exactly as hard as down: a nested title is a member of its parent, and
	 * when it holds one member, nothing else ranks it, so Graphviz would stand
	 * it on whichever rank between is least crowded, far above its members.
	 * One more on one of its edges down stands it on the rank just above them,
	 * and costs every other ranking just what it cost before.
	 * @param edges Every edge of the block's graph; a tied title's first edge down is made heavier, unless ties are kept.
	 */
	untie(edges: readonly Edge[]): void {
		const pulls = pullsDown(edges);
		const downs = [...this.block.clusters.keys()].flatMap((cluster) => {
			const title = titleOf(cluster);
			const down = edges.find(({ tail, attributes }) => tail === title && attributes?.["weight"]);
			return pulls.get(title) === 0 && down !== undefined ? [down] : [];
		});
		this.tied = downs.length > 0;
		if (this.keepTies) return;
		for (const down of downs)
			down.attributes = { ...down.attributes, weight: Number(down.attributes!["weight"]) + 1 };
	}

	/**
	 * How strongly a line pulls its lower end: one that holds it below its
	 * cluster's title, in place of the title's own edge, pulls as hard as that
	 * edge would, so the cluster stays as compact.
	 * @param tail The line's upper end.
	 * @param head Its lower end.
	 * @returns The line's weight.
	 */
	weightOf(tail: string, head: string): number {
		return this.holds(tail, head) ? TITLE_WEIGHT : 1;
	}

	/**
	 * The invisible edges that hold each title above its cluster's members. A
	 * member a line from inside its own cluster already holds below the title
	 * needs none: that edge would only pull it under the title, off the line.
	 * @param lower Members held down by something else, such as a grid.
	 * @param links Every line as Graphviz ranks it.
	 * @returns The edges.
	 */
	titleEdges(lower: ReadonlySet<string>, links: readonly { tail: string; head: string }[]): Edge[] {
		return [...this.block.clusterOf]
			.filter(([member]) => {
				const vendor = this.vendorOf(member);
				const held = links.some(({ tail, head }) => head === vendor && this.holds(tail, head));
				return !lower.has(member) && !held;
			})
			.map(([member, around]) => ({
				tail: titleOf(around),
				head: this.vendorOf(member),
				attributes: { style: "invis", weight: TITLE_WEIGHT },
			}));
	}

	/**
	 * The invisible edges that hold a container a line from another container
	 * enters below the line's source, so containers in a chain stack instead
	 * of stepping sideways where one's last rank and the next one's title would
	 * share a rank. A line from a card on its own adds none: holding containers
	 * below every such card drew the dogfood boards taller and more crossed.
	 * An edge that would close a loop, through the lines, the titles above
	 * their members and the edges already added, is left out: Graphviz would
	 * break the loop by turning some edge round, and a label would land beyond
	 * its own card.
	 * @param links Every line as Graphviz ranks it: its upper end, lower end, and whether a label sits between.
	 * @returns The edges.
	 */
	enteringEdges(links: readonly { tail: string; head: string; labelled: boolean }[]): Edge[] {
		const below = new Below();
		for (const { tail, head } of links) below.add(tail, head);
		for (const [member, around] of this.block.clusterOf)
			below.add(titleOf(around), this.vendorOf(member));
		return links.flatMap(({ tail, head, labelled }) =>
			this.entered(tail, head)
				.filter((cluster) => !below.reaches(titleOf(cluster), tail))
				.map((cluster) => {
					below.add(tail, titleOf(cluster));
					const attributes = { style: "invis", minlen: labelled ? 2 : 1, weight: 0 };
					return { tail, head: titleOf(cluster), attributes };
				}),
		);
	}

	/**
	 * The clusters a line from inside another cluster enters.
	 * @param tail The line's upper end.
	 * @param head Its lower end.
	 * @returns The clusters around the lower end and not around the upper; none when the upper end stands in no cluster.
	 */
	entered(tail: string, head: string): string[] {
		const theirs = new Set(this.around(tail));
		return theirs.size === 0 ? [] : this.around(head).filter((cluster) => !theirs.has(cluster));
	}

	/**
	 * The innermost cluster a vendor node stands in.
	 * @param name The vendor node.
	 * @returns The cluster's id, or nothing when it stands on the block itself.
	 */
	holding(name: string): string | undefined {
		return (
			this.block.clusterOf.get(name) ??
			[...this.graphs].find(([, graph]) => graph.nodes.some((node) => node.name === name))?.[0]
		);
	}

	/**
	 * The span a card or label may move in: inside its innermost cluster,
	 * clear of the cluster's inset, or inside the block.
	 * @param name The vendor node.
	 * @param boxes Every cluster's box.
	 * @param width The block's width.
	 * @returns The span, or nothing for any other vendor node, which stays.
	 */
	spanOf(
		name: string,
		boxes: ReadonlyMap<string, Box>,
		width: number,
	): { left: number; right: number } | undefined {
		if (!this.block.items.includes(name) && !name.startsWith("label:")) return undefined;
		const around = this.holding(name);
		if (around === undefined) return { left: 0, right: width };
		const inset =
			this.block.clusters.get(around)!.kind === "frame" ? CONTAINER_INSET : REGION_INSET;
		const bounds = boxes.get(around)!;
		return { left: bounds.x + inset, right: bounds.x + bounds.width - inset };
	}

	/**
	 * Line up the joined cards Graphviz stacked a few points out of one column
	 * (`alignColumns`): a card or label moves inside its cluster, or the
	 * block, and clear of the other clusters and the lines.
	 * @param joins Every line Graphviz ranks.
	 * @param centres Every vendor node's centre; the moved ones are replaced.
	 * @param placed Where Graphviz put everything.
	 * @param placed.boxes Every vendor node's box.
	 * @param placed.clusters Every cluster's box.
	 * @param placed.polylines Every vendor edge's polyline, by id.
	 * @param placed.width The block's width.
	 * @param placed.cards The block's cards, whose widths may be evened with the card over or under them.
	 * @param placed.lowered How far a wrap lowered each card of its rank; empty when none.
	 */
	lineUp(
		joins: readonly Join[],
		centres: Map<string, Point>,
		placed: {
			boxes: Map<string, Box>;
			clusters: ReadonlyMap<string, Box>;
			polylines: ReadonlyMap<string, readonly string[]>;
			width: number;
			cards: ReadonlyMap<string, unknown>;
			lowered: ReadonlyMap<string, number>;
		},
	): void {
		const { boxes, clusters, polylines, width, cards, lowered } = placed;
		for (const [id, at] of clusters) boxes.set(`cluster:${id}`, at);
		alignColumns(boxes, joins, {
			gap: LINED_UP_GAP,
			polylines,
			/**
			 * Where a card or label may move.
			 * @param name The vendor node.
			 * @returns Its span, or nothing when it stays.
			 */
			within: (name) => this.spanOf(name, clusters, width),
			/**
			 * Whether a vendor node is a card.
			 * @param name The vendor node.
			 * @returns True for a card.
			 */
			card: (name) => cards.has(name),
			wrap: {
				rows: lowered,
				/**
				 * The innermost cluster around a card.
				 * @param card The card.
				 * @returns The cluster, if any.
				 */
				around: (card) => this.block.clusterOf.get(card),
			},
			holds: {
				// A hold's chain is 2 points wide and keeps a node gap from the member it passes.
				slot: NODE_GAP + 2,
				/**
				 * The innermost cluster around a card.
				 * @param card The card.
				 * @returns The cluster, if any.
				 */
				around: (card) => this.block.clusterOf.get(card),
			},
		});
		for (const [name, at] of boxes) if (cards.has(name)) this.widths.set(name, at.width);
		for (const [name, { x, width: wide }] of boxes) {
			const centre = centres.get(name);
			if (centre !== undefined) centres.set(name, { x: x + wide / 2, y: centre.y });
		}
	}

	/**
	 * Every cluster's box, as Graphviz answered it.
	 * @param output What Graphviz answered.
	 * @param origin Where the drawing starts.
	 * @returns The boxes, by cluster.
	 */
	boxes(output: Output, origin: Point): Map<string, Box> {
		const boxes = new Map<string, Box>();
		for (const { name, bb } of output.objects) {
			const id = this.names.get(name);
			if (id === undefined || bb === undefined) continue;
			const [x1, y1, x2, y2] = numbers(bb);
			boxes.set(id, {
				x: Math.min(x1!, x2!) - origin.x,
				y: Math.min(y1!, y2!) - origin.y,
				width: Math.abs(x2! - x1!),
				height: Math.abs(y2! - y1!),
			});
		}
		return boxes;
	}

	/**
	 * The innermost frame around a cluster or member, passing over regions.
	 * @param start The cluster to start from, if any.
	 * @returns The frame's id, if any.
	 */
	frameAround(start: string | undefined): string | undefined {
		let at = start;
		while (at !== undefined && this.block.clusters.get(at)!.kind === "region")
			at = this.block.clusters.get(at)!.parent;
		return at;
	}

	/**
	 * Every frame as a node of the scene, around nothing yet, with its title row.
	 * @param centres Every vendor node's centre.
	 * @param boxes Every cluster's box.
	 * @returns The frames' nodes, by frame.
	 */
	frameNodes(
		centres: ReadonlyMap<string, Point>,
		boxes: ReadonlyMap<string, Box>,
	): Map<string, ElkNode & { children: ElkNode[] }> {
		const frames = new Map<string, ElkNode & { children: ElkNode[] }>();
		for (const cluster of this.block.clusters.values()) {
			if (cluster.kind !== "frame") continue;
			const bounds = boxes.get(cluster.id)!;
			const title = centres.get(titleOf(cluster.id))!;
			const row = [bounds.x, title.y - cluster.header.height / 2, bounds.width];
			const words = cluster.header.width - ARCHITECTURE_HEADER_PADDING;
			frames.set(cluster.id, {
				id: cluster.id,
				...bounds,
				layoutOptions: { [TRACK_TITLE]: [...row, cluster.header.height, words].join(",") },
				children: [],
			});
		}
		return frames;
	}

	/**
	 * The placed block's children nested as the track scene reads them: every
	 * frame a node around its members with its title row, every region a row
	 * on the root.
	 * @param leaves Every placed card, port, header and pin.
	 * @param centres Every vendor node's centre.
	 * @param boxes Every cluster's box.
	 * @returns The children, and the regions' rows.
	 */
	nest(
		leaves: readonly ElkNode[],
		centres: ReadonlyMap<string, Point>,
		boxes: ReadonlyMap<string, Box>,
	): { children: ElkNode[]; regions: string } {
		const frames = this.frameNodes(centres, boxes);
		const children: ElkNode[] = [];
		const placed: [ElkNode, string | undefined][] = [
			...[...frames].map(([id, frame]): [ElkNode, string | undefined] => [
				frame,
				this.block.clusters.get(id)!.parent,
			]),
			...leaves.map((leaf): [ElkNode, string | undefined] => [
				leaf,
				this.block.clusterOf.get(leaf.id),
			]),
		];
		for (const [node, around] of placed) {
			const frame = this.frameAround(around);
			(frame === undefined ? children : frames.get(frame)!.children).push(node);
		}
		return { children, regions: JSON.stringify(this.regionRows(centres, boxes)) };
	}

	/**
	 * Every region as the track scene reads it: its group, frame, direct
	 * members, band and caption.
	 * @param centres Every vendor node's centre.
	 * @param boxes Every cluster's box.
	 * @returns The rows.
	 */
	regionRows(
		centres: ReadonlyMap<string, Point>,
		boxes: ReadonlyMap<string, Box>,
	): {
		group: string;
		parent?: string;
		members: string[];
		box: number[];
		caption: number[];
	}[] {
		return [...this.block.clusters.values()]
			.filter(({ kind }) => kind === "region")
			.map((cluster) => {
				const bounds = boxes.get(cluster.id)!;
				const centre = centres.get(titleOf(cluster.id))!;
				const { width, height } = cluster.header;
				const parent = this.frameAround(cluster.parent);
				return {
					group: cluster.group!,
					...(parent === undefined ? {} : { parent }),
					members: [...this.block.clusterOf]
						.filter(([, around]) => around === cluster.id)
						.map(([member]) => member),
					box: [bounds.x, bounds.y, bounds.width, bounds.height],
					caption: [centre.x - width / 2, centre.y - height / 2, width, height],
				};
			});
	}
}

export { Below, Clusters, isTitle, titleOf };

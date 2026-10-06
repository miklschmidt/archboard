// A container's interface on the track engine (ADR 0044, TASK-368.08): the
// parts its callers reach take its first row, under its title, and what they
// hide sits beneath them, so a deep module reads as a narrow row of entry
// points over a larger body.
//
// A first entry point is one no other part of the container leads to along
// the lines, each from its source to its target, inside the container or
// round through parts outside. An entry point that another part calls stands
// below that caller, as every caller stands above what it calls; holding the
// hidden parts below it too would drag the whole container down after it.
//
// The first entry points stand on the row under the title, so a hidden part
// one of them already leads to is below that row and needs no edge: Graphviz
// orders each rank by every edge, so an edge that ranks nothing new would
// still move cards about. Every other hidden part is held below each first
// entry point by an invisible edge that only ranks and pulls nothing, so it
// stays as near its title as they let it. An edge that would close a loop,
// through the lines, the titles above their members and the edges already
// added, is left out: a hidden part that calls an entry point stands above it.
import type { Edge, Graph } from "@viz-js/viz";
import { Below } from "@/transformers/semantic-renderer/lib/blocks/below";
import type { Clusters } from "@/transformers/semantic-renderer/lib/blocks/clusters";
import type { Block, BlockTree } from "@/transformers/semantic-renderer/lib/blocks/tree";

/** What a block's layout gives the rule: its graph so far, clusters and line ends. */
interface Laying {
	readonly block: Block;
	readonly tree: BlockTree;
	readonly graph: Graph & { readonly edges: Edge[] };
	readonly clusters: Clusters;
	/** The vendor node a line end stands on. */
	vendorOf(end: string): string;
}

/**
 * Each container's parts a block draws inline, as vendor nodes: its cards and
 * the containers directly inside it, through any group region between.
 * @param layout The block's layout.
 * @returns The parts, by container.
 */
function partsOf(layout: Laying): string[][] {
	const { block, tree, clusters } = layout;
	const parts = new Map<string, string[]>();
	/**
	 * Whether a member of a cluster is a part of its container: a card or a container.
	 * @param member The member.
	 * @returns True when it is.
	 */
	const isPart = (member: string): boolean =>
		tree.cards.has(member) || block.clusters.get(member)?.kind === "frame";
	for (const [member, around] of block.clusterOf) {
		const frame = clusters.frameAround(around);
		if (frame !== undefined && isPart(member))
			parts.set(frame, [...(parts.get(frame) ?? []), member]);
	}
	return [...parts.values()];
}

/**
 * The entry points of one container that no other part of it leads to.
 * @param members The container's parts.
 * @param entries Every entry point.
 * @param along Where each line leads, from its source to its target.
 * @param vendorOf The vendor node a part stands at.
 * @returns The first entry points, as vendor nodes.
 */
function firstEntries(
	members: readonly string[],
	entries: ReadonlySet<string>,
	along: Below,
	vendorOf: (member: string) => string,
): string[] {
	const reached = members.filter((one) => entries.has(one)).map(vendorOf);
	if (reached.length === 0) return [];
	const vendors = members.map(vendorOf);
	const leadsTo = vendors.map((one) => along.reach(one));
	return reached.filter((entry) =>
		vendors.every((other, index) => other === entry || !leadsTo[index]!.has(entry)),
	);
}

/**
 * The invisible edges that stand each container's hidden parts below its
 * first entry points.
 * @param layout The block's layout, its graph holding every other edge.
 * @returns The edges.
 */
function entryRowEdges(layout: Laying): Edge[] {
	const { entries } = layout.tree;
	if (entries.size === 0) return [];
	const below = new Below();
	for (const { tail, head } of layout.graph.edges) below.add(tail, head);
	const along = new Below();
	for (const { from, to } of layout.block.lines.values())
		along.add(layout.vendorOf(from), layout.vendorOf(to));
	/**
	 * The vendor node a part stands at: a container at its title.
	 * @param member The part.
	 * @returns The vendor node.
	 */
	const vendorOf = (member: string): string => layout.clusters.vendorOf(member);
	return partsOf(layout).flatMap((members) => {
		const first = firstEntries(members, entries, along, vendorOf);
		const under = new Set(first.flatMap((entry) => [...below.reach(entry)]));
		const hidden = members.filter((one) => !entries.has(one)).map(vendorOf);
		return hidden
			.filter((part) => !under.has(part))
			.flatMap((part) => {
				const above = below.reach(part);
				return first
					.filter((entry) => !above.has(entry))
					.map((entry) => {
						below.add(entry, part);
						return { tail: entry, head: part, attributes: { style: "invis", weight: 0 } };
					});
			});
	});
}

export { entryRowEdges };

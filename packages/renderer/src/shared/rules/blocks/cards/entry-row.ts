// A container's interface on the track engine (ADR 0044, TASK-368.08): the
// parts its callers reach take its first row, under its title, and what they
// hide sits beneath them, so a deep module reads as a narrow row of entry
// points over a larger body.
//
// Only the first entry points hold that row: those no other part of the
// container leads to on the variant (`entryPointsOf`). An entry point that
// another part calls stands below that caller, as every caller stands above
// what it calls; holding the hidden parts below it too would drag the whole
// container down after it.
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
import { Below } from "#shared/rules/blocks/cards/below.ts";
import type { Clusters } from "#shared/rules/blocks/cards/clusters.ts";
import type { Block, BlockTree } from "#shared/rules/blocks/tree/tree.ts";

/** What a block's layout gives the rule: its graph so far and its clusters. */
interface Laying {
	readonly block: Block;
	readonly tree: BlockTree;
	readonly graph: Graph & { readonly edges: Edge[] };
	readonly clusters: Clusters;
}

/**
 * Each container's parts a block draws inline: its cards and the containers
 * directly inside it, through any group region between.
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
 * The invisible edges that stand each container's hidden parts below its
 * first entry points.
 * @param layout The block's layout, its graph holding every other edge.
 * @returns The edges.
 */
function entryRowEdges(layout: Laying): Edge[] {
	const { entries } = layout.tree;
	if (![...entries.values()].includes(true)) return [];
	const below = new Below();
	for (const { tail, head } of layout.graph.edges) below.add(tail, head);
	/**
	 * The vendor node a part stands at: a container at its title.
	 * @param member The part.
	 * @returns The vendor node.
	 */
	const vendorOf = (member: string): string => layout.clusters.vendorOf(member);
	return partsOf(layout).flatMap((members) => {
		const first = members.filter((one) => entries.get(one) === true).map(vendorOf);
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

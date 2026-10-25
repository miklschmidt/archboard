// A board drawn inline (TASK-349): every container and group region is a
// cluster of the block that lays the board out, not a block of its own, so
// the board's cards rank across containers as one layout. Here the block tree
// reads them in; `clusters.ts` lays them out.
import type { ElkNode } from "@archboard/elk-rs";
import { ENTRY_POINT } from "#shared/rules/layout/compound-graph.ts";
import { semanticOrder } from "#shared/rules/layout/semantic-order.ts";
import type { Block, BlockTree, Projection } from "#shared/rules/blocks/tree/tree.ts";
import { tabOf } from "#shared/rules/blocks/tree/laid.ts";
import type { Header } from "#shared/rules/blocks/cards/headers.ts";
import {
	bandOf,
	cardAs,
	frameHeader,
	placingGroup,
	type Lone,
} from "#shared/rules/blocks/tree/lone.ts";

/**
 * How a board's containers and group regions are drawn: each packed as a
 * block of its own, every one inline as a cluster of the board's layout, or
 * containers inline with each group's region packed as a block.
 */
type Nesting = "blocks" | "inline" | "groups";

/**
 * A container or group region a block of cards draws inline: a cluster of the
 * block's own Graphviz layout rather than a block of its own.
 */
interface Cluster {
	readonly id: string;
	readonly kind: "frame" | "region";
	/** The cluster it sits in, if any. */
	readonly parent: string | undefined;
	/** The group, for a region. */
	readonly group: string | undefined;
	/**
	 * A frame's title row or a region's caption; a container alone in its
	 * group's region heads the region's caption band too (`lone.ts`).
	 */
	readonly header: Header;
	/** The region round a container alone in it, laid out as the container. */
	readonly lone?: Lone;
}

/**
 * A group's region cluster inside a cluster of a block drawn inline, made on first use.
 * @param tree The blocks, for the groups' caption sizes.
 * @param block The block.
 * @param around The cluster it sits in, if any.
 * @param group The group.
 * @returns The region's cluster id.
 */
function inlineRegion(
	tree: BlockTree,
	block: Block,
	around: string | undefined,
	group: string,
): string {
	const id = `region:${around ?? block.id}:${group}`;
	if (block.clusters.has(id)) return id;
	block.clusters.set(id, {
		id,
		kind: "region",
		parent: around,
		group,
		header: tree.captions.get(group) ?? { width: 1, height: 1 },
	});
	if (around !== undefined) block.clusterOf.set(id, around);
	return id;
}

/**
 * A group's region packed as a block of its own inside a block drawn inline,
 * made on first use and standing in the cluster around it.
 * @param tree The blocks.
 * @param block The block that lays it out.
 * @param around The cluster it stands in, if any.
 * @param group The group.
 * @returns The region's block.
 */
function packedRegion(
	tree: BlockTree,
	block: Block,
	around: string | undefined,
	group: string,
): Block {
	const id = `region:${around ?? block.id}:${group}`;
	const existing = tree.blocks.get(id);
	if (existing !== undefined) return existing;
	const made = tree.block(id, "region", block, { group, header: tabOf(tree.captions.get(group)) });
	if (around !== undefined) block.clusterOf.set(id, around);
	return made;
}

/**
 * Add a container to a block drawn inline: a cluster with its children inside it.
 * @param tree The blocks.
 * @param block The block that lays it out.
 * @param node The container.
 * @param within The cluster it sits in, if any.
 */
function addFrame(tree: BlockTree, block: Block, node: ElkNode, within: string | undefined): void {
	const lone = tree.lone.get(node.id);
	block.clusters.set(node.id, {
		id: node.id,
		kind: "frame",
		parent: within,
		group: undefined,
		header: frameHeader(node, lone && bandOf(lone)),
		...(lone === undefined ? {} : { lone }),
	});
	const children = node.children!.toSorted(
		(one, other) => semanticOrder(one) - semanticOrder(other),
	);
	for (const child of children) addInline(tree, block, child, node.id, children);
}

/**
 * Where a node drawn inline goes: in its group's region, a cluster of the
 * block or, with groups packed, a block of its own; else where it is.
 * @param tree The blocks.
 * @param block The block that lays the node out.
 * @param around The cluster around it, if any.
 * @param group Its placing group, if any.
 * @returns The block that holds it and the cluster around it there, if any.
 */
function placing(
	tree: BlockTree,
	block: Block,
	around: string | undefined,
	group: string | undefined,
): { holder: Block; within: string | undefined } {
	if (group === undefined || block.group === group) return { holder: block, within: around };
	if (tree.nesting === "groups")
		return { holder: packedRegion(tree, block, around, group), within: undefined };
	return { holder: block, within: inlineRegion(tree, block, around, group) };
}

/**
 * Add one node to a block drawn inline: a card as an item, a container as a
 * cluster with its children inside it, each in its group's region; an entry
 * point of its container is noted as one.
 * @param tree The blocks.
 * @param block The block that lays the node out.
 * @param node The node.
 * @param around The cluster around it, if any.
 * @param siblings The nodes of its parent, itself among them.
 */
function addInline(
	tree: BlockTree,
	block: Block,
	node: ElkNode,
	around: string | undefined,
	siblings: readonly ElkNode[],
): void {
	const group = placingGroup(tree.lone, tree.captions, node, siblings);
	const { holder, within } = placing(tree, block, around, group);
	if (within !== undefined) holder.clusterOf.set(node.id, within);
	const entry = node.layoutOptions?.[ENTRY_POINT];
	if (entry !== undefined) tree.entries.set(node.id, entry === "true");
	tree.holder.set(node.id, holder);
	if (node.children?.length) {
		addFrame(tree, holder, node, within);
		return;
	}
	holder.items.push(node.id);
	tree.cards.set(node.id, cardAs(node, tree.lone.get(node.id)));
}

/**
 * The block that holds a relationship's label: the innermost block around
 * its target that can hold one, or with the label before a join its
 * source's, else the block that holds both ends.
 * @param tree The blocks.
 * @param projection Where the relationship is drawn.
 * @param before Whether it carries its label before a join with others to its card.
 * @returns The block.
 */
function labelHolder(tree: BlockTree, projection: Projection, before: boolean): Block {
	const { at, out, into } = projection;
	return before ? (out[0] ?? at) : (into.find((one) => holdsLabels(tree, one)) ?? out[0] ?? at);
}

/**
 * Whether a block can hold a line's label: every block drawn inline can,
 * and of the blocks packed each on its own, a block of cards. A block of
 * blocks draws only trunks between them (`pack.ts`), so a label given to a
 * region packing containers is lost.
 * @param tree The blocks.
 * @param block The block.
 * @returns True when it can.
 */
function holdsLabels(tree: BlockTree, block: Block): boolean {
	return tree.nesting !== "blocks" || !block.items.some((item) => tree.blocks.has(item));
}

/**
 * Whether a container or region a block draws inline holds an item, however deep.
 * @param block The block.
 * @param cluster The container or region.
 * @param item The item.
 * @returns True when the item stands inside it.
 */
function holds(block: Block, cluster: string, item: string): boolean {
	for (let at = block.clusterOf.get(item); at !== undefined; at = block.clusterOf.get(at))
		if (at === cluster) return true;
	return false;
}

export { addInline, holds, labelHolder, type Cluster, type Nesting };

// A board drawn inline (TASK-349): every container and group region is a
// cluster of the block that lays the board out, not a block of its own, so
// the board's cards rank across containers as one layout. Here the block tree
// reads them in; `clusters.ts` lays them out.
import type { ElkNode } from "@archboard/elk-rs";
import { PLACING_GROUP } from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import { semanticOrder } from "@/transformers/semantic-renderer/lib/layout/semantic-order";
import type { Block, BlockTree, Size } from "@/transformers/semantic-renderer/lib/blocks/tree";
import { cardOf } from "@/transformers/semantic-renderer/lib/blocks/card";

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
	/** A frame's title row or a region's caption. */
	readonly header: Size;
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
	const made = tree.block(id, "region", block, {
		group,
		header: tree.captions.get(group) ?? { width: 1, height: 1 },
	});
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
	const header = Number(node.layoutOptions?.["archboard.header.size"] ?? 0);
	block.clusters.set(node.id, {
		id: node.id,
		kind: "frame",
		parent: within,
		group: undefined,
		header: { width: node.width!, height: Math.max(1, header) },
	});
	const children = node.children!.toSorted(
		(one, other) => semanticOrder(one) - semanticOrder(other),
	);
	for (const child of children) addInline(tree, block, child, node.id);
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
 * cluster with its children inside it, each in its group's region.
 * @param tree The blocks.
 * @param block The block that lays the node out.
 * @param node The node.
 * @param around The cluster around it, if any.
 */
function addInline(tree: BlockTree, block: Block, node: ElkNode, around: string | undefined): void {
	const { holder, within } = placing(tree, block, around, node.layoutOptions?.[PLACING_GROUP]);
	if (within !== undefined) holder.clusterOf.set(node.id, within);
	tree.holder.set(node.id, holder);
	if (node.children?.length) {
		addFrame(tree, holder, node, within);
		return;
	}
	holder.items.push(node.id);
	tree.cards.set(node.id, cardOf(node));
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

export { addInline, holds, type Cluster, type Nesting };

// A board drawn inline (TASK-349): every container and group region is a
// cluster of the block that lays the board out, not a block of its own, so
// the board's cards rank across containers as one layout. A region round one
// card is such a cluster however the board is drawn: it gathers nothing to
// pack, and hugs its card where the card's own ranks stand it (ADR 0038).
// Here the block tree reads them in; `clusters.ts` lays them out.
import type { ElkNode } from "@archboard/elk-rs";
import { PLACING_GROUP } from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import { semanticOrder } from "@/transformers/semantic-renderer/lib/layout/semantic-order";
import type {
	Block,
	BlockTree,
	Projection,
	Size,
} from "@/transformers/semantic-renderer/lib/blocks/tree";
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
	for (const child of children) addInline(tree, block, child, node.id, children);
}

/**
 * Whether a node is the only one among its siblings that its group places.
 * A region round it gathers nothing to pack, so it is drawn inline, hugging
 * the node where the board's own ranks stand it.
 * @param node The node.
 * @param siblings The nodes of its parent, itself among them.
 * @returns True when no sibling shares its placing group.
 */
function alone(node: ElkNode, siblings: readonly ElkNode[]): boolean {
	const group = node.layoutOptions?.[PLACING_GROUP];
	return siblings.every((one) => one === node || one.layoutOptions?.[PLACING_GROUP] !== group);
}

/**
 * Where a node drawn inline goes: in its group's region, a cluster of the
 * block or, with groups packed, a block of its own unless the node is alone
 * in it; else where it is.
 * @param tree The blocks.
 * @param block The block that lays the node out.
 * @param around The cluster around it, if any.
 * @param node The node, and the nodes of its parent.
 * @param node.node The node.
 * @param node.siblings The nodes of its parent, itself among them.
 * @returns The block that holds it and the cluster around it there, if any.
 */
function placing(
	tree: BlockTree,
	block: Block,
	around: string | undefined,
	{ node, siblings }: { node: ElkNode; siblings: readonly ElkNode[] },
): { holder: Block; within: string | undefined } {
	const group = node.layoutOptions?.[PLACING_GROUP];
	if (group === undefined || block.group === group) return { holder: block, within: around };
	if (tree.nesting === "groups" && !alone(node, siblings))
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
 * @param siblings The nodes of its parent, itself among them.
 */
function addInline(
	tree: BlockTree,
	block: Block,
	node: ElkNode,
	around: string | undefined,
	siblings: readonly ElkNode[],
): void {
	const { holder, within } = placing(tree, block, around, { node, siblings });
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
 * Add one node to a block with every container and region packed as a block
 * of its own: a card alone in its group's region stays an item of the block,
 * inside the region drawn inline round it, so the region hugs the card.
 * @param tree The blocks.
 * @param block The block.
 * @param node The node.
 * @param siblings The nodes of its parent, itself among them.
 */
function addPacked(
	tree: BlockTree,
	block: Block,
	node: ElkNode,
	siblings: readonly ElkNode[],
): void {
	const group = node.layoutOptions?.[PLACING_GROUP];
	if (group === undefined) tree.add(block, node);
	else if (hugs(node, siblings)) {
		tree.add(block, node);
		block.clusterOf.set(node.id, inlineRegion(tree, block, undefined, group));
	} else tree.add(tree.region(block, group), node);
}

/**
 * Whether a node's region, with every container and region packed as a
 * block of its own, is drawn inline round it: it is a card alone in it.
 * @param node The node, in a group.
 * @param siblings The nodes of its parent, itself among them.
 * @returns True when it is.
 */
function hugs(node: ElkNode, siblings: readonly ElkNode[]): boolean {
	return !node.children?.length && alone(node, siblings);
}

/**
 * Move some cards from one block to another, with the regions drawn inline
 * round them.
 * @param tree The blocks.
 * @param from The block that held the cards.
 * @param to The block that holds them now.
 * @param cards The cards.
 */
function moveLoose(tree: BlockTree, from: Block, to: Block, cards: readonly string[]): void {
	for (const card of cards) {
		tree.holder.set(card, to);
		const around = from.clusterOf.get(card);
		if (around === undefined) continue;
		to.clusters.set(around, from.clusters.get(around)!);
		to.clusterOf.set(card, around);
		from.clusters.delete(around);
		from.clusterOf.delete(card);
	}
}

/**
 * The block that holds a relationship's label: the innermost block around
 * its target, or with the label before a join its source's, else the block
 * that holds both ends. A block that packs blocks of its own draws only
 * trunks between them (`pack.ts`), so a label entering one stays by its source.
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
 * Whether a block can hold a line's label: every block drawn inline can, and
 * of the blocks packed each on its own, a block of cards.
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

export { addInline, addPacked, holds, labelHolder, moveLoose, type Cluster, type Nesting };

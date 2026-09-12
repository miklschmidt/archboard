// Where PR Lens read a lane off every node, Archboard derives the picture's
// columns from containment. This file is that derivation, and nothing else
// reads `parent`.
//
// THE RULE, in full:
//
//   * A **column** is one root container, or one group of nodes that belong to
//     no container at all. Columns are drawn left to right in the document
//     order of the roots that seeded them.
//   * A node with children is a **container**, drawn as a box with the blocks it
//     holds inside it, at any depth: a system holding a service holding a module
//     is three boxes deep, and the middle level is not lost. A node with no
//     children is a **card**.
//   * Nodes belonging to no container do not stack into one narrow column. They
//     are spread across as many implicit columns as the widest rank of them
//     needs, up to a cap, so that a flat architecture — the first thing an agent
//     usually writes — reads as a grid rather than as a two-card ribbon. A chain
//     still reads as a chain, because a chain has one node per rank.
//
// Containment is validated before a board is ever read: single parent, no
// cycles, no dangling reference (`src/shared/semantic-board`). Nothing here
// re-derives any of that. The one defensive line is that a `parent` naming a
// node this content does not hold is treated as no parent, so the worst such a
// document could do is draw a node loose rather than lose it.

import type { SemanticEdge, SemanticNode, VariantContent } from "@/shared/semantic-board/index";
import { rankNodes } from "@/runtime/semantic-renderer/lib/layout/rank";

/**
 * How many implicit columns the uncontained nodes may spread across.
 *
 * A cap rather than "however many it takes": past three columns the eye stops
 * reading a grid and starts reading a wall, and a diagram that is wider than it
 * is tall is harder to navigate than one that is not. Three columns hold twelve
 * cards in two rows, which is more uncontained nodes than a readable board has.
 */
const MAX_IMPLICIT_COLUMNS = 3;

/** How many cards share one row of one column. */
const CARDS_PER_ROW = 2;

/** One node drawn as a box around what it contains. */
interface ContainerBlock {
	/** Which sort of block this is. */
	readonly kind: "container";
	/** The container itself. */
	readonly node: SemanticNode;
	/** What it holds, in document order. */
	readonly blocks: readonly Block[];
}

/** One node drawn as a card. */
interface CardBlock {
	/** Which sort of block this is. */
	readonly kind: "card";
	/** The node. */
	readonly node: SemanticNode;
}

/** What a column, or a container inside one, holds. */
type Block = ContainerBlock | CardBlock;

/** One column of the diagram, and what it holds. */
interface Region {
	/**
	 * The container this column stands for, or undefined for an implicit column
	 * that gathers nodes belonging to nothing.
	 */
	readonly container: SemanticNode | undefined;
	/** What the column holds, in document order. */
	readonly blocks: readonly Block[];
}

/**
 * Every node drawn as a card inside some blocks, at any depth.
 * @param blocks The blocks.
 * @returns The cards, in document order.
 */
function cardsIn(blocks: readonly Block[]): SemanticNode[] {
	return blocks.flatMap((block) => (block.kind === "card" ? [block.node] : cardsIn(block.blocks)));
}

/**
 * Every node drawn as a box inside some blocks, at any depth.
 * @param blocks The blocks.
 * @returns The containers, outermost first.
 */
function containersIn(blocks: readonly Block[]): SemanticNode[] {
	return blocks.flatMap((block) =>
		block.kind === "card" ? [] : [block.node, ...containersIn(block.blocks)],
	);
}

/**
 * Every node one column draws, containers and cards alike.
 * @param region The column.
 * @returns Its cards and the containers around them.
 */
function nodesOf(region: Region): SemanticNode[] {
	return [...cardsIn(region.blocks), ...containersIn(region.blocks)];
}

/**
 * Each node's children, in document order.
 * @param nodes The board's nodes.
 * @param byId Every node, by id.
 * @returns The children of each parent id.
 */
function childrenOf(
	nodes: readonly SemanticNode[],
	byId: ReadonlyMap<string, SemanticNode>,
): Map<string, SemanticNode[]> {
	const children = new Map<string, SemanticNode[]>();
	for (const node of nodes) {
		if (node.parent !== undefined && byId.has(node.parent)) {
			children.set(node.parent, [...(children.get(node.parent) ?? []), node]);
		}
	}
	return children;
}

/**
 * One node as the block it is drawn as, with everything under it.
 * @param node The node.
 * @param children Each node's children.
 * @returns The block.
 */
function blockOf(node: SemanticNode, children: ReadonlyMap<string, SemanticNode[]>): Block {
	const held = children.get(node.id);
	if (held === undefined) {
		return { kind: "card", node };
	}
	return { kind: "container", node, blocks: held.map((child) => blockOf(child, children)) };
}

/**
 * How many implicit columns a set of loose nodes should spread across.
 * @param ranks Each loose node's rank.
 * @param loose The loose nodes.
 * @returns The column count, at least one and at most the cap.
 */
function implicitColumnCount(
	ranks: ReadonlyMap<string, number>,
	loose: readonly SemanticNode[],
): number {
	const perRank = new Map<number, number>();
	for (const node of loose) {
		const rank = ranks.get(node.id) ?? 0;
		perRank.set(rank, (perRank.get(rank) ?? 0) + 1);
	}
	const widest = Math.max(1, ...perRank.values());
	return Math.min(MAX_IMPLICIT_COLUMNS, Math.ceil(widest / CARDS_PER_ROW));
}

/**
 * The loose nodes, dealt across the implicit columns.
 *
 * Dealt rank by rank rather than in one run, so that the nodes competing for
 * one row are the ones that end up beside each other. Within a rank the deal
 * follows document order, which is the stable tiebreak everywhere else too.
 * @param loose The nodes belonging to no container, in document order.
 * @param edges The relationships, for the ranks the deal is made against.
 * @returns One column's worth of nodes per implicit column.
 */
function dealLoose(
	loose: readonly SemanticNode[],
	edges: readonly SemanticEdge[],
): SemanticNode[][] {
	const ranks = rankNodes(loose, edges);
	const columns: SemanticNode[][] = Array.from(
		{ length: implicitColumnCount(ranks, loose) },
		() => [],
	);
	const byRank = [...loose].toSorted((a, b) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0));
	byRank.forEach((node, dealt) => {
		columns[dealt % columns.length]?.push(node);
	});
	return columns;
}

/**
 * The columns of one architecture, in the order they are drawn.
 *
 * A root container takes a column of its own where it was written. The
 * uncontained nodes take their implicit columns at the position of the first of
 * them, so that a standalone node written before the containers is drawn before
 * them, and one written after is drawn after.
 * @param content The architecture.
 * @returns Every column, left to right.
 */
function regionsOf(content: VariantContent): Region[] {
	const byId = new Map(content.nodes.map((node) => [node.id, node]));
	const children = childrenOf(content.nodes, byId);
	const roots = content.nodes.filter((node) => node.parent === undefined || !byId.has(node.parent));
	const loose = roots.filter((node) => !children.has(node.id));

	const regions: Region[] = [];
	let dealt = false;
	for (const root of roots) {
		const held = children.get(root.id);
		if (held !== undefined) {
			regions.push({ container: root, blocks: held.map((child) => blockOf(child, children)) });
		} else if (!dealt) {
			dealt = true;
			for (const column of dealLoose(loose, content.edges)) {
				regions.push({
					container: undefined,
					blocks: column.map((node) => ({ kind: "card", node })),
				});
			}
		}
	}
	return regions;
}

export {
	type Block,
	type CardBlock,
	type ContainerBlock,
	type Region,
	cardsIn,
	containersIn,
	nodesOf,
	regionsOf,
};

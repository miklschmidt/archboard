// The block engine, run where the layout engines run. Every block is laid out
// on its own, innermost first, so its size is final before its parent places
// it as one box: a block of blocks is packed and its trunks routed
// (`pack.ts`); a block of cards is ranked and routed on tracks
// (`card-layout.ts`), and folded into columns when that fits the page better
// (`fold.ts`). Last, every block is put where its parent placed it and each
// relationship's lines are joined end to end (`assembly.ts`).
import type { ElkNode } from "@archboard/elk-rs";
import type { Viz } from "@viz-js/viz";
import { CONTAINER_INSET } from "@/transformers/semantic-renderer/config";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import { Assembly } from "@/transformers/semantic-renderer/lib/blocks/assembly";
import { CardLayout } from "@/transformers/semantic-renderer/lib/blocks/card-layout";
import { foldBlock, foldPlan } from "@/transformers/semantic-renderer/lib/blocks/fold";
import { FoldLayout } from "@/transformers/semantic-renderer/lib/blocks/fold-layout";
import type { Insets, Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import { PackLayout } from "@/transformers/semantic-renderer/lib/blocks/pack";
import { BlockTree, type Block } from "@/transformers/semantic-renderer/lib/blocks/tree";
import { PAGE_MARGIN } from "@/transformers/semantic-renderer/lib/track/route";

/** Room a group region keeps around its members. */
const REGION_INSET = 14;
/** The root option carrying the placed drawing, as the JSON the assembly answers. */
const BLOCKS_PLACED = "archboard.blocks.placed";

/**
 * The insets a block keeps: left and right, above its first rank, below its last.
 * @param block The block.
 * @returns Its insets.
 */
function insetsOf(block: Block): Insets {
	if (block.kind === "root") return { side: PAGE_MARGIN, top: PAGE_MARGIN, bottom: PAGE_MARGIN };
	if (block.kind === "column" || block.kind === "cluster") return { side: 0, top: 0, bottom: 0 };
	const inset = block.kind === "frame" ? CONTAINER_INSET : REGION_INSET;
	return { side: inset, top: 0, bottom: [...block.ports.values()].includes("bottom") ? 0 : inset };
}

/**
 * Lay one block of cards out, folded into columns when that fits the page better.
 * @param viz The initialized Graphviz instance.
 * @param tree The blocks.
 * @param block The block.
 * @param laid Every block laid out so far; the columns are added to it.
 * @returns The laid-out block.
 */
function layCards(viz: Viz, tree: BlockTree, block: Block, laid: Map<string, Laid>): Laid {
	const insets = insetsOf(block);
	const whole = new CardLayout(block, laid, tree, insets).lay(viz);
	const plan = foldPlan(block, whole, insets);
	if (plan === undefined) return whole;
	const columns = foldBlock(tree, block, plan);
	for (const column of columns)
		laid.set(column.id, new CardLayout(column, laid, tree, insetsOf(column)).lay(viz));
	return new FoldLayout(block, columns, laid, tree, insets).lay();
}

/**
 * Lay a measured hierarchy out as blocks and route every relationship.
 * @param viz The initialized Graphviz instance.
 * @param avoid The initialized libavoid module.
 * @param graph The measured hierarchy.
 * @returns The hierarchy, with the drawing's geometry on its root.
 */
function placeBlocks(viz: Viz, avoid: AvoidEngine, graph: ElkNode): ElkNode {
	const tree = new BlockTree(graph);
	const laid = new Map<string, Laid>();
	for (const block of tree.innermostFirst()) {
		const holdsBlocks = block.items.some((item) => tree.blocks.has(item));
		laid.set(
			block.id,
			holdsBlocks
				? new PackLayout(block, laid, tree, insetsOf(block)).lay(avoid)
				: layCards(viz, tree, block, laid),
		);
	}
	const placed = new Assembly(tree, laid).placed();
	return {
		id: graph.id,
		x: 0,
		y: 0,
		width: placed.width,
		height: placed.height,
		layoutOptions: { ...graph.layoutOptions, [BLOCKS_PLACED]: JSON.stringify(placed) },
	};
}

export { BLOCKS_PLACED, placeBlocks };

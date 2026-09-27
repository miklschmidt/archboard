// The block engine, run where the layout engines run. Every block is laid out
// on its own, innermost first, so its size is final before its parent places
// it as one box: a block of blocks is packed and its trunks routed
// (`pack.ts`); a block of cards is ranked and routed on tracks
// (`card-layout.ts`), its widest rank wrapped into rows (`wraps.ts`) or its
// ranks folded into columns (`fold.ts`) where that is worth taking. Last,
// every block is put where its parent placed it and each relationship's
// lines are joined end to end (`assembly.ts`). Every choice between two
// layouts of a board is made on how each reads, as drawn (`weighing.ts`).
import type { ElkNode } from "@archboard/elk-rs";
import type { Viz } from "@viz-js/viz";
import { CONTAINER_INSET } from "@/transformers/semantic-renderer/config";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import { Assembly, type Placed } from "@/transformers/semantic-renderer/lib/blocks/assembly";
import { CardLayout } from "@/transformers/semantic-renderer/lib/blocks/card-layout";
import { foldBlock, foldPlan } from "@/transformers/semantic-renderer/lib/blocks/fold";
import { FoldLayout } from "@/transformers/semantic-renderer/lib/blocks/fold-layout";
import type { Insets, Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import type { Nesting } from "@/transformers/semantic-renderer/lib/blocks/inline";
import { bestWrap, weighed } from "@/transformers/semantic-renderer/lib/blocks/wraps";
import {
	layBoth,
	lineLength,
	settled,
	type Laying,
} from "@/transformers/semantic-renderer/lib/blocks/laying";
import { PackLayout, type Packing } from "@/transformers/semantic-renderer/lib/blocks/pack";
import { settlePorts } from "@/transformers/semantic-renderer/lib/blocks/settle";
import { sidesOf } from "@/transformers/semantic-renderer/lib/blocks/sides";
import { heldOrders } from "@/transformers/semantic-renderer/lib/blocks/orders";
import { layJoined, type Drawn } from "@/transformers/semantic-renderer/lib/blocks/joins";
import { TRUNK_CROSSING, detourOf } from "@/transformers/semantic-renderer/lib/blocks/trunks";
import { weighedLaid, weighedPlaced } from "@/transformers/semantic-renderer/lib/blocks/weighing";
import { BlockTree, type Block, type Side } from "@/transformers/semantic-renderer/lib/blocks/tree";
import { PAGE_MARGIN } from "@/transformers/semantic-renderer/lib/track/route";
import {
	crossingsOf,
	readsBetter,
	type Weighed,
} from "@/transformers/semantic-renderer/lib/track/score";

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
 * Lay one block of cards out: whole, its widest rank wrapped into rows when
 * that reads clearly better, or folded into columns when that does.
 * @param viz The initialized Graphviz instance.
 * @param tree The blocks.
 * @param block The block.
 * @param laid Every block laid out so far; the columns are added to it.
 * @returns The laid-out block.
 */
function layCards(viz: Viz, tree: BlockTree, block: Block, laid: Map<string, Laid>): Laid {
	const insets = insetsOf(block);
	const wraps = new Map<Laid, Laid | undefined>();
	/**
	 * The block's best wrap, laid out once for each way it stands whole.
	 * @param whole The block laid out whole.
	 * @param stacked Whether its containers stack.
	 * @returns The wrap, or nothing when the block stays whole.
	 */
	const wrapOf = (whole: Laid, stacked: boolean): Laid | undefined => {
		if (!wraps.has(whole))
			wraps.set(whole, bestWrap(viz, tree, block, { laid, whole, stacked, insets }));
		return wraps.get(whole);
	};
	const { whole, stacked } = stackedOrNot(viz, tree, block, { laid, wrapOf });
	const wrapped = wrapOf(whole, stacked);
	if (wrapped !== undefined) return wrapped;
	const walled = [...block.ports.values()].some((side) => side === "left" || side === "right");
	const plan = walled ? undefined : foldPlan(block, whole, insets, weighed(whole));
	if (plan === undefined) return whole;
	const columns = foldBlock(tree, block, plan.items);
	for (const column of columns)
		laid.set(
			column.id,
			settled(
				layBoth(viz, () => new CardLayout(column, laid, tree, insetsOf(column), { stacked })),
			),
		);
	return new FoldLayout(block, columns, laid, tree, insets).lay();
}

/**
 * How well a block laid out whole can read at its best: wrapped, folded or
 * as it stands, as {@link layCards} would take it. A fold is weighed as the
 * block unfolded on the fold's page, with its lines between columns.
 * @param tree The blocks.
 * @param block The block.
 * @param laid The block laid out whole.
 * @param wrapped Its best wrap, if one is taken.
 * @returns What its best is weighed on.
 */
function bestOf(tree: BlockTree, block: Block, laid: Laid, wrapped: Laid | undefined): Weighed {
	if (wrapped !== undefined) return weighedLaid(tree, block, wrapped);
	const whole = weighedLaid(tree, block, laid);
	const fold = foldPlan(block, laid, insetsOf(block), weighed(laid))?.weighed;
	if (fold === undefined) return whole;
	return { ...whole, width: fold.width, height: fold.height, bus: fold.bus ?? 0 };
}

/**
 * A block of cards laid out whole: with the containers a line from another
 * container enters stacked below it, when that reads better, or else as
 * Graphviz ranks them.
 * @param viz The initialized Graphviz instance.
 * @param tree The blocks.
 * @param block The block.
 * @param laying Every block laid out so far, and this one's best wrap.
 * @param laying.laid Every block laid out so far.
 * @param laying.wrapOf The best wrap of this block laid out whole one way, if one is taken.
 * @returns The block laid out, and whether it stacks. Its titles are pulled
 * onto their members where that crosses and draws no more line, and may
 * change whether it stacks only when the choice then draws no more line.
 */
function stackedOrNot(
	viz: Viz,
	tree: BlockTree,
	block: Block,
	{
		laid,
		wrapOf,
	}: { laid: Map<string, Laid>; wrapOf: (whole: Laid, stacked: boolean) => Laid | undefined },
): { whole: Laid; stacked: boolean } {
	const insets = insetsOf(block);
	const plain = layBoth(viz, () => new CardLayout(block, laid, tree, insets));
	if (!new CardLayout(block, laid, tree, insets).stacks())
		return { whole: settled(plain), stacked: false };
	const stacked = layBoth(viz, () => new CardLayout(block, laid, tree, insets, { stacked: true }));
	/**
	 * Whether the block reads better stacked. Stacked containers often read
	 * best wrapped or folded, so each is weighed at its best; a wrap is laid
	 * out only for the way the titles settle, which decides the choice unless
	 * pulling them down draws more line: laid out for the tied titles too,
	 * Board viewer (Track) took 1050 ms where it had taken 585.
	 * @param pick Which of each way the titles stand is weighed.
	 * @param wrapping Whether each is weighed wrapped where a wrap is taken.
	 * @returns True when it does.
	 */
	const stacks = (pick: (laying: Laying) => Laid, wrapping: boolean): boolean => {
		const [one, other] = [pick(stacked), pick(plain)];
		return readsBetter(
			bestOf(tree, block, one, wrapping ? wrapOf(one, true) : undefined),
			bestOf(tree, block, other, wrapping ? wrapOf(other, false) : undefined),
		);
	};
	const [tied, pulled] = [stacks(({ tied: one }) => one, false), stacks(settled, true)];
	// Pulling titles down may change the choice only when that draws no more line.
	const [was, is] = [tied, pulled].map((one) => settled(one ? stacked : plain));
	const keeps = tied !== pulled && lineLength(is!.lines.values()) > lineLength(was!.lines.values());
	const chosen = keeps ? tied : pulled;
	return { whole: settled(chosen ? stacked : plain), stacked: chosen };
}

/**
 * Whether a block is packed with its child blocks as the pieces, rather than
 * laid out as cards: a block of blocks, unless the board is drawn inline.
 * @param tree The blocks.
 * @param block The block.
 * @param nesting How containers and group regions are drawn.
 * @returns True when it is packed.
 */
function packsBlocks(tree: BlockTree, block: Block, nesting: Nesting): boolean {
	return nesting === "blocks" && block.items.some((item) => tree.blocks.has(item));
}

/**
 * Lay every block out, innermost first.
 * @param viz The initialized Graphviz instance.
 * @param avoid The initialized libavoid module.
 * @param graph The measured hierarchy.
 * @param earlier What an earlier layout decided, kept.
 * @param nesting How containers and group regions are drawn.
 * @param apart The blocks whose joins keep ports of their own, by id.
 * @returns The blocks, every block laid out, and each block of blocks' packing.
 */
function layAll(
	viz: Viz,
	avoid: AvoidEngine,
	graph: ElkNode,
	earlier: Earlier = NOTHING_EARLIER,
	nesting: Nesting,
	apart: ReadonlySet<string>,
): Board {
	const tree = new BlockTree(graph, earlier.exits, nesting, apart, earlier.orders);
	const laid = new Map<string, Laid>();
	const packings = new Map<string, Packing>();
	for (const block of tree.innermostFirst()) {
		if (packsBlocks(tree, block, nesting)) {
			const packed = new PackLayout(block, laid, tree, insetsOf(block)).lay(
				avoid,
				earlier.packings.get(block.id),
			);
			packings.set(block.id, packed.packing);
			laid.set(block.id, packed);
		} else laid.set(block.id, layCards(viz, tree, block, laid));
	}
	return { tree, laid, packings };
}

/** What an earlier layout decided, which a layout again keeps. */
interface Earlier {
	/** The edge each port moves to (`sides.ts`). */
	readonly exits: ReadonlyMap<string, Side>;
	/** Each block of blocks' packing. */
	readonly packings: ReadonlyMap<string, Packing>;
	/** The ports each block holds in an order on a face (`orders.ts`). */
	readonly orders?: ReadonlyMap<string, readonly string[]>;
}

/** What a first layout keeps: nothing. */
const NOTHING_EARLIER: Earlier = { exits: new Map(), packings: new Map() };

/** The blocks, every block laid out, and each block of blocks' packing. */
interface Board {
	readonly tree: BlockTree;
	readonly laid: Map<string, Laid>;
	readonly packings: Map<string, Packing>;
}

/**
 * Lay a measured hierarchy out one way and route every relationship; when a
 * line's blocks do not stand the way its faces point, once more with every
 * block of its chain crossed by the edges that face each other (`sides.ts`).
 * Where settling would swap ports on a block of cards' face, once more with
 * those ports held in the settled order (`orders.ts`), kept where it crosses
 * fewer lines. Not while a join is parted: the joins choice would then
 * prefer a parted drawing that runs a line round a block. Last, the ports on
 * every block's top and bottom are settled where both ends of their trunks
 * are known, and the blocks routed again with them there.
 * @param viz The initialized Graphviz instance.
 * @param avoid The initialized libavoid module.
 * @param graph The measured hierarchy.
 * @param nesting How containers and group regions are drawn.
 * @param apart The blocks whose joins keep ports of their own, by id.
 * @returns The blocks, every block laid out.
 */
function layOut(
	viz: Viz,
	avoid: AvoidEngine,
	graph: ElkNode,
	nesting: Nesting,
	apart: ReadonlySet<string>,
): { tree: BlockTree; laid: Map<string, Laid> } {
	const first = layAll(viz, avoid, graph, undefined, nesting, apart);
	const exits = sidesOf(first.tree, first.laid);
	const kept = { exits, packings: first.packings };
	const last = exits.size === 0 ? first : layAll(viz, avoid, graph, kept, nesting, apart);
	const orders = apart.size > 0 ? new Map() : heldOrders({ ...last, insetsOf, avoid });
	const held =
		orders.size === 0 ? [] : [layAll(viz, avoid, graph, { ...kept, orders }, nesting, apart)];
	return [last, ...held]
		.map((laying) => settledOrNot(laying, avoid))
		.reduce((one, other) => (other.crossings < one.crossings ? other : one));
}

/**
 * A layout with its ports settled, unless the drawing reads better unsettled
 * ({@link readsBetter}), as drawn: the line its routes run round what they
 * pass counts as crossings at the trunk router's rate, so a detour that
 * differs by less than a quarter of a crossing is no difference.
 * @param laying The layout; its blocks are replaced.
 * @param avoid The initialized libavoid module.
 * @returns The blocks, every block laid out, and how often the drawing's lines cross.
 */
function settledOrNot(
	laying: Board,
	avoid: AvoidEngine,
): { tree: BlockTree; laid: Map<string, Laid>; crossings: number } {
	const unsettled = new Map(laying.laid);
	settlePorts({ ...laying, insetsOf, avoid });
	const [was, is] = [unsettled, laying.laid].map((laid) => {
		const placed = Assembly.unstepped(new Assembly(laying.tree, laid).placed());
		const detour = placed.edges.reduce((sum, { points }) => sum + detourOf(points), 0);
		const drawn = weighedPlaced(laying.tree, placed);
		return { ...drawn, crossings: drawn.crossings + detour / TRUNK_CROSSING };
	});
	if (readsBetter(was!, is!)) for (const [id, laid] of unsettled) laying.laid.set(id, laid);
	const { edges } = new Assembly(laying.tree, laying.laid).placed();
	return {
		tree: laying.tree,
		laid: laying.laid,
		crossings: crossingsOf(edges.map(({ points }) => points)),
	};
}

/**
 * Lay a measured hierarchy out with every join of lines to one card kept
 * whole the way that reads better (`joins.ts`).
 * @param viz The initialized Graphviz instance.
 * @param avoid The initialized libavoid module.
 * @param graph The measured hierarchy.
 * @param nesting How containers and group regions are drawn.
 * @returns The blocks, and the drawing's geometry.
 */
function layJoinedOut(
	viz: Viz,
	avoid: AvoidEngine,
	graph: ElkNode,
	nesting: Nesting,
): Drawn<Placed> {
	return layJoined((apart) => {
		const { tree, laid } = layOut(viz, avoid, graph, nesting, apart);
		return { tree, placed: Assembly.unstepped(new Assembly(tree, laid).placed()) };
	});
}

/**
 * Whether a board laid with its groups packed reads better than laid inline
 * ({@link readsBetter}).
 * @param packed The drawing with groups packed.
 * @param inline The drawing with groups inline.
 * @returns True when the packed one reads better.
 */
function readsBetterPacked(packed: Drawn<Placed>, inline: Drawn<Placed>): boolean {
	return readsBetter(
		weighedPlaced(packed.tree, packed.placed),
		weighedPlaced(inline.tree, inline.placed),
	);
}

/**
 * Lay a measured hierarchy out as blocks and route every relationship. Drawn
 * inline, a board with groups is also laid with each group's region packed as
 * a block of its own, and the layout that reads better is kept: a group whose
 * members stand far apart in the board's ranks spans them all as a cluster,
 * a tall sparse band, but packed stands whole.
 * @param viz The initialized Graphviz instance.
 * @param avoid The initialized libavoid module.
 * @param graph The measured hierarchy.
 * @param inline Whether containers and group regions are drawn inline, as
 * clusters of the board's own layout, rather than packed as blocks.
 * @returns The hierarchy, with the drawing's geometry on its root.
 */
function placeBlocks(viz: Viz, avoid: AvoidEngine, graph: ElkNode, inline = false): ElkNode {
	const first = layJoinedOut(viz, avoid, graph, inline ? "inline" : "blocks");
	const { placed } = inline && hasRegions(first.tree) ? betterOf(viz, avoid, graph, first) : first;
	const drawn = JSON.stringify(placed);
	return {
		id: graph.id,
		x: 0,
		y: 0,
		width: placed.width,
		height: placed.height,
		layoutOptions: { ...graph.layoutOptions, [BLOCKS_PLACED]: drawn },
	};
}

/**
 * The better of a board drawn inline and drawn with each group's region
 * packed as a block of its own.
 * @param viz The initialized Graphviz instance.
 * @param avoid The initialized libavoid module.
 * @param graph The measured hierarchy.
 * @param inline The board drawn inline.
 * @returns The blocks and the drawing's geometry.
 */
function betterOf(
	viz: Viz,
	avoid: AvoidEngine,
	graph: ElkNode,
	inline: Drawn<Placed>,
): Drawn<Placed> {
	const packed = layJoinedOut(viz, avoid, graph, "groups");
	return readsBetterPacked(packed, inline) ? packed : inline;
}

/**
 * Whether a board drawn inline gathers any group into a region.
 * @param tree The blocks.
 * @returns True when some cluster is a group's region.
 */
function hasRegions(tree: BlockTree): boolean {
	return [...tree.root.clusters.values()].some(({ kind }) => kind === "region");
}

export { BLOCKS_PLACED, placeBlocks };

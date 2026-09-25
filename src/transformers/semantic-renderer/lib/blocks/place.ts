// The block engine, run where the layout engines run. Every block is laid out
// on its own, innermost first, so its size is final before its parent places
// it as one box: a block of blocks is packed and its trunks routed
// (`pack.ts`); a block of cards is ranked and routed on tracks
// (`card-layout.ts`), and folded into columns when that fits the page better
// (`fold.ts`). Last, every block is put where its parent placed it and each
// relationship's lines are joined end to end (`assembly.ts`).
import type { ElkNode } from "@archboard/elk-rs";
import type { Viz } from "@viz-js/viz";
import { REFERENCE_PANE } from "@/shared/shell-geometry/index";
import { CONTAINER_INSET } from "@/transformers/semantic-renderer/config";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import { Assembly } from "@/transformers/semantic-renderer/lib/blocks/assembly";
import { CardLayout } from "@/transformers/semantic-renderer/lib/blocks/card-layout";
import { foldBlock, foldPlan } from "@/transformers/semantic-renderer/lib/blocks/fold";
import { FoldLayout } from "@/transformers/semantic-renderer/lib/blocks/fold-layout";
import type { Insets, Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { PackLayout, type Packing } from "@/transformers/semantic-renderer/lib/blocks/pack";
import {
	BlockTree,
	type Block,
	type Line,
	type Side,
} from "@/transformers/semantic-renderer/lib/blocks/tree";
import { grids } from "@/transformers/semantic-renderer/lib/track/grid";
import { PAGE_MARGIN } from "@/transformers/semantic-renderer/lib/track/route";
import {
	crossingsOf,
	readsBetter,
	scoreOf,
	wrapPlans,
	type Weighed,
} from "@/transformers/semantic-renderer/lib/track/score";

/** How much better a wrap must fit the page than the board whole. */
const WORTH_WRAPPING = 1.1;
/**
 * How much better a wrap must fit the page than a block inside the board,
 * whose own fit only stands for how well its parent can pack it.
 */
const WORTH_WRAPPING_INSIDE = 1.4;
/** The fewest items a rank must hold to be wrapped. */
const MIN_WRAPPED = 4;
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
 * How readable a laid-out block is, on the score every layout choice is made by.
 * @param laid The block laid out.
 * @returns Its score.
 */
function scored(laid: Laid): number {
	return scoreOf(weighed(laid));
}

/**
 * What a laid-out block is scored on.
 * @param laid The block laid out.
 * @returns Its page and crossings.
 */
function weighed(laid: Laid): Weighed {
	return { width: laid.width, height: laid.height, crossings: crossingsOf(laid.lines.values()) };
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
	const whole = new CardLayout(block, laid, tree, insets).lay(viz);
	const wrapped = bestWrap(viz, tree, block, { laid, whole });
	if (wrapped !== undefined) return wrapped;
	const walled = [...block.ports.values()].some((side) => side === "left" || side === "right");
	const plan = walled ? undefined : foldPlan(block, whole, insets, scored(whole));
	if (plan === undefined) return whole;
	const columns = foldBlock(tree, block, plan);
	for (const column of columns)
		laid.set(column.id, new CardLayout(column, laid, tree, insetsOf(column)).lay(viz));
	return new FoldLayout(block, columns, laid, tree, insets).lay();
}

/**
 * The block's widest rank wrapped into rows, or its loose cards set out as a
 * grid, when that reads clearly better than the block whole.
 * @param viz The initialized Graphviz instance.
 * @param tree The blocks.
 * @param block The block.
 * @param laying Every block laid out so far, and this one whole.
 * @param laying.laid Every block laid out so far.
 * @param laying.whole This block laid out whole.
 * @returns The best wrap, or nothing when the block stays whole.
 */
function bestWrap(
	viz: Viz,
	tree: BlockTree,
	block: Block,
	laying: { laid: Map<string, Laid>; whole: Laid },
): Laid | undefined {
	const insets = insetsOf(block);
	const worth = block.kind === "root" ? WORTH_WRAPPING : WORTH_WRAPPING_INSIDE;
	const gridded = grids(new CardLayout(block, laying.laid, tree, insets).looseCards())
		? [new CardLayout(block, laying.laid, tree, insets, new Map(), true).lay(viz)]
		: [];
	const best = [
		...gridded,
		...wrapsOf(laying.whole).map((lowered) =>
			new CardLayout(block, laying.laid, tree, insets, lowered).lay(viz),
		),
	].reduce<Laid | undefined>(
		(one, other) => (one === undefined || readsBetter(weighed(other), weighed(one)) ? other : one),
		undefined,
	);
	return best !== undefined && scored(best) > scored(laying.whole) * worth ? best : undefined;
}

/**
 * The ways to wrap a block's widest rank of items into rows, when the block
 * is wider than the page's shape.
 * @param whole The block laid out whole.
 * @returns Each wrap, as how far each wrapped item is lowered.
 */
function wrapsOf(whole: Laid): Map<string, number>[] {
	const pane = REFERENCE_PANE.width / REFERENCE_PANE.height;
	const bands = whole.bands.filter(({ items }) => items.length >= MIN_WRAPPED);
	if (bands.length === 0 || whole.width / whole.height <= pane) return [];
	const widest = bands.reduce((one, other) =>
		other.items.length > one.items.length ? other : one,
	);
	const across = widest.items.toSorted(
		(one, other) => whole.boxes.get(one)!.x - whole.boxes.get(other)!.x,
	);
	return wrapPlans(across.map((id) => ({ ids: [id], width: whole.boxes.get(id)!.width })));
}

/**
 * Lay every block out, innermost first.
 * @param viz The initialized Graphviz instance.
 * @param avoid The initialized libavoid module.
 * @param graph The measured hierarchy.
 * @param earlier What an earlier layout decided: the wall each port moves to, and each packing, kept.
 * @param earlier.exits The wall each port moves to.
 * @param earlier.packings Each block of blocks' packing.
 * @returns The blocks, every block laid out, and each block of blocks' packing.
 */
function layAll(
	viz: Viz,
	avoid: AvoidEngine,
	graph: ElkNode,
	earlier?: { exits: ReadonlyMap<string, Side>; packings: ReadonlyMap<string, Packing> },
): { tree: BlockTree; laid: Map<string, Laid>; packings: Map<string, Packing> } {
	const tree = new BlockTree(graph, earlier?.exits);
	const laid = new Map<string, Laid>();
	const packings = new Map<string, Packing>();
	for (const block of tree.innermostFirst()) {
		if (block.items.some((item) => tree.blocks.has(item))) {
			const packed = new PackLayout(block, laid, tree, insetsOf(block)).lay(
				avoid,
				earlier?.packings.get(block.id),
			);
			packings.set(block.id, packed.packing);
			laid.set(block.id, packed);
		} else laid.set(block.id, layCards(viz, tree, block, laid));
	}
	return { tree, laid, packings };
}

/**
 * The leaving ports whose trunk goes to a block standing beside theirs, and
 * the wall of their block that faces it.
 * @param tree The blocks, laid out once.
 * @param laid Every block laid out.
 * @returns Each such port's wall, keyed `block|port`.
 */
function exitsOf(tree: BlockTree, laid: ReadonlyMap<string, Laid>): Map<string, Side> {
	const exits = new Map<string, Side>();
	for (const block of tree.blocks.values())
		for (const line of block.lines.values())
			for (const [key, side] of facing(tree, laid.get(block.id)?.boxes, line)) exits.set(key, side);
	return exits;
}

/**
 * The walls one line's two ports move to, when the blocks it joins stand side by side.
 * @param tree The blocks.
 * @param boxes Where the block the line is drawn in put its items.
 * @param line The line.
 * @returns Each port's wall, keyed `block|port`; none when the line does not join two blocks side by side.
 */
function facing(
	tree: BlockTree,
	boxes: ReadonlyMap<string, Box> | undefined,
	line: Line,
): [string, Side][] {
	const pins = [tree.pins.get(line.from), tree.pins.get(line.to)];
	const [one, other] = pins.map((pin) =>
		pin === undefined ? undefined : boxes?.get(pin.block.id),
	);
	if (!besides(one, other)) return [];
	const walls: Side[] = other!.x > one!.x ? ["right", "left"] : ["left", "right"];
	return pins.map((pin, index) => [`${pin!.block.id}|${pin!.port}`, walls[index]!]);
}

/**
 * Whether two boxes stand side by side: some height is in both.
 * @param one A box, if there is one.
 * @param other Another box, if there is one.
 * @returns True when both are there and share a height.
 */
function besides(one: Box | undefined, other: Box | undefined): boolean {
	if (one === undefined || other === undefined) return false;
	return one.y < other.y + other.height && other.y < one.y + one.height;
}

/**
 * Lay a measured hierarchy out as blocks and route every relationship; when
 * a trunk joins two blocks that stand side by side, once more with that
 * trunk leaving its block by the wall that faces the other.
 * @param viz The initialized Graphviz instance.
 * @param avoid The initialized libavoid module.
 * @param graph The measured hierarchy.
 * @returns The hierarchy, with the drawing's geometry on its root.
 */
function placeBlocks(viz: Viz, avoid: AvoidEngine, graph: ElkNode): ElkNode {
	const first = layAll(viz, avoid, graph);
	const exits = exitsOf(first.tree, first.laid);
	const { tree, laid } =
		exits.size === 0 ? first : layAll(viz, avoid, graph, { exits, packings: first.packings });
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

export { BLOCKS_PLACED, exitsOf, layAll, placeBlocks };

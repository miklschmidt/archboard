// The block engine, run where the layout engines run. Every block is laid out
// on its own, innermost first, so its size is final before its parent places
// it as one box: a block of blocks is packed and its trunks routed
// (`pack.ts`); a block of cards is ranked and routed on tracks
// (`card-layout.ts`), and folded into columns when that fits the page better
// (`fold.ts`). Last, every block is put where its parent placed it and each
// relationship's lines are joined end to end (`assembly.ts`).
import type { ElkNode } from "@archboard/elk-rs";
import type { Viz } from "@viz-js/viz";
import { REFERENCE_PANE, fitIn } from "@/shared/shell-geometry/index";
import { CONTAINER_INSET } from "@/transformers/semantic-renderer/config";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import { Assembly, type Placed } from "@/transformers/semantic-renderer/lib/blocks/assembly";
import { CardLayout } from "@/transformers/semantic-renderer/lib/blocks/card-layout";
import { foldBlock, foldPlan } from "@/transformers/semantic-renderer/lib/blocks/fold";
import { FoldLayout } from "@/transformers/semantic-renderer/lib/blocks/fold-layout";
import type { Insets, Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import type { Nesting } from "@/transformers/semantic-renderer/lib/blocks/inline";
import {
	layBoth,
	lineLength,
	settled,
	type Laying,
} from "@/transformers/semantic-renderer/lib/blocks/laying";
import { PackLayout, type Packing } from "@/transformers/semantic-renderer/lib/blocks/pack";
import { settlePorts } from "@/transformers/semantic-renderer/lib/blocks/settle";
import { sidesOf } from "@/transformers/semantic-renderer/lib/blocks/sides";
import { NEAR, layJoined } from "@/transformers/semantic-renderer/lib/blocks/joins";
import { routedScore } from "@/transformers/semantic-renderer/lib/blocks/trunks";
import { BlockTree, type Block, type Side } from "@/transformers/semantic-renderer/lib/blocks/tree";
import { grids } from "@/transformers/semantic-renderer/lib/track/grid";
import { PAGE_MARGIN } from "@/transformers/semantic-renderer/lib/track/route";
import {
	crossingsOf,
	readsBetter,
	scoreOf,
	sinks,
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
 * What a laid-out block is scored on: its page, and its crossings with each
 * line that laps round it counted as one more.
 * @param laid The block laid out.
 * @returns Its page and crossings.
 */
function weighed(laid: Laid): Weighed {
	const crossings = crossingsOf(laid.lines.values()) + (laid.laps ?? 0);
	return { width: laid.width, height: laid.height, crossings };
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
	const { whole, stacked } = stackedOrNot(viz, tree, block, laid);
	const wrapped = bestWrap(viz, tree, block, { laid, whole, stacked });
	if (wrapped !== undefined) return wrapped;
	const walled = [...block.ports.values()].some((side) => side === "left" || side === "right");
	const plan = walled ? undefined : foldPlan(block, whole, insets, scored(whole));
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
 * How readable a block laid out whole can be: as it stands, or folded.
 * @param block The block.
 * @param laid The block laid out whole.
 * @param insets Its insets.
 * @returns The better score.
 */
function bestOf(block: Block, laid: Laid, insets: Insets): number {
	return Math.max(scored(laid), foldPlan(block, laid, insets, scored(laid))?.score ?? 0);
}

/**
 * Whether two measures of a block stand within a near tie of each other.
 * @param one A measure.
 * @param other Another.
 * @returns True when they do.
 */
function near(one: number, other: number): boolean {
	return Math.abs(one - other) <= NEAR * Math.min(one, other);
}

/**
 * A block of cards laid out whole: with the containers a line from another
 * container enters stacked below it, when that reads better, or else as
 * Graphviz ranks them.
 * @param viz The initialized Graphviz instance.
 * @param tree The blocks.
 * @param block The block.
 * @param laid Every block laid out so far.
 * @returns The block laid out, and whether it stacks. Its titles are pulled
 * onto their members where that crosses and draws no more line, and may
 * change whether it stacks only when the choice then draws no more line.
 */
function stackedOrNot(
	viz: Viz,
	tree: BlockTree,
	block: Block,
	laid: Map<string, Laid>,
): { whole: Laid; stacked: boolean } {
	const insets = insetsOf(block);
	const plain = layBoth(viz, () => new CardLayout(block, laid, tree, insets));
	if (!new CardLayout(block, laid, tree, insets).stacks())
		return { whole: settled(plain), stacked: false };
	const stacked = layBoth(viz, () => new CardLayout(block, laid, tree, insets, { stacked: true }));
	/**
	 * Whether the block reads better stacked. Stacked containers often read
	 * best folded, so each is weighed at its best; a near tie goes to the
	 * page that fits the pane clearly better, as it does between a block's
	 * joins, and to the better score where neither page fits clearly better.
	 * @param pick Which of each way the titles stand is weighed.
	 * @returns True when it does.
	 */
	const stacks = (pick: (laying: Laying) => Laid): boolean => {
		const [one, other] = [bestOf(block, pick(stacked), insets), bestOf(block, pick(plain), insets)];
		const [fits, flat] = [fitIn(pick(stacked)), fitIn(pick(plain))];
		return near(one, other) && !near(fits, flat) ? fits > flat : one > other;
	};
	const [tied, pulled] = [stacks(({ tied: one }) => one), stacks(settled)];
	// Pulling titles down may change the choice only when that draws no more line.
	const [was, is] = [tied, pulled].map((one) => settled(one ? stacked : plain));
	const keeps = tied !== pulled && lineLength(is!.lines.values()) > lineLength(was!.lines.values());
	const chosen = keeps ? tied : pulled;
	return { whole: settled(chosen ? stacked : plain), stacked: chosen };
}

/**
 * The block's widest rank wrapped into rows, or its loose cards set out as a
 * grid, when that reads clearly better than the block whole.
 * @param viz The initialized Graphviz instance.
 * @param tree The blocks.
 * @param block The block.
 * @param laying Every block laid out so far, this one whole, and whether it stacks.
 * @param laying.laid Every block laid out so far.
 * @param laying.whole This block laid out whole.
 * @param laying.stacked Whether its containers stack.
 * @returns The best wrap, or nothing when the block stays whole.
 */
function bestWrap(
	viz: Viz,
	tree: BlockTree,
	block: Block,
	laying: { laid: Map<string, Laid>; whole: Laid; stacked: boolean },
): Laid | undefined {
	const insets = insetsOf(block);
	const { laid, stacked } = laying;
	const worth = block.kind === "root" ? WORTH_WRAPPING : WORTH_WRAPPING_INSIDE;
	const gridded = new CardLayout(block, laid, tree, insets).looseCards().some(grids)
		? [
				wrapOf(
					layBoth(viz, () => new CardLayout(block, laid, tree, insets, { grid: true, stacked })),
				),
			]
		: [];
	// A wrap that sinks a card stands it off on a late rank, away from its
	// neighbours; it may fit the page better, but it is no wrap.
	const wraps = wrapsOf(laying.whole, block, tree).flatMap((lowered) =>
		columnChoices(lowered, tree.nesting)
			.map((columns) =>
				wrapOf(
					layBoth(
						viz,
						() => new CardLayout(block, laid, tree, insets, { lowered, stacked, columns }),
					),
					lowered,
				),
			)
			.filter(({ laid: { boxes } }) => !sinks(lowered, boxes, (card) => block.clusterOf.get(card))),
	);
	// A wrap is chosen with its titles tied; only the chosen one is laid again with them pulled down.
	const best = [...gridded, ...wraps].reduce<Wrapped | undefined>(
		(one, other) => (one === undefined || wrapsBetter(other, one) ? other : one),
		undefined,
	);
	if (best === undefined || scored(best.laid) <= scored(laying.whole) * worth) return undefined;
	const kept = settled({ tied: best.laid, untied: best.untied });
	const sunk = sinks(best.lowered, kept.boxes, (card) => block.clusterOf.get(card));
	return sunk ? best.laid : kept;
}

/** A wrap or grid laid out, and how many rows a wrap deals its rank into. */
interface Wrapped {
	/** It laid out with its titles tied. */
	readonly laid: Laid;
	/** How far each wrapped item is lowered; none for a grid. */
	readonly lowered: ReadonlyMap<string, number>;
	readonly rows?: number;
	/**
	 * It laid out with its tied titles pulled onto their members.
	 * @returns It, or nothing when no title was tied.
	 */
	readonly untied: () => Laid | undefined;
}

/**
 * A wrap or grid as the wrap choice weighs it.
 * @param laying It laid out both ways its titles may stand.
 * @param lowered How far each wrapped item is lowered, for a wrap.
 * @returns The wrap.
 */
function wrapOf(laying: Laying, lowered?: ReadonlyMap<string, number>): Wrapped {
	const rows = lowered === undefined ? {} : { rows: 1 + Math.max(...lowered.values()) };
	return { laid: laying.tied, untied: laying.untied, lowered: lowered ?? new Map(), ...rows };
}

/**
 * Whether one wrap reads better than another: it scores higher, or, as well,
 * deals its rank into fewer rows. Two wraps that both fit the reference pane
 * at full scale score the same, and one dealt into more rows only saves
 * area: a wrap is for a rank too wide for the pane, and each row more steps
 * the rank further from how it reads.
 * @param one A wrap.
 * @param other Another.
 * @returns True when the first reads better.
 */
function wrapsBetter(one: Wrapped, other: Wrapped): boolean {
	const tied = Math.abs(scored(one.laid) - scored(other.laid)) <= 1e-9;
	if (tied && one.rows !== undefined && other.rows !== undefined && one.rows !== other.rows)
		return one.rows < other.rows;
	return readsBetter(weighed(one.laid), weighed(other.laid));
}

/**
 * Whether a wrap's rows may be laid with their columns free, as well as held.
 * Left free, a lowered card is pushed aside by the lines to every row below
 * it, so on the track engine's ranks a wrap deeper than two rows steps down
 * diagonally: it keeps its columns. The blocks engine packs such a block
 * among others, where holding its columns drew more crossings than it saved.
 * @param lowered How far each wrapped item is lowered.
 * @param nesting How the board's containers and group regions are drawn.
 * @returns The choices to lay the wrap with.
 */
function columnChoices(lowered: ReadonlyMap<string, number>, nesting: Nesting): boolean[] {
	const deep = Math.max(0, ...lowered.values()) > 1;
	return deep && nesting !== "blocks" ? [true] : [false, true];
}

/**
 * The ways to wrap a block's widest rank of items into rows, when the block
 * is wider than the page's shape. Interchangeable cards standing together,
 * of one kind and responsibility in one container, stay in one row: a pool
 * of equals reads as one, and a wrap that deals them apart scrambles cards a
 * reader expects in the board's order.
 * @param whole The block laid out whole.
 * @param block The block.
 * @param tree The blocks, for each card's peers.
 * @returns Each wrap, as how far each wrapped item is lowered.
 */
function wrapsOf(whole: Laid, block: Block, tree: BlockTree): Map<string, number>[] {
	const pane = REFERENCE_PANE.width / REFERENCE_PANE.height;
	const bands = whole.bands.filter(({ items }) => items.length >= MIN_WRAPPED);
	if (bands.length === 0 || whole.width / whole.height <= pane) return [];
	const widest = bands.reduce((one, other) =>
		other.items.length > one.items.length ? other : one,
	);
	const across = widest.items.toSorted(
		(one, other) => whole.boxes.get(one)!.x - whole.boxes.get(other)!.x,
	);
	const runs = peerRuns(across, whole.boxes, (id) => {
		const peers = tree.cards.get(id)?.peers;
		return peers === undefined ? undefined : `${block.clusterOf.get(id) ?? ""}|${peers}`;
	});
	return wrapPlans(runs).filter((plan) =>
		runs.every(({ ids }) => ids.every((id) => plan.get(id) === plan.get(ids[0]!))),
	);
}

/**
 * A rank's items, left to right, in runs that stand together: neighbouring
 * peers make one run, every other item a run of its own, each with its width.
 * @param across The items, left to right.
 * @param boxes Where each stands.
 * @param peersOf What an item is interchangeable with, if anything.
 * @returns The runs.
 */
function peerRuns(
	across: readonly string[],
	boxes: ReadonlyMap<string, Box>,
	peersOf: (id: string) => string | undefined,
): { ids: string[]; width: number }[] {
	const runs: { peers: string | undefined; ids: string[]; width: number }[] = [];
	for (const id of across) {
		const peers = peersOf(id);
		const last = runs.at(-1);
		const box = boxes.get(id)!;
		if (peers !== undefined && last?.peers === peers) {
			last.ids.push(id);
			last.width = box.x + box.width - boxes.get(last.ids[0]!)!.x;
		} else runs.push({ peers, ids: [id], width: box.width });
	}
	return runs;
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
 * @param earlier What an earlier layout decided: the wall each port moves to, and each packing, kept.
 * @param earlier.exits The wall each port moves to.
 * @param earlier.packings Each block of blocks' packing.
 * @param nesting How containers and group regions are drawn.
 * @param apart The blocks whose joins keep ports of their own, by id.
 * @returns The blocks, every block laid out, and each block of blocks' packing.
 */
function layAll(
	viz: Viz,
	avoid: AvoidEngine,
	graph: ElkNode,
	earlier: { exits: ReadonlyMap<string, Side>; packings: ReadonlyMap<string, Packing> } | undefined,
	nesting: Nesting,
	apart: ReadonlySet<string>,
): { tree: BlockTree; laid: Map<string, Laid>; packings: Map<string, Packing> } {
	const tree = new BlockTree(graph, earlier?.exits ?? new Map(), nesting, apart);
	const laid = new Map<string, Laid>();
	const packings = new Map<string, Packing>();
	for (const block of tree.innermostFirst()) {
		if (packsBlocks(tree, block, nesting)) {
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
 * Lay a measured hierarchy out one way and route every relationship; when a
 * line's blocks do not stand the way its faces point, once more with every
 * block of its chain crossed by the edges that face each other (`sides.ts`). Last, the ports on
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
	const last =
		exits.size === 0
			? first
			: layAll(viz, avoid, graph, { exits, packings: first.packings }, nesting, apart);
	const unsettled = new Map(last.laid);
	settlePorts({ ...last, insetsOf, avoid });
	if (
		routedScore(...pageAndLines(last.tree, unsettled)) >
		routedScore(...pageAndLines(last.tree, last.laid))
	)
		for (const [id, laid] of unsettled) last.laid.set(id, laid);
	return last;
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
): { tree: BlockTree; placed: Placed } {
	return layJoined((apart) => {
		const { tree, laid } = layOut(viz, avoid, graph, nesting, apart);
		return { tree, placed: new Assembly(tree, laid).placed() };
	});
}

/**
 * A drawing's page and every relationship's points, as drawn.
 * @param tree The blocks.
 * @param laid Every block laid out.
 * @returns The page and the points.
 */
function pageAndLines(
	tree: BlockTree,
	laid: ReadonlyMap<string, Laid>,
): [{ width: number; height: number }, Point[][]] {
	const placed = new Assembly(tree, laid).placed();
	return [placed, placed.edges.map(({ points }) => points)];
}

/**
 * How readable a whole drawing is: its page, and the crossings of its lines
 * as drawn, where pieces of one line in different blocks are joined.
 * @param placed The drawing's geometry.
 * @returns The score.
 */
function drawingScore(placed: Placed): number {
	const crossings = crossingsOf(placed.edges.map(({ points }) => points));
	return scoreOf({ width: placed.width, height: placed.height, crossings });
}

/**
 * Whether a board laid with its groups packed reads better than laid inline:
 * it scores higher, draws no more line, and fits the pane no worse. Blocks
 * standing side by side can trade a line's straight run for one round both
 * blocks, which the score alone does not see; and packing is for a page the
 * board's own ranks spread out, so a packing that fits worse only buys its
 * crossings with lines run round the blocks.
 * @param packed The drawing with groups packed.
 * @param inline The drawing with groups inline.
 * @returns True when the packed one reads better.
 */
function readsBetterPacked(packed: Placed, inline: Placed): boolean {
	const [packs, inlines] = [packed, inline].map(({ edges }) => edges.map(({ points }) => points));
	return (
		drawingScore(packed) > drawingScore(inline) &&
		lineLength(packs!) <= lineLength(inlines!) &&
		fitIn(packed) >= fitIn(inline)
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
	const { tree, placed: drawn } = layJoinedOut(viz, avoid, graph, inline ? "inline" : "blocks");
	const placed = inline && hasRegions(tree) ? betterOf(viz, avoid, graph, drawn) : drawn;
	return {
		id: graph.id,
		x: 0,
		y: 0,
		width: placed.width,
		height: placed.height,
		layoutOptions: { ...graph.layoutOptions, [BLOCKS_PLACED]: JSON.stringify(placed) },
	};
}

/**
 * The better of a board drawn inline and drawn with each group's region
 * packed as a block of its own.
 * @param viz The initialized Graphviz instance.
 * @param avoid The initialized libavoid module.
 * @param graph The measured hierarchy.
 * @param inline The board drawn inline.
 * @returns The drawing's geometry.
 */
function betterOf(viz: Viz, avoid: AvoidEngine, graph: ElkNode, inline: Placed): Placed {
	const packed = layJoinedOut(viz, avoid, graph, "groups").placed;
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

// The block engine, run where the layout engines run. Every block is laid out
// on its own, innermost first, so its size is final before its parent places
// it as one box: a block of blocks is packed and its trunks routed
// (`pack.ts`); a block of cards is ranked and routed on tracks
// (`card-layout.ts`), its widest rank wrapped into rows (`wraps.ts`) or its
// ranks folded into columns (`fold.ts`) where that is worth taking. Last,
// every block is put where its parent placed it and each relationship's
// lines are joined end to end (`assembly.ts`). One solve lays the board out
// one way: which way its joins are kept and whether a board's groups are
// packed are chosen where the renderer runs (`solves.ts`). Whether a block's
// containers stack, the joins, and the packing of a board's groups take the
// layout that reads better, as drawn (`weighing.ts`), only where their
// earlier weighing agrees or it reads no worse anywhere (`takes` in
// track/score.ts); settling ports, holding a port order and wrapping keep
// their earlier weighing.
import type { ElkNode } from "@archboard/elk-rs";
import { z } from "zod";
import { fitIn } from "@/shared/shell-geometry/index";
import { CONTAINER_INSET } from "@/transformers/semantic-renderer/config";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import { Assembly } from "@/transformers/semantic-renderer/lib/blocks/assembly";
import { CardLayout } from "@/transformers/semantic-renderer/lib/blocks/card-layout";
import { foldBlock, foldPlan } from "@/transformers/semantic-renderer/lib/blocks/fold";
import { FoldLayout } from "@/transformers/semantic-renderer/lib/blocks/fold-layout";
import {
	answeringOnce,
	type Graphviz,
} from "@/transformers/semantic-renderer/lib/blocks/graphviz-once";
import { corners, type Insets, type Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import { NestingSchema, type Nesting } from "@/transformers/semantic-renderer/lib/blocks/inline";
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
import { routedWeighed } from "@/transformers/semantic-renderer/lib/blocks/trunks";
import { weighedLaid } from "@/transformers/semantic-renderer/lib/blocks/weighing";
import { BlockTree, type Block, type Side } from "@/transformers/semantic-renderer/lib/blocks/tree";
import { PAGE_MARGIN } from "@/transformers/semantic-renderer/lib/track/route";
import { crossingsOf, scoreOf, takes } from "@/transformers/semantic-renderer/lib/track/score";

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
function layCards(viz: Graphviz, tree: BlockTree, block: Block, laid: Map<string, Laid>): Laid {
	const insets = insetsOf(block);
	const { whole, stacked } = stackedOrNot(viz, tree, block, laid);
	const wrapped = bestWrap(viz, tree, block, { laid, whole, stacked, insets });
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

/** How near two scores or fits of a block are for the stacking choice's earlier weighing to call them tied. */
const NEAR = 0.05;

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
 * How a block laid out whole scores at its best ({@link scoreOf}): as it
 * stands, or folded.
 * @param block The block.
 * @param laid The block laid out whole.
 * @returns The better score.
 */
function bestScore(block: Block, laid: Laid): number {
	const plan = foldPlan(block, laid, insetsOf(block), weighed(laid));
	return Math.max(scoreOf(weighed(laid)), plan === undefined ? 0 : scoreOf(plan.weighed));
}

/**
 * A block of cards laid out whole: with the containers a line from another
 * container enters stacked below it, or else as Graphviz ranks them. Stacked
 * is taken where it scores better as before ADR 0039 ({@link scoresStacked})
 * and its lines as drawn read better, or where either way it is chosen reads
 * no worse on any measure than the other ({@link takes}).
 * @param viz The initialized Graphviz instance.
 * @param tree The blocks.
 * @param block The block.
 * @param laid Every block laid out so far.
 * @returns The block laid out, and whether it stacks. Its titles are pulled
 * onto their members where that crosses and draws no more line, and may
 * change whether it stacks only when the choice then draws no more line.
 */
function stackedOrNot(
	viz: Graphviz,
	tree: BlockTree,
	block: Block,
	laid: Map<string, Laid>,
): { whole: Laid; stacked: boolean } {
	const insets = insetsOf(block);
	const plain = layBoth(viz, () => new CardLayout(block, laid, tree, insets));
	if (!new CardLayout(block, laid, tree, insets).stacks())
		return { whole: settled(plain), stacked: false };
	const stacked = layBoth(viz, () => new CardLayout(block, laid, tree, insets, { stacked: true }));
	const ways = { stacked, plain };
	const earlier = pulledOrTied(
		ways,
		scoresStacked(block, ways, ({ tied }) => tied),
		scoresStacked(block, ways, settled),
	);
	const chosen = takes(weighedLaid(settled(stacked)), weighedLaid(settled(plain)), earlier);
	return { whole: settled(chosen ? stacked : plain), stacked: chosen };
}

/**
 * Whether a block stacks, chosen with its titles tied and pulled down:
 * pulling them down may change the choice only when that draws no more line.
 * @param ways The block laid out stacked and plain.
 * @param ways.stacked It stacked.
 * @param ways.plain It plain.
 * @param tied Whether it stacks, chosen with its titles tied.
 * @param pulled Whether it stacks, chosen with them pulled down.
 * @returns Whether it stacks.
 */
function pulledOrTied(
	{ stacked, plain }: { stacked: Laying; plain: Laying },
	tied: boolean,
	pulled: boolean,
): boolean {
	const [was, is] = [tied, pulled].map((one) => settled(one ? stacked : plain));
	return tied !== pulled && lineLength(is!.lines.values()) > lineLength(was!.lines.values())
		? tied
		: pulled;
}

/**
 * Whether a block stacks on its score, as before ADR 0039: each way weighed
 * at its best ({@link bestScore}), a near tie going to the page that fits
 * the pane clearly better, as it does between a block's joins, and to the
 * better score where neither page fits clearly better.
 * @param block The block.
 * @param ways The block laid out stacked and plain.
 * @param ways.stacked It stacked.
 * @param ways.plain It plain.
 * @param pick Which of each way the titles stand is weighed.
 * @returns True when it stacks.
 */
function scoresStacked(
	block: Block,
	{ stacked, plain }: { stacked: Laying; plain: Laying },
	pick: (laying: Laying) => Laid,
): boolean {
	const [one, other] = [bestScore(block, pick(stacked)), bestScore(block, pick(plain))];
	const [fits, flat] = [fitIn(pick(stacked)), fitIn(pick(plain))];
	return near(one, other) && !near(fits, flat) ? fits > flat : one > other;
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
	viz: Graphviz,
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
	viz: Graphviz,
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
		.reduce((one, other) =>
			other.crossings < one.crossings && other.bends <= one.bends ? other : one,
		);
}

/**
 * A layout with its ports settled, unless the drawing scores better
 * unsettled ({@link scoreOf}) on its lines as the blocks route them, before
 * the steps they need not take are taken out, the line its routes run round
 * what they pass counted as crossings at the trunk router's rate. It is the
 * one choice ADR 0039's measures do not weigh: on them, the settled layout of
 * Browser application (Blocks) ran "the pane socket" 480 px along Browser
 * client's bottom wall, where a reader cannot tell the line from the frame;
 * held to the score wherever it read worse on some measure ({@link takes}),
 * Public ownership (Common-WebLib, Blocks) crossed four lines more and IIS
 * data (Cloud Infrastructure, Blocks) one, each settling a parted join.
 * @param laying The layout; its blocks are replaced.
 * @param avoid The initialized libavoid module.
 * @returns The blocks, every block laid out, and how often the drawing's lines cross and turn.
 */
function settledOrNot(
	laying: Board,
	avoid: AvoidEngine,
): { tree: BlockTree; laid: Map<string, Laid>; crossings: number; bends: number } {
	const unsettled = new Map(laying.laid);
	settlePorts({ ...laying, insetsOf, avoid });
	const [was, is] = [unsettled, laying.laid].map((laid) => {
		const placed = new Assembly(laying.tree, laid).placed();
		return scoreOf(
			routedWeighed(
				placed,
				placed.edges.map(({ points }) => points),
			),
		);
	});
	if (was! > is!) for (const [id, laid] of unsettled) laying.laid.set(id, laid);
	const lines = new Assembly(laying.tree, laying.laid).placed().edges.map(({ points }) => points);
	return {
		tree: laying.tree,
		laid: laying.laid,
		crossings: crossingsOf(lines),
		bends: lines.reduce((sum, points) => sum + corners(points).length - 2, 0),
	};
}

/** The root option naming how a solve draws the board's containers and group regions (`inline.ts`). */
const BLOCKS_NESTING = "archboard.blocks.nesting";
/** The root option naming the blocks whose joins a solve keeps apart, as a JSON list of ids (`joins.ts`). */
const BLOCKS_APART = "archboard.blocks.apart";

/**
 * Lay a measured hierarchy out as blocks one way and route every
 * relationship: its containers and group regions drawn as its root options
 * name, else packed as blocks, or inline when asked; and the joins of the
 * blocks they name kept apart. Which way reads best is chosen where the
 * renderer runs (`solves.ts`).
 * @param viz The initialized Graphviz instance.
 * @param avoid The initialized libavoid module.
 * @param graph The measured hierarchy.
 * @param inline Whether containers and group regions are drawn inline, as
 * clusters of the board's own layout, when its options name no way.
 * @returns The hierarchy, with the drawing's geometry on its root.
 */
function placeBlocks(viz: Graphviz, avoid: AvoidEngine, graph: ElkNode, inline = false): ElkNode {
	const options = graph.layoutOptions ?? {};
	const nesting = NestingSchema.parse(options[BLOCKS_NESTING] ?? (inline ? "inline" : "blocks"));
	const apart = new Set(ApartSchema.parse(JSON.parse(options[BLOCKS_APART] ?? "[]")));
	const { tree, laid } = layOut(answeringOnce(viz), avoid, graph, nesting, apart);
	const placed = Assembly.unstepped(new Assembly(tree, laid).placed());
	return {
		id: graph.id,
		x: 0,
		y: 0,
		width: placed.width,
		height: placed.height,
		layoutOptions: { ...graph.layoutOptions, [BLOCKS_PLACED]: JSON.stringify(placed) },
	};
}

/** The blocks a solve keeps apart. */
const ApartSchema = z.array(z.string());

export { BLOCKS_APART, BLOCKS_NESTING, BLOCKS_PLACED, placeBlocks };

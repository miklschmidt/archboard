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
// shared/rules/track/scene/score.ts); settling ports, holding a port order and wrapping keep
// their earlier weighing.
import type { ElkNode } from "@archboard/elk-rs";
import { z } from "zod";
import { CONTAINER_INSET, REGION_INSET } from "#shared/constants/spacing.ts";
import { Assembly } from "#shared/rules/blocks/tree/assembly.ts";
import { CardLayout } from "#shared/rules/blocks/cards/card-layout.ts";
import { foldBlock, foldPlan } from "#shared/rules/blocks/folds/fold.ts";
import { FoldLayout } from "#shared/rules/blocks/folds/fold-layout.ts";
import { answeringOnce, type Graphviz } from "#shared/rules/blocks/cards/graphviz-once.ts";
import { corners, type Insets, type Laid } from "#shared/rules/blocks/tree/laid.ts";
import { grownInsets, widened } from "#shared/rules/blocks/tree/lone.ts";
import { NestingSchema, type Nesting } from "#shared/rules/blocks/tree/inline.ts";
import { bestWrap, weighed } from "#shared/rules/blocks/folds/wraps.ts";
import { layBoth, settled } from "#shared/rules/blocks/cards/laying.ts";
import { PackLayout, type Packing } from "#shared/rules/blocks/packing/pack.ts";
import { settlePorts } from "#shared/rules/blocks/packing/settle.ts";
import { sidesOf } from "#shared/rules/blocks/packing/sides.ts";
import { heldOrders } from "#shared/rules/blocks/cards/orders.ts";
import { routedWeighed } from "#shared/rules/blocks/packing/trunks.ts";
import {
	BLOCKS_STACKING,
	BLOCKS_STOOD,
	BLOCKS_UNTIL_STOOD,
	StoodLaid,
	stackedOrNot,
	type Stacking,
	type Stood,
} from "#shared/rules/blocks/tree/stacking.ts";
import { facingTurns } from "#shared/rules/blocks/packing/walls.ts";
import { awayPlaced } from "#shared/rules/blocks/lines/away.ts";
import { BlockTree, type Block, type Side } from "#shared/rules/blocks/tree/tree.ts";
import { PAGE_MARGIN } from "#shared/rules/track/routes/route.ts";
import { crossingsOf, scoreOf } from "#shared/rules/track/scene/score.ts";

/** The root option carrying the placed drawing, as the JSON the assembly answers. */
const BLOCKS_PLACED = "archboard.blocks.placed";

/**
 * The insets a block keeps: left and right, above its first rank, below its last.
 * @param block The block.
 * @returns Its insets.
 */
function insetsOf(block: Block): Insets {
	return grownInsets(plainInsets(block), block.lone);
}

/**
 * The room a block keeps around what it holds, alone in no region.
 * @param block The block.
 * @returns Its insets.
 */
function plainInsets(block: Block): Insets {
	if (block.kind === "root") return { side: PAGE_MARGIN, top: PAGE_MARGIN, bottom: PAGE_MARGIN };
	if (block.kind === "column" || block.kind === "cluster") return { side: 0, top: 0, bottom: 0 };
	const inset = block.kind === "frame" ? CONTAINER_INSET : REGION_INSET;
	return { side: inset, top: 0, bottom: [...block.ports.values()].includes("bottom") ? 0 : inset };
}

/**
 * Lay one block of cards out: whole, stacked or not (`stacking.ts`), its
 * widest rank wrapped into rows when that reads clearly better, or folded
 * into columns when that does.
 * @param viz The initialized Graphviz instance.
 * @param tree The blocks.
 * @param block The block.
 * @param laid Every block laid out so far; the columns are added to it.
 * @param stacking The solve's stacking choice.
 * @returns The laid-out block.
 */
function layCards(
	viz: Graphviz,
	tree: BlockTree,
	block: Block,
	laid: Map<string, Laid>,
	stacking: Stacking,
): Laid {
	const insets = insetsOf(block);
	const { whole, stacked } = stackedOrNot(viz, tree, block, { laid, insets }, stacking);
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
 * Lay one block out: packed with its child blocks as the pieces, or as cards.
 * @param viz The initialized Graphviz instance.
 * @param board The blocks, every block laid out so far and each block of blocks' packing; the block's are set.
 * @param block The block.
 * @param kept What an earlier layout decided, and the solve's stacking choice.
 * @param kept.earlier What an earlier layout decided, kept.
 * @param kept.stacking The solve's stacking choice.
 * @returns The laid-out block.
 */
function layBlock(
	viz: Graphviz,
	board: Board,
	block: Block,
	{ earlier, stacking }: { earlier: Earlier; stacking: Stacking },
): Laid {
	const { tree, laid, packings } = board;
	if (!packsBlocks(tree, block, tree.nesting)) return layCards(viz, tree, block, laid, stacking);
	const packed = new PackLayout(block, laid, tree, insetsOf(block)).lay(
		earlier.packings.get(block.id),
	);
	packings.set(block.id, packed.packing);
	return packed;
}

/**
 * Lay every block out, innermost first. A container alone in its region
 * whose caption needs the region wider is laid out again, standing in the
 * middle of the wider region (`lone.ts`).
 * @param viz The initialized Graphviz instance.
 * @param graph The measured hierarchy.
 * @param earlier What an earlier layout decided, kept.
 * @param nesting How containers and group regions are drawn.
 * @param way The blocks whose joins keep ports of their own, and the solve's stacking choice.
 * @param way.apart The blocks whose joins keep ports of their own, by id.
 * @param way.stacking The solve's stacking choice.
 * @returns The blocks, every block laid out, and each block of blocks' packing.
 */
function layAll(
	viz: Graphviz,
	graph: ElkNode,
	earlier: Earlier = NOTHING_EARLIER,
	nesting: Nesting,
	{ apart, stacking }: { apart: ReadonlySet<string>; stacking: Stacking },
): Board {
	const tree = new BlockTree(graph, earlier.exits, nesting, apart, earlier.orders, earlier.facing);
	const board = { tree, laid: new Map<string, Laid>(), packings: new Map<string, Packing>() };
	const kept = { earlier, stacking };
	for (const block of tree.innermostFirst()) {
		const once = layBlock(viz, board, block, kept);
		const wider = block.lone && widened(block.lone, once.width);
		if (wider !== undefined) {
			block.lone = wider;
			tree.lone.set(block.id, wider);
		}
		board.laid.set(block.id, wider === undefined ? once : layBlock(viz, board, block, kept));
	}
	return board;
}

/** What an earlier layout decided, which a layout again keeps. */
interface Earlier {
	/** The edge each port moves to (`sides.ts`). */
	readonly exits: ReadonlyMap<string, Side>;
	/** Each block of blocks' packing. */
	readonly packings: ReadonlyMap<string, Packing>;
	/** The ports each block holds in an order on a face (`orders.ts`). */
	readonly orders?: ReadonlyMap<string, readonly string[]>;
	/** Whether every block faces the walls its lines cross (`BlockTree`). */
	readonly facing?: boolean;
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
 * block of its chain crossed by the edges that face each other (`sides.ts`),
 * and every block facing its walls when asked (`BlockTree`). Where settling
 * would swap ports on a block of cards' face, once more with those ports
 * held in the settled order (`orders.ts`), kept where it crosses fewer
 * lines. Not while a join is parted: the joins choice would then prefer a
 * parted drawing that runs a line round a block. Last, the ports on every
 * block's top and bottom are settled where both ends of their trunks are
 * known, and the blocks routed again with them there.
 * @param viz The initialized Graphviz instance.
 * @param graph The measured hierarchy.
 * @param nesting How containers and group regions are drawn.
 * @param way Which joins to keep apart, whether every block faces its walls, and the solve's stacking choice.
 * @param way.apart The blocks whose joins keep ports of their own, by id.
 * @param way.facing Whether every block faces its walls.
 * @param way.stacking The solve's stacking choice (`stacking.ts`).
 * @returns The blocks, every block laid out, and whether facing every block's
 * walls changes them ({@link facesOf}).
 */
function layOut(
	viz: Graphviz,
	graph: ElkNode,
	nesting: Nesting,
	way: { apart: ReadonlySet<string>; facing: boolean; stacking: Stacking },
): { tree: BlockTree; laid: Map<string, Laid>; faces: boolean } {
	const { apart, facing } = way;
	const first = layAll(viz, graph, undefined, nesting, way);
	const exits = sidesOf(first.tree, first.laid);
	const faces = facesOf(graph, exits, nesting, apart);
	const kept = { exits, packings: first.packings, facing: facing && faces };
	const last = exits.size === 0 ? first : layAll(viz, graph, kept, nesting, way);
	const orders = apart.size > 0 ? new Map() : heldOrders({ ...last, insetsOf });
	const held = orders.size === 0 ? [] : [layAll(viz, graph, { ...kept, orders }, nesting, way)];
	const { tree, laid } = [last, ...held]
		.map((laying) => settledOrNot(laying))
		.reduce((one, other) =>
			other.crossings < one.crossings && other.bends <= one.bends ? other : one,
		);
	return { tree, laid, faces };
}

/**
 * Whether facing every block's walls would change a board's blocks
 * ({@link facingTurns}). Only Blocks faces them: drawn inline, no drawing
 * of either vault changed by facing them (`solves.ts`).
 * @param graph The measured hierarchy.
 * @param exits The wall each port moves to (`sides.ts`).
 * @param nesting How containers and group regions are drawn.
 * @param apart The blocks whose joins keep ports of their own, by id.
 * @returns True when it would.
 */
function facesOf(
	graph: ElkNode,
	exits: ReadonlyMap<string, Side>,
	nesting: Nesting,
	apart: ReadonlySet<string>,
): boolean {
	if (nesting !== "blocks" || exits.size === 0) return false;
	return facingTurns(new BlockTree(graph, exits, nesting, apart, undefined, true));
}

/**
 * A layout with its ports settled, unless the drawing scores better
 * unsettled ({@link scoreOf}) on its lines as the blocks route them, before
 * the steps they need not take are taken out, the line its routes run round
 * what they pass counted as crossings at the trunk router's rate, and so is
 * each line's run away from its ends (`away.ts`): settled, two lines of
 * Inside Rust device trust library (Blocks) ran down the far left of the
 * page and along its foot to cross eight lines fewer. It is the
 * one choice ADR 0039's measures do not weigh: on them, the settled layout of
 * Browser application (Blocks) ran "the pane socket" 480 px along Browser
 * client's bottom wall, where a reader cannot tell the line from the frame;
 * held to the score wherever it read worse on some measure ({@link takes}),
 * Public ownership (Common-WebLib, Blocks) crossed four lines more and IIS
 * data (Cloud Infrastructure, Blocks) one, each settling a parted join.
 * @param laying The layout; its blocks are replaced.
 * @returns The blocks, every block laid out, and how often the drawing's lines cross and turn.
 */
function settledOrNot(laying: Board): {
	tree: BlockTree;
	laid: Map<string, Laid>;
	crossings: number;
	bends: number;
} {
	const unsettled = new Map(laying.laid);
	settlePorts({ ...laying, insetsOf });
	const [was, is] = [unsettled, laying.laid].map((laid) => {
		const placed = new Assembly(laying.tree, laid).placed();
		return scoreOf({
			...routedWeighed(
				placed,
				placed.edges.map(({ points }) => points),
			),
			away: awayPlaced(laying.tree.projections, placed),
		});
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
/** The root option asking a solve to face every block's walls, `true` when asked (`solves.ts`). */
const BLOCKS_FACING = "archboard.blocks.facing";

/**
 * Lay a measured hierarchy out as blocks one way and route every
 * relationship: its containers and group regions drawn as its root options
 * name, else packed as blocks, or inline when asked; the joins of the
 * blocks they name kept apart; and its first block that could stack laid
 * only the way they name, if they name one, telling what that way stood at,
 * and answering only that once it is laid where they ask so.
 * Which way reads best is chosen where the renderer runs (`solves.ts`).
 * @param viz The initialized Graphviz instance.
 * @param graph The measured hierarchy.
 * @param inline Whether containers and group regions are drawn inline, as
 * clusters of the board's own layout, when its options name no way.
 * @returns The hierarchy, with the drawing's geometry on its root.
 */
function placeBlocks(viz: Graphviz, graph: ElkNode, inline = false): ElkNode {
	const { nesting, ...way } = wayOf(graph.layoutOptions ?? {}, inline);
	let laidOut: ReturnType<typeof layOut>;
	try {
		laidOut = layOut(answeringOnce(viz), graph, nesting, way);
	} catch (error) {
		if (!(error instanceof StoodLaid)) throw error;
		return answer(graph, { width: 0, height: 0 }, toldStood(error.stood));
	}
	const { tree, laid, faces } = laidOut;
	const placed = { ...Assembly.unstepped(new Assembly(tree, laid).placed()), faces };
	return answer(graph, placed, {
		[BLOCKS_PLACED]: JSON.stringify(placed),
		...toldStood(way.stacking.stood),
	});
}

/**
 * The way a solve's root options ask it to lay a board out.
 * @param options The root options.
 * @param inline Whether containers and group regions are drawn inline when the options name no way.
 * @returns How its containers and group regions are drawn, which joins stay
 * apart, whether every block faces its walls, and its stacking choice.
 */
function wayOf(
	options: Readonly<Record<string, string>>,
	inline: boolean,
): { nesting: Nesting; apart: ReadonlySet<string>; facing: boolean; stacking: Stacking } {
	return {
		nesting: NestingSchema.parse(options[BLOCKS_NESTING] ?? (inline ? "inline" : "blocks")),
		apart: new Set(ApartSchema.parse(JSON.parse(options[BLOCKS_APART] ?? "[]"))),
		facing: options[BLOCKS_FACING] === "true",
		stacking: {
			way: StackingSchema.parse(options[BLOCKS_STACKING]),
			until: options[BLOCKS_UNTIL_STOOD] === "true",
		},
	};
}

/**
 * The root option telling what a solve's first block that could stack stood at, once laid one way.
 * @param stood What it stood at, if it was laid one way.
 * @returns The option, or none.
 */
function toldStood(stood: Stood | undefined): Record<string, string> {
	return stood === undefined ? {} : { [BLOCKS_STOOD]: JSON.stringify(stood) };
}

/**
 * A solve's answer: the hierarchy's root, as large as the drawing, carrying it in its options.
 * @param graph The measured hierarchy.
 * @param size How large the drawing is.
 * @param size.width Its width.
 * @param size.height Its height.
 * @param told What the solve tells, by root option.
 * @returns The answer.
 */
function answer(
	graph: ElkNode,
	{ width, height }: { width: number; height: number },
	told: Readonly<Record<string, string>>,
): ElkNode {
	return {
		id: graph.id,
		x: 0,
		y: 0,
		width,
		height,
		layoutOptions: { ...graph.layoutOptions, ...told },
	};
}

/** The blocks a solve keeps apart. */
const ApartSchema = z.array(z.string());
/** The way a solve lays its first block that could stack, if it names one. */
const StackingSchema = z
	.enum(["true", "false"])
	.optional()
	.transform((way) => (way === undefined ? undefined : way === "true"));

export { BLOCKS_APART, BLOCKS_FACING, BLOCKS_NESTING, BLOCKS_PLACED, placeBlocks };

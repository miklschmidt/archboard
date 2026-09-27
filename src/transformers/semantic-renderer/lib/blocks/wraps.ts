// A block of cards' widest rank wrapped into rows, or its loose cards set out
// as a grid, when that is worth taking over the block whole. The board's wrap
// is weighed on how it reads (ADR 0039); a block inside the board is laid out
// before its parent packs it, so its wrap is weighed on its score, its fit
// standing for how well its parent can pack it (`scoreOf` in track/score.ts).
import type { Viz } from "@viz-js/viz";
import { REFERENCE_PANE, fitIn } from "@/shared/shell-geometry/index";
import { CardLayout } from "@/transformers/semantic-renderer/lib/blocks/card-layout";
import type { Insets, Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import { layBoth, settled, type Laying } from "@/transformers/semantic-renderer/lib/blocks/laying";
import type { Nesting } from "@/transformers/semantic-renderer/lib/blocks/inline";
import type { Block, BlockTree } from "@/transformers/semantic-renderer/lib/blocks/tree";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { grids } from "@/transformers/semantic-renderer/lib/track/grid";
import {
	costOf,
	crossingsOf,
	readsBetter,
	scoreOf,
	scoresBetter,
	sinks,
	worthTaking,
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
/**
 * What a laid-out block is weighed on: its page, and its crossings with each
 * line that laps round it counted as one more.
 * @param laid The block laid out.
 * @returns Its page and crossings.
 */
function weighed(laid: Laid): Weighed {
	const crossings = crossingsOf(laid.lines.values()) + (laid.laps ?? 0);
	return { width: laid.width, height: laid.height, crossings };
}

/**
 * The block's widest rank wrapped into rows, or its loose cards set out as a
 * grid, when that reads clearly better than the block whole.
 * @param viz The initialized Graphviz instance.
 * @param tree The blocks.
 * @param block The block.
 * @param laying Every block laid out so far, this one whole, whether it stacks, and its insets.
 * @param laying.laid Every block laid out so far.
 * @param laying.whole This block laid out whole.
 * @param laying.stacked Whether its containers stack.
 * @param laying.insets Its insets.
 * @returns The best wrap, or nothing when the block stays whole.
 */
function bestWrap(
	viz: Viz,
	tree: BlockTree,
	block: Block,
	laying: { laid: Map<string, Laid>; whole: Laid; stacked: boolean; insets: Insets },
): Laid | undefined {
	const { laid, stacked, insets } = laying;
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
		(one, other) => (one === undefined || wrapsBetter(other, one, block) ? other : one),
		undefined,
	);
	if (best === undefined || !worthWrapping(weighed(best.laid), weighed(laying.whole), block))
		return undefined;
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
 * Whether a block's best wrap is taken over the block whole. The board's is
 * taken where it reads better, or as well and fits the page clearly better
 * ({@link worthTaking}). A block inside the board is laid out before its
 * parent packs it, so how its wrap will read is not known yet: its wrap is
 * taken where it scores clearly better ({@link scoreOf}), its fit standing
 * for how well its parent can pack it.
 * @param wrap The wrap.
 * @param whole The block whole.
 * @param block The block.
 * @returns True when the wrap is taken.
 */
function worthWrapping(wrap: Weighed, whole: Weighed, block: Block): boolean {
	if (block.kind === "root") return worthTaking(wrap, whole, WORTH_WRAPPING);
	return scoreOf(wrap) > scoreOf(whole) * WORTH_WRAPPING_INSIDE;
}

/**
 * Whether one wrap of a block is better than another, on what the block's
 * wraps are weighed on ({@link worthWrapping}), or, tied, deals its rank
 * into fewer rows. Two wraps that both fit the reference pane at full scale
 * fit it the same, and one dealt into more rows only saves area: a wrap is
 * for a rank too wide for the pane, and each row more steps the rank further
 * from how it reads.
 * @param one A wrap.
 * @param other Another.
 * @param block The block.
 * @returns True when the first is better.
 */
function wrapsBetter(one: Wrapped, other: Wrapped, block: Block): boolean {
	const [mine, theirs] = [weighed(one.laid), weighed(other.laid)];
	const root = block.kind === "root";
	const fewer = fewerRows(one, other);
	if (fewer !== undefined && tied(mine, theirs, root)) return fewer;
	return root ? readsBetter(mine, theirs) : scoresBetter(mine, theirs);
}

/**
 * Whether one wrap deals its rank into fewer rows than another.
 * @param one A wrap.
 * @param other Another.
 * @returns True or false, or nothing when either is a grid or both deal as many rows.
 */
function fewerRows(one: Wrapped, other: Wrapped): boolean | undefined {
	if (one.rows === undefined || other.rows === undefined || one.rows === other.rows)
		return undefined;
	return one.rows < other.rows;
}

/**
 * Whether two wraps weigh the same, ignoring their area.
 * @param one A wrap.
 * @param other Another.
 * @param root Whether they wrap the board, and are weighed on how they read.
 * @returns True when they do.
 */
function tied(one: Weighed, other: Weighed, root: boolean): boolean {
	return root
		? costOf(one) === costOf(other) && fitIn(one) === fitIn(other)
		: Math.abs(scoreOf(one) - scoreOf(other)) <= 1e-9;
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

export { bestWrap, weighed };

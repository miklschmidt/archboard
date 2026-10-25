// A block of cards' widest rank wrapped into rows, or its loose cards set out
// as a grid, when that scores clearly better than the block whole (`scoreOf`
// in shared/rules/track/scene/score.ts).
import type { Graphviz } from "#shared/rules/blocks/cards/graphviz-once.ts";
import { LAYOUT_ASPECT } from "#shared/constants/shell-geometry.ts";
import { CardLayout } from "#shared/rules/blocks/cards/card-layout.ts";
import type { Insets, Laid } from "#shared/rules/blocks/tree/laid.ts";
import { layBoth, settled, type Laying } from "#shared/rules/blocks/cards/laying.ts";
import type { Block, BlockTree } from "#shared/rules/blocks/tree/tree.ts";
import type { Box } from "#shared/rules/geometry.ts";
import { grids } from "#shared/rules/track/channels/grid.ts";
import {
	crossingsOf,
	scoreOf,
	scoresBetter,
	sinks,
	wrapPlans,
	type Weighed,
} from "#shared/rules/track/scene/score.ts";

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
	viz: Graphviz,
	tree: BlockTree,
	block: Block,
	laying: { laid: Map<string, Laid>; whole: Laid; stacked: boolean; insets: Insets },
): Laid | undefined {
	const worth = block.kind === "root" ? WORTH_WRAPPING : WORTH_WRAPPING_INSIDE;
	const needed = scoreOf(weighed(laying.whole)) * worth;
	// No layout scores above one, a page that fits at full scale and crosses
	// nothing: a block that needs a wrap to score more keeps whole unweighed.
	return needed < 1 ? wrapScoring(viz, tree, block, { ...laying, needed }) : undefined;
}

/**
 * The block's best wrap or grid, when it scores more than the block needs.
 * @param viz The initialized Graphviz instance.
 * @param tree The blocks.
 * @param block The block.
 * @param laying Every block laid out so far, this one whole, whether it stacks, its insets, and the score a wrap must beat.
 * @param laying.laid Every block laid out so far.
 * @param laying.whole This block laid out whole.
 * @param laying.stacked Whether its containers stack.
 * @param laying.insets Its insets.
 * @param laying.needed The score a wrap must beat.
 * @returns The best wrap, or nothing when the block stays whole.
 */
function wrapScoring(
	viz: Graphviz,
	tree: BlockTree,
	block: Block,
	laying: {
		laid: Map<string, Laid>;
		whole: Laid;
		stacked: boolean;
		insets: Insets;
		needed: number;
	},
): Laid | undefined {
	const { laid, stacked, insets, needed } = laying;
	const gridded = new CardLayout(block, laid, tree, insets).looseCards().some(grids)
		? [
				wrapOf(
					layBoth(viz, () => new CardLayout(block, laid, tree, insets, { grid: true, stacked })),
				),
			]
		: [];
	/**
	 * The innermost cluster around a card, if any.
	 * @param card The card.
	 * @returns The cluster.
	 */
	const around = (card: string): string | undefined => block.clusterOf.get(card);
	// A wrap that sinks a card stands it off on a late rank, away from its
	// neighbours; it may fit the page better, but it is no wrap. Where a card
	// stands across the block is settled before its lines are routed, so a
	// wrap lined up that sinks one is not routed at all.
	const wraps = wrapsOf(laying.whole, block, tree).flatMap((lowered) =>
		[false, true]
			.map(
				(columns) => () => new CardLayout(block, laid, tree, insets, { lowered, stacked, columns }),
			)
			.filter((make) => !sinks(lowered, linedUp(viz, make()), around))
			.map((make) => wrapOf(layBoth(viz, make), lowered))
			.filter(({ laid: { boxes } }) => !sinks(lowered, boxes, around)),
	);
	// A wrap is chosen with its titles tied; only the chosen one is laid again with them pulled down.
	const best = [...gridded, ...wraps].reduce<Wrapped | undefined>(
		(one, other) => (one === undefined || wrapsBetter(other, one) ? other : one),
		undefined,
	);
	if (best === undefined || scoreOf(weighed(best.laid)) <= needed) return undefined;
	const kept = settled({ tied: best.laid, untied: best.untied });
	const sunk = sinks(best.lowered, kept.boxes, around);
	return sunk ? best.laid : kept;
}

/**
 * Whether one wrap reads better than another: it scores higher
 * ({@link scoresBetter}), or, as well, deals its rank into fewer rows. Two
 * wraps that both fit the reference pane at full scale score the same, and
 * one dealt into more rows only saves area: a wrap is for a rank too wide
 * for the pane, and each row more steps the rank further from how it reads.
 * @param one A wrap.
 * @param other Another.
 * @returns True when the first reads better.
 */
function wrapsBetter(one: Wrapped, other: Wrapped): boolean {
	const [mine, theirs] = [weighed(one.laid), weighed(other.laid)];
	const tied = Math.abs(scoreOf(mine) - scoreOf(theirs)) <= 1e-9;
	if (tied && one.rows !== undefined && other.rows !== undefined && one.rows !== other.rows)
		return one.rows < other.rows;
	return scoresBetter(mine, theirs);
}

/**
 * Where a layout of a block stands its items with its titles tied, lined up
 * and not yet routed.
 * @param viz The initialized Graphviz instance.
 * @param layout A fresh layout of the block.
 * @returns Every item's box.
 */
function linedUp(viz: Graphviz, layout: CardLayout): ReadonlyMap<string, Box> {
	layout.clusters.keepTies = true;
	return layout.lined(viz).boxes;
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
	const bands = whole.bands.filter(({ items }) => items.length >= MIN_WRAPPED);
	if (bands.length === 0 || whole.width / whole.height <= LAYOUT_ASPECT) return [];
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

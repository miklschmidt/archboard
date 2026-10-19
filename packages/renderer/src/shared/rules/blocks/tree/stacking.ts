// Whether a block of cards stacks its containers, and that choice laid out
// side by side. Weighing it lays the block out both ways, and on the track
// engine that is most of a board's solve. So the renderer may ask for two
// solves, each laying the first block that could stack only one way and
// telling what that way stood at (`Stood`); it then makes the choice where it
// runs, by the same weighing, and keeps the solve that laid the way chosen
// (`solves.ts`). Every later choice in either solve is made as before, so
// the solve kept is the one laying both ways would give (TASK-377).
import { z } from "zod";
import { fitIn } from "#shared/constants/shell-geometry.ts";
import { CardLayout } from "#shared/rules/blocks/cards/card-layout.ts";
import { foldPlan } from "#shared/rules/blocks/folds/fold.ts";
import type { Graphviz } from "#shared/rules/blocks/cards/graphviz-once.ts";
import type { Insets, Laid } from "#shared/rules/blocks/tree/laid.ts";
import { layBoth, lineLength, settled, type Laying } from "#shared/rules/blocks/cards/laying.ts";
import type { Block, BlockTree } from "#shared/rules/blocks/tree/tree.ts";
import { weighedLaid } from "#shared/rules/blocks/tree/weighing.ts";
import { weighed } from "#shared/rules/blocks/folds/wraps.ts";
import { scoreOf, takes, type Weighed } from "#shared/rules/track/scene/score.ts";

/** The root option laying a solve's first block that could stack only one way, `true` stacked (`solves.ts`). */
const BLOCKS_STACKING = "archboard.blocks.stacking";
/** The root option asking a solve to answer once that block is laid, `true` when asked. */
const BLOCKS_UNTIL_STOOD = "archboard.blocks.until-stood";
/** The root option a solve answers what that block stood at in, as JSON. */
const BLOCKS_STOOD = "archboard.blocks.stood";

/** How near two scores or fits of a block are for the stacking choice's earlier weighing to call them tied. */
const NEAR = 0.05;

const WeighedSchema = z.object({
	width: z.number(),
	height: z.number(),
	crossings: z.number(),
	away: z.number().exactOptional(),
	bus: z.number().exactOptional(),
	hooks: z.number().exactOptional(),
	bends: z.number().exactOptional(),
	length: z.number().exactOptional(),
}) satisfies z.ZodType<Weighed>;
const ScoredSchema = z.object({ score: z.number(), fit: z.number() });

/** What the stacking choice weighs of a block laid out one way: its titles tied, and pulled down where that is kept. */
const StoodSchema = z.object({
	tied: ScoredSchema,
	settled: ScoredSchema.extend({ length: z.number(), weighed: WeighedSchema }),
});
/** What the stacking choice weighs of a block laid out one way. */
type Stood = z.infer<typeof StoodSchema>;
/** A score at the block's best, and how well its page fits the pane. */
type Scored = z.infer<typeof ScoredSchema>;

/**
 * The stacking choice of one solve: the way its first block that could
 * stack is laid, when only one way is, whether the solve answers once it is,
 * and what that way stood at once laid.
 */
interface Stacking {
	way: boolean | undefined;
	readonly until: boolean;
	stood?: Stood;
}

/** What ends a solve that answers once its first block that could stack is laid: what that block stood at. */
class StoodLaid extends Error {
	/**
	 * End the solve with what its first block that could stack stood at.
	 * @param stood What the block stood at.
	 */
	constructor(readonly stood: Stood) {
		super("The solve's first block that could stack is laid.");
	}
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
 * How a block laid out whole scores at its best ({@link scoreOf}), as it
 * stands or folded, and how well its page fits the pane.
 * @param block The block.
 * @param insets Its insets.
 * @param laid The block laid out whole.
 * @returns Its score and fit.
 */
function scoredOf(block: Block, insets: Insets, laid: Laid): Scored {
	const plan = foldPlan(block, laid, insets, weighed(laid));
	const score = Math.max(scoreOf(weighed(laid)), plan === undefined ? 0 : scoreOf(plan.weighed));
	return { score, fit: fitIn(laid) };
}

/**
 * What the stacking choice weighs of a block laid out one way.
 * @param block The block.
 * @param insets Its insets.
 * @param laying It laid out that way.
 * @returns What it stood at.
 */
function stoodOf(block: Block, insets: Insets, laying: Laying): Stood {
	const kept = settled(laying);
	return {
		tied: scoredOf(block, insets, laying.tied),
		settled: {
			...scoredOf(block, insets, kept),
			length: lineLength(kept.lines.values()),
			weighed: weighedLaid(kept),
		},
	};
}

/**
 * Whether a block stacks on its score, as before ADR 0039: each way weighed
 * at its best, a near tie going to the page that fits the pane clearly
 * better, as it does between a block's joins, and to the better score where
 * neither page fits clearly better.
 * @param stacked It stacked.
 * @param plain It plain.
 * @returns True when it stacks.
 */
function scoresStacked(stacked: Scored, plain: Scored): boolean {
	return near(stacked.score, plain.score) && !near(stacked.fit, plain.fit)
		? stacked.fit > plain.fit
		: stacked.score > plain.score;
}

/**
 * Whether a block stacks: where it scores better as before ADR 0039
 * ({@link scoresStacked}), with its titles tied and pulled down, pulling
 * them down changing the choice only where that draws no more line, and its
 * lines as drawn read better; or where either way it is chosen reads no
 * worse on any measure than the other ({@link takes}).
 * @param stacked What it stood at stacked.
 * @param plain What it stood at plain.
 * @returns True when it stacks.
 */
function stacks(stacked: Stood, plain: Stood): boolean {
	const tied = scoresStacked(stacked.tied, plain.tied);
	const pulled = scoresStacked(stacked.settled, plain.settled);
	const [was, is] = [tied, pulled].map((one) => (one ? stacked : plain).settled.length);
	const earlier = tied !== pulled && is! > was! ? tied : pulled;
	return takes(stacked.settled.weighed, plain.settled.weighed, earlier);
}

/**
 * A block of cards laid out whole: with the containers a line from another
 * container enters stacked below it, or else as Graphviz ranks them, as
 * {@link stacks} chooses. Its titles are pulled onto their members where
 * that crosses and draws no more line. The first block of a solve that
 * could stack is laid only the way the solve's stacking names, when it
 * names one, and what that way stood at is kept on it; a solve that answers
 * once it is laid ends there ({@link StoodLaid}).
 * @param viz The initialized Graphviz instance.
 * @param tree The blocks.
 * @param block The block.
 * @param laid Every block laid out so far, and the block's insets.
 * @param laid.laid Every block laid out so far.
 * @param laid.insets The block's insets.
 * @param stacking The solve's stacking choice.
 * @returns The block laid out, and whether it stacks.
 */
function stackedOrNot(
	viz: Graphviz,
	tree: BlockTree,
	block: Block,
	{ laid, insets }: { laid: Map<string, Laid>; insets: Insets },
	stacking: Stacking,
): { whole: Laid; stacked: boolean } {
	/**
	 * The block laid out one way.
	 * @param stacked Whether it stacks.
	 * @returns It laid out.
	 */
	const lay = (stacked: boolean): Laying =>
		layBoth(viz, () =>
			stacked
				? new CardLayout(block, laid, tree, insets, { stacked: true })
				: new CardLayout(block, laid, tree, insets),
		);
	if (!new CardLayout(block, laid, tree, insets).stacks())
		return { whole: settled(lay(false)), stacked: false };
	const { way } = stacking;
	if (way !== undefined) {
		const laying = lay(way);
		stacking.way = undefined;
		stacking.stood = stoodOf(block, insets, laying);
		if (stacking.until) throw new StoodLaid(stacking.stood);
		return { whole: settled(laying), stacked: way };
	}
	const [plain, stacked] = [lay(false), lay(true)];
	const chosen = stacks(stoodOf(block, insets, stacked), stoodOf(block, insets, plain));
	return { whole: settled(chosen ? stacked : plain), stacked: chosen };
}

export {
	BLOCKS_STACKING,
	BLOCKS_STOOD,
	BLOCKS_UNTIL_STOOD,
	StoodLaid,
	StoodSchema,
	stackedOrNot,
	stacks,
	type Stacking,
	type Stood,
};

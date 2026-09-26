// A block of cards laid out both ways its cluster titles may stand (TASK-349).
// A nested title pulled up by its parent's title exactly as hard as down onto
// its one unheld member is a tie Graphviz breaks by standing it on the least
// crowded rank, far above its members; pulling it down one more stands it on
// the rank just above them. Graphviz may answer that changed graph with
// another ranking of the whole block, so the block is laid both ways and the
// pulled one kept only where it crosses and draws no more line. The label of a
// line leaving a container is pulled down the same way, where it stood beside
// the container (leaving.ts).
import type { Viz } from "@viz-js/viz";
import type { CardLayout } from "@/transformers/semantic-renderer/lib/blocks/card-layout";
import type { Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import { labelsBeside } from "@/transformers/semantic-renderer/lib/blocks/leaving";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import { crossingsOf } from "@/transformers/semantic-renderer/lib/track/score";

/**
 * A block of cards laid out with every cluster title as Graphviz breaks its
 * ties, and, where some title was pulled up as hard as down, the way to lay
 * it with that title pulled onto its members.
 */
interface Laying {
	/** The block with its titles left tied. */
	readonly tied: Laid;
	/**
	 * The block with its tied titles pulled onto their members, laid when first asked for.
	 * @returns It, or nothing when no title was tied.
	 */
	readonly untied: () => Laid | undefined;
}

/**
 * A block of cards laid out with its titles left tied, and the way to lay it
 * with them pulled onto their members, which only a layout that is weighed
 * that way pays for; both with its leaving labels pulled down where that
 * stands them clear of their containers.
 * @param viz The initialized Graphviz instance.
 * @param make A fresh layout of the block.
 * @returns The block laid out.
 */
function layBoth(viz: Viz, make: () => CardLayout): Laying {
	const plain = tiedLayout(viz, make);
	const pulled = leavingPulled(viz, make, plain);
	const [tying, tied] = pulled ?? plain;
	const remake = pulled === undefined ? make : pulling(make);
	let untied: Laid | undefined;
	return {
		tied,
		/**
		 * The block laid out with its tied titles pulled down, once.
		 * @returns It, or nothing when no title was tied.
		 */
		untied: () => {
			if (tying.clusters.tied) untied ??= remake().lay(viz);
			return untied;
		},
	};
}

/**
 * A block laid out with its titles left tied.
 * @param viz The initialized Graphviz instance.
 * @param make A fresh layout of the block.
 * @returns The layout and the block laid out.
 */
function tiedLayout(viz: Viz, make: () => CardLayout): [CardLayout, Laid] {
	const tying = make();
	tying.clusters.keepTies = true;
	return [tying, tying.lay(viz)];
}

/**
 * The way to make a block's layout with the label of every line leaving a
 * container pulled onto the line's lower end.
 * @param make A fresh layout of the block.
 * @returns The way.
 */
function pulling(make: () => CardLayout): () => CardLayout {
	return () => {
		const layout = make();
		layout.clusters.pullsLeaving = true;
		return layout;
	};
}

/**
 * The block laid out again with its leaving labels pulled down, where its
 * plain layout stands one beside the container its line leaves; kept only
 * where that stands fewer beside, crosses no more and draws no clearly more
 * line, since the pull re-ranks the whole block.
 * @param viz The initialized Graphviz instance.
 * @param make A fresh layout of the block.
 * @param plain The block's plain layout, laid out with its titles tied.
 * @returns The pulled layout and the block laid out, or nothing.
 */
function leavingPulled(
	viz: Viz,
	make: () => CardLayout,
	plain: [CardLayout, Laid],
): [CardLayout, Laid] | undefined {
	const [layout, laid] = plain;
	const beside = labelsBeside(layout.clusters, layout.links(), laid);
	if (beside === 0) return undefined;
	const pulled = tiedLayout(viz, pulling(make));
	const [again, relaid] = pulled;
	if (labelsBeside(again.clusters, again.links(), relaid) >= beside) return undefined;
	return readsNoWorse(relaid, laid) ? pulled : undefined;
}

/**
 * Whether one layout of a block crosses no more than another and draws no
 * clearly more line.
 * @param one The layout.
 * @param other The other.
 * @returns True when it does.
 */
function readsNoWorse(one: Laid, other: Laid): boolean {
	const crosses = crossingsOf(one.lines.values()) > crossingsOf(other.lines.values());
	const longer =
		lineLength(one.lines.values()) > lineLength(other.lines.values()) * (1 + LONGER_SHARE);
	return !crosses && !longer;
}

/**
 * How much more line a block with its titles pulled onto their members may
 * draw and still be kept: a few points more is a line routed round a label
 * it now keeps clear of, while another ranking of the whole block draws a
 * fifth more (Board viewer, 16.9k against 20.0k).
 */
const LONGER_SHARE = 0.05;

/**
 * A block with its tied titles pulled onto their members, a nested title on
 * the rank just above them, unless that crosses more or draws clearly more
 * line: pulling a title down is meant to move only the title, but Graphviz
 * may answer the changed graph with another ranking of the whole block,
 * whose longer lines the score does not see.
 * @param laying The block laid out both ways.
 * @returns The layout kept.
 */
function settled(laying: Laying): Laid {
	const { tied } = laying;
	const untied = laying.untied();
	if (untied === undefined) return tied;
	return readsNoWorse(untied, tied) ? untied : tied;
}

/**
 * How much line some lines draw.
 * @param lines Every line's points.
 * @returns Their total length.
 */
function lineLength(lines: Iterable<readonly Point[]>): number {
	let sum = 0;
	for (const points of lines)
		for (const [index, to] of points.slice(1).entries())
			sum += Math.abs(to.x - points[index]!.x) + Math.abs(to.y - points[index]!.y);
	return sum;
}

export { layBoth, lineLength, settled, type Laying };

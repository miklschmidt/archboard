// A block of cards laid out both ways its cluster titles may stand (TASK-349).
// A nested title pulled up by its parent's title exactly as hard as down onto
// its one unheld member is a tie Graphviz breaks by standing it on the least
// crowded rank, far above its members; pulling it down one more stands it on
// the rank just above them. Graphviz may answer that changed graph with
// another ranking of the whole block, so the block is laid both ways and the
// pulled one kept only where it crosses and draws no more line.
import type { Viz } from "@viz-js/viz";
import type { CardLayout } from "@/transformers/semantic-renderer/lib/blocks/card-layout";
import type { Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
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
 * that way pays for.
 * @param viz The initialized Graphviz instance.
 * @param make A fresh layout of the block.
 * @returns The block laid out.
 */
function layBoth(viz: Viz, make: () => CardLayout): Laying {
	const tying = make();
	tying.clusters.keepTies = true;
	const tied = tying.lay(viz);
	let untied: Laid | undefined;
	return {
		tied,
		/**
		 * The block laid out with its tied titles pulled down, once.
		 * @returns It, or nothing when no title was tied.
		 */
		untied: () => {
			if (tying.clusters.tied) untied ??= make().lay(viz);
			return untied;
		},
	};
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
	const crosses = crossingsOf(untied.lines.values()) > crossingsOf(tied.lines.values());
	const longer =
		lineLength(untied.lines.values()) > lineLength(tied.lines.values()) * (1 + LONGER_SHARE);
	return crosses || longer ? tied : untied;
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

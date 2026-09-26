// A block of cards laid out both ways its cluster titles may stand (TASK-349).
// A nested title pulled up by its parent's title exactly as hard as down onto
// its one unheld member is a tie Graphviz breaks by standing it on the least
// crowded rank, far above its members; pulling it down one more stands it on
// the rank just above them. Graphviz may answer that changed graph with
// another ranking of the whole block, so the block is laid both ways and the
// pulled one kept only where it crosses and draws no more line. Remedies to
// the labels of lines leaving and entering containers change the graph the
// same way, and are kept on the same terms.
import type { Viz } from "@viz-js/viz";
import type { CardLayout } from "@/transformers/semantic-renderer/lib/blocks/card-layout";
import type { Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import { anchorable } from "@/transformers/semantic-renderer/lib/blocks/anchors";
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

/** A layout of a block, and the block laid out by it. */
type Layout = readonly [CardLayout, Laid];

/**
 * A change to how a block is ranked that mends something its layout shows.
 * Graphviz answers the changed graph with another ranking of the whole
 * block, so the changed layout is only kept where it reads no worse.
 */
interface Remedy {
	/**
	 * Make the change on a fresh layout, before it is built.
	 * @param layout The layout.
	 */
	readonly apply: (layout: CardLayout) => void;
	/**
	 * Whether a laid-out block shows what the change mends.
	 * @param laid The layout and the block laid out.
	 * @returns True when it does.
	 */
	readonly needed: (laid: Layout) => boolean;
	/**
	 * Whether the changed layout is kept over the one before.
	 * @param after The changed layout.
	 * @param before The layout before.
	 * @returns True when it is.
	 */
	readonly kept: (after: Layout, before: Layout) => boolean;
}

/**
 * How many lines' labels a layout stands beside a container the line leaves.
 * @param layout The layout and the block laid out.
 * @returns How many.
 */
function beside(layout: Layout): number {
	const [making, laid] = layout;
	return labelsBeside(making.clusters, making.links(), laid);
}

/**
 * How much page a laid-out block takes.
 * @param laid The block laid out.
 * @returns Its area.
 */
function area(laid: Laid): number {
	return laid.width * laid.height;
}

/**
 * Pull the label of every line leaving a container onto the line's lower end.
 * @param layout A fresh layout.
 */
function pullLeaving(layout: CardLayout): void {
	layout.clusters.pullsLeaving = true;
}

/**
 * Hold the label of every line entering a container below a line from inside it.
 * @param layout A fresh layout.
 */
function anchorLabels(layout: CardLayout): void {
	layout.clusters.anchorsLabels = true;
}

/**
 * Whether a layout stands some leaving label beside its container.
 * @param layout The layout and the block laid out.
 * @returns True when it does.
 */
function besideSome(layout: Layout): boolean {
	return beside(layout) > 0;
}

/**
 * Whether a layout could anchor some entering label.
 * @param layout The layout and the block laid out.
 * @returns True when it could.
 */
function anchorsSome(layout: Layout): boolean {
	return anchorable(layout[0].clusters, layout[0].links());
}

/**
 * Whether a layout with its leaving labels pulled down stands fewer beside
 * their containers than the one before, and reads no worse.
 * @param after The pulled layout.
 * @param before The layout before.
 * @returns True when it does.
 */
function fewerBeside(after: Layout, before: Layout): boolean {
	return beside(after) < beside(before) && readsNoWorse(after[1], before[1]);
}

/**
 * Whether a layout with its entering labels anchored reads no worse than the
 * one before, on no more page.
 * @param after The anchored layout.
 * @param before The layout before.
 * @returns True when it does.
 */
function noLarger(after: Layout, before: Layout): boolean {
	return readsNoWorse(after[1], before[1]) && area(after[1]) <= area(before[1]);
}

/**
 * The remedies a block's layout is tried with, in turn: the label of a line
 * leaving a container pulled onto the line's lower end where one stood
 * beside the container (leaving.ts), and the label of a line entering one
 * held below a line from inside it (anchors.ts).
 */
const REMEDIES: readonly Remedy[] = [
	{ apply: pullLeaving, needed: besideSome, kept: fewerBeside },
	{ apply: anchorLabels, needed: anchorsSome, kept: noLarger },
];

/**
 * A block of cards laid out with its titles left tied, and the way to lay it
 * with them pulled onto their members, which only a layout that is weighed
 * that way pays for; both with every remedy its layout keeps.
 * @param viz The initialized Graphviz instance.
 * @param make A fresh layout of the block.
 * @returns The block laid out.
 */
function layBoth(viz: Viz, make: () => CardLayout): Laying {
	const [remake, [tying, tied]] = REMEDIES.reduce<[() => CardLayout, Layout]>(
		([making, laid], remedy) => remedied(viz, making, laid, remedy),
		[make, tiedLayout(viz, make)],
	);
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
function tiedLayout(viz: Viz, make: () => CardLayout): Layout {
	const tying = make();
	tying.clusters.keepTies = true;
	return [tying, tying.lay(viz)];
}

/**
 * A block laid out again with a remedy, where its layout needs it and the
 * remedied layout is kept, and the way to make that layout afresh.
 * @param viz The initialized Graphviz instance.
 * @param make A fresh layout of the block.
 * @param laid The block laid out so far, with its titles tied.
 * @param remedy The remedy.
 * @returns The way to make the layout kept, and the block laid out by it.
 */
function remedied(
	viz: Viz,
	make: () => CardLayout,
	laid: Layout,
	remedy: Remedy,
): [() => CardLayout, Layout] {
	if (!remedy.needed(laid)) return [make, laid];
	/**
	 * A fresh layout of the block with the remedy.
	 * @returns The layout.
	 */
	const remade = (): CardLayout => {
		const layout = make();
		remedy.apply(layout);
		return layout;
	};
	const again = tiedLayout(viz, remade);
	return remedy.kept(again, laid) ? [remade, again] : [make, laid];
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

// Whether a wrapped card that stepped out of a line's way was worth it
// (visual polish). Lining up steps a lowered card aside where a column
// between the line's two ends opens, but only routing shows whether the line
// then runs straight there: its label, or a card further on, can still turn
// it. So a block whose cards stepped aside is laid again with each of them,
// in turn, left in its column, and a step is kept only where it leaves fewer
// bends.
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import { corners, type Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";

/** A block lined up one way, placed and routed. */
interface Aligned {
	/** The lowered cards that stepped out of a line's way. */
	readonly stepped: readonly string[];
	readonly centres: ReadonlyMap<string, Point>;
	readonly placed: ElkNode & { edges: ElkExtendedEdge[] };
	readonly laid: Laid;
}

/**
 * How many times a laid-out block's lines turn.
 * @param laid The block.
 * @returns The bends.
 */
function bendsOf(laid: Laid): number {
	return [...laid.lines.values()].reduce(
		(sum, points) => sum + Math.max(0, corners(points).length - 2),
		0,
	);
}

/**
 * The block lined up with each card that stepped aside left in its column,
 * in turn, where that routes its lines with no more bends.
 * @param lay The block lined up, with some cards refused a step.
 * @returns The one kept.
 */
function keptSteps(lay: (refused: ReadonlySet<string>) => Aligned): Aligned {
	let kept = lay(new Set());
	const refused = new Set<string>();
	for (const card of kept.stepped) {
		const tried = lay(new Set([...refused, card]));
		if (bendsOf(tried.laid) > bendsOf(kept.laid)) continue;
		refused.add(card);
		kept = tried;
	}
	return kept;
}

export { keptSteps, type Aligned };

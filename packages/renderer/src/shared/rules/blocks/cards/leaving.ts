// The label of a line that leaves a container (TASK-349). Pulled as hard onto
// the line's upper end as onto its lower, Graphviz stands the label on
// whichever rank between is least crowded. On a rank the container spans the
// label must stand beside the container, outside its wall, and the card the
// line leads into follows it out past the wall, alone on its own column and
// widening the page. Pulled one harder onto its lower end, the label stands on
// the rank just above that card, below the container. The pull re-ranks the
// block, so it is only made where the label stood beside the container.
import type { Laid } from "#shared/rules/blocks/tree/laid.ts";
import type { Clusters } from "#shared/rules/blocks/cards/clusters.ts";
import type { Box } from "#shared/rules/geometry.ts";
import type { Link } from "#shared/rules/blocks/cards/anchors.ts";

/**
 * The containers a line leaves: frames its upper end stands in and its lower
 * end does not. A group region is no boundary a line must go round, so
 * leaving one is leaving nothing.
 * @param clusters The block's clusters.
 * @param tail The line's upper end.
 * @param head Its lower end.
 * @returns The frames' ids.
 */
function leftFrames(clusters: Clusters, tail: string, head: string): string[] {
	const theirs = new Set(clusters.around(head));
	return clusters
		.around(tail)
		.filter((id) => !theirs.has(id) && clusters.block.clusters.get(id)!.kind === "frame");
}

/**
 * How much harder a line's label is pulled onto its lower end than onto its
 * upper: one where the line leaves a container and its block pulls such labels.
 * @param clusters The block's clusters.
 * @param tail The line's upper end.
 * @param head Its lower end.
 * @returns The extra pull.
 */
function leavingPull(clusters: Clusters, tail: string, head: string): number {
	return Number(clusters.pullsLeaving && leftFrames(clusters, tail, head).length > 0);
}

/**
 * Whether a box stands beside another: on some of its height, wholly left or right of it.
 * @param one The box.
 * @param other The other.
 * @returns True when it does.
 */
function beside(one: Box, other: Box): boolean {
	const level = one.y < other.y + other.height && other.y < one.y + one.height;
	return level && (one.x >= other.x + other.width || one.x + one.width <= other.x);
}

/**
 * How many lines' labels a laid-out block stands beside a container the line leaves.
 * @param clusters The block's clusters.
 * @param links Every line Graphviz ranked, between the vendor nodes it joins.
 * @param laid The block laid out.
 * @returns How many.
 */
function labelsBeside(clusters: Clusters, links: readonly Link[], laid: Laid): number {
	const frames = new Map((laid.frames ?? []).map(({ id, box }) => [id, box]));
	return links.filter(({ tail, head, labelled, label }) => {
		const at = label === undefined ? undefined : laid.boxes.get(label);
		if (!labelled || at === undefined) return false;
		return leftFrames(clusters, tail, head).some((id) => {
			const frame = frames.get(id);
			return frame !== undefined && beside(at, frame);
		});
	}).length;
}

export { leavingPull, labelsBeside };

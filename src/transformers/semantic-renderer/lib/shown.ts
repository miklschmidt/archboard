// What a picture of a variant shows when its comparison is not shown.
//
// A variant read against another is laid out with what it lacks of the other
// put back, drawn as removed. Turning the comparison off must change nothing
// but the comparison: every subject the two pictures share stands in the same
// place and every line runs the same route. So both pictures are one layout,
// and this is where the one without the comparison leaves out what stands
// removed — its cards, frames, lines, their words and traffic, a group region
// that gathers nothing else, a flow, a participant, a message — and settles
// the crossings again on what is left, so no line hops or is cut beneath one
// that is not drawn. The page is still the whole layout's page, so the
// subjects left keep their places on it.

import type { VariantContent } from "@/shared/semantic-board/index";
import type { LineLook, PaintedDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { DataFlowLayout } from "@/transformers/semantic-renderer/lib/layout/dataflow";
import { bridgeCrossings } from "@/transformers/semantic-renderer/lib/layout/crossings";
import { unfoldCrossings } from "@/transformers/semantic-renderer/lib/layout/folded-crossings";
import type { StatedStandings } from "@/transformers/semantic-renderer/lib/svg/standing";

/**
 * The subjects a picture leaves out: those that stand removed, when the
 * comparison is not shown. Nothing, when it is or there is nothing to compare.
 * @param standing How each subject stands, when the variant is read against another.
 * @param paintStanding Whether the comparison is shown.
 * @returns The ids left undrawn.
 */
function unshownOf(
	standing: StatedStandings | undefined,
	paintStanding: boolean | undefined,
): ReadonlySet<string> {
	if (paintStanding !== false || standing === undefined) return new Set();
	return new Set(
		Object.entries(standing).flatMap(([id, stands]) => (stands === "removed" ? [id] : [])),
	);
}

/**
 * Whether a subject is drawn, for filtering subjects by.
 * @param unshown The ids left out.
 * @returns The test.
 */
function drawnOf(unshown: ReadonlySet<string>): (subject: { readonly id: string }) => boolean {
	return ({ id }) => !unshown.has(id);
}

/**
 * The content a picture says it draws: without the subjects left out.
 * @param content The content laid out.
 * @param unshown The ids left out.
 * @returns What is drawn of it.
 */
function shownContent(content: VariantContent, unshown: ReadonlySet<string>): VariantContent {
	if (unshown.size === 0) return content;
	const shown = drawnOf(unshown);
	return {
		...content,
		nodes: content.nodes.filter(shown),
		edges: content.edges.filter(shown),
		flows: content.flows
			.filter(shown)
			.map((flow) => ({ ...flow, steps: flow.steps.filter(shown) })),
	};
}

/**
 * Whether one box lies inside another.
 * @param inner The box that may be inside.
 * @param outer The box it may be inside.
 * @returns True when it is.
 */
function inside(inner: Box, outer: Box): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

/**
 * A drawing without the subjects left out, its crossings settled again on what
 * is left. Every box and route it keeps is the drawing's own.
 * @param drawing The whole layout, as painted with its comparison.
 * @param unshown The ids left out.
 * @param lines How each line is drawn, as measurement settled it.
 * @returns The drawing to paint.
 */
function shownDrawing(
	drawing: PaintedDrawing,
	unshown: ReadonlySet<string>,
	lines: ReadonlyMap<string, LineLook>,
): PaintedDrawing {
	if (unshown.size === 0) return drawing;
	const shown = drawnOf(unshown);
	const cards = drawing.cards.filter(({ measured }) => shown(measured.node));
	const containers = drawing.containers.filter(({ measured }) => shown(measured.node));
	const nodes = [...cards, ...containers];
	// A region stays while it gathers something still drawn.
	const regions = drawing.regions?.filter((region) =>
		nodes.some(({ box }) => inside(box, region.box)),
	);
	const kept = {
		...drawing,
		cards,
		containers,
		edges: drawing.edges.filter(({ edge }) => shown(edge)),
		...(regions === undefined ? {} : { regions }),
	};
	// The routes as the crossing pass settled them, lanes exchanged included,
	// so what is left runs where it ran beside what is not drawn.
	const routes = unfoldCrossings(drawing).edges.filter(({ edge }) => shown(edge));
	return { ...kept, bridged: bridgeCrossings({ ...kept, edges: routes }, lines) };
}

/**
 * A sequence without the flows, participants and messages left out; every
 * frame, column and message kept stands where it stood.
 * @param layout The whole sequence, as laid out with its comparison.
 * @param unshown The ids left out.
 * @returns The sequence to paint.
 */
function shownFlows(layout: DataFlowLayout, unshown: ReadonlySet<string>): DataFlowLayout {
	if (unshown.size === 0) return layout;
	return {
		...layout,
		flows: layout.flows
			.filter(({ flow }) => !unshown.has(flow.id))
			.map((laid) => ({
				...laid,
				columns: laid.columns.filter(({ card }) => !unshown.has(card.node.id)),
				steps: laid.steps.filter(({ step }) => !unshown.has(step.id)),
			})),
	};
}

export { shownContent, shownDrawing, shownFlows, unshownOf };

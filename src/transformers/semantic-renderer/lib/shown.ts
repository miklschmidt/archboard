// What a picture of a variant shows when its comparison is not shown.
//
// A variant read against another is laid out with what it lacks of the other
// put back, drawn as removed. Turning the comparison off must change nothing
// but the comparison: every subject the two pictures share stands in the same
// place and every line runs the same route. So both pictures are one layout,
// and this is where the one without the comparison leaves out what the
// variant's own reading of the view does not hold — what stands removed, with
// its cards, frames, lines, their words and traffic, a group region that
// gathers nothing else, a flow, a participant, a message. The lines left keep
// their lanes, and only their hops and cuts are settled again, so no line
// hops or is cut beneath one that is not drawn. The page is still the whole
// layout's page, so the subjects left keep their places on it.

import type { VariantContent } from "@/shared/semantic-board/index";
import type { LineLook, PaintedDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { DataFlowLayout } from "@/transformers/semantic-renderer/lib/layout/dataflow";
import { bridgeUnfolded } from "@/transformers/semantic-renderer/lib/layout/crossings";
import { unfoldCrossings } from "@/transformers/semantic-renderer/lib/layout/folded-crossings";

/**
 * Every subject content draws: its nodes, relationships, flows and their messages.
 * @param content The content.
 * @returns Their ids.
 */
function idsOf(content: VariantContent): string[] {
	return [
		...content.nodes.map(({ id }) => id),
		...content.edges.map(({ id }) => id),
		...content.flows.flatMap((flow) => [flow.id, ...flow.steps.map(({ id }) => id)]),
	];
}

/**
 * The subjects a picture without its comparison leaves out: everything laid
 * out that the variant's own reading of the view does not hold. That is what
 * stands removed, and whatever the restored content pulled into the view
 * that the variant's view would not show, such as the far end of a removed
 * relationship the view selects.
 * @param laid The content laid out: the variant with what it lacks put back, read through the view.
 * @param own The variant's own content, read through the same view.
 * @returns The ids left undrawn.
 */
function unshownOf(laid: VariantContent, own: VariantContent): ReadonlySet<string> {
	const held = new Set(idsOf(own));
	return new Set(idsOf(laid).filter((id) => !held.has(id)));
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
 * @param unshown The ids left out, when any are.
 * @returns What is drawn of it.
 */
function shownContent(
	content: VariantContent,
	unshown: ReadonlySet<string> | undefined,
): VariantContent {
	if (unshown === undefined || unshown.size === 0) return content;
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
 * A drawing without the subjects left out. Every box and route it keeps is
 * the drawing's own, and only the hops and cuts where its lines cross are
 * settled again on what is left.
 * @param drawing The whole layout, as painted with its comparison.
 * @param unshown The ids left out, when any are.
 * @param lines How each line is drawn, as measurement settled it.
 * @returns The drawing to paint.
 */
function shownDrawing(
	drawing: PaintedDrawing,
	unshown: ReadonlySet<string> | undefined,
	lines: ReadonlyMap<string, LineLook>,
): PaintedDrawing {
	if (unshown === undefined || unshown.size === 0) return drawing;
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
	// so what is left runs where it ran beside what is not drawn: the lanes are
	// not exchanged again without what held them.
	const routes = unfoldCrossings(drawing).edges.filter(({ edge }) => shown(edge));
	return { ...kept, bridged: bridgeUnfolded({ ...kept, edges: routes }, lines) };
}

/**
 * A sequence without the flows, participants and messages left out; every
 * frame, column and message kept stands where it stood.
 * @param layout The whole sequence, as laid out with its comparison.
 * @param unshown The ids left out, when any are.
 * @returns The sequence to paint.
 */
function shownFlows(
	layout: DataFlowLayout,
	unshown: ReadonlySet<string> | undefined,
): DataFlowLayout {
	if (unshown === undefined || unshown.size === 0) return layout;
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

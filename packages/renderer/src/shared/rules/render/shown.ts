// What a picture of a variant shows when its comparison is not shown.
//
// A variant read against another is laid out with what it lacks of the other
// put back, drawn as removed. Turning the comparison off must change nothing
// but the comparison: every subject the two pictures share stands in the same
// place and every line runs the same route. So both pictures are one layout,
// and this is where the one without the comparison leaves out what the
// variant's own reading of the view does not hold — what stands removed, with
// its cards, frames, lines, their words and traffic, and a group region that
// gathers nothing else. The lines left keep their lanes, and only their hops
// and cuts are settled again, so no line hops or is cut beneath one that is
// not drawn. The page is still the whole layout's page, so the subjects left
// keep their places on it. A sequence leaves out its flows, participants and
// messages the same way, in the core (`crates/archboard-flows`).

import { everyStep } from "@archboard/board/flow";
import type { VariantContent } from "@archboard/board/content";
import type { LineLook, PaintedDrawing } from "#shared/rules/render/drawing.ts";
import type { Box } from "#shared/rules/geometry.ts";
import { bridgeUnfolded } from "#shared/rules/layout/routes/crossings.ts";
import { unfoldCrossings } from "#shared/rules/layout/routes/folded-crossings.ts";

/**
 * The cards and lines laid out that a reading does not hold: what a picture
 * without its comparison leaves undrawn. That is what stands removed, and
 * whatever the restored content pulled into the view that the variant's own
 * view would not show, such as the far end of a removed relationship the view
 * selects. A line drawn for a flow's message is held when the message is.
 * @param laid The content laid out, its lines drawn for messages included.
 * @param held The variant's own reading of the view.
 * @returns The ids left undrawn.
 */
function unshownOf(laid: VariantContent, held: VariantContent): ReadonlySet<string> {
	const kept = new Set([
		...held.nodes.map(({ id }) => id),
		...held.edges.map(({ id }) => id),
		...held.flows.flatMap(({ steps }) => everyStep(steps).map(({ id }) => id)),
	]);
	return new Set([...laid.nodes, ...laid.edges].map(({ id }) => id).filter((id) => !kept.has(id)));
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
	// so what is left runs where it ran beside what is not drawn: the lanes are
	// not exchanged again without what held them.
	const routes = unfoldCrossings(drawing).edges.filter(({ edge }) => shown(edge));
	return { ...kept, bridged: bridgeUnfolded({ ...kept, edges: routes }, lines) };
}

export { shownDrawing, unshownOf };

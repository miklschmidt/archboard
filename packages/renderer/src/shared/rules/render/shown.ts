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

import { everyStep, type SemanticFlow } from "@archboard/board/flow";
import type { VariantContent } from "@archboard/board/content";
import type { LineLook, PaintedDrawing } from "#shared/rules/render/drawing.ts";
import type { Box } from "#shared/rules/geometry.ts";
import type {
	DataFlowLayout,
	PlacedColumn,
	PlacedStep,
} from "#shared/rules/layout/sequence/dataflow.ts";
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

/**
 * Whether a message runs to or from a participant.
 * @param placed The message.
 * @param node The participant.
 * @returns True when it does.
 */
function touches(placed: PlacedStep, node: string): boolean {
	return placed.step.from === node || placed.step.to === node;
}

/**
 * A column with the bars no kept message of its participant stands in. A bar
 * only dropped messages opened or held is dropped with them; a bar a kept
 * message stands in stays whole, since that message's ends are placed against it.
 * @param column The column as laid out.
 * @param steps The messages kept.
 * @returns The column to paint.
 */
function shownColumn(column: PlacedColumn, steps: readonly PlacedStep[]): PlacedColumn {
	const node = column.card.node.id;
	const activations = column.activations.filter((bar) =>
		steps.some((placed) => touches(placed, node) && bar.top <= placed.y && placed.y <= bar.bottom),
	);
	return { ...column, activations };
}

/**
 * A sequence with only what the variant's own reading of the view holds: its
 * flows, and in each of them its participants and messages, and the bars those
 * messages stand in. Every frame, column and message kept stands where it stood.
 * @param layout The whole sequence, as laid out with its comparison.
 * @param held The flows of the variant's own reading, when the picture is without its comparison.
 * @returns The sequence to paint.
 */
function shownFlows(
	layout: DataFlowLayout,
	held: readonly SemanticFlow[] | undefined,
): DataFlowLayout {
	if (held === undefined) return layout;
	const own = new Map(held.map((flow) => [flow.id, flow]));
	return {
		...layout,
		flows: layout.flows.flatMap((laid) => {
			const flow = own.get(laid.flow.id);
			if (flow === undefined) return [];
			const participants = new Set(flow.participants);
			const told = new Set(everyStep(flow.steps).map(({ id }) => id));
			const steps = laid.steps.filter(({ step }) => told.has(step.id));
			const frames = laid.frames.filter(({ step }) => told.has(step.id));
			const columns = laid.columns
				.filter(({ card }) => participants.has(card.node.id))
				.map((column) => shownColumn(column, steps));
			return [{ ...laid, columns, steps, frames }];
		}),
	};
}

export { shownDrawing, shownFlows, unshownOf };

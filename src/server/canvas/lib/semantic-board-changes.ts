// What a proposal changed, worked out for the picture being drawn.
//
// Nothing on a board says a node is new. A proposal states its architecture and
// what it changed is read against the variant it came from, every time, out of
// the identities the two share (ADR 0023). That reading happens here, on the way
// out, so no tombstone is ever written and a variant with no predecessor simply
// carries nothing.
//
// Removals are the interesting half, because a removed subject exists only in
// the predecessor. A picture of the whole variant puts all of them back, which
// the contract's own `withRemoved` already knows how to do and is the one owner
// of. A view is narrower on purpose, so this is where the narrowing is decided:
// it shows what its own corner lost and stays silent about what was removed
// somewhere it does not draw — and when it does show a removal, it brings back
// whatever that removal needs in order to be legible, which for a step of a
// sequence means the participant it was addressed to.

import {
	compareVariants,
	withRemoved,
	type ChangeKind,
	type SemanticBoard,
	type SemanticEdge,
	type SemanticFlow,
	type SemanticNode,
	type SemanticVariant,
	type VariantComparison,
	type VariantContent,
} from "@/shared/semantic-board/index";

/** What the answer says about a proposal, or nothing for a variant with no predecessor. */
interface DrawnChanges {
	readonly predecessor: { id: string; name: string; lifecycle: SemanticVariant["lifecycle"] };
	readonly standing: Record<string, ChangeKind>;
}

/** The picture to draw, and what it says about the proposal it is of. */
interface DrawnProposal {
	/** The content to draw: what the proposal says, plus what it took away. */
	readonly content: VariantContent;
	/** What it changed, or null when this variant came from nothing. */
	readonly changes: DrawnChanges | null;
}

/**
 * The variant this one was derived from, when it was derived from one on this
 * board.
 * @param board The board.
 * @param variant The variant being drawn.
 * @returns The predecessor, or undefined when there is none.
 */
function predecessorOf(
	board: SemanticBoard,
	variant: SemanticVariant,
): SemanticVariant | undefined {
	return variant.parent === undefined
		? undefined
		: board.variants.find((one) => one.id === variant.parent);
}

/**
 * The picture to draw for one variant, and what it changed.
 *
 * A proposal's picture is not simply the proposal. What a change took away is
 * half of what a reader came to see, so it is put back here — never on the
 * board, which keeps saying what the architecture would be. The renderer is
 * told how each subject stands and draws a restored one as absent rather than
 * as part of the proposal.
 * @param board The board.
 * @param variant The variant being drawn.
 * @param drawn The content this picture is of, after any view has narrowed it.
 * @param whole Whether this picture is of the whole variant rather than a part.
 * @returns The content to draw and the changes to mark on it.
 */
function drawingOf(
	board: SemanticBoard,
	variant: SemanticVariant,
	drawn: VariantContent,
	whole: boolean,
): DrawnProposal {
	const parent = predecessorOf(board, variant);
	if (parent === undefined) {
		return { content: drawn, changes: null };
	}
	// Compared whole, before any view narrowed it: a view that hides a node is a
	// narrower reading of the variant, never a variant that lost one.
	const comparison = compareVariants(parent.content, variant.content);
	const content = whole
		? withRemoved(drawn, comparison)
		: narrowedWithRemoved(drawn, comparison, [...variant.content.nodes, ...parent.content.nodes]);
	return {
		content,
		// Read off the picture rather than off the comparison, so what the answer
		// says and what the picture holds can never disagree: everything restored
		// above is in the content and reads as removed here, and a removal the
		// picture had no context for is in neither.
		changes: {
			predecessor: { id: parent.id, name: parent.name, lifecycle: parent.lifecycle },
			standing: standingOfDrawn(comparison, content),
		},
	};
}

/**
 * A view's content with the removals this corner of the board has the context
 * for put back.
 *
 * Restoring is done in the order one thing needs another: containers before
 * what was inside them, steps before the participants they were addressed to,
 * relationships last, once every node they might connect is there.
 * @param drawn What the view shows of the variant.
 * @param comparison What the variant changed.
 * @param known Every node either variant has, for context to be taken from.
 * @returns The content to draw.
 */
function narrowedWithRemoved(
	drawn: VariantContent,
	comparison: VariantComparison,
	known: readonly SemanticNode[],
): VariantContent {
	const inside = [...drawn.nodes, ...restoredInside(comparison, drawn)];
	const flows = restoredSteps(drawn.flows, comparison);
	const nodes = [...inside, ...neededBy(flows, inside, known)];
	const shown = new Set(nodes.map((node) => node.id));
	return {
		...drawn,
		nodes,
		edges: [...drawn.edges, ...restoredEdges(comparison, drawn, shown)],
		flows: flows.map((flow) => ({ ...flow, participants: seated(flow, shown) })),
	};
}

/**
 * The removed nodes this view puts back: the ones whose container it still
 * draws, and a removed container's own removed children after it, which one
 * pass over the list would miss.
 *
 * A removed node that sat at the top level is not among them. It hung off
 * nothing, so a narrower reading has nowhere to say it was — that is what the
 * whole-variant picture is for.
 * @param comparison What the variant changed.
 * @param drawn What the view shows.
 * @returns The nodes to draw as removed.
 */
function restoredInside(comparison: VariantComparison, drawn: VariantContent): SemanticNode[] {
	const shown = new Set(drawn.nodes.map((node) => node.id));
	const gone = [...comparison.nodes.values()]
		.filter((change) => change.kind === "removed")
		.map((change) => change.entity);
	const back: SemanticNode[] = [];
	let reached = true;
	while (reached) {
		reached = false;
		for (const node of gone.filter((one) => placeable(one, shown))) {
			shown.add(node.id);
			back.push(node);
			reached = true;
		}
	}
	return back;
}

/**
 * Whether a removed node is not yet drawn and has a container that is.
 * @param node The removed node.
 * @param shown What the picture draws so far.
 * @returns True when the picture can show where it was.
 */
function placeable(node: SemanticNode, shown: ReadonlySet<string>): boolean {
	return !shown.has(node.id) && node.parent !== undefined && shown.has(node.parent);
}

/**
 * The removed relationships this view puts back: the ones both of whose ends it
 * draws, restored ends included.
 * @param comparison What the variant changed.
 * @param drawn What the view shows.
 * @param shown Every node the picture now draws.
 * @returns The relationships to draw as removed.
 */
function restoredEdges(
	comparison: VariantComparison,
	drawn: VariantContent,
	shown: ReadonlySet<string>,
): SemanticEdge[] {
	const already = new Set(drawn.edges.map((edge) => edge.id));
	return [...comparison.edges.values()]
		.filter(
			(change) =>
				change.kind === "removed" &&
				!already.has(change.entity.id) &&
				shown.has(change.entity.from) &&
				shown.has(change.entity.to),
		)
		.map((change) => change.entity);
}

/**
 * The drawn flows with the steps they lost put back in the order they were
 * told.
 *
 * Unconditionally: a step of a sequence the view is showing is part of what
 * that sequence lost, and dropping it because one of its ends is not in the
 * view would leave the picture saying the exchange was always this short. What
 * the step needs in order to be drawn is brought back with it instead.
 * @param flows The flows the view shows.
 * @param comparison What the variant changed.
 * @returns The flows, with their removed steps back where they were.
 */
function restoredSteps(
	flows: readonly SemanticFlow[],
	comparison: VariantComparison,
): SemanticFlow[] {
	const gone = [...comparison.steps.values()]
		.filter((change) => change.kind === "removed")
		.map((change) => change.entity);
	return flows.map((flow) => ({
		...flow,
		steps: toldWith(
			flow.steps,
			gone.filter((step) => step.flow === flow.id),
		),
	}));
}

/**
 * One flow's steps with the removed ones back in the order they were told.
 * @param steps The steps the proposal states.
 * @param gone The steps the predecessor told here and this one does not.
 * @returns The steps to draw.
 */
function toldWith(
	steps: readonly SemanticFlow["steps"][number][],
	gone: readonly (SemanticFlow["steps"][number] & { readonly position: number })[],
): SemanticFlow["steps"][number][] {
	const told = [...steps];
	for (const step of gone.toSorted((one, other) => one.position - other.position)) {
		told.splice(Math.min(step.position - 1, told.length), 0, step);
	}
	return told;
}

/**
 * The nodes a restored step is addressed to or from that the picture does not
 * draw yet.
 *
 * These are reference context, not changes: a participant that was dropped from
 * a flow while the node itself stayed on the board is drawn here because the
 * step needs a column to arrive at, and it stands exactly as the comparison
 * says it stands, which for a node nobody touched is unchanged.
 * @param flows The flows to be drawn, steps already restored.
 * @param nodes The nodes the picture draws so far.
 * @param known Every node either variant has.
 * @returns The nodes to bring in as context.
 */
function neededBy(
	flows: readonly SemanticFlow[],
	nodes: readonly SemanticNode[],
	known: readonly SemanticNode[],
): SemanticNode[] {
	const shown = new Set(nodes.map((node) => node.id));
	const context: SemanticNode[] = [];
	for (const id of endpointsOf(flows)) {
		const node = shown.has(id) ? undefined : known.find((one) => one.id === id);
		if (node !== undefined) {
			shown.add(id);
			context.push(node);
		}
	}
	return context;
}

/**
 * Every node the steps of these flows are addressed to or from.
 * @param flows The flows to be drawn.
 * @returns The node ids, in the order the steps name them.
 */
function endpointsOf(flows: readonly SemanticFlow[]): string[] {
	return flows.flatMap((flow) => flow.steps.flatMap((step) => [step.from, step.to]));
}

/**
 * One flow's columns: the ones it states, plus any the restored steps need,
 * which are appended rather than woven in because where a column sits is the
 * renderer's business and the flow's own order is what it stated.
 * @param flow The flow to be drawn, steps already restored.
 * @param shown Every node the picture draws.
 * @returns The participants to draw columns for.
 */
function seated(flow: SemanticFlow, shown: ReadonlySet<string>): string[] {
	const columns = [...flow.participants];
	for (const id of endpointsOf([flow])) {
		if (!columns.includes(id) && shown.has(id)) {
			columns.push(id);
		}
	}
	return columns;
}

/**
 * How every subject the picture shows stands against the predecessor.
 * @param comparison What the variant changed.
 * @param drawn The content being drawn.
 * @returns The standing of each drawn subject, by id.
 */
function standingOfDrawn(
	comparison: VariantComparison,
	drawn: VariantContent,
): Record<string, ChangeKind> {
	return {
		...against(comparison.nodes, drawn.nodes),
		...against(comparison.edges, drawn.edges),
		...against(comparison.flows, drawn.flows),
		...against(
			comparison.steps,
			drawn.flows.flatMap((flow) => [...flow.steps]),
		),
	};
}

/**
 * How each of one kind of drawn subject stands.
 *
 * A subject the comparison never saw stands unchanged: it is drawn, so it is on
 * this variant, and the only way it can be absent from the comparison is that
 * both variants have it and neither touched it.
 * @param changes That kind's comparison.
 * @param drawn The subjects of that kind in the picture.
 * @returns Their standing, by id.
 */
function against(
	changes: ReadonlyMap<string, { readonly kind: ChangeKind }>,
	drawn: readonly { readonly id: string }[],
): Record<string, ChangeKind> {
	const standing: Record<string, ChangeKind> = {};
	for (const subject of drawn) {
		standing[subject.id] = changes.get(subject.id)?.kind ?? "unchanged";
	}
	return standing;
}

export { drawingOf, predecessorOf, type DrawnChanges, type DrawnProposal };

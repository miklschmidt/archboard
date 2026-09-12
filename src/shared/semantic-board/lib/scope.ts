// What one view actually shows.
//
// A view names a grammar and a part of the variant; this is where that part is
// cut out, before anything is drawn. Cutting here rather than in the renderer
// is what keeps "a view hides a node" from ever being confused with "the board
// lost a node": the variant is untouched, and what comes back is a reading of
// it (ADR 0023).
//
// A relationship survives only when both its ends do, and a flow only when
// every node it names does. A drawing with an arrow to nothing is not a
// narrower explanation, it is a broken one.
//
// What a selection does to relationships is worth stating exactly, because two
// readings are both defensible and only one of them can be true:
//
//   A selection that names relationships shows those relationships and no
//   others. Naming one is how a view isolates a single connection — "how the
//   gateway reaches the ledger" — and admitting a second path between the same
//   two cards merely because both ends survived would answer a different
//   question than the one the view asked.
//
//   A selection that names none shows every relationship between the nodes it
//   kept. Such a view is about a region — a service and what is inside it — and
//   a region drawn with its parts unwired would be the broken drawing again.

import type { VariantContent } from "@/shared/semantic-board/lib/content";
import type { SemanticView, ViewScope } from "@/shared/semantic-board/lib/views";

/**
 * The content one view shows.
 *
 * Containment is followed upward: selecting a module selects the service it is
 * part of, because a card drawn outside the container it belongs to would be
 * telling the reader something untrue about the architecture.
 * @param content The variant's whole content.
 * @param scope What the view selects.
 * @returns The content as that view reads it.
 */
function scopedContent(content: VariantContent, scope: ViewScope): VariantContent {
	if (scope.kind === "all") {
		return content;
	}
	const kept = withContainers(content, endpointsOf(content, scope));
	return {
		nodes: content.nodes.filter((node) => kept.has(node.id)),
		edges: content.edges.filter(
			(edge) =>
				(scope.edges.length === 0 || scope.edges.includes(edge.id)) &&
				kept.has(edge.from) &&
				kept.has(edge.to),
		),
		flows: content.flows.filter(
			(flow) =>
				scope.flows.includes(flow.id) &&
				flow.participants.every((participant) => kept.has(participant)),
		),
		views: content.views,
		// A view narrows what is drawn. It says nothing about what is explained,
		// so the variant's explanations come through a view untouched.
		walkthroughs: content.walkthroughs,
	};
}

/**
 * Every node a scope asks for, directly or by naming something that needs it.
 *
 * A selected relationship needs both its ends and a selected flow needs every
 * participant, because the alternative is drawing a line to nothing.
 * @param content The variant's whole content.
 * @param scope A selection.
 * @returns The node ids the view cannot do without.
 */
function endpointsOf(
	content: VariantContent,
	scope: Extract<ViewScope, { kind: "selection" }>,
): Set<string> {
	const wanted = new Set(scope.nodes);
	for (const flow of content.flows.filter((one) => scope.flows.includes(one.id))) {
		for (const participant of flow.participants) {
			wanted.add(participant);
		}
	}
	for (const edge of content.edges.filter((one) => scope.edges.includes(one.id))) {
		wanted.add(edge.from);
		wanted.add(edge.to);
	}
	return wanted;
}

/**
 * The wanted nodes, plus every container they sit inside.
 * @param content The variant's whole content.
 * @param wanted The nodes the view asked for, directly or through what it selected.
 * @returns Every node that has to be drawn for those to make sense.
 */
function withContainers(content: VariantContent, wanted: ReadonlySet<string>): Set<string> {
	const byId = new Map(content.nodes.map((node) => [node.id, node]));
	const kept = new Set(wanted);
	for (const id of wanted) {
		let at = byId.get(id)?.parent;
		while (at !== undefined && !kept.has(at)) {
			kept.add(at);
			at = byId.get(at)?.parent;
		}
	}
	return kept;
}

/**
 * The view a reader asked for, by id or by the name it is addressed under.
 *
 * A reader who asked for no view is not asking for the first one: that is the
 * whole variant, and it is the caller's to say so. Nothing here guesses which
 * explanation was meant — a name fits at most one view, because a variant
 * holding two views of one name is refused before it is ever read.
 * @param content The variant's content.
 * @param asked The view's id or the name it was written under.
 * @returns The view, or undefined when nothing on this variant answers to it.
 */
function findView(content: VariantContent, asked: string): SemanticView | undefined {
	return (
		content.views.find((view) => view.id === asked) ??
		content.views.find((view) => view.name === asked)
	);
}

export { scopedContent, findView };

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

//
// Two readings are nobody's to author (ADR 0052). The overview is what a board
// opens on: its root parts and the parts directly inside each root container,
// with every deeper container closed. Everything is every part and every
// relationship, asked for as the view of that name.

import type { SemanticBoard } from "@/shared/semantic-board/lib/aggregate";
import type { SemanticEdge, VariantContent } from "@/shared/semantic-board/lib/content";
import type { SemanticView, ViewScope } from "@/shared/semantic-board/lib/views";

/** What a reading draws: an authored view's scope, or the overview nobody authors. */
type ReadingScope = ViewScope | { readonly kind: "overview" };

/** The reading of every part and relationship, asked for by its name. */
const EVERYTHING_VIEW: SemanticView = Object.freeze({
	id: "Everything",
	name: "Everything",
	grammar: "architecture",
	scope: Object.freeze({ kind: "all" }),
});

/** The names no authored view can take, because a reading nobody authors answers to them. */
const RESERVED_VIEW_NAMES: readonly string[] = Object.freeze(["Overview", EVERYTHING_VIEW.name]);

/**
 * The content one reading shows.
 *
 * Containment is followed upward: selecting a module selects the service it is
 * part of, because a card drawn outside the container it belongs to would be
 * telling the reader something untrue about the architecture.
 * @param content The variant's whole content.
 * @param scope What the reading selects.
 * @returns The content as that reading reads it.
 */
function scopedContent(content: VariantContent, scope: ReadingScope): VariantContent {
	if (scope.kind === "all") {
		return content;
	}
	if (scope.kind === "overview") {
		return overviewContent(content);
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
		// A view narrows what is drawn. It says nothing about what is explained,
		// so the variant's explanations come through a view untouched.
		walkthroughs: content.walkthroughs,
	};
}

/**
 * The overview: the root parts and the parts directly inside each root
 * container, every deeper container drawn closed.
 *
 * A relationship to a hidden part is drawn to the closed card that holds it,
 * because the card stands for everything inside it. All relationships from
 * one drawn part to another are one line: a reader of the overview asks which
 * parts work together, and how often is the views' question. A joined line
 * keeps the identity of the first relationship in board order, so a comparison
 * marks it; it says no label, because no one label speaks for all of them, and
 * it takes the kind most of them have. A relationship inside one closed card is
 * the card's own business and is not drawn. Flows are calls in an order, which
 * the sequence views draw, so the overview draws none.
 * @param content The variant's whole content.
 * @returns The overview's content.
 */
function overviewContent(content: VariantContent): VariantContent {
	const drawnAs = drawnPartOf(content);
	const joined = new Map<string, [SemanticEdge, ...SemanticEdge[]]>();
	for (const edge of content.edges) {
		const [from, to] = [drawnAs(edge.from), drawnAs(edge.to)];
		if (from === to) continue;
		const key = `${from}\u0000${to}`;
		const line = joined.get(key);
		if (line === undefined) joined.set(key, [{ ...edge, from, to }]);
		else line.push({ ...edge, from, to });
	}
	return {
		nodes: content.nodes.filter((node) => drawnAs(node.id) === node.id),
		edges: [...joined.values()].map(oneLine),
		flows: [],
		walkthroughs: content.walkthroughs,
	};
}

/**
 * The part the overview draws for each node: the node itself when it is a
 * root or directly inside one, else the part directly inside its root that
 * holds it.
 * @param content The variant's whole content.
 * @returns The drawn part's id, by node id.
 */
function drawnPartOf(content: VariantContent): (id: string) => string {
	const byId = new Map(content.nodes.map((node) => [node.id, node]));
	return (id) => {
		const chain = [id];
		for (let at = byId.get(id)?.parent; at !== undefined; at = byId.get(at)?.parent) {
			chain.push(at);
		}
		// The chain runs from the node up to its root; one below the root stands for its subtree.
		return chain.at(-2) ?? id;
	};
}

/**
 * Relationships from one drawn part to another, as one line.
 * @param edges The relationships, in board order, re-ended on the drawn parts.
 * @returns The line.
 */
function oneLine(edges: readonly [SemanticEdge, ...SemanticEdge[]]): SemanticEdge {
	const [first] = edges;
	if (edges.length === 1) {
		return first;
	}
	const counts = new Map<string, number>();
	for (const edge of edges) {
		counts.set(edge.kind, (counts.get(edge.kind) ?? 0) + 1);
	}
	// Map order is board order, so the first kind to reach the most wins a tie.
	const kind = [...counts].reduce((best, next) => (next[1] > best[1] ? next : best))[0];
	const { label: _label, ...unlabelled } = first;
	return { ...unlabelled, kind };
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
 * overview, and it is the caller's to say so. `Everything` is the whole
 * variant, and no authored view can take that name. Nothing here guesses which
 * explanation was meant — a name fits at most one view, because a board
 * holding two views of one name is refused before it is ever read.
 * @param board The board that owns the views.
 * @param asked The view's id or the name it was written under.
 * @returns The view, or undefined when nothing on this board answers to it.
 */
function findView(board: Pick<SemanticBoard, "views">, asked: string): SemanticView | undefined {
	if (asked === EVERYTHING_VIEW.id) {
		return EVERYTHING_VIEW;
	}
	return (
		board.views.find((view) => view.id === asked) ?? board.views.find((view) => view.name === asked)
	);
}

export {
	EVERYTHING_VIEW,
	RESERVED_VIEW_NAMES,
	findView,
	overviewContent,
	scopedContent,
	type ReadingScope,
};

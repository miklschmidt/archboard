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
// opens on: its root parts, with every container closed. The board itself is
// the container of its subject, so no part stands for it. Everything is every
// part and every relationship, asked for as the view of that name.

import type { SemanticBoard } from "#shared/schemas/board-document.ts";
import type { SemanticEdge, VariantContent } from "#shared/schemas/content.ts";
import type { SemanticView, ViewScope } from "#shared/schemas/views.ts";

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
 * telling the reader something untrue about the architecture. A container
 * that holds every part the view asked for is the exception: it separates
 * nothing in the picture, so it is left out, as the board is (ADR 0052).
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
		nodes: content.nodes.flatMap((node) => {
			if (!kept.has(node.id)) return [];
			if (node.parent === undefined || kept.has(node.parent)) return [node];
			const { parent: _framing, ...unframed } = node;
			return [unframed];
		}),
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

/** One line of the overview, and the relationships it stands for. */
interface OverviewLine {
	/** What the overview draws. */
	readonly line: SemanticEdge;
	/** The relationships it joins, in board order, as the variant states them. */
	readonly joins: readonly [SemanticEdge, ...SemanticEdge[]];
}

/**
 * The overview: the root parts, every container drawn closed.
 *
 * A relationship to a hidden part is drawn to the closed card that holds it,
 * because the card stands for everything inside it. Flows are calls in an
 * order, which the sequence views draw, so the overview draws none.
 * @param content The variant's whole content.
 * @returns The overview's content.
 */
function overviewContent(content: VariantContent): VariantContent {
	const drawnAs = rootOf(content);
	return {
		nodes: content.nodes.filter((node) => drawnAs(node.id) === node.id),
		edges: overviewLines(content).map(({ line }) => line),
		flows: [],
		walkthroughs: content.walkthroughs,
	};
}

/**
 * The lines the overview draws. All relationships from one drawn part to
 * another are one line: a reader of the overview asks which parts work
 * together, and what each relationship does is the views' question. A
 * relationship inside one closed card, or between a container and a part it
 * holds, is the card's own business and is not drawn (ADR 0052).
 * @param content The variant's whole content.
 * @param openSelf The open containers whose authored self-connections stay visible.
 * @returns Each line, with what it joins.
 */
function overviewLines(
	content: VariantContent,
	openSelf: ReadonlySet<string> = new Set(),
): OverviewLine[] {
	const drawnAs = rootOf(content);
	const joined = new Map<string, [SemanticEdge, ...SemanticEdge[]]>();
	for (const edge of content.edges) {
		const [from, to] = [drawnAs(edge.from), drawnAs(edge.to)];
		if (from === to && !openSelf.has(from)) continue;
		const key = `${from}\u0000${to}`;
		const joins = joined.get(key);
		if (joins === undefined) joined.set(key, [edge]);
		else joins.push(edge);
	}
	return [...joined.values()].map((joins) => ({
		line: oneLine(joins, drawnAs(joins[0].from), drawnAs(joins[0].to)),
		joins,
	}));
}

/**
 * The part the overview draws for each node: the root part that holds it, or
 * the node itself when it is a root.
 * @param content The variant's whole content.
 * @returns The drawn part's id, by node id.
 */
function rootOf(content: VariantContent): (id: string) => string {
	const parentOf = new Map(content.nodes.map((node) => [node.id, node.parent]));
	return (id) => {
		let at = id;
		for (let up = parentOf.get(at); up !== undefined; up = parentOf.get(at)) at = up;
		return at;
	};
}

/**
 * Relationships from one drawn part to another, as one line.
 *
 * A lone relationship is drawn as stated. A joined line keeps the identity of
 * the first relationship in board order, so a comparison marks it, and it
 * takes the kind most of them have. Its label stacks their labels, each once,
 * one to a line of the text, because no one of them speaks for all of them; a
 * relationship with no label adds none. What only one of them says, its
 * description, emphasis, traffic and anchor, is not said of the line.
 * @param edges The relationships, in board order.
 * @param from The drawn part the line starts at.
 * @param to The drawn part the line ends at.
 * @returns The line.
 */
function oneLine(
	edges: readonly [SemanticEdge, ...SemanticEdge[]],
	from: string,
	to: string,
): SemanticEdge {
	const [first] = edges;
	if (edges.length === 1) {
		return { ...first, from, to };
	}
	const counts = new Map<string, number>();
	for (const edge of edges) {
		counts.set(edge.kind, (counts.get(edge.kind) ?? 0) + 1);
	}
	// Map order is board order, so the first kind to reach the most wins a tie.
	const kind = [...counts].reduce((best, next) => (next[1] > best[1] ? next : best))[0];
	const labels = [...new Set(edges.flatMap(({ label }) => (label === undefined ? [] : [label])))];
	return {
		id: first.id,
		order: first.order,
		from,
		to,
		kind,
		...(labels.length === 0 ? {} : { label: labels.join("\n") }),
		emphasis: "normal",
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
 * The wanted nodes, plus every container they sit inside that separates some
 * of them from the rest: a container that holds every wanted node only frames
 * the picture.
 * @param content The variant's whole content.
 * @param wanted The nodes the view asked for, directly or through what it selected.
 * @returns Every node that has to be drawn for those to make sense.
 */
function withContainers(content: VariantContent, wanted: ReadonlySet<string>): Set<string> {
	const parentOf = new Map(content.nodes.map((node) => [node.id, node.parent]));
	const chains = [...wanted].map((id) => containersOf(parentOf, id));
	const framing = new Set(chains[0]?.filter((at) => chains.every((chain) => chain.includes(at))));
	const kept = new Set(wanted);
	for (const at of chains.flat()) {
		if (!framing.has(at)) kept.add(at);
	}
	return kept;
}

/**
 * Every container a node sits inside, from its parent up to its root.
 * @param parentOf Each node's parent, by node id.
 * @param id The node.
 * @returns The containers, innermost first.
 */
function containersOf(parentOf: ReadonlyMap<string, string | undefined>, id: string): string[] {
	const chain: string[] = [];
	for (let at = parentOf.get(id); at !== undefined; at = parentOf.get(at)) chain.push(at);
	return chain;
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
	overviewLines,
	scopedContent,
	type OverviewLine,
	type ReadingScope,
};

// What one view actually shows.
//
// A view names a grammar and a part of the variant; this is where that part is
// cut out, before anything is drawn. Cutting here rather than in the renderer
// is what keeps "a view hides a node" from ever being confused with "the model
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
// Two readings are nobody's to author (ADR 0052). The overview is what a model
// opens on: its root parts, with every container closed. The model itself is
// the container of its subject, so no part stands for it. Everything is every
// part and every relationship, asked for as the view of that name.

import type { LegacyBoard } from "#shared/schemas/legacy-board.ts";
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
 * nothing in the picture, so it is left out, as the model is (ADR 0052).
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

/**
 * What a line that joins relationships of several kinds wears. No vocabulary name holds a
 * space, so no vault can define this kind, and the core draws it in its neutral mixed style.
 */
const MIXED_KIND = "mixed kinds";

/** The most parts inside a card that a joined line names. */
const NAMED_PARTS = 2;

/** Relationships that one line joins, in model order. */
type JoinedEdges = [SemanticEdge, ...SemanticEdge[]];

/** A drawn line. It says two-way when it holds relationships in both directions. */
type DrawnEdge = SemanticEdge & { readonly twoWay?: true };

/** The drawn parts at a line's two ends, and whether it runs both ways. */
interface LineEnds {
	readonly from: string;
	readonly to: string;
	readonly twoWay: boolean;
}

/** Names the parts inside a drawn card that some relationships reach, in the order a line names them. */
type PartsReached = (card: string, edges: readonly SemanticEdge[]) => readonly string[];

/**
 * The first of some names, with a count of the rest.
 * @param names The names, or labels, in the order to show them.
 * @param most How many to show.
 * @returns The first names and `+N` for the others.
 */
function fewNames(names: readonly string[], most: number): string {
	const rest = names.length - most;
	return `${names.slice(0, most).join(", ")}${rest > 0 ? ` +${rest}` : ""}`;
}

/**
 * The parts that a line names.
 * @param word How the parts stand to the line.
 * @param parts Their names, in the order to show them.
 * @returns The words, or nothing without a part.
 */
function namedParts(word: string, parts: readonly string[]): string | undefined {
	return parts.length === 0 ? undefined : `${word} ${fewNames(parts, NAMED_PARTS)}`;
}

/**
 * The words that name what a line reaches inside its cards: the target's parts, then the source's.
 * A two-way line has no target, so it names the card with more parts, and the far end on a tie.
 * @param edges The relationships on the line.
 * @param ends The line's drawn ends.
 * @param reached Names the parts inside a card.
 * @returns The words, or nothing when no relationship reaches inside a card.
 */
function wordsOfParts(
	edges: readonly SemanticEdge[],
	ends: LineEnds,
	reached: PartsReached,
): string | undefined {
	const target = reached(ends.to, edges);
	const source = reached(ends.from, edges);
	if (ends.twoWay) return namedParts("with", source.length > target.length ? source : target);
	return target.length > 0 ? namedParts("to", target) : namedParts("from", source);
}

/**
 * The one answer to what a joined line says (reader redesign, rule 4). A shared label stands for
 * all of them. Otherwise a reader asks what one card uses of the other, and the names inside
 * the cards answer that where a label list could not fit. Failing those, the first label and the
 * count of the others. A count alone tells a reader nothing (ADR 0052), so a line with neither a
 * label nor an inner part wears no words.
 * @param edges The relationships on the line.
 * @param ends The line's drawn ends.
 * @param reached Names the parts inside a card.
 * @returns The line's words.
 */
function wordsOnJoinedLine(
	edges: readonly SemanticEdge[],
	ends: LineEnds,
	reached: PartsReached,
): string | undefined {
	const labels = [...new Set(edges.flatMap(({ label }) => label ?? []))];
	if (labels.length === 1 && edges.every(({ label }) => label !== undefined)) return labels[0];
	return (
		wordsOfParts(edges, ends, reached) ?? (labels.length === 0 ? undefined : fewNames(labels, 1))
	);
}

/**
 * The direct part of a drawn card that holds a relationship's end.
 * @param end The relationship's end.
 * @param card The drawn card.
 * @param parentOf Each module's parent.
 * @returns The part, or nothing when the end is the card itself or lies outside it.
 */
function partHolding(
	end: string,
	card: string,
	parentOf: ReadonlyMap<string, string | undefined>,
): string | undefined {
	let at = end;
	for (let up = parentOf.get(at); up !== undefined && up !== card; up = parentOf.get(at)) at = up;
	return parentOf.get(at) === card ? at : undefined;
}

/**
 * How a reading names the parts that a line reaches inside a card: the part that the most
 * relationships reach first, then model order. A name comes from the content, so an end that the
 * content no longer holds names nothing.
 * @param content The content the reading draws from.
 * @param endsOf Where a relationship's line starts and ends.
 * @returns The reader of parts.
 */
function partsReachedIn(
	content: VariantContent,
	endsOf: (edge: SemanticEdge) => readonly [string, string],
): PartsReached {
	const parentOf = new Map(content.nodes.map((node) => [node.id, node.parent]));
	return (card, edges) => {
		const reached = new Map<string, number>();
		for (const edge of edges) {
			const part = partHolding(endsOf(edge)[1] === card ? edge.to : edge.from, card, parentOf);
			if (part !== undefined) reached.set(part, (reached.get(part) ?? 0) + 1);
		}
		return content.nodes
			.filter(({ id }) => reached.has(id))
			.toSorted((one, other) => (reached.get(other.id) ?? 0) - (reached.get(one.id) ?? 0))
			.map(({ name }) => name);
	};
}

/** One line of the overview, and the relationships it stands for. */
interface OverviewLine {
	/** What the overview draws. */
	readonly line: DrawnEdge;
	/** The relationships it joins, in model order, as the variant states them. */
	readonly joins: Readonly<JoinedEdges>;
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
 * The lines the overview draws. All relationships between two drawn parts are
 * one line, whichever way each runs: a reader of the overview asks which parts
 * work together, and what each relationship does is the views' question. A
 * relationship inside one closed card, or between a container and a part it
 * holds, is the card's own business and is not drawn (ADR 0052).
 * @param content The variant's whole content.
 * @param openSelf The open containers whose authored self-connections stay visible.
 * @param endsOf Where a relationship's line starts and ends; the root parts that hold it by default.
 * @returns Each line, with what it joins.
 */
function overviewLines(
	content: VariantContent,
	openSelf: ReadonlySet<string> = new Set(),
	endsOf: (edge: SemanticEdge) => readonly [string, string] = rootEnds(content),
): OverviewLine[] {
	const joined = new Map<string, { ends: readonly [string, string]; joins: JoinedEdges }>();
	for (const edge of content.edges) {
		const ends = endsOf(edge);
		const [from, to] = ends;
		if (!drawsConnection(edge, from, to, openSelf)) continue;
		const key = [from, to].toSorted().join("\u0000");
		const line = joined.get(key);
		if (line === undefined) joined.set(key, { ends, joins: [edge] });
		else line.joins.push(edge);
	}
	const reached = partsReachedIn(content, endsOf);
	return [...joined.values()].map(({ ends: [from, to], joins }) => {
		const twoWay = from !== to && joins.some((edge) => endsOf(edge)[0] === to);
		return { line: oneLine(joins, { from, to, twoWay }, reached), joins };
	});
}

/**
 * Where a relationship's line runs when every container is closed.
 * @param content The variant's whole content.
 * @returns The root parts at its two ends.
 */
function rootEnds(content: VariantContent): (edge: SemanticEdge) => readonly [string, string] {
	const drawnAs = rootOf(content);
	return (edge) => [drawnAs(edge.from), drawnAs(edge.to)];
}

/**
 * Keep authored open-module self-connections without inventing loops from hidden internals.
 * @param edge The original authored relationship.
 * @param from Its visible source.
 * @param to Its visible target.
 * @param open The open modules in this reading.
 * @returns Whether the relationship has a visible connection.
 */
function drawsConnection(
	edge: SemanticEdge,
	from: string,
	to: string,
	open: ReadonlySet<string>,
): boolean {
	return from !== to || (open.has(from) && edge.from === from && edge.to === to);
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
 * Relationships between two drawn parts, as one line.
 *
 * A lone relationship is drawn as stated. A joined line keeps the identity of
 * the first relationship in model order, so a comparison marks it, and it runs
 * the way that relationship runs. It wears the kind they share, or the neutral
 * mixed kind when they differ, because a majority kind would be a false mark.
 * What only one of them says, its description, emphasis, traffic and anchor,
 * is not said of the line, and {@link wordsOnJoinedLine} decides its words.
 * @param edges The relationships, in model order.
 * @param ends The line's drawn ends.
 * @param reached Names the parts inside a card.
 * @returns The line.
 */
function oneLine(edges: Readonly<JoinedEdges>, ends: LineEnds, reached: PartsReached): DrawnEdge {
	const [first] = edges;
	const { from, to, twoWay } = ends;
	if (edges.length === 1) {
		return { ...first, from, to };
	}
	const kinds = new Set(edges.map(({ kind }) => kind));
	const label = wordsOnJoinedLine(edges, ends, reached);
	return {
		id: first.id,
		order: first.order,
		from,
		to,
		kind: kinds.size === 1 ? first.kind : MIXED_KIND,
		...(label === undefined ? {} : { label }),
		emphasis: "normal",
		...(twoWay ? { twoWay } : {}),
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
 * explanation was meant — a name fits at most one view, because a legacy board
 * holding two views of one name is refused before it is ever read.
 * @param model The legacy board that owns the views.
 * @param asked The view's id or the name it was written under.
 * @returns The view, or undefined when nothing on this legacy board answers to it.
 */
function findView(model: Pick<LegacyBoard, "views">, asked: string): SemanticView | undefined {
	if (asked === EVERYTHING_VIEW.id) {
		return EVERYTHING_VIEW;
	}
	return (
		model.views.find((view) => view.id === asked) ?? model.views.find((view) => view.name === asked)
	);
}

export {
	EVERYTHING_VIEW,
	MIXED_KIND,
	RESERVED_VIEW_NAMES,
	containersOf,
	findView,
	overviewContent,
	overviewLines,
	scopedContent,
	type DrawnEdge,
	type OverviewLine,
	type ReadingScope,
};

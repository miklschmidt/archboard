// What the legacy board render reads off a board beside the model rules: the
// view an address asks for, whether anything on the board is built, and the
// subjects a picture placed, named. Each has this render as its one reader.

import {
	EVERYTHING_VIEW,
	readFlow,
	type DrawnSubjects,
	type LegacyBoard,
	type SemanticView,
	type VariantContent,
} from "@archboard/model-contract";

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

/**
 * Whether nothing a board describes is built: it has no current variant, so
 * every variant on it is a proposal (ADR 0031).
 * @param board The board, or as much of it as says what is current.
 * @returns True when the board has no current variant.
 */
function nothingBuilt(board: Pick<LegacyBoard, "current">): boolean {
	return board.current === undefined;
}

/**
 * What a picture draws, named: the subjects of the drawn content that the
 * renderer placed, by kind, in the model's order. Only the renderer knows
 * which of the content's subjects its grammar draws, so it says which ids it
 * placed and this names them as a person reads them.
 * @param content The content the picture was drawn from.
 * @param placed The subjects the renderer placed, by id.
 * @returns Each placed node, edge, flow and step, by id and name.
 */
function drawnSubjects(content: VariantContent, placed: readonly string[]): DrawnSubjects {
	const drawn = new Set(placed);
	const names = new Map(content.nodes.map((node) => [node.id, node.name]));
	const flows = content.flows.map((flow) => readFlow(flow.steps));
	const words = new Map(flows.flatMap((flow) => [...flow.words]));
	/**
	 * The placed subjects of one kind, named.
	 * @param subjects That kind's subjects, in the model's order.
	 * @param name What a person reads one of them as.
	 * @returns The placed ones.
	 */
	const named = <Subject extends { readonly id: string }>(
		subjects: readonly Subject[],
		name: (subject: Subject) => string,
	): DrawnSubjects["nodes"] =>
		subjects
			.filter(({ id }) => drawn.has(id))
			.map((subject) => ({ id: subject.id, name: name(subject) }));
	return {
		nodes: named(content.nodes, (node) => node.name),
		edges: named(
			content.edges,
			(edge) =>
				edge.label ?? `${names.get(edge.from) ?? edge.from} → ${names.get(edge.to) ?? edge.to}`,
		),
		flows: named(content.flows, (flow) => flow.name),
		steps: named(
			flows.flatMap((flow) => flow.every),
			(step) => words.get(step.id) ?? "",
		),
	};
}

export { drawnSubjects, findView, nothingBuilt };

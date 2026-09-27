// A flow is drawn through its data-flow view; the board itself is the
// architecture picture. A board whose author wrote an exchange and no
// relationships would otherwise draw its participants as cards with nothing
// joining them, so the architecture reading draws each message of a flow as a
// line of its own kind: a step between two participants, distinguishable from
// an authored relationship, carrying the step's id so selection and standing
// resolve to the step. Nothing here is written to the board (ADR 0023); the
// grammar stays the view's choice, and the line is a reading of content the
// board already holds.

import type { FlowStep, SemanticEdge, VariantContent } from "@/shared/semantic-board/index";
import type { StatedStandings } from "@/transformers/semantic-renderer/lib/svg/standing";

/** The content as the architecture reading draws it, and which lines are steps. */
interface StepLines {
	readonly content: VariantContent;
	/** Ids of the drawn lines that are flow steps, not authored relationships. */
	readonly derived: ReadonlySet<string>;
}

/**
 * Whether a step can be a line of its own on this reading: a message, not the
 * answer travelling back, between two distinct participants both drawn here
 * as cards. A step whose participant this
 * reading does not hold (a view without it, a proposal that removed it) has no
 * card to land on; a container receives nothing itself, since a message to a
 * part drawn with children belongs on the child whose body runs.
 * @param step The step.
 * @param content The content being read.
 * @returns True when the step may be drawn.
 */
function drawable(step: FlowStep, content: VariantContent): boolean {
	if (step.from === step.to || step.kind === "return") return false;
	const ends = content.nodes.filter((node) => node.id === step.from || node.id === step.to);
	if (ends.length !== 2) return false;
	return !content.nodes.some((node) => node.parent === step.from || node.parent === step.to);
}

/**
 * The line a step draws as: the step's own id, ends, kind and label.
 * @param step The step.
 * @param order Its authored position in the flow reading.
 * @returns The line.
 */
function lineOf(step: FlowStep, order: number): SemanticEdge {
	return {
		id: step.id,
		order,
		from: step.from,
		to: step.to,
		kind: step.kind,
		label: step.label,
		emphasis: "normal",
	};
}

/**
 * Whether the variant keeps a subject: it does unless the subject stands removed.
 * @param subject The subject.
 * @param subject.id Its id.
 * @param standing How each subject stands against the variant it is read against, if any.
 * @returns True when the variant holds it.
 */
function kept({ id }: { readonly id: string }, standing: StatedStandings | undefined): boolean {
	return standing?.[id] !== "removed";
}

/**
 * Whether a step, rather than the one already riding its pair, is the pair's
 * line: the first step over a pair is, and a later one is when the variant
 * keeps it and not the one before it.
 * @param step The step.
 * @param riding The line already drawn over its pair, if any.
 * @param standing How each subject stands against the variant it is read against, if any.
 * @returns True when the step is the pair's line.
 */
function replaces(
	step: FlowStep,
	riding: SemanticEdge | undefined,
	standing: StatedStandings | undefined,
): boolean {
	return riding === undefined || (!kept(riding, standing) && kept(step, standing));
}

/**
 * One line for each pair of participants a drawable message runs between.
 * @param content The variant content.
 * @param standing How each subject stands against the variant it is read against, if any.
 * @returns The lines, in the order their pairs first appear.
 */
function stepLinesOf(
	content: VariantContent,
	standing: StatedStandings | undefined,
): SemanticEdge[] {
	const riders = new Map<string, SemanticEdge>();
	for (const [index, step] of content.flows.flatMap((flow) => flow.steps).entries()) {
		const pair = `${step.from}>${step.to}`;
		if (drawable(step, content) && replaces(step, riders.get(pair), standing)) {
			riders.set(pair, lineOf(step, (index + 1) * 1000));
		}
	}
	return [...riders.values()];
}

/**
 * The content with one derived line per flow message between two distinct
 * participants, on a board that holds no relationships of its own. Further
 * steps over the same pair in the same direction ride one line; a return, a
 * self step, a step to a container and a step whose participant is not in
 * this reading draw nothing.
 *
 * On a variant read against another, the content holds what the variant lost
 * as well, and a picture without the comparison leaves that out. So a board
 * whose relationships all stand removed still reads its exchange this way,
 * and a pair's line is a step the variant keeps whenever one rides it.
 * Neither choice depends on whether the comparison is shown, so both pictures
 * lay out the same lines.
 * @param content The variant content.
 * @param standing How each subject stands against the variant it is read against, if any.
 * @returns The drawable content and the derived ids.
 */
function withStepLines(content: VariantContent, standing: StatedStandings | undefined): StepLines {
	// A board that has relationships is drawn from them: a flow there restates
	// the wiring as messages and answers, and drawing those again doubles every
	// line. Only a board with no relationships of its own reads its exchange this way.
	if (content.edges.some((edge) => kept(edge, standing))) return { content, derived: new Set() };
	const lines = stepLinesOf(content, standing);
	const derived = new Set(lines.map((line) => line.id));
	return derived.size === 0
		? { content, derived }
		: { content: { ...content, edges: [...content.edges, ...lines] }, derived };
}

export { withStepLines, type StepLines };

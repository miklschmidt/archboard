// A flow is drawn through its sequence view; the board itself is the
// architecture picture. A board whose author wrote an exchange and no
// relationships would otherwise draw its participants as cards with nothing
// joining them, so the architecture reading draws each message of a flow as a
// line of its own kind: a step between two participants, distinguishable from
// an authored relationship, carrying the step's id so selection and standing
// resolve to the step. Nothing here is written to the board (ADR 0023); the
// grammar stays the view's choice, and the line is a reading of content the
// board already holds.

import { messagesOf } from "@archboard/board/flow-steps";
import { type FlowMessage } from "@archboard/board/views";
import { type SemanticEdge, type VariantContent } from "@archboard/board/content";

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
function drawable(step: FlowMessage, content: VariantContent): boolean {
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
function lineOf(step: FlowMessage, order: number): SemanticEdge {
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
 * One line for each pair of participants a drawable message runs between. A
 * pair's line is the first message over it that the variant holds, or the
 * first message over it when the variant holds none. Whether a message the
 * variant holds is drawable is asked of the variant's own reading: a
 * participant is not a container there only because the comparison restored
 * a child the variant removed.
 * @param content The content laid out.
 * @param held The variant's own reading of the view.
 * @returns The lines, in the order their pairs first appear.
 */
function stepLinesOf(content: VariantContent, held: VariantContent): SemanticEdge[] {
	const own = new Set(held.flows.flatMap(({ steps }) => messagesOf(steps).map(({ id }) => id)));
	const riders = new Map<string, SemanticEdge>();
	for (const [index, step] of content.flows.flatMap((flow) => messagesOf(flow.steps)).entries()) {
		const pair = `${step.from}>${step.to}`;
		const reading = own.has(step.id) ? held : content;
		if (drawable(step, reading) && takesPair(riders.get(pair), step, own)) {
			riders.set(pair, lineOf(step, (index + 1) * 1000));
		}
	}
	return [...riders.values()];
}

/**
 * Whether a message becomes its pair's line: the pair has none yet, or its
 * line is a message the variant does not hold and this one it does.
 * @param riding The pair's line so far, if any.
 * @param step The message.
 * @param own The ids of the messages the variant holds.
 * @returns True when the message takes the pair.
 */
function takesPair(
	riding: SemanticEdge | undefined,
	step: FlowMessage,
	own: ReadonlySet<string>,
): boolean {
	return riding === undefined || (!own.has(riding.id) && own.has(step.id));
}

/**
 * The content with one derived line per flow message between two distinct
 * participants, on a board that holds no relationships of its own. Further
 * steps over the same pair in the same direction ride one line; a return, a
 * self step, a step to a container and a step whose participant is not in
 * this reading draw nothing.
 *
 * On a variant read against another, the content laid out holds what the
 * variant lost as well, and a picture without the comparison draws only what
 * the variant's own reading of the view holds. So whether the board has
 * relationships of its own is asked of that reading, and a pair's line is a
 * message it holds whenever one rides the pair. Neither choice depends on
 * whether the comparison is shown, so both pictures lay out the same lines.
 * @param content The content laid out.
 * @param held The variant's own reading of the view.
 * @returns The drawable content and the derived ids.
 */
function withStepLines(content: VariantContent, held: VariantContent): StepLines {
	// A board that has relationships is drawn from them: a flow there restates
	// the wiring as messages and answers, and drawing those again doubles every
	// line. Only a board with no relationships of its own reads its exchange this way.
	if (held.edges.length > 0) return { content, derived: new Set() };
	const lines = stepLinesOf(content, held);
	const derived = new Set(lines.map((line) => line.id));
	return derived.size === 0
		? { content, derived }
		: { content: { ...content, edges: [...content.edges, ...lines] }, derived };
}

export { withStepLines, type StepLines };

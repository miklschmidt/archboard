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
 * @returns The line.
 */
function lineOf(step: FlowStep): SemanticEdge {
	return {
		id: step.id,
		from: step.from,
		to: step.to,
		kind: step.kind,
		label: step.label,
		emphasis: "normal",
	};
}

/**
 * The content with one derived line per flow message between two distinct
 * participants, on a board that holds no relationships of its own. A second
 * step over the same pair in the same direction rides the first; a return, a
 * self step, a step to a container and a step whose participant is not in
 * this reading draw nothing.
 * @param content The variant content.
 * @returns The drawable content and the derived ids.
 */
function withStepLines(content: VariantContent): StepLines {
	// A board that has relationships is drawn from them: a flow there restates
	// the wiring as messages and answers, and drawing those again doubles every
	// line. Only a board with no relationships at all reads its exchange this way.
	if (content.edges.length > 0) return { content, derived: new Set() };
	const joined = new Set<string>();
	const lines: SemanticEdge[] = [];
	for (const step of content.flows.flatMap((flow) => flow.steps)) {
		const pair = `${step.from}>${step.to}`;
		if (joined.has(pair) || !drawable(step, content)) continue;
		joined.add(pair);
		lines.push(lineOf(step));
	}
	const derived = new Set(lines.map((line) => line.id));
	return derived.size === 0
		? { content, derived }
		: { content: { ...content, edges: [...content.edges, ...lines] }, derived };
}

export { withStepLines, type StepLines };

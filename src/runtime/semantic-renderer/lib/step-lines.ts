// A flow is drawn through its data-flow view; the board itself is the
// architecture picture. A board whose author wrote an exchange and no
// relationships would otherwise draw its participants as cards with nothing
// joining them, so the architecture reading draws each message of a flow as a
// line of its own kind: a step between two participants, distinguishable from
// an authored relationship, carrying the step's id so selection and standing
// resolve to the step. Nothing here is written to the board (ADR 0023); the
// grammar stays the view's choice, and the line is a reading of content the
// board already holds.

import type { SemanticEdge, VariantContent } from "@/shared/semantic-board/index";

/** The content as the architecture reading draws it, and which lines are steps. */
interface StepLines {
	readonly content: VariantContent;
	/** Ids of the drawn lines that are flow steps, not authored relationships. */
	readonly derived: ReadonlySet<string>;
}

/**
 * The content with one derived line per flow message between two distinct
 * participants that no authored relationship already joins in that direction.
 * A second step over the same pair in the same direction rides the first; a
 * self step draws nothing, since a card is its own column.
 * @param content The variant content.
 * @returns The drawable content and the derived ids.
 */
function withStepLines(content: VariantContent): StepLines {
	const joined = new Set(content.edges.map((edge) => `${edge.from}>${edge.to}`));
	const derived = new Set<string>();
	const lines: SemanticEdge[] = [];
	for (const flow of content.flows) {
		for (const step of flow.steps) {
			const pair = `${step.from}>${step.to}`;
			if (step.from === step.to || joined.has(pair)) continue;
			joined.add(pair);
			derived.add(step.id);
			lines.push({
				id: step.id,
				from: step.from,
				to: step.to,
				kind: step.kind,
				label: step.label,
				emphasis: "normal",
			});
		}
	}
	return derived.size === 0
		? { content, derived }
		: { content: { ...content, edges: [...content.edges, ...lines] }, derived };
}

export { withStepLines, type StepLines };

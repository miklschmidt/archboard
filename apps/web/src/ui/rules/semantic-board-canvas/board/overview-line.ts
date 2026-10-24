// A line of the overview that joins several relationships, as the inspector
// reads it (ADR 0052). The line keeps the id of the first relationship it
// joins, so the id alone would read as that one relationship.

import type { SemanticVariant } from "@archboard/board/document";
import type { SemanticEdge, SemanticNode } from "@archboard/board/content";
import { overviewLines } from "@archboard/board/views";
import type { EdgeSubject } from "#ui/rules/semantic-board-canvas/board/board-document.ts";

/**
 * One line of the overview that joins several relationships (ADR 0052), with
 * the drawn parts at its ends and every relationship it joins.
 */
interface LineSubject {
	/** Which sort of subject this is. */
	readonly kind: "line";
	/** The line, as the overview draws it. */
	readonly line: SemanticEdge;
	/** The drawn part it starts at. */
	readonly from: SemanticNode | undefined;
	/** The drawn part it ends at. */
	readonly to: SemanticNode | undefined;
	/** The relationships it joins, in board order, each with the nodes at its own ends. */
	readonly joins: readonly EdgeSubject[];
}

/**
 * The joined line of the overview that a picked id names, when it names one.
 * @param variant The variant the overview is drawn from.
 * @param id The picked id.
 * @returns The line, or undefined when the id is not a joined line's.
 */
function overviewLineOf(variant: SemanticVariant, id: string): LineSubject | undefined {
	const found = overviewLines(variant.content).find(({ line }) => line.id === id);
	if (found === undefined || found.joins.length === 1) {
		return undefined;
	}
	const byId = new Map(variant.content.nodes.map((node) => [node.id, node]));
	return {
		kind: "line",
		line: found.line,
		from: byId.get(found.line.from),
		to: byId.get(found.line.to),
		joins: found.joins.map((edge) => ({
			kind: "edge",
			edge,
			from: byId.get(edge.from),
			to: byId.get(edge.to),
		})),
	};
}

/**
 * What one pick stands for: the joined line it names when the reading is the
 * overview, and the ids of every relationship that line joins, else the
 * picked id alone.
 * @param held The state that holds the picked id, when one does.
 * @param selection The picked semantic id.
 * @param overview Whether the reading is the overview.
 * @returns The line, when there is one, and the ids.
 */
function pickedLine(
	held: SemanticVariant | undefined,
	selection: string,
	overview: boolean,
): { readonly line: LineSubject | undefined; readonly ids: readonly string[] } {
	const line = overview && held !== undefined ? overviewLineOf(held, selection) : undefined;
	return { line, ids: line === undefined ? [selection] : line.joins.map(({ edge }) => edge.id) };
}

/**
 * The ends a line runs between, named for reading: each part's name, or the id
 * the board names it by when the variant no longer holds it.
 * @param from The part it starts at, when the variant holds it.
 * @param to The part it ends at, when the variant holds it.
 * @param edge The line, for the ids of its ends.
 * @returns The words, such as "API → Store".
 */
function endsOf(
	from: SemanticNode | undefined,
	to: SemanticNode | undefined,
	edge: SemanticEdge,
): string {
	return `${from?.name ?? edge.from} → ${to?.name ?? edge.to}`;
}

export { type LineSubject, endsOf, overviewLineOf, pickedLine };

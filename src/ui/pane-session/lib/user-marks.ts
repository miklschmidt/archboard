// Which parts of a pane's reading changed because the user's own hand changed them (ADR 0034).
//
// A reading is a settled snapshot, not an event: a pick and a board version an agent just wrote
// can land in the same report. So the cause is kept per part. A gesture marks the part it asked
// to change, and the report in which that part really differs carries the mark and uses it up.
// Whatever changes without a mark is told to nobody, which is what keeps a change the canvas or
// an agent caused from being told to the voice model as the user's.

import type { SemanticPaneContext, SemanticPanePart } from "@/shared/semantic-pane-context";

/** The parts of a reading the marks are compared by. */
type MarkedReading = Pick<SemanticPaneContext, "board" | "variant" | "view" | "selection">;

/** One pane's marks. */
interface UserMarks {
	/**
	 * The user asked for this part to change.
	 * @param part The part their gesture was about.
	 */
	readonly mark: (part: SemanticPanePart) => void;
	/**
	 * A gesture came to nothing, so the part is not waiting to change any more.
	 * @param part The part.
	 */
	readonly unmark: (part: SemanticPanePart) => void;
	/**
	 * The marked parts this reading really changed, which are used up by being told.
	 * @param reading The reading about to be sent.
	 * @returns The parts, in the order the schema lists them; empty when nobody is to be told.
	 */
	readonly take: (reading: MarkedReading) => readonly SemanticPanePart[];
}

const PARTS: readonly SemanticPanePart[] = ["board", "variant", "view", "selection"];

/** How each part of a reading is read out of it, as something two readings can be compared by. */
const READ: Readonly<Record<SemanticPanePart, (reading: MarkedReading) => unknown>> = {
	/**
	 * The board's name: its key also names the variant.
	 * @param reading The reading.
	 * @returns The name, or undefined.
	 */
	board: (reading) => reading.board?.name,
	/**
	 * The variant's identity.
	 * @param reading The reading.
	 * @returns The id, or undefined.
	 */
	variant: (reading) => reading.variant?.id,
	/**
	 * The view's identity.
	 * @param reading The reading.
	 * @returns The id, or undefined for the whole variant.
	 */
	view: (reading) => reading.view?.id,
	/**
	 * Everything picked out.
	 * @param reading The reading.
	 * @returns The selection.
	 */
	selection: (reading) => reading.selection,
};

/**
 * What one part of a reading says, as text two readings can be compared by.
 * @param reading The reading.
 * @param part The part.
 * @returns Its value as text.
 */
function valueOf(reading: MarkedReading, part: SemanticPanePart): string {
	return JSON.stringify(READ[part](reading) ?? null);
}

/**
 * Create one pane's marks.
 * @returns The marks.
 */
function createUserMarks(): UserMarks {
	const marked = new Set<SemanticPanePart>();
	// The last reading that was of a drawn board. It outlives the publisher forgetting what it
	// published when the pane moves, because a move is exactly the change a board mark is for.
	let lastDrawn: MarkedReading | null = null;

	/**
	 * Whether a part differs from the last drawn reading.
	 * @param reading The reading about to be sent.
	 * @param part The part.
	 * @returns True when it changed, or when nothing was drawn before.
	 */
	function changed(reading: MarkedReading, part: SemanticPanePart): boolean {
		return lastDrawn === null || valueOf(lastDrawn, part) !== valueOf(reading, part);
	}

	/**
	 * The marked parts this reading really changed, used up by being told.
	 * @param reading The reading about to be sent.
	 * @returns The parts; empty when nobody is to be told.
	 */
	function take(reading: MarkedReading): readonly SemanticPanePart[] {
		// A pane between two boards reads nothing for a moment. That is not where the user
		// was going, so it neither tells anybody nor uses a mark up.
		if (reading.board === null) {
			return [];
		}
		const told = PARTS.filter((part) => marked.has(part) && changed(reading, part));
		for (const part of told) {
			marked.delete(part);
		}
		// A pick or a view changes in the same moment as the gesture, so a mark this report
		// did not use was a gesture that changed nothing, and must not wait for a change
		// somebody else makes. A board or variant is asked of the server and arrives later.
		marked.delete("selection");
		marked.delete("view");
		lastDrawn = reading;
		return told;
	}

	return {
		/**
		 * The user asked for this part to change.
		 * @param part The part.
		 */
		mark: (part) => {
			marked.add(part);
		},
		/**
		 * A gesture came to nothing.
		 * @param part The part.
		 */
		unmark: (part) => {
			marked.delete(part);
		},
		take,
	};
}

export { createUserMarks, type UserMarks };

// Where the reader went from a picture, which sends it on its way out.

import type { SemanticBox } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";

/** Where the reader went, as far as the picture leaving is concerned. */
type DepartureWay =
	/** Into the board a card opens. */
	| "into"
	/** Back to the board above. */
	| "out"
	/** Anywhere else. */
	| "across";

/** A picture on its way out, and where the reader went. */
interface Departure {
	readonly way: DepartureWay;
	/** The card opened, when the reader went into one; its box in the picture leaving. */
	readonly toward: SemanticBox | null;
	/** The board being drawn next. */
	readonly board: string;
}

export type { Departure, DepartureWay };

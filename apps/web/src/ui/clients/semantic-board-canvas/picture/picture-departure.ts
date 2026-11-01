// Where the reader went from a picture, which sends it on its way out.

import type { SemanticBox } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";

/** Where the reader went, as far as the picture leaving is concerned. */
type DepartureWay =
	/** To a deeper board. */
	| "into"
	/** To a shallower board. */
	| "out"
	/** To a board at the same depth, or to another view of this one. */
	| "across";

/** Which way a reader travels among the boards at one depth: left to one earlier in the tree. */
type DepartureSide = "left" | "right";

/** A picture on its way out, and where the reader went. */
interface Departure {
	readonly way: DepartureWay;
	/** The card opened, when the reader went into one; its box in the picture leaving. */
	readonly toward: SemanticBox | null;
	/** Which way along the module tree a board at the same depth stands. */
	readonly side?: DepartureSide | undefined;
	/** The board being drawn next. */
	readonly board: string;
}

export type { Departure, DepartureSide, DepartureWay };

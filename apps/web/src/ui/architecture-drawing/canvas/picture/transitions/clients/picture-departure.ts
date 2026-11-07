// Where the reader went from a picture, which sends it on its way out.

import type { SemanticBox } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";

/** Where the reader went, as far as the picture leaving is concerned. */
type DepartureWay =
	/** To a deeper model. */
	| "into"
	/** To a shallower model. */
	| "out"
	/** To a model at the same depth, or to another view of this one. */
	| "across";

/** Which way a reader travels among the models at one depth: left to one earlier in the tree. */
type DepartureSide = "left" | "right";

/** A picture on its way out, and where the reader went. */
interface Departure {
	readonly way: DepartureWay;
	/** The card opened, when the reader went into one; its box in the picture leaving. */
	readonly toward: SemanticBox | null;
	/** Which way along the module tree a model at the same depth stands. */
	readonly side?: DepartureSide | undefined;
	/** The model being drawn next. */
	readonly model: string;
}

export type { Departure, DepartureSide, DepartureWay };

// The variant the linked pane shows (TASK-538.02), for the readers in a pane:
// the pane provides it once, and a reader takes it from here rather than through
// every component between the two. A pane that is not linked provides none.

import { createContext } from "react";

/** What the linked pane shows. */
interface VariantBeside {
	/** The variant, by id or name, or null for the one the board's bare name opens. */
	readonly variant: string | null;
}

/** The variant the linked pane shows, or null while the pane around a reader is not linked. */
const PaneBesideContext = createContext<VariantBeside | null>(null);

export { PaneBesideContext, type VariantBeside };

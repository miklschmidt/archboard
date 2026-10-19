// The vault of the pane a reader is drawn in (ADR 0049, ADR 0050).
//
// Two panes of one tab can show two repositories, so every read a pane's canvas
// makes names that pane's vault. The pane provides it once, and each reader
// takes it from here rather than through every component between the two. The
// pane session is its one source: this only hands the value down.

import { createContext } from "react";

/** The vault of the pane around a reader, or null outside any pane. */
const PaneVaultContext = createContext<string | null>(null);

export { PaneVaultContext };

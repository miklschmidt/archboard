// The question a pane's readers can put to the agent of the pane's checkout
// (ADR 0050): the pane provides it once, and a reader takes it from here
// rather than through every component between the two. A page with no agent,
// such as a recording or a replayed talk, provides none.

import { createContext } from "react";

/** Ask the agent of this pane's checkout one question, sent at once. */
type PaneAsk = (text: string) => void;

/** The ask of the pane around a reader, or null where the page has no agent. */
const PaneAskContext = createContext<PaneAsk | null>(null);

export { PaneAskContext, type PaneAsk };

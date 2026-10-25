// What the shell puts in a pane's header, which the pane's own stage lays out:
// the pane's letter while two panes share the centre, the pane's own controls
// at the header's end, and what the shell has to say about the pane under it
// (an agent's claim). The shell decides what they are; the stage decides where
// its header puts them, so a pane has one header row and not a shell row over
// a stage row.

import { createContext, type ReactNode } from "react";

/** The shell's parts of one pane's header. */
interface PaneChrome {
	/** The pane's letter, while two panes share the centre; null with one. */
	readonly letter: ReactNode;
	/** The pane's own controls, at the end of its header. */
	readonly controls: ReactNode;
	/** What the shell says about the pane under its header, such as a claim; null for nothing. */
	readonly notice: ReactNode;
	/** Whether another pane shares the centre, which leaves each picture less room. */
	readonly shared: boolean;
	/** Whether the pane is the one with focus, which the keyboard shortcuts reach. */
	readonly active: boolean;
}

/** A pane outside the shell, such as a recording page's: a header with nothing of the shell's. */
const NO_CHROME: PaneChrome = Object.freeze({
	letter: null,
	controls: null,
	notice: null,
	shared: false,
	active: true,
});

/** The shell's parts of the pane being drawn. */
const PaneChromeContext = createContext<PaneChrome>(NO_CHROME);

export { PaneChromeContext, type PaneChrome };

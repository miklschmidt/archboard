export interface SemanticPaneRegistration {
	readonly paneId: string;
	readonly clientId: string;
	/** The board it is showing, or null when it is showing none. */
	readonly board: string | null;
}

/**
 * Resolve only the controller's current pane; focus and registration order are
 * irrelevant.
 *
 * What it resolves is identity, not display. The pane it looks for is the one
 * the delivery is bound to, and what that pane happens to be showing is none of
 * this function's business: requiring it to show the board that changed made a
 * person's screen decide who was told about an architecture, so a pane looking
 * elsewhere silenced the session bound to it.
 * @param input The binding, the panes on screen and how to read each pane's board.
 * @param input.bindingPaneId The pane the semantic delivery is bound to.
 * @param input.contextBoard Unused; the board a context is about, kept so callers read the same shape.
 * @param input.panes Every pane on screen.
 * @param input.boardForPane The board a pane is authoritatively showing.
 * @param input.aggregateOf The board a key names, without its variant.
 * @returns The bound pane.
 */
export function requireExactSemanticPane<Pane extends SemanticPaneRegistration>(input: {
	readonly bindingPaneId: string | null;
	readonly contextBoard?: string;
	readonly panes: Iterable<Pane>;
	readonly boardForPane: (pane: Pane) => string | null;
	readonly aggregateOf: (key: string | null) => string | null;
}): Pane {
	const bindingPaneId = input.bindingPaneId;
	if (bindingPaneId === null) {
		throw new Error("The Codex semantic publisher has no current thread-context binding.");
	}
	/**
	 * Whether this is the bound pane.
	 *
	 * Its id and nothing else. What board it happens to be showing used to be
	 * part of this, which made a delivery depend on what a person had on screen:
	 * a pane looking at something else, or closed, dropped news a session needed.
	 * A session hears every board update except its own writes, and what is
	 * displayed is presentation.
	 * @param pane The candidate.
	 * @returns True for the pane the context belongs to.
	 */
	const isBoundPane = (pane: Pane): boolean => pane.paneId === bindingPaneId;
	for (const pane of input.panes) {
		if (isBoundPane(pane)) {
			return pane;
		}
	}
	throw new Error(`The bound Codex context pane is not open: ${bindingPaneId}.`);
}

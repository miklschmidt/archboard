export interface SemanticPaneRegistration {
	readonly paneId: string;
	readonly clientId: string;
	readonly board: string;
}

/**
 * Resolve only the controller's current pane; focus and registration order are
 * irrelevant.
 * @param input The binding, the panes on screen and how to read each pane's board.
 * @param input.bindingPaneId The pane the semantic delivery is bound to.
 * @param input.contextBoard The board that pane must be showing, when the caller knows it.
 * @param input.panes Every pane on screen.
 * @param input.boardForPane The board a pane is authoritatively showing.
 * @returns The bound pane.
 */
export function requireExactSemanticPane<Pane extends SemanticPaneRegistration>(input: {
	readonly bindingPaneId: string | null;
	readonly contextBoard?: string;
	readonly panes: Iterable<Pane>;
	readonly boardForPane: (pane: Pane) => string;
}): Pane {
	const bindingPaneId = input.bindingPaneId;
	if (bindingPaneId === null) {
		throw new Error("The Codex semantic publisher has no current thread-context binding.");
	}
	const contextBoard = input.contextBoard;
	/**
	 * Whether this is the bound pane, showing the board the caller named.
	 * @param pane The candidate.
	 * @returns True for the pane the context belongs to.
	 */
	const isBoundPane = (pane: Pane): boolean =>
		pane.paneId === bindingPaneId &&
		(contextBoard === undefined || input.boardForPane(pane) === contextBoard);
	for (const pane of input.panes) {
		if (isBoundPane(pane)) {
			return pane;
		}
	}
	throw new Error(
		contextBoard === undefined
			? `The bound Codex context pane is not open: ${bindingPaneId}.`
			: `The bound Codex context pane ${bindingPaneId} does not own board ${contextBoard}.`,
	);
}

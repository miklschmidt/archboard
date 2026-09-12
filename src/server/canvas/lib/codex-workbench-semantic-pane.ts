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
 * The board is compared as a board, never as a pane's whole address. Every
 * variant of a board is in the one document, so a pane reading a proposal of
 * `payments` is a pane on `payments`; comparing `payments@proposal` against
 * `payments` would make that pane reject a context about the very board it is
 * showing. Which variant it is reading is a fact about the reading, and the
 * report carries it.
 * @param input The binding, the panes on screen and how to read each pane's board.
 * @param input.bindingPaneId The pane the semantic delivery is bound to.
 * @param input.contextBoard The board that pane must be showing, when the caller knows it.
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
	const contextBoard = input.contextBoard;
	const wanted = contextBoard === undefined ? null : input.aggregateOf(contextBoard);
	/**
	 * Whether this is the bound pane, showing the board the caller named.
	 * @param pane The candidate.
	 * @returns True for the pane the context belongs to.
	 */
	const isBoundPane = (pane: Pane): boolean =>
		pane.paneId === bindingPaneId &&
		(wanted === null || input.aggregateOf(input.boardForPane(pane)) === wanted);
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

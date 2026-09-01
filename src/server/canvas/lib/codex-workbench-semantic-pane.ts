export interface SemanticPaneRegistration {
	readonly paneId: string;
	readonly clientId: string;
	readonly board: string;
}

/** Resolve only the controller's current pane; focus and registration order are irrelevant. */
export function requireExactSemanticPane<Pane extends SemanticPaneRegistration>(input: {
	readonly bindingPaneId: string | null;
	readonly contextBoard?: string;
	readonly panes: Iterable<Pane>;
	readonly boardForPane: (pane: Pane) => string;
}): Pane {
	if (input.bindingPaneId === null)
		throw new Error("The Codex semantic publisher has no current thread-context binding.");
	for (const pane of input.panes) {
		if (
			pane.paneId === input.bindingPaneId &&
			(input.contextBoard === undefined || input.boardForPane(pane) === input.contextBoard)
		)
			return pane;
	}
	throw new Error(
		input.contextBoard === undefined
			? `The bound Codex context pane is not open: ${input.bindingPaneId}.`
			: `The bound Codex context pane ${input.bindingPaneId} does not own board ${input.contextBoard}.`,
	);
}

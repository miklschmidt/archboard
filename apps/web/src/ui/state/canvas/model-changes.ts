// How a pane hears that the legacy board it is showing has changed.
//
// The server announces a semantic write on the existing pane socket, as
// `{ type: "model_note", semantic: true, board, version }`, to every socket
// the tab has. There is no second socket here and there must not be one: the
// pane's own socket is already open, already reconnects, and is already the
// one thing that says whether this tab is in contact with the server.
//
// What the socket cannot do is reach the cache. A pane's message handler is
// not a React component, so it cannot read the query client out of the
// context the cache lives in. This is the seam between the two: the message
// handler announces the model by vault and name, and whichever panes are showing that
// model answer by invalidating their own drawing through the cache they are
// already subscribed to. One announcement, no cache reference outside React,
// and nothing to unwind when a pane and its socket go.

/**
 * What a listener is told: which model of which vault moved, and to which
 * version. Two repositories can each have a model of the same name, and news of
 * one is not news of the other.
 */
type ModelChangeListener = (vault: string, model: string, version: number) => void;

const listeners = new Set<ModelChangeListener>();

/**
 * Tell every pane that a legacy board has a new version.
 * @param vault The vault of the socket the news came on.
 * @param model The legacy board key the server announced.
 * @param version The version the legacy board is at now.
 */
function announceModelChange(vault: string, model: string, version: number): void {
	for (const listener of listeners) {
		listener(vault, model, version);
	}
}

/**
 * Hear legacy board changes until the returned function is called.
 * @param listener What to tell.
 * @returns Stops listening.
 */
function onModelChange(listener: ModelChangeListener): () => void {
	listeners.add(listener);
	return (): void => {
		listeners.delete(listener);
	};
}

export { announceModelChange, onModelChange };

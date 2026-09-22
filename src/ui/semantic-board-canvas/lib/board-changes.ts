// How a pane hears that the semantic board it is showing has changed.
//
// The server announces a semantic write on the existing pane socket, as
// `{ type: "board_note", semantic: true, board, version }`, to every socket
// the tab has. There is no second socket here and there must not be one: the
// pane's own socket is already open, already reconnects, and is already the
// one thing that says whether this tab is in contact with the server.
//
// What the socket cannot do is reach the cache. A pane's message handler is
// not a React component, so it cannot read the query client out of the
// context the cache lives in. This is the seam between the two: the message
// handler announces the board by name, and whichever panes are showing that
// board answer by invalidating their own drawing through the cache they are
// already subscribed to. One announcement, no cache reference outside React,
// and nothing to unwind when a pane and its socket go.

/** What a listener is told: which board moved, and to which version. */
type SemanticBoardListener = (board: string, version: number) => void;

const listeners = new Set<SemanticBoardListener>();

/**
 * Tell every pane that a semantic board has a new version.
 * @param board The board key the server announced.
 * @param version The version the board is at now.
 */
function announceSemanticBoardChange(board: string, version: number): void {
	for (const listener of listeners) {
		listener(board, version);
	}
}

/**
 * Hear semantic board changes until the returned function is called.
 * @param listener What to tell.
 * @returns Stops listening.
 */
function onSemanticBoardChange(listener: SemanticBoardListener): () => void {
	listeners.add(listener);
	return (): void => {
		listeners.delete(listener);
	};
}

export { announceSemanticBoardChange, onSemanticBoardChange, type SemanticBoardListener };

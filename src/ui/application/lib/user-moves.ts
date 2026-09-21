// The user pointing a pane at a board or a variant, as far as the pane's reading has to know.
//
// A board open is asked of the server and comes back over the pane's socket looking exactly
// like one an agent asked for, so the pane cannot tell them apart when it arrives. What can is
// here: the picker, a variant choice and the address bar are the user's, and they say so before
// asking (ADR 0034).

import type { PaneHandles } from "@/ui/application/lib/pane-handles";

/** One move the user asked for. */
interface UserMove {
	/** The server could not make it, so nothing of this pane's is waiting to change. */
	readonly failed: () => void;
}

/**
 * The user asked for a pane to show another board or another variant of its board.
 * @param handles The panes' sessions.
 * @param paneId The pane they asked about.
 * @returns The move, to be failed if the server refuses it.
 */
function userMoves(handles: PaneHandles, paneId: string): UserMove {
	const session = handles.session(paneId);
	// Both: which of the two really changes is what the pane's next reading says.
	session?.userChanged("board");
	session?.userChanged("variant");
	return {
		/** The server refused the move. */
		failed: (): void => {
			session?.userChangeFailed("board");
			session?.userChangeFailed("variant");
		},
	};
}

export { userMoves, type UserMove };

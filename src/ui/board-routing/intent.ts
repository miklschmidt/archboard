// Which workspace change the person asked for, so that the address bar can
// tell a deliberate move from one that simply happened.
//
// An agent moving a pane and a person moving it arrive identically: the server
// answers both with the same message and the pane reports the same status. Only
// the gesture knows, so the gesture says so here, and the address bar pushes a
// history entry for that one change and replaces for every other.
//
// An expectation lives no longer than the next workspace change: it is cleared
// whether or not it was met, and a gesture that failed clears it at once. There
// is no marker left over for a later change to be mistaken for.

import { boardIn, sameBoardKey, type WorkspaceAddress } from "@/ui/board-routing/address";

/** What a person's gesture asked the workspace to become. */
type NavigationIntent =
	| {
			readonly kind: "board";
			readonly paneId: string;
			/** The board that pane showed when the gesture was made. */
			readonly from: string | null;
			/** The board they asked for, so no other change can be taken for theirs. */
			readonly boardKey: string;
	  }
	| {
			readonly kind: "panes";
			/** How many panes the person asked to be looking at. */
			readonly count: number;
	  };

/** The one expectation outstanding, if any. */
interface DeliberateNavigation {
	/** A person asked for this; the change it produces is deliberate. */
	readonly expect: (intent: NavigationIntent) => void;
	/** The gesture failed or was abandoned; nothing is expected any more. */
	readonly clear: () => void;
	/**
	 * The workspace settled. Answers whether it is what was asked for, and
	 * forgets the expectation either way.
	 * @returns True when this change is the deliberate one.
	 */
	readonly settle: (address: WorkspaceAddress) => boolean;
}

/**
 * Whether an address is what an intent asked for.
 * @param intent The expectation.
 * @param address The workspace as it settled.
 * @returns True when the gesture got what it asked for.
 */
function met(intent: NavigationIntent, address: WorkspaceAddress): boolean {
	if (intent.kind === "panes") {
		return address.panes.length === intent.count;
	}
	// The pane the person asked to move is showing the board they asked for.
	// Both halves matter: without the second, a change somebody else made to
	// that pane would be taken for theirs.
	//
	// A spelling the vault would not recognise costs a history entry, never a
	// wrong board.
	const shown = boardIn(address, intent.paneId);
	return shown !== intent.from && sameBoardKey(shown, intent.boardKey);
}

/**
 * The one outstanding expectation.
 * @returns The navigation intent.
 */
function createDeliberateNavigation(): DeliberateNavigation {
	let expected: NavigationIntent | null = null;
	return {
		/**
		 * A person asked for this.
		 * @param intent What they asked for.
		 */
		expect: (intent: NavigationIntent): void => {
			expected = intent;
		},
		/** The gesture failed; forget it. */
		clear: (): void => {
			expected = null;
		},
		/**
		 * The workspace settled.
		 * @param address The workspace now.
		 * @returns True when this is the change the person asked for.
		 */
		settle: (address: WorkspaceAddress): boolean => {
			const intent = expected;
			expected = null;
			return intent !== null && met(intent, address);
		},
	};
}

export { createDeliberateNavigation, type DeliberateNavigation, type NavigationIntent };

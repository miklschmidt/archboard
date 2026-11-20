// Starting voice for a pane, in the order voice needs (TASK-251).
//
// Voice follows the pane that is active when its step is taken, so voice asked
// for in a pane that is not active yet starts only once that pane is active and
// the voice has moved to it: started any sooner it would speak for the pane that
// was active before. Making the pane active is the shell's move, made as it asks;
// the voice follows it one render later, and that wait is the narrator's. A pane
// that has no voice to move (it has no connection just now) starts all the same,
// so the person is told why it cannot happen, as a start that needs no wait is.
// A start whose pane the person has left before the voice followed, or that
// voice has started since, is dropped: it must never start later, with nobody
// asking. It holds no React state, so the order can be read, and tested, on its own.

/** Where the agent is, as far as a start for a pane needs to know. */
interface PaneFocus {
	/** The pane with focus. */
	readonly active: string;
	/** The pane the voice follows, or null while it follows none. */
	readonly followed: string | null;
	/** Whether voice is off, so that it can start. */
	readonly idle: boolean;
}

/** Starts of voice for a pane, held until the voice is on that pane. */
interface Narrator<Start> {
	/**
	 * The agent moved: another pane is active, the voice follows another, or voice started or ended.
	 * @param focus Where it is now.
	 */
	readonly sync: (focus: PaneFocus) => void;
	/**
	 * Start voice for one pane, now or once the voice is on it. Nothing starts while voice runs.
	 * @param paneId The pane.
	 * @param start What to start it with.
	 */
	readonly start: (paneId: string, start: Start) => void;
}

/** A start that waits for its pane. */
interface Waiting<Start> {
	readonly paneId: string;
	readonly start: Start;
}

/**
 * A narrator over the agent's focus.
 * @param talk Start voice, for the pane it follows.
 * @returns The narrator, which knows nothing of the focus until it is told.
 */
function createNarrator<Start>(talk: (start: Start) => void): Narrator<Start> {
	let focus: PaneFocus = { active: "", followed: null, idle: false };
	let waiting: Waiting<Start> | null = null;
	/** Settle the start that waits for its pane: make it, keep it waiting, or drop it. */
	function settleWaiting(): void {
		if (waiting === null) {
			return;
		}
		const { paneId, start } = waiting;
		if (focus.active !== paneId || !focus.idle) {
			waiting = null;
		} else if (focus.followed === paneId || focus.followed === null) {
			waiting = null;
			talk(start);
		}
	}
	return {
		/**
		 * The agent moved.
		 * @param next Where it is now.
		 */
		sync: (next) => {
			focus = next;
			settleWaiting();
		},
		/**
		 * Start, now or once the pane has the voice.
		 * @param paneId The pane.
		 * @param start What to start it with.
		 */
		start: (paneId, start) => {
			if (!focus.idle) {
				return;
			}
			if (paneId === focus.active) {
				talk(start);
				return;
			}
			waiting = { paneId, start };
		},
	};
}

export { createNarrator, type Narrator, type PaneFocus };

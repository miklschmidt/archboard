// Starting a narration for a pane, in the order voice needs (TASK-251).
//
// Voice follows the pane that is active when its step is taken, so a narration
// asked for in another pane has to make that pane active first, and start only
// once the voice has moved to it: started any sooner it would narrate for the
// pane that was active before. A pointer press has already made the pane
// active by the time its click arrives; a key press has not, and that is the
// case this exists for. It holds no React state, so the order can be read, and
// tested, on its own.

import type { WalkthroughNarration } from "@/ui/semantic-board-canvas";

/** Where the shell is, as far as a narration needs to know. */
interface ShellState {
	/** The pane with focus. */
	readonly active: string;
	/** The pane the voice follows, or null while it follows none. */
	readonly followed: string | null;
	/** Whether voice is off, so that a narration can start. */
	readonly idle: boolean;
}

/** What a narrator moves. */
interface NarratorPorts {
	/**
	 * Start voice narrating one walkthrough, for the pane it follows.
	 * @param walkthrough The walkthrough's id.
	 */
	readonly talk: (walkthrough: string) => void;
	/**
	 * Make a pane the active one.
	 * @param paneId The pane.
	 */
	readonly select: (paneId: string) => void;
}

/** Narrations to start, and where the shell is. */
interface Narrator {
	/**
	 * The shell moved: another pane is active, the voice follows another, or voice started or ended.
	 * @param state Where it is now.
	 */
	readonly sync: (state: ShellState) => void;
	/**
	 * Narrate one walkthrough of one pane's board. Nothing starts while voice runs.
	 * @param paneId The pane.
	 * @param walkthrough The walkthrough's id.
	 */
	readonly start: (paneId: string, walkthrough: string) => void;
}

/** A narration that waits for its pane. */
interface Waiting {
	readonly paneId: string;
	readonly walkthrough: string;
}

/**
 * A narrator over the shell.
 * @param ports What it moves.
 * @returns The narrator, which knows nothing of the shell until it is told.
 */
function createNarrator(ports: NarratorPorts): Narrator {
	let state: ShellState = { active: "", followed: null, idle: false };
	let waiting: Waiting | null = null;
	/** Start the waiting narration once its pane is the active one and the voice follows it. */
	function startWhenFollowed(): void {
		if (waiting?.paneId === state.active && state.active === state.followed) {
			const { walkthrough } = waiting;
			waiting = null;
			ports.talk(walkthrough);
		}
	}
	return {
		/**
		 * The shell moved.
		 * @param next Where it is now.
		 */
		sync: (next) => {
			state = next;
			startWhenFollowed();
		},
		/**
		 * Narrate, now or once the pane has the voice.
		 * @param paneId The pane.
		 * @param walkthrough The walkthrough's id.
		 */
		start: (paneId, walkthrough) => {
			if (!state.idle) {
				return;
			}
			if (paneId === state.active) {
				ports.talk(walkthrough);
				return;
			}
			waiting = { paneId, walkthrough };
			ports.select(paneId);
		},
	};
}

/**
 * What each pane is offered of a narrator, as a function that makes one object
 * for a pane and gives it again, so a pane is not drawn again for being offered
 * what it was offered already.
 * @param narrator The narrator.
 * @param held Why a narration cannot start now, or null when one can.
 * @returns What a pane is offered.
 */
function offerNarration(
	narrator: Narrator,
	held: string | null,
): (paneId: string) => WalkthroughNarration {
	const offered = new Map<string, WalkthroughNarration>();
	return (paneId) => {
		const known = offered.get(paneId);
		if (known !== undefined) {
			return known;
		}
		const made: WalkthroughNarration = {
			held,
			/**
			 * Narrate one of this pane's walkthroughs.
			 * @param walkthrough The walkthrough's id.
			 */
			start: (walkthrough) => {
				narrator.start(paneId, walkthrough);
			},
		};
		offered.set(paneId, made);
		return made;
	};
}

export { createNarrator, offerNarration, type Narrator, type NarratorPorts, type ShellState };

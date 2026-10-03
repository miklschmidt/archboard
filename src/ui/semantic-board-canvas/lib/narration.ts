// What a pane may ask of the shell's voice. Voice is the shell's: a pane knows
// nothing of it, only that its walkthroughs can be narrated, or cannot be now,
// and why. The control is drawn whenever the shell can narrate at all, so the
// rows and buttons around it never move with what voice is doing.

/** Narrating this pane's walkthroughs aloud. */
interface WalkthroughNarration {
	/** Why a narration cannot start now, or null when one can. */
	readonly held: string | null;
	/**
	 * Start voice to narrate one walkthrough of this pane's board, from its first
	 * step. The pane is made the active one first, when it is not, and nothing
	 * starts while voice is running.
	 * @param walkthrough The walkthrough's id.
	 */
	readonly start: (walkthrough: string) => void;
}

export type { WalkthroughNarration };

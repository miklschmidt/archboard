/** Pane news as the voice model is given it (TASK-293). */
export interface CoordinatorPaneNews {
	/** The one sentence of names: where the user's reading now stands, or what changed under it. */
	readonly sentence: string;
	/**
	 * Whether, during a narration, it is a reason to stop the talk: a pick that is not empty, a
	 * view or variant the user chose, or an agent's pane navigation. An emptied selection,
	 * a move to another pane, or a live edit outside the captured snapshots is not.
	 */
	readonly stops: boolean;
	/**
	 * Who caused the news: the user, an agent outside this session, or an external change.
	 * The coordinator also hears changes outside this session.
	 */
	readonly by: "user" | "agent" | "external";
	/**
	 * For a board an outside agent wrote, its aggregate key: the write is told only while a pane of
	 * this canvas shows that board. It never interrupts captured narration. Null for anything else.
	 */
	readonly board: string | null;
}

/** What the canvas of this tab session holds now, read when a callback is delivered. */
export interface CoordinatorCallbackCanvas {
	/** The boards its panes show, by aggregate key. */
	readonly boards: readonly string[];
	/**
	 * The board a live narration in one of its panes is on, by aggregate key, or null when none is
	 * under way. A recording is no narration: nobody is listening to stop for.
	 */
	readonly narrated: string | null;
}

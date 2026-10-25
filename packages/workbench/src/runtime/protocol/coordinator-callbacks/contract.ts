/** Pane news as the voice model is given it (TASK-293). */
export interface CoordinatorPaneNews {
	/** The one sentence of names: where the user's reading now stands, or what changed under it. */
	readonly sentence: string;
	/**
	 * Whether, during a narration, it is a reason to stop the talk: a pick that is not empty, a
	 * view or variant the user chose, or anything an agent outside this session did. An emptied
	 * selection or a move to another pane is not.
	 */
	readonly stops: boolean;
	/**
	 * Who did what it tells: the user by hand, or an agent that is neither this session's workhorse
	 * nor its coordinator (TASK-293.06). Neither of those asked for an agent's change, so the
	 * coordinator is told it too.
	 */
	readonly by: "user" | "agent";
	/**
	 * For a board an outside agent wrote, its aggregate key: the write is told only while a pane of
	 * this canvas shows that board, and stops only a narration of it. Null for anything else.
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

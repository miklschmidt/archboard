// How a pane's board key spells which board and which variant it is showing.
//
// A pane may be showing a variant that is not the board's current one — a
// proposal, or a state that used to be current — and which one is part of what
// the pane is showing, so it is part of the key:
//
//     /?paneA=pipeline@7c40IV7N
//
// The suffix is a variant id or a variant name, and the server resolves either,
// as it resolves the designation `current`. A key with no suffix means whatever
// is current, which is what every address written so far already means and must
// go on meaning. Which view the pane reads it through stays a separate
// parameter: a view and a variant are orthogonal.
//
// The key is split at its *first* `@`, because a board name can never contain
// one — `@` is reserved in a name segment — and a variant's name can: a
// proposal somebody called "Queue @ edge" has to be addressable, or it is a
// name the branch command accepts and nothing can open. Splitting at the last
// would take only the tail of such a name and look up a variant nobody has.
//
// `@/ui/board-routing` carries pane board keys as opaque strings, so nothing
// in the address bar has to learn this spelling. There was a `semantic:` prefix
// here while two kinds of board existed, marking the ones the legacy open path
// had to keep away from; TASK-181 left one kind, so the marker went with it.

import type { OfferedView, RenderedVariant } from "@/shared/semantic-board/index";
/** How a variant is spelled onto a board key. */
const VARIANT_MARK = "@";

/** What one semantic pane key names: a board, and which of its variants. */
interface SemanticTarget {
	/** The board name. */
	readonly board: string;
	/** A variant id or name, or undefined for the board's current variant. */
	readonly variant: string | undefined;
}

/**
 * What a board key names, without any prefix in it.
 *
 * This is the whole of the spelling that survives the coexistence: a board, and
 * which of its variants. When there is one kind of board left, the prefix goes
 * and this is what every caller is already using (TASK-181).
 * @param key The key as a pane or an address carries it, prefix already gone.
 * @returns The board and variant, or null when the key names nothing.
 */
function boardAddressOf(key: string | null): SemanticTarget | null {
	if (key === null || key === "") {
		return null;
	}
	const mark = key.indexOf(VARIANT_MARK);
	if (mark <= 0) {
		return { board: key, variant: undefined };
	}
	const variant = key.slice(mark + 1);
	return { board: key.slice(0, mark), variant: variant === "" ? undefined : variant };
}

/**
 * The key for one board and one of its variants, without any prefix.
 * @param board The board name.
 * @param variant Which variant, or nothing for the board's current one.
 * @returns The key.
 */
function boardKeyFor(board: string, variant?: string | null): string {
	return variant === undefined || variant === null || variant === ""
		? board
		: `${board}${VARIANT_MARK}${variant}`;
}

/**
 * Whether two spellings of a board name are the same board.
 *
 * The server keys a board by a normalised form of its name and reports the
 * name as it was written, so the two reach the browser in different cases and
 * only a case-insensitive comparison can tell that they are one board.
 * @param one A board name or key.
 * @param other Another board name or key.
 * @returns True when they name the same board.
 */
function sameBoardName(one: string, other: string): boolean {
	return one.toLowerCase() === other.toLowerCase();
}

/**
 * What a pane is actually reading, as everything outside the pane needs it.
 *
 * Not the same thing as the address that opened it. A pane that has been
 * drilled into is showing another board entirely, at a variant the address
 * never named, and a beat of a walkthrough reads its variant through a view the
 * person did not choose. Everything a shell does on the pane's behalf — saying
 * what an agent is looking at, opening the code a subject is bound to,
 * reporting what was picked out — is about the board on screen, so the pane
 * says which one that is rather than leaving the shell to assume its own.
 */
interface SemanticPaneReading {
	/** The board on screen, which is the drilled-into one when there is one. */
	readonly board: string;
	/** The variant on screen, by id, or null before anything has been drawn. */
	readonly variant: string | null;
	/** The view it is being read through, or null for the whole variant. */
	readonly view: string | null;
	/** What is selected on that board, or null when nothing is. */
	readonly selection: string | null;
	/**
	 * The resolved reading, including an empty view, as the server named it;
	 * null before the server has answered.
	 *
	 * The ids above are what an address is written from; this is what a reader
	 * who has not got the board open needs to be told — a variant's lasting name
	 * and where it stands, and the view's name and grammar. The pane has just
	 * been handed all of it with the picture, so saying it costs nothing and
	 * saves everybody downstream a second read of a document somebody else is
	 * holding open.
	 */
	readonly drawn: {
		readonly variant: RenderedVariant;
		readonly view: OfferedView | null;
		readonly version: number;
	} | null;
	/**
	 * Where a presented walkthrough has got to, or null when none is presented.
	 *
	 * Said so something narrating the presentation can follow the picture
	 * (TASK-251): which step is on screen, whether it has finished arriving, and
	 * whether a person or a request put it there. The position is still the
	 * pane's; this is the pane saying where it is.
	 */
	readonly presentation: PanePresentation | null;
}

/** Where a presented walkthrough has got to. */
interface PanePresentation {
	/** The walkthrough being presented, by id. */
	readonly walkthrough: string;
	/** Which beat is on screen, counted from zero. */
	readonly beat: number;
	/** How many beats it has. */
	readonly of: number;
	/** Whether that beat has finished arriving. */
	readonly arrived: boolean;
	/** The request this position answers, or null when a person chose it. */
	readonly answering: string | null;
}

export {
	boardAddressOf,
	boardKeyFor,
	sameBoardName,
	type PanePresentation,
	type SemanticPaneReading,
	type SemanticTarget,
};

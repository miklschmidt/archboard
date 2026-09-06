// What the navigator lists, derived from the real listing: persisted boards
// grouped by name, open boards that are not in the vault yet, boards an agent
// is working on that nothing else lists, which pane is showing what, what an
// agent is doing where, and the scratch boards. Pure: no React.

import type { ScratchBoardEntry, ShellView } from "@/ui/shell/lib/contracts";
import type { PreviewSource } from "@/ui/board-preview";
import type { AgentActivityEntry, BoardIdentity, BoardListing } from "@/ui/types";

/** Pane letters in reading order; a third pane would be a number. */
const PANE_LETTERS = ["A", "B"] as const;

/**
 * The letter a pane is called by in the chrome.
 * @param index The pane's position in reading order.
 * @returns `A`, `B`, or the one-based position beyond that.
 */
function paneLetter(index: number): string {
	return PANE_LETTERS[index] ?? String(index + 1);
}

/** One selectable navigator entry. */
interface NavigatorEntry {
	key: string;
	identity: BoardIdentity;
	preview: PreviewSource | null;
	/** Open in the session but not persisted in the vault. */
	draft: boolean;
	/** The letter of the pane showing this board, or null when no pane holds it. */
	onScreen: string | null;
	/** A scratch board with a note but no chosen name. */
	placeholder: boolean;
	/** What an agent is doing to this board right now, or null (ADR 0022). */
	activity: AgentActivityEntry | null;
}

/**
 * The identity a board key spells: a bare name is the current variant, and
 * `name@variant` names another. Mirrors `parseBoardKey` in the engine, which
 * the browser cannot import.
 * @param key The board key.
 * @returns Its identity.
 */
function identityOfKey(key: string): BoardIdentity {
	const at = key.lastIndexOf("@");
	return at === -1
		? { board: key, variant: "current" }
		: { board: key.slice(0, at), variant: key.slice(at + 1) };
}

/** A named board and its variants, in listing order. */
interface NavigatorGroup {
	board: string;
	variants: NavigatorEntry[];
}

/**
 * Which pane letter shows each board key.
 * @param listing The listing with its on-screen panes in reading order.
 * @returns Board key to pane letter.
 */
function onScreenLetters(listing: BoardListing): ReadonlyMap<string, string> {
	const letters = new Map<string, string>();
	listing.onScreen.forEach((pane, index) => {
		if (!letters.has(pane.board)) {
			letters.set(pane.board, paneLetter(index));
		}
	});
	return letters;
}

/** What every entry is built from. */
interface EntrySource {
	key: string;
	identity: BoardIdentity;
	draft: boolean;
	placeholder: boolean;
}

/**
 * Build one entry from its source and the view's previews and pane letters.
 * @param source The board's key, identity and flags.
 * @param view The shell view.
 * @param letters Board key to pane letter.
 * @returns The entry.
 */
function toEntry(
	source: EntrySource,
	view: ShellView,
	letters: ReadonlyMap<string, string>,
): NavigatorEntry {
	return {
		key: source.key,
		identity: source.identity,
		preview: view.previews[source.key] ?? null,
		draft: source.draft,
		onScreen: letters.get(source.key) ?? null,
		placeholder: source.placeholder,
		activity: view.agentActivity[source.key] ?? null,
	};
}

/**
 * Persisted boards first, then open boards the vault does not hold yet, then
 * boards an agent is working on that neither lists: a board an agent has just
 * created shows the moment it is written to (ADR 0022). A scratch board is
 * open too, but it belongs to the scratch group, not here.
 * @param view The shell view holding the listing and the agent activity.
 * @param scratchKeys The keys the scratch group already lists.
 * @returns Sources in listing order, drafts last.
 */
function boardSources(view: ShellView, scratchKeys: ReadonlySet<string>): EntrySource[] {
	const listing = view.boards;
	const persisted = listing.boards.map((board) => ({
		key: board.key,
		identity: board.identity,
		draft: false,
		placeholder: false,
	}));
	const listed = new Set(persisted.map((source) => source.key));
	const drafts = listing.open
		.filter((board) => !listed.has(board.key) && !scratchKeys.has(board.key))
		.map((board) => ({
			key: board.key,
			identity: board.identity,
			draft: true,
			placeholder: false,
		}));
	for (const draft of drafts) {
		listed.add(draft.key);
	}
	const working = Object.keys(view.agentActivity)
		.filter((key) => !listed.has(key) && !scratchKeys.has(key))
		.map((key) => ({ key, identity: identityOfKey(key), draft: true, placeholder: false }));
	return [...persisted, ...drafts, ...working];
}

/**
 * Group the listing by board name, drafts included. The vault lists boards in
 * directory order, which changes between restarts; a person finds a board by
 * name, so groups and their variants are sorted by name.
 * @param view The shell view holding the listing and the previews.
 * @returns Groups by board name, variants by key.
 */
function groupBoards(view: ShellView): NavigatorGroup[] {
	const letters = onScreenLetters(view.boards);
	const groups = new Map<string, NavigatorGroup>();
	const scratchKeys = new Set(view.scratch.map((entry) => entry.key));
	for (const source of boardSources(view, scratchKeys)) {
		const group = groups.get(source.identity.board) ?? {
			board: source.identity.board,
			variants: [],
		};
		group.variants.push(toEntry(source, view, letters));
		groups.set(source.identity.board, group);
	}
	return [...groups.values()]
		.map((group) => ({
			...group,
			variants: group.variants.toSorted((a, b) => a.key.localeCompare(b.key, "en")),
		}))
		.toSorted((a, b) => a.board.localeCompare(b.board, "en"));
}

/**
 * Scratch boards as navigator entries.
 * @param view The shell view holding the scratch list and the previews.
 * @returns One entry per scratch board.
 */
function scratchEntries(view: ShellView): NavigatorEntry[] {
	const letters = onScreenLetters(view.boards);
	return view.scratch.map((entry: ScratchBoardEntry) =>
		toEntry(
			{ key: entry.key, identity: entry.identity, draft: false, placeholder: entry.placeholder },
			view,
			letters,
		),
	);
}

export {
	identityOfKey,
	paneLetter,
	groupBoards,
	scratchEntries,
	type NavigatorEntry,
	type NavigatorGroup,
};

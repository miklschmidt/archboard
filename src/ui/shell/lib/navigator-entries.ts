// What the navigator lists, derived from the real listing: the vault's boards
// grouped by name, boards an agent is working on that the listing does not
// hold yet, which pane is showing what, and what an agent is doing where.
// Pure: no React.

import { listedBoardKey } from "@/ui/board-catalog";
import { boardAddressOf } from "@/ui/semantic-board-canvas";
import type { ShellView } from "@/ui/shell/types/contracts";
import type { AgentActivityEntry, BoardEntry, BoardIdentity, BoardListing } from "@/ui/types";

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
interface NavigatorEntry extends BoardEntry {
	/** Being worked on but not listed by the vault yet. */
	draft: boolean;
	/** The letter of the pane showing this board, or null when no pane holds it. */
	onScreen: string | null;
	/** What an agent is doing to this board right now, or null (ADR 0022). */
	activity: AgentActivityEntry | null;
}

/**
 * The identity a board key spells: a bare name is the current variant, and
 * `name@variant` names another.
 *
 * The split is the canvas module's, not a second reading of the same spelling.
 * A board's name can never hold an `@` and a variant's name can — "Queue @ edge"
 * is a title somebody wrote — so where the mark falls is a rule, and a listing
 * that guessed it differently from the pane would name a board nothing opens.
 * @param key The board key.
 * @returns Its identity.
 */
function identityOfKey(key: string): BoardIdentity {
	const target = boardAddressOf(key);
	return target === null
		? { board: key, variant: "current" }
		: { board: target.board, variant: target.variant ?? "current" };
}

/** A variant and its descendants. */
interface NavigatorBranch {
	entry: NavigatorEntry;
	children: NavigatorBranch[];
}

/** A named board and its variant ancestry. */
interface NavigatorGroup {
	board: string;
	variants: NavigatorEntry[];
	roots: NavigatorBranch[];
}

/**
 * Which pane letter shows each board key.
 * @param listing The listing with its on-screen panes in reading order.
 * @returns Board key to pane letter.
 */
function onScreenLetters(listing: BoardListing): ReadonlyMap<string, string> {
	const letters = new Map<string, string>();
	listing.onScreen.forEach((pane, index) => {
		const key = listedBoardKey(listing, pane.board) ?? pane.board;
		if (!letters.has(key)) {
			letters.set(key, paneLetter(index));
		}
	});
	return letters;
}

/** What every entry is built from. */
interface EntrySource extends BoardEntry {
	draft: boolean;
}

/**
 * Build one entry from its source and the view's pane letters.
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
		...source,
		onScreen: letters.get(source.key) ?? null,
		activity: view.agentActivity[boardAddressOf(source.key)?.board ?? source.key] ?? null,
	};
}

/**
 * The vault's boards first, then boards an agent is working on that the
 * listing does not hold: a board an agent has just created shows the moment it
 * is written to (ADR 0022).
 * @param view The shell view holding the listing and the agent activity.
 * @returns Sources in listing order, the unlisted ones last.
 */
function boardSources(view: ShellView): EntrySource[] {
	const listed = view.boards.boards.map((board) => ({
		...board,
		draft: false,
	}));
	const known = new Set(listed.map((source) => boardAddressOf(source.key)?.board ?? source.key));
	const working = Object.keys(view.agentActivity)
		.filter((key) => !known.has(key))
		.map((key) => ({ key, identity: identityOfKey(key), draft: true }));
	return [...listed, ...working];
}

/**
 * Group the listing by board name, drafts included. The vault lists boards in
 * directory order, which changes between restarts; a person finds a board by
 * name, so groups and their variants are sorted by name.
 * @param view The shell view holding the listing.
 * @returns Groups by board name with siblings ordered by variant name.
 */
function groupBoards(view: ShellView): NavigatorGroup[] {
	const letters = onScreenLetters(view.boards);
	const groups = new Map<string, NavigatorGroup>();
	for (const source of boardSources(view)) {
		const group = groups.get(source.identity.board) ?? {
			board: source.identity.board,
			variants: [],
			roots: [],
		};
		group.variants.push(toEntry(source, view, letters));
		groups.set(source.identity.board, group);
	}
	return [...groups.values()]
		.map((group) => ({ ...group, roots: variantTree(group.variants) }))
		.toSorted((a, b) => a.board.localeCompare(b.board, "en"));
}

/**
 * Read ancestry independently of lifecycle: adoption never moves a descendant
 * out from under the state it came from. Names sort siblings deterministically.
 * @param entries The board's persisted variants.
 * @returns Every root and its descendants.
 */
function variantTree(entries: readonly NavigatorEntry[]): NavigatorBranch[] {
	const ordered = entries.toSorted(
		(a, b) =>
			a.identity.variant.localeCompare(b.identity.variant, "en") ||
			a.key.localeCompare(b.key, "en"),
	);
	const branches = new Map<string, NavigatorBranch>(
		ordered.map((entry) => [entry.variant?.id ?? entry.key, { entry, children: [] }]),
	);
	const roots: NavigatorBranch[] = [];
	for (const branch of branches.values()) {
		const parentId = branch.entry.variant?.parentId;
		const parent = parentId == null ? undefined : branches.get(parentId);
		if (parent === undefined) roots.push(branch);
		else parent.children.push(branch);
	}
	return roots;
}

export {
	identityOfKey,
	paneLetter,
	groupBoards,
	type NavigatorEntry,
	type NavigatorGroup,
	type NavigatorBranch,
};

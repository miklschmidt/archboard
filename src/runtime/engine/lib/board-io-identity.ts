// Who a note says it is.
//
// Three things can name a board: the address being opened, the note's own
// frontmatter, and the path it was found at. They agree almost always, and
// this is what happens when they do not: the address wins, because that is how
// the file was found; the note supplies what no path can carry; and a note
// that names a different board is reported rather than obeyed.

import { type BoardIdentity, boardKey } from "@/runtime/engine/lib/board-address";

/**
 * A candidate's display name, when it is about the same board.
 * @param candidate An identity that may or may not name this board.
 * @param key The board being opened.
 * @returns Its display name, or undefined when it names something else.
 */
function displayNameIfSame(candidate: BoardIdentity | null, key: string): string | undefined {
	return candidate && boardKey(candidate) === key ? candidate.displayName : undefined;
}

/**
 * What to call this board.
 *
 * Preferring what the note says over what its path implies, and both over what
 * the caller asked: the address is case-insensitive, so opening `payments`
 * must not rename a board somebody created as `Payments`.
 * @param asked The identity as asked.
 * @param declared What the frontmatter declares, if anything.
 * @param onDisk What the file name implies, if anything.
 * @returns The display name to carry, if any.
 */
function chosenDisplayName(
	asked: BoardIdentity,
	declared: BoardIdentity | null,
	onDisk: BoardIdentity | null,
): string | undefined {
	const key = boardKey(asked);
	return displayNameIfSame(declared, key) ?? displayNameIfSame(onDisk, key) ?? asked.displayName;
}

/**
 * The identity a loaded note carries.
 *
 * The address being opened, plus `level`, which no path can express and only
 * the frontmatter can supply.
 * @param asked The board being opened.
 * @param declared What the frontmatter declares, if anything.
 * @param displayName What to call it.
 * @returns The identity.
 */
function loadedIdentity(
	asked: BoardIdentity,
	declared: BoardIdentity | null,
	displayName: string | undefined,
): BoardIdentity {
	return {
		...asked,
		...(declared?.level ? { level: declared.level } : {}),
		...(displayName ? { displayName } : {}),
	};
}

/**
 * The board the note says it is, when that is not the board being opened.
 *
 * Reported rather than obeyed: the address the file was found at is what it
 * is, and a note that disagrees is something the caller should hear about.
 * @param asked The board being opened.
 * @param declared What the frontmatter declares, if anything.
 * @returns The `declaredKey` field, or nothing.
 */
function declaredKeyOf(
	asked: BoardIdentity,
	declared: BoardIdentity | null,
): { declaredKey?: string } {
	return declared && boardKey(declared) !== boardKey(asked)
		? { declaredKey: boardKey(declared) }
		: {};
}

export { chosenDisplayName, declaredKeyOf, loadedIdentity };

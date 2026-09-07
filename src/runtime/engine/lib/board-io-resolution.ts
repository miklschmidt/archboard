// Turning an address somebody typed into the one note it names, or the
// refusal that says why it names none (ADR 0020). Nothing here reads a note:
// the checks below are on what the vault listing says, and `board-io.ts` does
// the read once they pass.

import { BoardResolutionError } from "@/runtime/engine/board-target";
import { type BoardIdentity, boardKey, makeIdentity, parseBoardKey, SCRATCH_BOARD } from "@/runtime/engine/lib/board-address";
import { listBoards, type VaultBoard } from "@/runtime/engine/lib/board-vault-listing";
import { errorMessage } from "@/runtime/engine/lib/board-errno";

/**
 * Every distinct board key in the vault, for the refusal that lists what a
 * caller could have named. An unreadable vault lists nothing rather than
 * turning one refusal into another.
 * @param root The vault root.
 * @returns Sorted, de-duplicated keys.
 */
function availableBoardKeys(root: string): string[] {
	try {
		return listBoards(root)
			.map((entry) => entry.key)
			.filter((key, index, all) => all.indexOf(key) === index)
			.toSorted();
	} catch {
		return [];
	}
}

/**
 * Parse a typed address, turning a bad one into a resolution refusal that
 * says how to find a good one.
 * @param asked The address as typed.
 * @returns The identity it names.
 */
function parseAskedKey(asked: string): BoardIdentity {
	try {
		return parseBoardKey(asked);
	} catch (error) {
		throw new BoardResolutionError(
			asked,
			"malformed",
			`Board address ${JSON.stringify(asked)} is invalid: ${errorMessage(error)} Run \`board list\` and pass one exact board key.`,
			[],
			{ cause: error },
		);
	}
}

/**
 * The refusal for a note whose own frontmatter names a different board than
 * its path does.
 * @param key The board key asked for.
 * @param file The note found at that address.
 * @param declaredKey The key the note's frontmatter claims.
 * @returns The error to throw.
 */
function conflictingDeclaration(key: string, file: string, declaredKey: string): BoardResolutionError {
	return new BoardResolutionError(
		key,
		"conflicting",
		`Board "${key}" resolves to ${file}, but that note declares itself as "${declaredKey}". Make the note path and frontmatter name agree, then retry.`,
		[file],
	);
}

/**
 * The one vault note listed under a key, refusing when there are several or
 * when the one there disagrees with its own frontmatter. The scratch board is
 * archboard's own note outside the listing and has no candidate.
 * @param key The board key asked for.
 * @param root The vault root.
 * @returns The listed note, or undefined when the listing has none.
 */
function candidateNoteFor(key: string, root: string): VaultBoard | undefined {
	const candidates =
		key === boardKey(makeIdentity({ board: SCRATCH_BOARD }))
			? []
			: listBoards(root).filter((entry) => entry.key === key);
	if (candidates.length > 1) {
		const files = candidates.map((entry) => entry.file).toSorted();
		throw new BoardResolutionError(
			key,
			"ambiguous",
			`Board "${key}" matches ${files.length} notes: ${files.join(", ")}. Rename or remove the duplicate notes so one key names one board.`,
			files,
		);
	}
	const candidate = candidates[0];
	if (candidate?.declaredKey) {
		throw conflictingDeclaration(key, candidate.file, candidate.declaredKey);
	}
	return candidate;
}

/**
 * The refusal for creating a board whose key already has a note.
 * @param key The board key asked for.
 * @param existing The notes already listed under it.
 * @returns The error to throw.
 */
function existingNotesError(key: string, existing: VaultBoard[]): BoardResolutionError {
	const files = existing.map((entry) => entry.file).toSorted();
	const one = existing.length === 1;
	return new BoardResolutionError(
		key,
		one ? "conflicting" : "ambiguous",
		`Board "${key}" already has ${one ? "a note" : `${existing.length} notes`} in the vault at ${files.join(", ")}. Use another name, or resolve the existing note${one ? "" : "s"} before retrying.`,
		files,
	);
}

export { availableBoardKeys, parseAskedKey, conflictingDeclaration, candidateNoteFor, existingNotesError };

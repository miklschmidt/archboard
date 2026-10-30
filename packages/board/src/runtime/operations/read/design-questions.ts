// The design questions of a vault, read from its boards (ADR 0044, ADR 0059).
//
// Every board is read at its current variant, because that is the architecture
// that is built. A board nobody has built has none, and a board that cannot be
// read has no content: each is listed as skipped with the reason, so neither
// reads as a board with nothing to ask. A board the caller names that is not in
// the vault is a refusal, not a skip, because a name that matches nothing is a
// mistake that an empty answer would hide.
//
// Nothing is stored: each call reads the files and derives the answer.

import {
	designQuestionsReply,
	type BoardAtVariant,
	type DesignQuestionsReply,
	type SkippedBoard,
} from "#shared/protocol/design-questions.ts";
import { currentVariant } from "#shared/schemas/board-document.ts";
import { listSemanticBoards } from "#runtime/operations/read/listing.ts";
import {
	readSemanticBoard,
	readSemanticBoardAt,
	type SemanticBoardRead,
} from "#runtime/operations/read/read.ts";

/** The answer, or the boards that were named and the vault does not hold. */
type DesignQuestionsRead =
	| { readonly ok: true; readonly reply: DesignQuestionsReply }
	| { readonly ok: false; readonly missing: readonly string[] };

/**
 * Every board of the vault that the caller named, or every board when it named
 * none. A name is matched as every board name is, so its case does not matter.
 * @param vault The vault directory.
 * @param named The board names the caller gave.
 * @returns What reading each board answered, or the names that match no board.
 */
function readNamed(
	vault: string,
	named: readonly string[],
): { readonly reads: SemanticBoardRead[] } | { readonly missing: string[] } {
	if (named.length === 0) {
		return { reads: listSemanticBoards(vault).map((one) => readSemanticBoardAt(vault, one)) };
	}
	const reads = named.map((name) => ({ name, read: readOrMissing(vault, name) }));
	const missing = reads.flatMap(({ name, read }) => (read === undefined ? [name] : []));
	return missing.length > 0
		? { missing }
		: { reads: reads.flatMap(({ read }) => (read === undefined ? [] : [read])) };
}

/**
 * One board by the name the caller gave it.
 * @param vault The vault directory.
 * @param name The name.
 * @returns What reading it answered, or undefined when no board answers to the name.
 */
function readOrMissing(vault: string, name: string): SemanticBoardRead | undefined {
	try {
		const read = readSemanticBoard(vault, name);
		return read.ok || read.code !== "BOARD_MISSING" ? read : undefined;
	} catch {
		// A name that cannot be a board's: nothing answers to it.
		return undefined;
	}
}

/**
 * Whether a board was skipped.
 * @param one A board as the answer reads it.
 * @returns True for a skip.
 */
const isSkip = (one: BoardAtVariant | SkippedBoard): one is SkippedBoard => "reason" in one;

/**
 * One board as the answer reads it: at its current variant, or why it is skipped.
 * @param read What reading the board answered.
 * @returns The board at its variant, or the skip.
 */
function placed(read: SemanticBoardRead): BoardAtVariant | SkippedBoard {
	if (!read.ok) {
		return { reason: "board-unreadable", board: read.location.name, detail: read.problem };
	}
	const { board } = read;
	const variant = currentVariant(board);
	return variant === undefined
		? { reason: "no-current-variant", board: board.name }
		: { name: board.name, version: board.version, variant };
}

/**
 * The three design questions over the boards of a vault, each at its current
 * variant.
 * @param vault The vault directory.
 * @param named The boards to read; every board of the vault when none is named.
 * A board named twice is read once.
 * @returns The answer, or the names that match no board.
 */
function readDesignQuestions(vault: string, named: readonly string[] = []): DesignQuestionsRead {
	const found = readNamed(vault, named);
	if ("missing" in found) return { ok: false, missing: found.missing };
	const once = new Map(found.reads.map((read) => [read.location.key, read]));
	const each = [...once.values()].map(placed);
	return {
		ok: true,
		reply: designQuestionsReply(
			each.flatMap((one) => (isSkip(one) ? [] : [one])),
			each.filter(isSkip),
		),
	};
}

export { type DesignQuestionsRead, readDesignQuestions };

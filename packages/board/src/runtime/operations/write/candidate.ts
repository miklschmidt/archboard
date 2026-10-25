// What a write may write: the board read, the stated version checked, the
// change applied and the candidate admitted under the vault's policy and the
// board's own address. Nothing here takes a lease or writes a file.
//
// The write's own pass runs these checks under the lease (`write.ts`). A
// preparation runs them with a read that holds no lease (`prepare.ts`), so a
// candidate somebody reads evidence about is judged by the rules its commit is
// judged by again.

import type { SemanticBoard } from "#shared/schemas/board-document.ts";
import { semanticBoardAddress, type SemanticBoardLocation } from "#runtime/store/location.ts";
import {
	readSemanticBoardAtUnderLease,
	type SemanticBoardRead,
} from "#runtime/operations/read/read.ts";
import { relocation, type Relocation } from "#runtime/operations/rename/relocation.ts";
import { refuse, type SemanticRefusalCode } from "#runtime/operations/write/outcome.ts";
import type { DescendantOutcome } from "#runtime/operations/variant/propagate.ts";
import type { WriteNotice } from "#runtime/operations/edit/replaced-relationships.ts";
import { readSemanticBoardConfiguration } from "#runtime/store/configuration.ts";
import { acceptedBoard } from "#runtime/operations/write/accepted.ts";
import type {
	SemanticWriteCommand,
	SemanticWriteRejection,
} from "#runtime/operations/write/write.ts";

/** What a candidate is made from: the vault, the change and the version the writer read. */
type CandidateCommand = Pick<SemanticWriteCommand, "vault" | "transition" | "expectedVersion">;

/** A candidate the checks admit, where it is written, and the version it was made from. */
interface CheckedCandidate {
	readonly outcome: "checked";
	/** Where the board is written, and where its file was when it moves. */
	readonly moved: Relocation;
	/** The board as it is written: stamped, coherent and configured. */
	readonly board: SemanticBoard;
	/** The version the board was at, or null when there was none. */
	readonly previousVersion: number | null;
	/** What every draft under the change did about it. */
	readonly descendants?: readonly DescendantOutcome[];
	/** What the change did that the answer should say. */
	readonly notices?: readonly WriteNotice[];
}

/**
 * Shape a rejection.
 * @param location Where the board lives.
 * @param version The version the board is actually at.
 * @param code Why the write was refused.
 * @param problem What went wrong, in a sentence.
 * @returns The rejection.
 */
function rejected(
	location: SemanticBoardLocation,
	version: number | null,
	code: SemanticRefusalCode,
	problem: string,
): SemanticWriteRejection {
	return { outcome: "rejected", code, problem, location, version };
}

/** How a write's checks read the board it is about. */
type BoardReader = (vault: string, location: SemanticBoardLocation) => SemanticBoardRead;

/**
 * The board as it stands, ready for the transition, or the refusal a caller
 * gets instead. A board that is simply not there yet is not a refusal: that is
 * what a create command expects to find.
 * @param vault The vault root the board lives in.
 * @param location Where the board lives.
 * @param expected The version the writer stated, when it stated one.
 * @param readBoard How the board is read: under its lease, which persists a
 * migration it awaits, unless the caller holds none and writes nothing.
 * @returns The board and its version, or why the write cannot go ahead.
 */
function boardBefore(
	vault: string,
	location: SemanticBoardLocation,
	expected: number | undefined,
	readBoard: BoardReader = readSemanticBoardAtUnderLease,
):
	| { readonly ok: true; readonly board: SemanticBoard | null; readonly version: number | null }
	| SemanticWriteRejection {
	const read = readBoard(vault, location);
	const unusable = unusableRefusal(location, read);
	if (unusable !== null) {
		return unusable;
	}
	const board = read.ok ? read.board : null;
	const version = board === null ? null : board.version;
	const stale = versionRefusal(expected, version);
	return stale === null
		? { ok: true, board, version }
		: rejected(location, version, stale.code, stale.problem);
}

/**
 * Whether what is on disk can be written to at all: it is either nothing yet,
 * or a coherent board that really is this one.
 * @param location Where the board lives.
 * @param read What the read found.
 * @returns The refusal, or null when the write may go ahead.
 */
function unusableRefusal(
	location: SemanticBoardLocation,
	read: SemanticBoardRead,
): SemanticWriteRejection | null {
	if (read.ok) {
		return misaddressedRefusal(location, read.board);
	}
	return read.code === "BOARD_UNREADABLE"
		? rejected(location, null, read.code, read.problem)
		: null;
}

/**
 * Refuse a board that is not the board its own address says it is.
 *
 * Checked on the way in and on the way out. A file copied or renamed inside a
 * vault keeps the name written inside it; a command can equally well ask to
 * write a board called one thing to the address of another. Either way the
 * document would answer to two identities, and reads, the listing, the lease
 * and the message a pane receives would each pick one of them.
 * @param location Where the board lives.
 * @param board The board read or about to be written.
 * @returns The refusal, or null when the two agree.
 */
function misaddressedRefusal(
	location: SemanticBoardLocation,
	board: SemanticBoard,
): SemanticWriteRejection | null {
	if (semanticBoardAddress(board.name).key === location.key) {
		return null;
	}
	return rejected(
		location,
		board.version,
		"BOARD_MISADDRESSED",
		`${location.file} holds a board that calls itself "${board.name}", which is a different board ` +
			`from "${location.name}". Rename one of them, or move the file back to where its name says ` +
			"it belongs. Nothing was written.",
	);
}

/**
 * Refuse a command that must state which version it read and did not.
 *
 * The check is here rather than only at the transport, because this is the
 * boundary every caller goes through: a dynamic tool, a route and a command all
 * arrive at this function, and a precondition enforced in one of them is a
 * precondition the other two do not have.
 * @param location Where the board lives.
 * @param command The stated command.
 * @returns The refusal, or null when the command may go ahead.
 */
function missingVersionRefusal(
	location: SemanticBoardLocation,
	command: CandidateCommand,
): SemanticWriteRejection | null {
	if (!command.transition.changesExistingBoard || command.expectedVersion !== undefined) {
		return null;
	}
	return rejected(
		location,
		null,
		"EXPECT_VERSION_REQUIRED",
		`This write does not say which version of "${location.name}" it was written against, so there ` +
			"is no way to tell whether somebody else has changed it since. Read the board, write the " +
			"change against what it said, and state the version it reported. Reading it again " +
			"immediately before writing would make the check pass by construction and hide the change " +
			"you were meant to notice. Nothing was written.",
	);
}

/**
 * Whether the board a command produced may be written: it is coherent, and it
 * is the board this address names.
 * @param location Where it would be written.
 * @param command The stated command, for a refusal to say what it was doing.
 * @param before The family before this command.
 * @param produced The board the transition produced.
 * @param at The timestamp to stamp it with.
 * @returns The board, or why it may not be written.
 */
function acceptable(
	location: SemanticBoardLocation,
	command: CandidateCommand,
	before: SemanticBoard | null,
	produced: SemanticBoard,
	at: string,
): { readonly board: SemanticBoard } | Omit<SemanticWriteRejection, "version"> {
	const configured = readSemanticBoardConfiguration(command.vault);
	const accepted = acceptedBoard(
		before,
		produced,
		at,
		configured.ok ? configured.configuration : null,
	);
	if ("problem" in accepted) {
		return {
			outcome: "rejected",
			code: "INVALID_CONTENT",
			problem: `refusing to ${command.transition.summary}: ${accepted.problem}`,
			location,
		};
	}
	return misaddressedRefusal(location, accepted.board) ?? { board: accepted.board };
}

/**
 * Whether the writer is working from the board as it stands.
 *
 * A writer that states no version is not checked — that is the caller saying
 * it does not care, and it is how a first create works. A writer that states
 * one is refused the moment it disagrees, before anything is applied.
 * @param expected The version the writer stated, when it stated one.
 * @param actual The version the board is at, or null when there is no board.
 * @returns The refusal, or null when the write may proceed.
 */
function versionRefusal(
	expected: number | undefined,
	actual: number | null,
): { readonly code: SemanticRefusalCode; readonly problem: string } | null {
	if (expected === undefined || expected === actual) {
		return null;
	}
	const at = actual === null ? "no board is there" : `it is at version ${actual}`;
	const { code, problem } = refuse(
		"BOARD_VERSION_CONFLICT",
		`this write expected version ${expected} and ${at}; read the board again and restate the change`,
	);
	return { code, problem };
}

/**
 * Read the board, check the stated version, apply the change and admit the
 * candidate. A refusal leaves the file as it was, and so does success: this
 * writes nothing.
 * @param location Where the board lives.
 * @param command The vault, the change and the version the writer read.
 * @param at The timestamp to stamp the change with.
 * @param readBoard How the board is read: under the lease, or as the lease would read it.
 * @returns The checked candidate, or why it may not be written.
 */
function checkedCandidate(
	location: SemanticBoardLocation,
	command: CandidateCommand,
	at: string,
	readBoard: BoardReader,
): CheckedCandidate | SemanticWriteRejection {
	const missing = missingVersionRefusal(location, command);
	if (missing !== null) {
		return missing;
	}
	const before = boardBefore(command.vault, location, command.expectedVersion, readBoard);
	if (!("ok" in before)) {
		return before;
	}
	const candidate = command.transition.apply(before.board, at);
	if (!candidate.ok) {
		return rejected(location, before.version, candidate.code, candidate.problem);
	}
	const moved = relocation(command.vault, location, before.board, candidate.board);
	const checked = acceptable(moved.location, command, before.board, candidate.board, at);
	if (!("board" in checked)) {
		return { ...checked, version: before.version };
	}
	const { descendants, notices } = candidate;
	return {
		outcome: "checked",
		moved,
		board: checked.board,
		previousVersion: before.version,
		...(descendants === undefined ? {} : { descendants }),
		...(notices === undefined ? {} : { notices }),
	};
}

export { type BoardReader, type CheckedCandidate, boardBefore, checkedCandidate, rejected };

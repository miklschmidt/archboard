// Where a board's file goes when its name changes (TASK-281, ADR 0036).
//
// A board's file is named after the board, and the read boundary refuses a
// file that holds a board by another name (ADR 0010), so a rename moves the
// file. The move is part of the one write that renames the board: under the
// board's lease, after every check, and committed before it is answered.
//
// The new name is somebody else's business until it is taken. A board may
// already carry it, or have carried it before a rename of its own, and a
// writer may be creating a board by that name at this moment. So the new name's
// lease is taken as well, without waiting — a rename that has to queue behind
// somebody else's board is refused with who has it — and both questions are
// asked under it.
//
// The file is moved first and then written, never the other way round. A crash
// between the two leaves one file that holds the board under its old name at
// its new path, which every reader refuses with the words that say how to put
// it back; the other order would leave two coherent boards, one of them stale,
// and nothing would say which.

import fs from "node:fs";
import path from "node:path";
import { moveFileDurably, writeFileAtomic } from "@/runtime/engine/atomic-write";
import { withBoardLockIfFreeSync, type HolderKind } from "@/runtime/engine/board-lock";
import type { SemanticBoard } from "@/shared/semantic-board/index";
import { boardFormerlyCalled } from "@/runtime/semantic-board-store/lib/former-names";
import {
	locateSemanticBoard,
	SEMANTIC_BOARD_FILE_SUFFIX,
	semanticBoardAddress,
	type SemanticBoardAddress,
	type SemanticBoardLocation,
} from "@/runtime/semantic-board-store/lib/location";
import type { SemanticRefusalCode } from "@/runtime/semantic-board-store/lib/outcome";

/** Where a candidate board is written, and where its file was when it moves. */
interface Relocation {
	/** Where the board is written. */
	readonly location: SemanticBoardLocation;
	/** Where its file is now, when the write moves it; null when it stays. */
	readonly from: SemanticBoardLocation | null;
}

/** Why a board could not take its new name. */
interface RelocationRefusal {
	readonly code: SemanticRefusalCode;
	readonly problem: string;
}

/**
 * Where the board a transition produced goes.
 *
 * Where it already is, unless its name changed. A change of case alone keeps
 * the key and the directory, and re-spells the file's own name; the
 * directories on the way are other boards' too and keep their spelling. Any
 * other change goes where the new name resolves.
 * @param vault The vault root the board lives in.
 * @param location Where the board is now.
 * @param before The board as it stands, or null before there is one.
 * @param candidate The board as it would be.
 * @returns Where it is written, and whether that moves it.
 */
function relocation(
	vault: string,
	location: SemanticBoardLocation,
	before: SemanticBoard | null,
	candidate: SemanticBoard,
): Relocation {
	if (before === null || candidate.name === before.name) {
		return { location, from: null };
	}
	const address = semanticBoardAddress(candidate.name);
	const to =
		address.key === location.key
			? { ...address, file: respelled(location.file, address.name) }
			: locateSemanticBoard(candidate.name, vault);
	return { location: to, from: to.file === location.file ? null : location };
}

/**
 * A board file's path with its own name spelled as a board name spells it.
 * @param file The file's path now.
 * @param name The board's name.
 * @returns The same directory, and the name's last segment as the file name.
 */
function respelled(file: string, name: string): string {
	const last = name.split("/").at(-1) ?? name;
	return path.join(path.dirname(file), `${last}${SEMANTIC_BOARD_FILE_SUFFIX}`);
}

/**
 * Take the new name and write the board under it, or say why it cannot be
 * taken. The write runs only once nothing else answers to the name and, when
 * the key changes, while this writer holds the new name's lease as well. A
 * write that keeps its name just runs.
 * @param vault The vault root the board lives in.
 * @param moved Where the board goes, and where its file was when it moves.
 * @param holder Who is writing: the identity the board is held under, and its kind.
 * @param holder.id The identity.
 * @param holder.kind Whether a person or an agent.
 * @param write The write, run only once the name is this board's to take.
 * @returns What the write answered, or why the name could not be taken.
 */
function underNewName<Written>(
	vault: string,
	moved: Relocation,
	holder: { readonly id: string; readonly kind: HolderKind },
	write: () => Written,
): Written | RelocationRefusal {
	const { location, from } = moved;
	if (from === null) {
		return write();
	}
	const moving = { location, from };
	if (location.key === from.key) {
		return fileTaken(moving) ?? write();
	}
	const held = withBoardLockIfFreeSync({ vault, board: moving.location.key, holder }, () => {
		return takenBy(vault, moving) ?? write();
	});
	return held.acquired
		? held.value
		: {
				code: "BOARD_HELD",
				problem:
					`Somebody is writing the board "${moving.location.name}" at this moment, so the name ` +
					"cannot be taken now. Try the rename again once they are done. Nothing was written.",
			};
}

/**
 * Whether another board already answers to the new name: one that carries it,
 * or one that carried it before a rename of its own and still opens by it.
 * @param vault The vault root the board lives in.
 * @param moving Where the board goes, and where it was.
 * @param moving.location Where the board goes.
 * @param moving.from Where its file is now.
 * @returns The refusal, or null when the name is free.
 */
function takenBy(
	vault: string,
	moving: {
		readonly location: SemanticBoardLocation;
		readonly from: SemanticBoardLocation;
	},
): RelocationRefusal | null {
	const { location, from } = moving;
	const file = fileTaken(moving);
	if (file !== null) {
		return file;
	}
	const formerly = boardFormerlyCalled(location.key, vault, from.key);
	if (formerly === null) {
		return null;
	}
	return {
		code: "BOARD_EXISTS",
		problem:
			`"${location.name}" is what the board "${formerly.name}" used to be called, and it still ` +
			"opens that board wherever something names it. Choose another name. Nothing was written.",
	};
}

/**
 * Whether another board's file is already where this one would go. A change of
 * case alone asks only this: the key is this board's, and nothing it used to
 * be called can be another board's.
 * @param moving Where the board goes, and where it was.
 * @param moving.location Where the board goes.
 * @param moving.from Where its file is now.
 * @returns The refusal, or null when nothing is there but this board.
 */
function fileTaken(moving: {
	readonly location: SemanticBoardLocation;
	readonly from: SemanticBoardLocation;
}): RelocationRefusal | null {
	const { location, from } = moving;
	if (!fs.existsSync(location.file) || sameFile(location.file, from.file)) {
		return null;
	}
	return {
		code: "BOARD_EXISTS",
		problem: `A board called "${location.name}" is already in the vault. Nothing was written.`,
	};
}

/**
 * Whether two paths are one file: on a filesystem that ignores case, a change
 * of case alone names the file that is already there.
 * @param one A path.
 * @param other Another path.
 * @returns True when both name the same file.
 */
function sameFile(one: string, other: string): boolean {
	try {
		const left = fs.statSync(one);
		const right = fs.statSync(other);
		return left.dev === right.dev && left.ino === right.ino;
	} catch {
		return false;
	}
}

/**
 * How a board is spelled on disk: indented with tabs and ending in a newline,
 * because it sits in a vault a person opens in a text editor, and a one-line
 * document there is a document nobody will ever read a diff of.
 * @param board The board to spell.
 * @returns The bytes to write.
 */
function serializeBoard(board: SemanticBoard): string {
	return `${JSON.stringify(board, null, "\t")}\n`;
}

/**
 * Write a board's file where it goes, moving it there first when its name
 * changed.
 * @param moved Where the board goes, and where its file was when it moves.
 * @param board The board as it should now be.
 * @throws {unknown} Whatever the move or the write threw.
 */
function writeBoardFile(moved: Relocation, board: SemanticBoard): void {
	const bytes = serializeBoard(board);
	if (moved.from === null) {
		fs.mkdirSync(path.dirname(moved.location.file), { recursive: true });
		writeFileAtomic(moved.location.file, bytes);
		return;
	}
	writeMoved(moved.from.file, moved.location.file, bytes);
}

/**
 * Move a board's file to its new path, then write the board there.
 *
 * A write that fails after the move puts the file back where it was, so a
 * refused rename leaves the vault as it found it.
 * @param from The file's path now.
 * @param to Where it goes.
 * @param bytes The board as it should now be.
 * @throws {unknown} Whatever the move or the write threw.
 */
function writeMoved(from: string, to: string, bytes: string): void {
	fs.mkdirSync(path.dirname(to), { recursive: true });
	moveFileDurably(from, to);
	try {
		writeFileAtomic(to, bytes);
	} catch (error) {
		moveFileDurably(to, from);
		throw error;
	}
}

/**
 * The address a write moved the board away from, when its key changed: what
 * everything keyed by the old name — a pane on it, the claim on it, what an
 * agent said it was doing — follows the board from.
 * @param moved Where the board went, and where its file was.
 * @param moved.location Where the board went.
 * @param moved.from Where its file was, or null when it stayed.
 * @returns The field to report, or nothing when the key stayed.
 */
function renamedFrom({ location, from }: Relocation): {
	renamedFrom?: SemanticBoardAddress;
} {
	return from === null || from.key === location.key
		? {}
		: { renamedFrom: { name: from.name, key: from.key } };
}

export {
	type Relocation,
	type RelocationRefusal,
	relocation,
	renamedFrom,
	underNewName,
	writeBoardFile,
};

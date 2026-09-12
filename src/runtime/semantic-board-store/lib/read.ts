// Reading a board off disk, and refusing to guess when it is not one.
//
// The board on disk is the board (ADR 0015's rule, applied to ADR 0023's file):
// nothing here keeps a copy, every read goes to the file, and the read is
// synchronous on purpose, because the write boundary reads and writes inside
// one lease and an `await` between them would open the window the lease exists
// to close.
//
// Every read validates. A file that parses as JSON but is not a coherent board
// is an error rather than a board with holes in it, because the only thing
// downstream can do with a board with holes in it is draw a wrong picture.

import fs from "node:fs";
import { errnoCode, errorMessage } from "@/shared/thrown-error/index";
import { parseSemanticBoard, type SemanticBoard } from "@/shared/semantic-board/index";
import {
	locateSemanticBoard,
	semanticBoardAddress,
	type SemanticBoardLocation,
} from "@/runtime/semantic-board-store/lib/location";

/** A board that was there and was coherent, or why it was neither. */
type SemanticBoardRead =
	| { readonly ok: true; readonly board: SemanticBoard; readonly location: SemanticBoardLocation }
	| {
			readonly ok: false;
			readonly code: "BOARD_MISSING" | "BOARD_UNREADABLE";
			readonly problem: string;
			readonly location: SemanticBoardLocation;
	  };

/**
 * The bytes at a path, or nothing when no file is there. A missing board is
 * not an error: a board that has not been created yet is exactly what the
 * create command expects to find.
 * @param file The path.
 * @returns The file's text, or undefined.
 * @throws {unknown} Whatever the read threw, other than the file being absent.
 */
function textAt(file: string): string | undefined {
	try {
		return fs.readFileSync(file, "utf-8");
	} catch (error) {
		if (errnoCode(error) === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

/**
 * Refuse a board that is there but cannot be believed.
 * @param location Where the board lives.
 * @param problem What is wrong with it.
 * @returns The refusal.
 */
function unreadable(location: SemanticBoardLocation, problem: string): SemanticBoardRead {
	return { ok: false, code: "BOARD_UNREADABLE", problem, location };
}

/**
 * Read the board at a known location.
 * @param location Where the board lives.
 * @returns The board, or why it could not be read.
 */
function readSemanticBoardAt(location: SemanticBoardLocation): SemanticBoardRead {
	const text = textAt(location.file);
	if (text === undefined) {
		return {
			ok: false,
			code: "BOARD_MISSING",
			problem: `no semantic board at ${location.file}`,
			location,
		};
	}
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		return unreadable(location, `${location.file} is not JSON: ${errorMessage(error)}`);
	}
	const parsed = parseSemanticBoard(value);
	if (!parsed.ok) {
		return unreadable(location, parsed.problem);
	}
	// A file copied or renamed inside a vault keeps the name written inside it.
	// A document that answers to two addresses is one the listing, the lease and
	// every pane would each name differently, so it is refused rather than read.
	if (semanticBoardAddress(parsed.board.name).key !== location.key) {
		return unreadable(
			location,
			`${location.file} holds a board that calls itself "${parsed.board.name}", which is a ` +
				`different board from "${location.name}"`,
		);
	}
	return { ok: true, board: parsed.board, location };
}

/**
 * Read the board a caller asked for by name.
 * @param asked The board name as typed.
 * @returns The board, or why it could not be read.
 * @throws {Error} When the name is not usable or would escape the vault.
 */
function readSemanticBoard(asked: string): SemanticBoardRead {
	return readSemanticBoardAt(locateSemanticBoard(asked));
}

export { type SemanticBoardRead, readSemanticBoardAt, readSemanticBoard };

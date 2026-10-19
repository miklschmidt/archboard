// Which board a name answers to, now that a board can be renamed (ADR 0036).
//
// A board answers to its own name first, always: a file that carries the name
// is that board, and nothing a former name says can take it away. Only when no
// board carries a name is it looked for among the names boards used to have,
// so a drill-down, a saved pane address or a command written before a rename
// keeps opening the board it meant.
//
// That second look reads the vault. It is paid on a miss alone, which is a name
// nobody has used since a rename or a name no board ever had; the ordinary read
// of a board by its own name costs what it always did. Nothing is kept between
// looks: the files are the answer (ADR 0015), and a cache of who used to be
// called what would be a second copy of something the boards already say.
//
// The document is read raw rather than validated: a board that cannot be read
// is reported by whoever opens it, and the question here is only which file
// once went by this name.

import fs from "node:fs";
import { normalizeBoardKey } from "#runtime/store/address.ts";
import { listSemanticBoards } from "#runtime/operations/read/listing.ts";
import { locateSemanticBoard, type SemanticBoardLocation } from "#runtime/store/location.ts";

/**
 * The keys of the names one board file says it used to have.
 * @param file The board file.
 * @returns Their keys; none when it has none or cannot be read.
 */
function formerKeysAt(file: string): string[] {
	let value: unknown;
	try {
		value = JSON.parse(fs.readFileSync(file, "utf-8"));
	} catch {
		return [];
	}
	const names = isRecord(value) ? value["formerNames"] : undefined;
	return Array.isArray(names)
		? names.filter((name) => typeof name === "string").map((name) => normalizeBoardKey(name))
		: [];
}

/**
 * Whether a decoded JSON value is a plain object.
 * @param value The value.
 * @returns True for an object that is neither null nor an array.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The board that used to be called a name, when one did.
 *
 * In key order, so two boards that both claim a name — which no rename makes,
 * but two canvases racing or a hand edit could — always resolve the same way.
 * @param key The name's key.
 * @param root The vault root.
 * @param except A board to leave out: the one being renamed, which may take one
 *   of its own former names back.
 * @returns Where that board is, or null when no board ever had the name.
 */
function boardFormerlyCalled(
	key: string,
	root: string,
	except?: string,
): SemanticBoardLocation | null {
	return (
		listSemanticBoards(root).find(
			(location) => location.key !== except && formerKeysAt(location.file).includes(key),
		) ?? null
	);
}

/**
 * Where the board a name answers to lives: the board that carries it, else the
 * one that used to, else the name's own location, which holds no board yet.
 *
 * Reads a directory, so a writer asks it before taking a board's lease and
 * takes the lease on the key it answers, locating the file again once held.
 * @param asked The board name as typed.
 * @param root The vault root.
 * @returns Where that board is.
 * @throws {Error} When the name is not usable or would escape the vault.
 */
function resolveSemanticBoard(asked: string, root: string): SemanticBoardLocation {
	const own = locateSemanticBoard(asked, root);
	return fs.existsSync(own.file) ? own : (boardFormerlyCalled(own.key, root) ?? own);
}

export { boardFormerlyCalled, resolveSemanticBoard };

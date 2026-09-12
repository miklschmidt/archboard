// Which semantic boards a vault holds.
//
// The walk looks for this module's own suffix and nothing else, so a vault full
// of Excalidraw notes lists as no semantic boards rather than as a pile of
// unreadable ones. Dotfiles are skipped, which is what keeps an in-flight atomic
// write's temp file from being listed as a board, and what keeps archboard's own
// `.archboard` state directory out of somebody's board list.
//
// Directories are walked, because a board name may carry `/` and a board called
// `services/payments` is a file in a directory. Links are not followed: a link
// inside a vault can point anywhere, and a listing that walked one would report
// somebody's home directory as boards.

import fs from "node:fs";
import path from "node:path";
import { requireVaultRoot } from "@/runtime/engine/board";
import {
	locateSemanticBoard,
	SEMANTIC_BOARD_FILE_SUFFIX,
	type SemanticBoardLocation,
} from "@/runtime/semantic-board-store/lib/location";

/** How deep a vault is walked. A board address nests; a vault is not a tree. */
const MAX_DEPTH = 8;

/**
 * Every board file under one directory, as names relative to the vault.
 * @param at The directory to read.
 * @param prefix What to prepend to the names found there.
 * @param depth How far down this already is.
 * @returns The board names.
 */
function namesUnder(at: string, prefix: string, depth: number): string[] {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(at, { withFileTypes: true });
	} catch {
		return [];
	}
	const found: string[] = [];
	for (const entry of entries) {
		found.push(...namesIn(at, prefix, depth, entry));
	}
	return found;
}

/**
 * What one directory entry contributes to the listing: a board's name, the
 * names inside it, or nothing at all.
 * @param at The directory it was found in.
 * @param prefix What to prepend to names found there.
 * @param depth How far down that directory already is.
 * @param entry The entry.
 * @returns The board names it contributes.
 */
function namesIn(at: string, prefix: string, depth: number, entry: fs.Dirent): string[] {
	if (entry.name.startsWith(".") || entry.isSymbolicLink()) {
		return [];
	}
	if (entry.isDirectory()) {
		return depth < MAX_DEPTH
			? namesUnder(path.join(at, entry.name), `${prefix}${entry.name}/`, depth + 1)
			: [];
	}
	return entry.isFile() ? boardName(prefix, entry.name) : [];
}

/**
 * The board name a file contributes, when it is a board file.
 * @param prefix What to prepend to the name.
 * @param file The file's own name.
 * @returns The board name, or nothing.
 */
function boardName(prefix: string, file: string): string[] {
	return file.endsWith(SEMANTIC_BOARD_FILE_SUFFIX)
		? [`${prefix}${file.slice(0, -SEMANTIC_BOARD_FILE_SUFFIX.length)}`]
		: [];
}

/**
 * Every semantic board in the vault, by name.
 * @param root The vault root; defaults to the configured vault.
 * @returns The boards, sorted by key.
 */
function listSemanticBoards(root = requireVaultRoot()): SemanticBoardLocation[] {
	const found: SemanticBoardLocation[] = [];
	for (const name of namesUnder(path.resolve(root), "", 0)) {
		try {
			found.push(locateSemanticBoard(name, root));
		} catch {
			// A file whose name is not a board address is not a board. It is
			// somebody's file that happens to end in our suffix, and the listing
			// says nothing about it rather than refusing to list the vault.
			continue;
		}
	}
	return found.toSorted((left, right) =>
		left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
	);
}

export { listSemanticBoards };

// Every board in the vault, found by walking it, and which of them collide.

import fs from "fs";
import path from "path";
import {
	BOARD_FILE_SUFFIX,
	type BoardIdentity,
	boardKey,
	identityFromFrontmatter,
	identityFromVaultPath,
	requireVaultRoot,
} from "@/runtime/engine/lib/board-address";

interface VaultBoard {
	key: string;
	identity: BoardIdentity;
	file: string;
	// Set when the note's frontmatter names a different board than its path
	// does — a note that was renamed or moved in Obsidian since it was last
	// saved. The path is the address, so that is what `key` reports; the next
	// save rewrites the frontmatter and the disagreement goes away. Surfaced
	// rather than silently reconciled because it usually means a human moved
	// something and may not have meant to.
	declaredKey?: string;
	// The other notes in the vault that address the same board. Two notes whose
	// paths differ only in case, or only in unicode normalisation, are one
	// address (ADR 0010) and only one of them can be reached — but a
	// case-sensitive filesystem will hold both, so a vault authored on Linux
	// before this rule, or edited manually, can arrive in this state. Reported
	// rather than reconciled: which of two notes to keep is not archboard's to decide.
	collidesWith?: string[];
}

// Frontmatter lives at the top of the note; a board's scene JSON can be
// megabytes, and listing a vault must not read all of it.
const FRONTMATTER_PROBE_BYTES = 16 * 1024;

/**
 * The first bytes of a file, enough to hold its frontmatter.
 * @param filePath The file to probe.
 * @param bytes How many bytes to read.
 * @returns The head, decoded as UTF-8.
 */
function readHead(filePath: string, bytes = FRONTMATTER_PROBE_BYTES): string {
	const handle = fs.openSync(filePath, "r");
	try {
		const buffer = Buffer.alloc(bytes);
		const read = fs.readSync(handle, buffer, 0, bytes, 0);
		return buffer.subarray(0, read).toString("utf-8");
	} finally {
		fs.closeSync(handle);
	}
}

/**
 * The identity a note's head declares, or null when the head cannot be read;
 * the path still names the board either way.
 * @param file The note's path.
 * @returns The declared identity, or null.
 */
function declaredIdentity(file: string): BoardIdentity | null {
	try {
		return identityFromFrontmatter(readHead(file));
	} catch {
		return null;
	}
}

/**
 * The vault board one note file is, or null when the file is not a board note.
 * @param file The absolute note path.
 * @param vault The resolved vault root.
 * @returns The board entry, or null.
 */
function vaultBoardAt(file: string, vault: string): VaultBoard | null {
	const fromPath = identityFromVaultPath(file, vault);
	if (!fromPath) return null;
	const declared = declaredIdentity(file);
	// Level cannot be derived from a path, so it always comes from the note.
	const identity: BoardIdentity = {
		...fromPath,
		...(declared?.level ? { level: declared.level } : {}),
	};
	return {
		key: boardKey(identity),
		identity,
		file,
		...(declared && boardKey(declared) !== boardKey(fromPath)
			? { declaredKey: boardKey(declared) }
			: {}),
	};
}

/**
 * Collect every board note below one directory into `found`, skipping
 * dot-directories (.obsidian, .git, .trash) and unreadable directories.
 * @param dir The directory to walk.
 * @param vault The resolved vault root.
 * @param found The list being built.
 */
function collectBoards(dir: string, vault: string, found: VaultBoard[]): void {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collectBoards(full, vault, found);
			continue;
		}
		if (!entry.isFile() || !entry.name.endsWith(BOARD_FILE_SUFFIX)) continue;
		const board = vaultBoardAt(full, vault);
		if (board) found.push(board);
	}
}

/**
 * Mark the notes that share a key. `vaultPathFor` picks one of them and the
 * rest are unreachable, which is a thing to be told rather than to find out.
 * @param found Every board in the vault.
 */
function markCollisions(found: VaultBoard[]): void {
	const byKey = new Map<string, VaultBoard[]>();
	for (const board of found) {
		const same = byKey.get(board.key);
		if (same) same.push(board);
		else byKey.set(board.key, [board]);
	}
	for (const same of byKey.values()) {
		if (same.length < 2) continue;
		for (const board of same) {
			board.collidesWith = same.filter((other) => other !== board).map((other) => other.file);
		}
	}
}

/**
 * Every board in the vault. Walks the whole tree because Obsidian vaults are
 * organised in folders and a board name may contain "/" for exactly that
 * reason.
 * @param root The vault root.
 * @returns The boards found, with collisions marked.
 */
function listBoards(root = requireVaultRoot()): VaultBoard[] {
	const vault = path.resolve(root);
	const found: VaultBoard[] = [];
	if (!fs.existsSync(vault)) return found;
	collectBoards(vault, vault, found);
	found.toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.file < b.file ? -1 : 1));
	markCollisions(found);
	return found;
}

export { type VaultBoard, listBoards };

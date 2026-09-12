// Where a semantic board lives, and how it is told apart from a legacy one.
//
// A vault now holds two kinds of board file. An Excalidraw note keeps its
// `.excalidraw.md` suffix and is read and written by `board-io.ts` exactly as
// before; a semantic board is one JSON document under `.semantic.json`. The
// two never collide, because a suffix is part of a file's name, and that is
// the whole of how ADR 0023's promise to leave existing files untouched is
// kept: nothing in this module can open a note, and nothing that opens notes
// knows this suffix exists.
//
// Addressing is shared rather than reinvented. `vaultPathFor` already knows how
// to find a board case-insensitively, create it case-preservingly, and refuse a
// name that would resolve outside the vault; it takes the suffix as an argument
// so that there is one answer to "where does this board live" rather than one
// per file kind.
//
// Two things are this module's own. The first is that the key is computed
// without touching the filesystem, so a writer can take the board's lease
// before anything looks at a directory: on a case-sensitive filesystem two
// processes creating `Payments` and `payments` would otherwise each resolve an
// absent path of their own, take the same lease in turn, and leave two files
// for one board. The second is that containment is checked against the real
// path rather than the written one, because a lexical check passes straight
// through a symlinked directory and a board is not allowed to be written
// outside the vault whatever the vault's own directories point at.

import fs from "node:fs";
import path from "node:path";
import {
	boardKey,
	makeIdentity,
	normalizeBoardKey,
	requireVaultRoot,
	vaultPathFor,
} from "@/runtime/engine/board";

/** What a semantic board's aggregate is stored under, inside the vault. */
const SEMANTIC_BOARD_FILE_SUFFIX = ".semantic.json";

/** A board's name and the key every writer, lock and broadcast agrees on. */
interface SemanticBoardAddress {
	/** The name as the caller spelled it, validated and trimmed. */
	readonly name: string;
	/** The comparison form of that name (ADR 0010). */
	readonly key: string;
}

/** An address, and the file that holds it. */
interface SemanticBoardLocation extends SemanticBoardAddress {
	/** The absolute path of the aggregate. */
	readonly file: string;
}

/**
 * The address of the board a caller asked for, without reading a directory.
 *
 * A semantic board has no variant in its address: its variants live inside the
 * one document, which is the point of the aggregate. So the address is a name,
 * and asking for `payments@proposed` is asking for a board called that, not for
 * a variant of `payments`.
 * @param asked The board name as typed.
 * @returns The name and the key.
 * @throws {Error} When the name is not usable as a board name.
 */
function semanticBoardAddress(asked: string): SemanticBoardAddress {
	const identity = makeIdentity({ board: asked });
	return {
		name: identity.displayName ?? identity.board,
		key: normalizeBoardKey(boardKey(identity)),
	};
}

/**
 * Whether a path really is inside the vault, following every link on the way.
 *
 * The lexical check in `vaultPathFor` stops a name from spelling its way out
 * with `..`. It cannot stop a directory inside the vault from being a symlink
 * to somewhere else, and a board written through one is a file this program
 * put outside the vault it was given. The deepest existing ancestor is the one
 * that can be resolved: the board's own file usually does not exist yet.
 * @param file The board file.
 * @param root The vault root.
 * @returns True when the file would be written inside the vault.
 */
function insideVault(file: string, root: string): boolean {
	let real: string;
	try {
		real = fs.realpathSync.native(path.resolve(root));
	} catch {
		// No vault on disk yet: there is nothing a link could point through.
		return true;
	}
	let at = path.dirname(file);
	const unresolved: string[] = [];
	for (;;) {
		try {
			const here = fs.realpathSync.native(at);
			const resolved = path.resolve(here, ...unresolved.toReversed());
			return resolved === real || resolved.startsWith(real + path.sep);
		} catch {
			const parent = path.dirname(at);
			if (parent === at) {
				return false;
			}
			unresolved.push(path.basename(at));
			at = parent;
		}
	}
}

/**
 * Where the board a caller asked for lives.
 * @param asked The board name as typed.
 * @param root The vault root; defaults to the configured vault.
 * @returns Where that board is.
 * @throws {Error} When the name is not usable or would escape the vault.
 */
function locateSemanticBoard(asked: string, root = requireVaultRoot()): SemanticBoardLocation {
	const address = semanticBoardAddress(asked);
	const file = vaultPathFor(makeIdentity({ board: asked }), root, SEMANTIC_BOARD_FILE_SUFFIX);
	if (!insideVault(file, root)) {
		throw new Error(
			`Refusing to resolve board "${address.key}": it resolves through a link that leaves the ` +
				`vault at ${root}. A board lives in the vault, and nothing here writes outside it.`,
		);
	}
	return { ...address, file };
}

export {
	SEMANTIC_BOARD_FILE_SUFFIX,
	type SemanticBoardAddress,
	type SemanticBoardLocation,
	semanticBoardAddress,
	locateSemanticBoard,
};

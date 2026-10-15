// What a move checks before it writes anything (ADR 0051), and which boards
// of the source vault it has to rewrite. Every question here reads the two
// vaults as they are on disk, without a lease and never migrating a board:
// `move.ts` asks them inside the leases it holds, and reads each board it
// rewrites again under that board's own lease.

import fs from "node:fs";
import { normalizeBoardKey } from "@/runtime/engine/board";
import type { SemanticBoard } from "@/shared/semantic-board/index";
import { decodeSemanticBoardDocument } from "@/runtime/semantic-board-store/lib/decode";
import { resolveSemanticBoard } from "@/runtime/semantic-board-store/lib/former-names";
import { listSemanticBoards } from "@/runtime/semantic-board-store/lib/listing";
import type { SemanticBoardLocation } from "@/runtime/semantic-board-store/lib/location";
import {
	rewriteDrillDowns,
	type DrillRewrite,
	type MoveIdentities,
} from "@/runtime/semantic-board-store/lib/move-drill-downs";
import { rejected, type SemanticWriteRejection } from "@/runtime/semantic-board-store/lib/write";

/** The two vaults of a move. */
interface MoveVaults {
	/** The root of the vault the board is in. */
	readonly vault: string;
	/** The root of the vault the board moves to. */
	readonly to: string;
}

/**
 * Refuse a target that is the board's own repository. Two checkouts of one
 * identity are two copies of one vault, and git carries boards between them.
 * @param command The move.
 * @param identities The two identities.
 * @param address Where the board is in the source vault.
 * @returns The refusal, or null when the target is another repository.
 */
function sameRepositoryRefusal(
	command: MoveVaults,
	identities: MoveIdentities,
	address: SemanticBoardLocation,
): SemanticWriteRejection | null {
	const same =
		realPath(command.vault) === realPath(command.to) ||
		(identities.source !== undefined && identities.source === identities.target);
	if (!same) return null;
	return rejected(
		address,
		null,
		"MOVE_SAME_REPOSITORY",
		`${command.to} is the board's own vault or another checkout of its repository` +
			(identities.source === undefined ? "" : ` (${identities.source})`) +
			", and git carries boards between two checkouts of one repository. Name a directory of " +
			"another repository, or an untracked vault, with --to. Nothing was written.",
	);
}

/**
 * A directory as its real path, or as given when it cannot be resolved.
 * @param directory The directory.
 * @returns Its real path.
 */
function realPath(directory: string): string {
	try {
		return fs.realpathSync.native(directory);
	} catch {
		return directory;
	}
}

/**
 * The board a file holds, as it is on disk: read without a lease and never
 * migrated or written.
 * @param file The board file.
 * @returns The board, or null when the file is gone or holds no board.
 */
function boardAt(file: string): SemanticBoard | null {
	let text: string;
	try {
		text = fs.readFileSync(file, "utf-8");
	} catch {
		return null;
	}
	const decoded = decodeSemanticBoardDocument(text);
	return decoded.ok ? decoded.board : null;
}

/**
 * The keys a board file answers to: its own, and those of the names its board
 * had before. A file that holds no readable board still holds its own name.
 * @param location Where the file is.
 * @param board The board it holds, or null.
 * @returns The keys.
 */
function keysAnsweredAt(location: SemanticBoardLocation, board: SemanticBoard | null): string[] {
	return [location.key, ...(board?.formerNames ?? []).map((name) => normalizeBoardKey(name))];
}

/**
 * Refuse a target vault that has a board, or a former name, that the moved
 * board's name or one of its former names would answer to. Two boards
 * answering to one name would leave the name opening either. A board with the
 * moved board's id is the earlier half of this same move, and is no obstacle.
 * @param target The target vault.
 * @param board The board that moves.
 * @param address Where it is in the source vault.
 * @returns The refusal, or null when every name is free in the target.
 */
function takenInTarget(
	target: string,
	board: SemanticBoard,
	address: SemanticBoardLocation,
): SemanticWriteRejection | null {
	const keys = new Set([board.name, ...(board.formerNames ?? [])].map(normalizeBoardKey));
	const taken = listSemanticBoards(target).find((location) => {
		const other = boardAt(location.file);
		return other?.id !== board.id && keysAnsweredAt(location, other).some((key) => keys.has(key));
	});
	if (taken === undefined) return null;
	return rejected(
		address,
		board.version,
		"BOARD_EXISTS",
		`The vault ${target} already has the board "${taken.name}", which answers to "${board.name}" ` +
			"or to a name the board had before. A name opens one board, so the move would leave it " +
			"opening either. Rename one of the two boards first. Nothing was written.",
	);
}

/**
 * Whether a board name, read in the source vault, opens the moved board.
 * Asked once per name.
 * @param vault The source vault.
 * @param key The moved board's key.
 * @returns The question.
 */
function opensBoard(vault: string, key: string): (name: string) => boolean {
	const answers = new Map<string, boolean>();
	return (name) => {
		let opens = answers.get(name);
		if (opens === undefined) {
			try {
				opens = resolveSemanticBoard(name, vault).key === key;
			} catch {
				opens = false;
			}
			answers.set(name, opens);
		}
		return opens;
	};
}

/**
 * The boards of the source vault, other than the moved one, that drill down
 * into it, as they are on disk. Read without a lease and never migrated: each
 * is read again under its own lease before it is rewritten.
 * @param vault The source vault.
 * @param key The moved board's key.
 * @param rewrite What each of their drill-downs becomes.
 * @returns Where each one is.
 */
function boardsDrillingIn(
	vault: string,
	key: string,
	rewrite: DrillRewrite,
): SemanticBoardLocation[] {
	return listSemanticBoards(vault).filter((location) => {
		const board = location.key === key ? null : boardAt(location.file);
		return board !== null && rewriteDrillDowns(board, rewrite).rewritten.length > 0;
	});
}

/**
 * Refuse a move that needs a drill-down into an untracked vault: it has no
 * identity, so no board in another vault can name it (ADR 0049).
 * @param command The two vaults.
 * @param identities Their identities.
 * @param address Where the board is in the source vault.
 * @param needs How many links need each vault's identity.
 * @param needs.target Links in the source vault into the moved board.
 * @param needs.source Links on the moved board into the source vault.
 * @param version The board's version.
 * @returns The refusal, or null when every identity needed is there.
 */
function untrackedRefusal(
	command: MoveVaults,
	identities: MoveIdentities,
	address: SemanticBoardLocation,
	needs: { readonly target: number; readonly source: number },
	version: number,
): SemanticWriteRejection | null {
	const missing =
		needs.target > 0 && identities.target === undefined
			? `${needs.target} drill-down(s) of ${command.vault} open the board, and ${command.to}`
			: needs.source > 0 && identities.source === undefined
				? `the board has ${needs.source} drill-down(s) into ${command.vault}, which`
				: null;
	if (missing === null) return null;
	return rejected(
		address,
		version,
		"MOVE_NEEDS_IDENTITY",
		`${missing} is an untracked vault. A drill-down into another vault names its repository, and an ` +
			"untracked vault has none. Remove those drill-downs first, or move the board into a " +
			"repository. Nothing was written.",
	);
}

export {
	type MoveVaults,
	boardAt,
	boardsDrillingIn,
	opensBoard,
	sameRepositoryRefusal,
	takenInTarget,
	untrackedRefusal,
};

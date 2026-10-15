// What a move would do, read before anybody asks for it (ADR 0051).
//
// Before a person moves a board, the browser shows the drill-downs the move
// rewrites. The preview runs the move's own checks and rewrites against the
// two vaults as they are on disk, and holds and writes nothing: a writer is
// never kept waiting for a question. So it can be out of date by the time the
// move runs. The move checks everything again under its leases, and the
// version the preview read is the version the move states, so a board written
// since is refused rather than moved as nobody saw it.

import { vaultIdentity } from "@/runtime/code-target/index";
import type { MoveEnd, MovedDrillDown, SemanticBoard } from "@/shared/semantic-board/index";
import { resolveSemanticBoard } from "@/runtime/semantic-board-store/lib/former-names";
import {
	locateSemanticBoard,
	type SemanticBoardLocation,
} from "@/runtime/semantic-board-store/lib/location";
import {
	checkedMove,
	type CheckedMove,
	type MoveCheck,
} from "@/runtime/semantic-board-store/lib/move";
import {
	boardAt,
	sameRepositoryRefusal,
	type MoveVaults,
} from "@/runtime/semantic-board-store/lib/move-checks";
import { rewriteDrillDowns } from "@/runtime/semantic-board-store/lib/move-drill-downs";
import { rejected, type SemanticWriteRejection } from "@/runtime/semantic-board-store/lib/write";

/** Which board to move, and where. */
type SemanticMovePreviewCommand = MoveVaults & { readonly board: string };

/** A move that passes every check now: the board, both ends and every drill-down it rewrites. */
interface SemanticMovePreview {
	readonly outcome: "ready";
	/** The board as it is in the source vault; its version is the one a move states. */
	readonly board: SemanticBoard;
	readonly from: MoveEnd;
	readonly to: MoveEnd;
	/** Every drill-down the move would rewrite, each as it would read. */
	readonly rewritten: readonly MovedDrillDown[];
}

/**
 * Every drill-down a checked move would rewrite: the moved board's own, in the
 * target vault, then each other board's, in its own vault.
 * @param to The target vault.
 * @param checked The checked move.
 * @returns The drill-downs, each as it would read.
 */
function rewritesOf(to: string, checked: CheckedMove): MovedDrillDown[] {
	const own = checked.own.rewritten.map((one) => ({ ...one, vault: to }));
	const others = checked.drilling.flatMap(({ vault, location, rewrite }) => {
		const board = boardAt(location.file);
		if (board === null) return [];
		return rewriteDrillDowns(board, rewrite).rewritten.map((one) => ({ ...one, vault }));
	});
	return [...own, ...others];
}

/**
 * The move's own checks, run on the two vaults as they are on disk.
 * @param check The two vaults, and their identities.
 * @param location Where the board is in the source vault.
 * @returns What would move, or why nothing would.
 */
function checkedNow(
	check: Pick<MoveCheck, "identities"> & { readonly command: MoveVaults },
	location: SemanticBoardLocation,
): CheckedMove | SemanticWriteRejection {
	try {
		return checkedMove(
			{ ...check, command: { ...check.command, expectedVersion: undefined } },
			location,
		);
	} catch (error) {
		// A board that only its own write can bring up to date is read by the move, not here.
		const why = error instanceof Error ? error.message : String(error);
		return rejected(
			location,
			null,
			"BOARD_UNREADABLE",
			`${location.name} cannot be read before the move: ${why}`,
		);
	}
}

/**
 * What moving one board into another repository's vault would do now, or why
 * the move would be refused.
 * @param command Which board, and where to.
 * @returns The move as it would be, or its refusal.
 * @throws {Error} When the board name is not usable or would escape the vault.
 */
function previewSemanticMove(
	command: SemanticMovePreviewCommand,
): SemanticMovePreview | SemanticWriteRejection {
	const address = resolveSemanticBoard(command.board, command.vault);
	const identities = { source: vaultIdentity(command.vault), target: vaultIdentity(command.to) };
	const same = sameRepositoryRefusal(command, identities, address);
	if (same !== null) return same;
	const checked = checkedNow(
		{ command, identities },
		locateSemanticBoard(address.name, command.vault),
	);
	if ("outcome" in checked) return checked;
	return {
		outcome: "ready",
		board: checked.source,
		from: { vault: command.vault, repository: identities.source ?? null },
		to: { vault: command.to, repository: identities.target ?? null },
		rewritten: rewritesOf(command.to, checked),
	};
}

export { previewSemanticMove, type SemanticMovePreview, type SemanticMovePreviewCommand };

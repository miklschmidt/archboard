// Moving a board to another repository's vault (ADR 0051).
//
// The whole note moves: every variant, every former name and every subject id
// stay as they were, so the comparison and the history stay true. A move is not
// a rename. The board keeps its name, and its former names keep answering in
// the target vault (ADR 0036).
//
// One thing somebody asked for is one write (TASK-068), and a move cannot be
// one, because two vaults are two files, often in two repositories. So it
// writes in a fixed order, under the lease of the board in the source vault and
// the lease of its name in the target vault:
//
//   1. the target note, which is the source board with its own drill-downs into
//      the source vault rewritten. Its version advances once, as any write's;
//   2. every other board of the source vault that drills down into the moved
//      board, one board write at a time under that board's own lease;
//   3. the source note, deleted last.
//
// A move that stops part way leaves the board in both vaults, never in
// neither. Run again, the same move finishes it: the target's copy carries the
// board's id, which is how the second run tells the first run's half of the
// move from another board of the same name, and a drill-down the first run
// rewrote no longer opens a board of the source vault.
//
// Everything between the leases is one synchronous pass, as in `write.ts`.
// A board that drills down into the moved board is taken without waiting
// (`withBoardLockIfFreeSync`): a pass cannot wait, and when somebody else holds
// one, the move stops before it deletes the source note and says to run it again.

import { unlinkDurably } from "@/runtime/engine/atomic-write";
import {
	BoardHeldError,
	claimWriterId,
	holdBoard,
	releaseClaim,
	releaseHold,
	withBoardLockIfFreeSync,
} from "@/runtime/engine/board-lock";
import { vaultIdentity } from "@/runtime/code-target/index";
import type { MoveEnd, MovedDrillDown, SemanticBoard } from "@/shared/semantic-board/index";
import { acceptedBoard } from "@/runtime/semantic-board-store/lib/accepted";
import { readSemanticBoardConfiguration } from "@/runtime/semantic-board-store/lib/configuration";
import { resolveSemanticBoard } from "@/runtime/semantic-board-store/lib/former-names";
import {
	locateSemanticBoard,
	type SemanticBoardLocation,
} from "@/runtime/semantic-board-store/lib/location";
import {
	boardsDrillingIn,
	opensBoard,
	sameRepositoryRefusal,
	takenInTarget,
	untrackedRefusal,
} from "@/runtime/semantic-board-store/lib/move-checks";
import {
	inboundRewrite,
	outboundRewrite,
	rewriteDrillDowns,
	type DrillRewrite,
	type MoveIdentities,
} from "@/runtime/semantic-board-store/lib/move-drill-downs";
import type { SemanticRefusalCode } from "@/runtime/semantic-board-store/lib/outcome";
import { writeBoardFile } from "@/runtime/semantic-board-store/lib/relocation";
import {
	admit,
	boardBefore,
	leaseRequest,
	rejected,
	underBoardLease,
	type BoardLeaseAsk,
	type SemanticWriteCommand,
	type SemanticWriteRejection,
} from "@/runtime/semantic-board-store/lib/write";

/** One board to move, where to, who is moving it, and the version they read when they state one. */
type SemanticMoveCommand = BoardLeaseAsk &
	Pick<SemanticWriteCommand, "expectedVersion"> & {
		/** The root of the vault the board moves to. */
		readonly to: string;
	};

/** One board the move wrote, at the version it wrote. */
interface MoveWrite {
	readonly vault: string;
	readonly location: SemanticBoardLocation;
	readonly version: number;
}

/** What a move did, whether it finished or stopped part way. */
interface MoveProgress {
	/** The board as it was written to the target vault. */
	readonly board: SemanticBoard;
	readonly from: MoveEnd;
	readonly to: MoveEnd;
	/** The version the board was at in the source vault. */
	readonly previousVersion: number;
	/** Every board written, in order: the target note first, then each rewritten board. */
	readonly written: readonly MoveWrite[];
	/** Every drill-down rewritten, on the moved board and on the boards of the source vault. */
	readonly rewritten: readonly MovedDrillDown[];
}

/** A move that finished, or that wrote the target note and stopped before the source note went. */
type MovePass =
	| ({ readonly outcome: "moved" } & MoveProgress)
	| ({
			readonly outcome: "stopped";
			readonly code: Extract<SemanticRefusalCode, "MOVE_STOPPED">;
			readonly problem: string;
	  } & MoveProgress);

/** What a move did, and the identity it held the board under, or why it did nothing. */
type SemanticMoveResult = (MovePass & { readonly heldAs: string }) | SemanticWriteRejection;

/** What the pass knows before it holds anything. */
interface MovePlan {
	readonly command: SemanticMoveCommand;
	readonly identities: MoveIdentities;
	readonly at: string;
}

/**
 * Write one board under a lease this pass holds, checked as every write is.
 * @param vault The vault it is in.
 * @param location Where it is written.
 * @param before The board it replaces: the source board, for the target note.
 * @param candidate The board as it should now be.
 * @param at The timestamp to stamp it with.
 * @returns The board as written, or why it may not be.
 */
function writeChecked(
	vault: string,
	location: SemanticBoardLocation,
	before: SemanticBoard,
	candidate: SemanticBoard,
	at: string,
): { readonly board: SemanticBoard } | { readonly problem: string } {
	const configured = readSemanticBoardConfiguration(vault);
	const accepted = acceptedBoard(
		before,
		candidate,
		at,
		configured.ok ? configured.configuration : null,
	);
	if ("problem" in accepted) return accepted;
	writeBoardFile({ location, from: null }, accepted.board);
	return accepted;
}

/**
 * Rewrite one board of the source vault under its own lease, taken without
 * waiting. It is read again under that lease, so a link somebody changed since
 * the move looked is rewritten as it now stands.
 * @param plan The move.
 * @param location Where the board is.
 * @param rewrite What each of its drill-downs becomes.
 * @returns What was written, or why the board could not be rewritten now.
 */
function rewriteOne(
	plan: MovePlan,
	location: SemanticBoardLocation,
	rewrite: DrillRewrite,
):
	| { readonly write: MoveWrite | null; readonly rewritten: MovedDrillDown[] }
	| { problem: string } {
	const { vault, writer } = plan.command;
	const admission = admit(vault, location.key, writer);
	if (!admission.ok) return { problem: admission.problem };
	const held = withBoardLockIfFreeSync(
		leaseRequest(location.key, { vault, board: location.key, writer }, admission),
		() => {
			const before = boardBefore(vault, location, undefined);
			if (!("ok" in before)) return { problem: before.problem };
			if (before.board === null) return { write: null, rewritten: [] };
			const next = rewriteDrillDowns(before.board, rewrite);
			if (next.rewritten.length === 0) return { write: null, rewritten: [] };
			const written = writeChecked(vault, location, before.board, next.board, plan.at);
			if ("problem" in written) return written;
			return {
				write: { vault, location, version: written.board.version },
				rewritten: next.rewritten.map((one) => ({ ...one, vault })),
			};
		},
	);
	return held.acquired
		? held.value
		: { problem: `somebody else is writing "${location.name}" at this moment` };
}

/** A move that passed every check: what moves, and every link it rewrites. */
interface CheckedMove {
	/** The board as it is in the source vault. */
	readonly source: SemanticBoard;
	/** The board as it is written to the target, with its own drill-downs rewritten. */
	readonly own: ReturnType<typeof rewriteDrillDowns>;
	/** The other boards of the source vault that drill down into it. */
	readonly drilling: readonly SemanticBoardLocation[];
	/** What their drill-downs become. */
	readonly inbound: DrillRewrite;
}

/**
 * Everything the move checks before it writes anything: the board is there at
 * the version stated, its names are free in the target, and every link it
 * rewrites can name the identity it needs.
 * @param plan The move.
 * @param location Where the board is in the source vault.
 * @returns What moves, or why nothing does.
 */
function checkedMove(
	plan: MovePlan,
	location: SemanticBoardLocation,
): CheckedMove | SemanticWriteRejection {
	const { command, identities } = plan;
	const before = boardBefore(command.vault, location, command.expectedVersion);
	if (!("ok" in before)) return before;
	const source = before.board;
	if (source === null) {
		return rejected(
			location,
			null,
			"BOARD_MISSING",
			`There is no board "${location.name}" in ${command.vault} to move. Nothing was written.`,
		);
	}
	const opensMoved = opensBoard(command.vault, location.key);
	const inbound = inboundRewrite(identities, opensMoved);
	const drilling = boardsDrillingIn(command.vault, location.key, inbound);
	const own = rewriteDrillDowns(source, outboundRewrite(identities, opensMoved));
	const needs = { target: drilling.length, source: own.rewritten.length };
	return (
		takenInTarget(command.to, source, location) ??
		untrackedRefusal(command, identities, location, needs, source.version) ?? {
			source,
			own,
			drilling,
			inbound,
		}
	);
}

/** What a move has done so far, added to as it rewrites each board. */
type Progress = MoveProgress & {
	readonly written: MoveWrite[];
	readonly rewritten: MovedDrillDown[];
};

/**
 * Write the target note: the source board with its own drill-downs rewritten,
 * checked against the target vault's configuration as any write is.
 * @param plan The move.
 * @param location Where the board is in the source vault.
 * @param checked What moves.
 * @returns What the move has done, or why the target refused the board.
 */
function writeTarget(
	plan: MovePlan,
	location: SemanticBoardLocation,
	checked: CheckedMove,
): Progress | SemanticWriteRejection {
	const { command, identities } = plan;
	const { source, own } = checked;
	const target = locateSemanticBoard(source.name, command.to);
	const moved = writeChecked(command.to, target, source, own.board, plan.at);
	if ("problem" in moved) {
		return rejected(location, source.version, "INVALID_CONTENT", moved.problem);
	}
	return {
		board: moved.board,
		from: { vault: command.vault, repository: identities.source ?? null },
		to: { vault: command.to, repository: identities.target ?? null },
		previousVersion: source.version,
		written: [{ vault: command.to, location: target, version: moved.board.version }],
		rewritten: own.rewritten.map((one) => ({ ...one, vault: command.to })),
	};
}

/**
 * Rewrite every board of the source vault that drills down into the moved
 * board, one board write at a time.
 * @param plan The move.
 * @param checked What moves, and the boards that drill down into it.
 * @param progress What the move has done, added to as each board is rewritten.
 * @returns The stopped move when a board could not be rewritten, else null.
 */
function rewriteDrilling(
	plan: MovePlan,
	checked: CheckedMove,
	progress: Progress,
): MovePass | null {
	for (const other of checked.drilling) {
		const done = rewriteOne(plan, other, checked.inbound);
		if ("problem" in done) return stopped(plan, progress, other, done.problem);
		if (done.write !== null) progress.written.push(done.write);
		progress.rewritten.push(...done.rewritten);
	}
	return null;
}

/**
 * Move the board, inside both leases: check, write the target note, rewrite
 * the drill-downs into it, and delete the source note.
 * @param plan The move.
 * @param location Where the board is in the source vault.
 * @returns What the move did, or why it did nothing.
 */
function moveUnderLeases(
	plan: MovePlan,
	location: SemanticBoardLocation,
): MovePass | SemanticWriteRejection {
	const checked = checkedMove(plan, location);
	if ("outcome" in checked) return checked;
	const progress = writeTarget(plan, location, checked);
	if ("outcome" in progress) return progress;
	const halted = rewriteDrilling(plan, checked, progress);
	if (halted !== null) return halted;
	unlinkDurably(location.file);
	return { outcome: "moved", ...progress };
}

/**
 * A move that wrote the target note and could not rewrite one board: the
 * source note stays, so the board is in both vaults until the move runs again.
 * @param plan The move.
 * @param progress What the move did so far.
 * @param board The board it could not rewrite.
 * @param why Why not.
 * @returns The stopped move.
 */
function stopped(
	plan: MovePlan,
	progress: MoveProgress,
	board: SemanticBoardLocation,
	why: string,
): MovePass {
	return {
		outcome: "stopped",
		code: "MOVE_STOPPED",
		problem:
			`The move stopped part way: the board is written in ${plan.command.to} and is still in ` +
			`${plan.command.vault}, because its drill-down on "${board.name}" could not be rewritten: ` +
			`${why}. ${progress.rewritten.length} drill-down(s) were rewritten. Run the same move ` +
			"again to finish it.",
		...progress,
	};
}

/**
 * Hold the board's name in the target vault, as this writer, so nobody
 * creates a board by that name there while the move writes it.
 * @param command The move.
 * @param address Where the board is in the source vault.
 * @returns How to give the name back, or why it cannot be held.
 */
async function holdTargetName(
	command: SemanticMoveCommand,
	address: SemanticBoardLocation,
): Promise<{ readonly release: () => void } | SemanticWriteRejection> {
	const admission = admit(command.to, address.key, command.writer);
	if (!admission.ok) {
		return rejected(address, null, "CLAIM_REVOKED", admission.problem);
	}
	try {
		const hold = await holdBoard(
			leaseRequest(address.key, { ...command, vault: command.to }, admission),
		);
		return {
			/** Give the name back, when this move took it rather than joining a hold of its own. */
			release: () => {
				if (hold.created) releaseHold(command.to, address.key, admission.id);
			},
		};
	} catch (error) {
		if (error instanceof BoardHeldError) {
			return rejected(
				address,
				null,
				"BOARD_HELD",
				`In ${command.to}: ${error.message} Try the move again once they are done. Nothing was written.`,
			);
		}
		throw error;
	}
}

/**
 * Move one board, every variant of it, into another repository's vault.
 * @param command Which board, where to, and who is moving it.
 * @returns What the move did, or why it did nothing.
 * @throws {Error} When the board name is not usable or would escape the vault.
 */
async function moveSemanticBoard(command: SemanticMoveCommand): Promise<SemanticMoveResult> {
	const address = resolveSemanticBoard(command.board, command.vault);
	const identities = { source: vaultIdentity(command.vault), target: vaultIdentity(command.to) };
	const same = sameRepositoryRefusal(command, identities, address);
	if (same !== null) return same;
	const name = await holdTargetName(command, address);
	if ("outcome" in name) return name;
	const plan: MovePlan = { command, identities, at: new Date().toISOString() };
	let result: SemanticMoveResult;
	try {
		result = await underBoardLease(command, (location) =>
			location.key === address.key
				? moveUnderLeases(plan, location)
				: rejected(
						location,
						null,
						"BOARD_VERSION_CONFLICT",
						`"${command.board}" was renamed as the move began. Run the move again. Nothing was written.`,
					),
		);
	} finally {
		name.release();
	}
	if (result.outcome === "moved" && claimWriterId(command.vault, address.key) === result.heldAs) {
		releaseClaim(command.vault, address.key);
	}
	return result;
}

export { type MoveWrite, type SemanticMoveCommand, type SemanticMoveResult, moveSemanticBoard };

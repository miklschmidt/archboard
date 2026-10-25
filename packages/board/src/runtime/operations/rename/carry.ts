// Renaming a board carries what this process keyed by its old name (TASK-281,
// ADR 0036). The file, the lease, the claim and what an agent said it was doing
// are all facts about the board, so they follow it to its new name: the lines
// an agent wrote about the board stay with it, and this server's claim on it is
// carried, so a campaign that renamed its board is still one campaign.

import { errorMessage } from "@archboard/diagnostics/errno";
import type { BoardRenameInput } from "#shared/protocol/resolution-input.ts";
import type { VaultDiagnostic } from "#shared/schemas/semantic-policy.ts";
import { forgetDoing, recentDoing, recordDoing } from "#runtime/store/doing.ts";
import { claimBoard, claimOn, releaseClaim } from "#runtime/store/lock/lock.ts";
import { renameTransition } from "#runtime/operations/rename/rename.ts";
import {
	writeSemanticBoard,
	type SemanticWriteCommand,
	type SemanticWriteResult,
} from "#runtime/operations/write/write.ts";

/**
 * Rename a board, or one variant of it, and carry what this process keyed by
 * the board's old name to its new one.
 * @param command The write, with the rename asked for in place of a transition.
 * @returns What the write did. A claim that could not follow the board adds a
 *   `CLAIM_NOT_CARRIED` warning.
 */
async function renameSemanticBoard(
	command: Omit<SemanticWriteCommand, "transition"> & { readonly rename: BoardRenameInput },
): Promise<SemanticWriteResult> {
	const { rename, ...write } = command;
	const result = await writeSemanticBoard({ ...write, transition: renameTransition(rename) });
	if (result.outcome !== "applied" || result.renamedFrom === undefined) {
		return result;
	}
	carryDoing(command.vault, result.renamedFrom.key, result.location.key);
	const lost = await carryClaim(command.vault, result.renamedFrom.key, result.location.name);
	return lost === null ? result : { ...result, warnings: [...result.warnings, lost] };
}

/**
 * Keep what agents said they were doing to the board with the board.
 * @param vault The vault the board lives in.
 * @param from The key it was said under.
 * @param to The key the board has now.
 */
function carryDoing(vault: string, from: string, to: string): void {
	for (const entry of recentDoing(vault, from)) {
		recordDoing(vault, to, entry);
	}
	forgetDoing({ vault, board: from });
}

/**
 * Carry this server's claim on the board to its new name, for what is left of
 * the campaign and for the reason it was taken.
 * @param vault The vault the board lives in.
 * @param from The key the claim was taken on.
 * @param to The board's new name.
 * @returns A warning when the claim could not follow the board, else null.
 */
async function carryClaim(
	vault: string,
	from: string,
	to: string,
): Promise<VaultDiagnostic | null> {
	const claim = claimOn(vault, from);
	if (claim === null) {
		return null;
	}
	releaseClaim(vault, from);
	try {
		await claimBoard({
			vault,
			board: to,
			reason: claim.holder.reason ?? "",
			forMs: Date.parse(claim.expires) - Date.now(),
			waitMs: 0,
		});
		return null;
	} catch (error) {
		return {
			severity: "warning",
			code: "CLAIM_NOT_CARRIED",
			file: "",
			board: to,
			message:
				`The board was renamed, and your claim on it ended with its old name: ` +
				`${errorMessage(error)}. Claim "${to}" again to go on with the campaign.`,
		};
	}
}

export { renameSemanticBoard };

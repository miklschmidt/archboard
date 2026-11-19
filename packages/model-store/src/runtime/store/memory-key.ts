// The key process memory files a model under. Two vaults can each hold a model
// of one name (ADR 0049), so a claim, an announcement or a fingerprint is never
// keyed by the name alone.

import { normalizePaneKey } from "@archboard/model-contract";

/**
 * The key process memory files a board under: the vault it lives in and its
 * normalised name together.
 * @param vault The vault the board lives in, as the call named it.
 * @param board A board key or name as typed.
 * @returns One string per board of one vault.
 */
function modelMemoryKey(vault: string, board: string): string {
	return `${vault}\n${normalizePaneKey(board)}`;
}

export { modelMemoryKey };

// Reading the variant an address opens: the board read by name, then the
// variant the address states, or the one a bare name opens.

import {
	addressedVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "#shared/schemas/board-document.ts";
import type { VaultDiagnostic } from "#shared/schemas/semantic-policy.ts";
import { isCurrentVariant } from "#runtime/store/address.ts";
import type { SemanticBoardLocation } from "#runtime/store/location.ts";
import { readSemanticBoard } from "#runtime/operations/read/read.ts";

/** The variant an address opens, or why it opens none. */
type BoardVariantRead =
	| {
			readonly ok: true;
			readonly board: SemanticBoard;
			readonly variant: SemanticVariant;
			readonly warnings: VaultDiagnostic[];
			readonly location: SemanticBoardLocation;
	  }
	| {
			readonly ok: false;
			readonly code: "BOARD_MISSING" | "BOARD_UNREADABLE";
			readonly problem: string;
			readonly location: SemanticBoardLocation;
	  }
	| {
			readonly ok: false;
			/**
			 * `VARIANT_MISSING` when the address names a variant the board does not
			 * have, `VARIANT_UNCHOSEN` when a bare name opens no single variant.
			 */
			readonly code: "VARIANT_MISSING" | "VARIANT_UNCHOSEN";
			/** Why, without a full stop. */
			readonly problem: string;
			readonly board: SemanticBoard;
			readonly location: SemanticBoardLocation;
	  };

/**
 * The variant an address states, or undefined when it states none: a bare
 * name, an empty variant and `current` all open what the bare name opens.
 * @param variant The variant as the address spells it.
 * @returns The variant, or undefined.
 */
function statedVariantOf(variant: string | undefined): string | undefined {
	const asked = variant?.trim() ?? "";
	return asked === "" || isCurrentVariant(asked) ? undefined : asked;
}

/**
 * Read a board by name and open the variant an address states.
 * @param vault The vault root to read from.
 * @param board The board name as typed, or a former name.
 * @param variant The variant as an address states it: an id, a name, `current`, or undefined for a bare name.
 * @returns The board and the variant, or why the address opens nothing.
 * @throws {Error} When the name is not usable or would escape the vault.
 */
function readBoardVariant(vault: string, board: string, variant?: string): BoardVariantRead {
	const read = readSemanticBoard(vault, board);
	if (!read.ok) {
		return read;
	}
	const stated = statedVariantOf(variant);
	const opened = addressedVariant(read.board, stated);
	if (!opened.ok) {
		return {
			ok: false,
			code: stated === undefined ? "VARIANT_UNCHOSEN" : "VARIANT_MISSING",
			problem: opened.problem,
			board: read.board,
			location: read.location,
		};
	}
	return { ...read, variant: opened.variant };
}

export { type BoardVariantRead, readBoardVariant };

// Boards: named, persisted architectures, one file per board in the vault.
//
// A board is addressed by its identity — a name plus a variant — and the vault
// path is derived from that identity rather than stored
// (`lib/board-address.ts`). Which file kind a board is stored in belongs to
// whoever stores it: `src/runtime/semantic-board-store` owns the one this
// product writes, and asks here only for the addressing every board shares.

export {
	type BoardIdentity,
	CURRENT_VARIANT,
	VAULT_STATE_DIR,
	LEVELS,
	normalizeBoardKey,
	normalizeBoardName,
	validateBoardName,
	validateVariant,
	validateLevel,
	makeIdentity,
	boardDisplayName,
	boardKey,
	paneBoardAddress,
	parseBoardKey,
	requireVaultRoot,
	vaultPathFor,
} from "@/runtime/engine/lib/board-address";

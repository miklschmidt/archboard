// What an agent may say to create, edit, adopt, rename, shelve, move or delete a board.
export {
	BoardDiscardAnswerSchema,
	BoardOpenedByAnswerSchema,
} from "#shared/protocol/board-discard.ts";
export {
	BoardBranchInputSchema,
	BoardCreateInputSchema,
	ConfirmableRefusalSchema,
	VariantEditInputSchema,
} from "#shared/protocol/board-input.ts";
export type { SemanticEdgeInput, SemanticNodeInput } from "#shared/protocol/board-input.ts";
export {
	BoardMoveAnswerSchema,
	BoardMoveInputSchema,
	MovedDrillDownSchema,
	MoveEndSchema,
} from "#shared/protocol/board-move.ts";
export type { BoardMovePreview } from "#shared/protocol/board-move.ts";
export {
	BoardAdoptInputSchema,
	BoardRenameInputSchema,
	BoardShelveInputSchema,
	ResolutionInputSchema,
} from "#shared/protocol/resolution-input.ts";
export {
	HistoricalCorrectionInputSchema,
	HistoricalRevisionSchema,
} from "#shared/protocol/historical-correction.ts";

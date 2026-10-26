// Writing a board: the one write, the transitions it applies, a discarded or accepted board, a rename, tracking an embed and the propagation to drill-downs.
export { renameTransition } from "#runtime/operations/rename/rename.ts";
export type { DescendantOutcome } from "#runtime/operations/variant/propagate.ts";
export { acceptedBoard } from "#runtime/operations/write/accepted.ts";
export { discardSemanticBoard } from "#runtime/operations/write/discard.ts";
export {
	adoptVariantTransition,
	branchVariantTransition,
	createBoardTransition,
	editVariantTransition,
	settleVariantTransition,
	shelveVariantTransition,
} from "#runtime/operations/write/transitions.ts";
export type { SemanticTransition } from "#runtime/operations/write/transitions.ts";
export { writeSemanticBoard } from "#runtime/operations/write/write.ts";
export type { SemanticWriteResult } from "#runtime/operations/write/write.ts";
export { correctHistoricalTransition } from "#runtime/operations/write/correction.ts";
export { trackEmbedTransition } from "#runtime/operations/embeds/track.ts";

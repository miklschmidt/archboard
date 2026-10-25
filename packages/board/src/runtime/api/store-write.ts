// Writing a board: the one write, the transitions it applies, a discarded or accepted board, a rename and the propagation to drill-downs.
export { renameSemanticBoard } from "#runtime/operations/rename/carry.ts";
export { acceptedBoard } from "#runtime/operations/write/accepted.ts";
export { discardSemanticBoard } from "#runtime/operations/write/discard.ts";
export { adoptVariantTransition, branchVariantTransition, createBoardTransition, editVariantTransition, settleVariantTransition, shelveVariantTransition } from "#runtime/operations/write/transitions.ts";
export { writeSemanticBoard } from "#runtime/operations/write/write.ts";
export { correctHistoricalTransition } from "#runtime/operations/write/correction.ts";

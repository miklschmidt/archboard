// The one owner of a semantic board on disk (ADR 0023).
//
// Reads go through `readSemanticBoard`, which answers a board's former name
// with the board (ADR 0036). Authored changes go through
// `writeSemanticBoard`, which owns the claim, expected-version check, version
// advance and atomic fsync write. `discardSemanticBoard` removes a whole board
// under the same lease and admission. A read of an older contract runs a registered
// schema migration under the same board lease and persists it before answering.
// Historical bytes use `decodeSemanticBoardDocument`: the same checks and
// migrations in memory, without vault access or a migration write.

export {
	type DecodedSemanticBoard,
	decodeSemanticBoardDocument,
} from "@/runtime/semantic-board-store/lib/decode";

export {
	SEMANTIC_BOARD_FILE_SUFFIX,
	type SemanticBoardAddress,
	type SemanticBoardLocation,
	semanticBoardAddress,
	locateSemanticBoard,
} from "@/runtime/semantic-board-store/lib/location";
export { listSemanticBoards } from "@/runtime/semantic-board-store/lib/listing";
export {
	SEMANTIC_BOARD_CONFIG_PATH,
	SemanticBoardConfigurationSchema,
	type SemanticBoardConfiguration,
	type SemanticBoardConfigurationRead,
	semanticBoardConfigurationPath,
	readSemanticBoardConfiguration,
	initializeSemanticBoardConfiguration,
} from "@/runtime/semantic-board-store/lib/configuration";
export {
	type SemanticBoardRead,
	readSemanticBoard,
	readSemanticBoardAt,
} from "@/runtime/semantic-board-store/lib/read";
export {
	type SemanticRefusalCode,
	type SemanticRefusal,
} from "@/runtime/semantic-board-store/lib/outcome";
export {
	FIRST_VARIANT_NAME,
	type SemanticTransition,
	type TransitionResult,
	adoptVariantTransition,
	branchVariantTransition,
	createBoardTransition,
	editVariantTransition,
	settleVariantTransition,
	shelveVariantTransition,
} from "@/runtime/semantic-board-store/lib/transitions";
export { renameTransition } from "@/runtime/semantic-board-store/lib/rename";
export { resolveSemanticBoard } from "@/runtime/semantic-board-store/lib/former-names";
export {
	type SemanticWriter,
	type SemanticWriteCommand,
	type SemanticWriteResult,
	writeSemanticBoard,
} from "@/runtime/semantic-board-store/lib/write";
export {
	type SemanticDiscardCommand,
	type SemanticDiscardResult,
	discardSemanticBoard,
} from "@/runtime/semantic-board-store/lib/discard";
export {
	unsettledAncestor,
	type DescendantOutcome,
	type Propagation,
} from "@/runtime/semantic-board-store/lib/propagate";

export { checkSemanticVault } from "@/runtime/semantic-board-store/lib/diagnostics";
export { edgeSubjects, nodeSubject } from "@/runtime/semantic-board-store/lib/subject";

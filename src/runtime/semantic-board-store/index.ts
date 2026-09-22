// The one owner of a semantic board on disk (ADR 0023).
//
// Reads go through `readSemanticBoard`. Authored changes go through
// `writeSemanticBoard`, which owns the claim, expected-version check, version
// advance and atomic fsync write. A read of an older contract runs a registered
// schema migration under the same board lease and persists it before answering.

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
export {
	type SemanticWriter,
	type SemanticWriteCommand,
	type SemanticWriteResult,
	writeSemanticBoard,
} from "@/runtime/semantic-board-store/lib/write";
export {
	unsettledAncestor,
	type DescendantOutcome,
	type Propagation,
} from "@/runtime/semantic-board-store/lib/propagate";

export { checkSemanticVault } from "@/runtime/semantic-board-store/lib/diagnostics";

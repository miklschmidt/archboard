// The board document: its schema and version, the variant address and lifecycle, how a variant is found, the draft references, and the one parse of an untrusted value.
export { parseSemanticBoard } from "#shared/rules/coherence/parse-board.ts";
export {
	addressedVariant,
	asksForDesignation,
	currentVariant,
	findVariant,
	nothingBuilt,
	resolveVariant,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardLevelSchema,
	SemanticBoardSchema,
	SemanticVariantSchema,
	TrackedEmbedSchema,
	variantNamed,
} from "#shared/schemas/board-document.ts";
export type { SemanticBoard, SemanticVariant } from "#shared/schemas/board-document.ts";
export { draftRefs, nodesPinnedTo, ownRefs, refOfBinding } from "#shared/schemas/draft-ref.ts";
export type { OwnRef } from "#shared/schemas/draft-ref.ts";
export { VariantLifecycleSchema } from "#shared/schemas/vocabulary.ts";

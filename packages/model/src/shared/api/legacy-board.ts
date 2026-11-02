// The model document: its schema and version, the variant address and lifecycle, how a variant is found, the draft references, and the one parse of an untrusted value.
export { parseLegacyBoard } from "#shared/rules/coherence/parse-legacy-board.ts";
export {
	addressedVariant,
	asksForDesignation,
	currentVariant,
	findVariant,
	nothingBuilt,
	resolveVariant,
	LEGACY_BOARD_SCHEMA_VERSION,
	LegacyBoardSchema,
	variantNamed,
} from "#shared/schemas/legacy-board.ts";
export type { LegacyBoard, SemanticVariant } from "#shared/schemas/legacy-board.ts";
export { draftRefs, nodesPinnedTo, ownRefs, refOfBinding } from "#shared/schemas/draft-ref.ts";
export type { OwnRef } from "#shared/schemas/draft-ref.ts";
export { VariantLifecycleSchema } from "#shared/schemas/vocabulary.ts";

import { z } from "zod";
import { codeAnchorSchema, codeBindingSchema } from "@archboard/code-binding/bindings";
import {
	DescriptionSchema,
	DisplayNameSchema,
	QualifiedSubjectIdSchema,
	SemanticIdSchema,
	SingleLineTextSchema,
} from "#shared/schemas/primitives.ts";
import { ModelRevisionSchema } from "#shared/schemas/model-definitions.ts";
import { RelationshipEffectSchema, VocabularyNameSchema } from "#shared/schemas/semantic-policy.ts";
import { ArchitectureModelFailureSchema } from "#shared/canonical-contracts/schemas/model.ts";
import { ArchitectureEditSuccessSchema } from "#shared/canonical-contracts/schemas/model-operations.ts";

/** One end of a relationship in the inventory: the module, and where its code is when it is bound. */
const InventoryEndSchema = z.strictObject({
	id: QualifiedSubjectIdSchema,
	name: DisplayNameSchema,
	binding: codeBindingSchema().optional(),
});
/**
 * One relationship of an old-format vault, to classify from the code. The
 * upgrade fills nothing in: `kind` starts as the old kind, except the retired
 * `data`, and `effect` starts empty. A `gap` says why a side effect could not
 * be ruled out, and then the effect is `mutation`.
 */
const InventoryRelationshipSchema = z.strictObject({
	id: QualifiedSubjectIdSchema,
	/** The draft that adds this relationship, or changes its kind. Absent for the current state. */
	proposal: SemanticIdSchema.optional(),
	from: InventoryEndSchema,
	to: InventoryEndSchema,
	label: SingleLineTextSchema.optional(),
	description: DescriptionSchema.optional(),
	anchor: codeAnchorSchema().optional(),
	oldKind: VocabularyNameSchema,
	kind: VocabularyNameSchema.nullable(),
	effect: RelationshipEffectSchema.nullable(),
	gap: DescriptionSchema.nullable(),
});
/** The relationships whose source sits under one root module, as one file an agent fills. */
const UpgradeInventorySchema = z.strictObject({
	format: z.literal("archboard-upgrade-inventory"),
	schemaVersion: z.literal(1),
	/** The digest of the vault revision the inventory was read from. */
	revision: z.string().regex(/^[a-f0-9]{64}$/u),
	root: z.strictObject({ id: QualifiedSubjectIdSchema, name: DisplayNameSchema }),
	relationships: z.array(InventoryRelationshipSchema),
});
type UpgradeInventory = z.infer<typeof UpgradeInventorySchema>;
type InventoryRelationship = z.infer<typeof InventoryRelationshipSchema>;

const UpgradeInventoryReadSchema = z.discriminatedUnion("success", [
	z.strictObject({ success: z.literal(true), inventories: z.array(UpgradeInventorySchema) }),
	ArchitectureModelFailureSchema,
]);
type UpgradeInventoryRead = z.infer<typeof UpgradeInventoryReadSchema>;

/**
 * Installing filled inventories: every one the inventory wrote, as one
 * request. Its operation identity is the inventories' digest, so installing
 * the same inventories again answers with the same receipt.
 */
const ArchitectureUpgradeRequestSchema = z.strictObject({
	inventories: z.array(UpgradeInventorySchema).min(1),
	writer: SingleLineTextSchema,
	doing: SingleLineTextSchema.max(140),
});
type ArchitectureUpgradeRequest = z.infer<typeof ArchitectureUpgradeRequestSchema>;

/** The upgrade as its checkpoint records it: the inventories by digest, not by content. */
const UpgradeInstallationSchema = z.strictObject({
	type: z.literal("upgrade"),
	operationId: SingleLineTextSchema,
	writer: SingleLineTextSchema,
	doing: SingleLineTextSchema.max(140),
	expectedRevision: ModelRevisionSchema,
	inventoryDigest: z.string().regex(/^[a-f0-9]{64}$/u),
	target: z.strictObject({ model: SemanticIdSchema, state: SemanticIdSchema.nullable() }),
});

/**
 * An installed upgrade: the receipt of any installation, and the relationships
 * whose effect is a mutation because a side effect could not be ruled out.
 */
const ArchitectureUpgradeResultSchema = z.discriminatedUnion("success", [
	ArchitectureEditSuccessSchema.extend({
		gaps: z.array(z.strictObject({ id: QualifiedSubjectIdSchema, gap: DescriptionSchema })),
	}),
	ArchitectureModelFailureSchema,
]);
type ArchitectureUpgradeResult = z.infer<typeof ArchitectureUpgradeResultSchema>;

export {
	ArchitectureUpgradeRequestSchema,
	ArchitectureUpgradeResultSchema,
	type ArchitectureUpgradeResult,
	InventoryRelationshipSchema,
	UpgradeInstallationSchema,
	UpgradeInventoryReadSchema,
	UpgradeInventorySchema,
	type ArchitectureUpgradeRequest,
	type InventoryRelationship,
	type UpgradeInventory,
	type UpgradeInventoryRead,
};

/**
 * The schema of one inventory file, for the CLI that writes and reads them.
 * @returns The schema.
 */
export function upgradeInventorySchema(): typeof UpgradeInventorySchema {
	return UpgradeInventorySchema;
}

/**
 * The schema of the inventory read, for callers that parse it.
 * @returns The schema.
 */
export function upgradeInventoryReadSchema(): typeof UpgradeInventoryReadSchema {
	return UpgradeInventoryReadSchema;
}

/**
 * The schema of an upgrade request, for callers that parse it.
 * @returns The schema.
 */
export function architectureUpgradeRequestSchema(): typeof ArchitectureUpgradeRequestSchema {
	return ArchitectureUpgradeRequestSchema;
}

/**
 * The schema of an upgrade's answer, for callers that parse it.
 * @returns The schema.
 */
export function architectureUpgradeResultSchema(): typeof ArchitectureUpgradeResultSchema {
	return ArchitectureUpgradeResultSchema;
}

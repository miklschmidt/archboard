import { z } from "zod";
import { DocumentReferenceSchema } from "@archboard/code-binding/bindings";
import { SemanticEdgeSchema, SemanticNodeSchema } from "#shared/schemas/content.ts";
import {
	SemanticIdSchema,
	DisplayNameSchema,
	DescriptionSchema,
	QualifiedSubjectIdSchema,
} from "#shared/schemas/primitives.ts";
const StateMetadataSchema = z
	.object({
		id: SemanticIdSchema,
		name: DisplayNameSchema,
		formerNames: z.array(DisplayNameSchema).optional(),
		summary: DescriptionSchema.optional(),
		documents: z.array(DocumentReferenceSchema).optional(),
	})
	.strict();

const ArchitectureManifestSchema = z
	.object({
		schemaVersion: z.literal(1),
		id: SemanticIdSchema,
		name: DisplayNameSchema,
		current: StateMetadataSchema.nullable(),
		retiredIds: z.array(QualifiedSubjectIdSchema).optional(),
	})
	.strict();

const OwnedRelationshipSchema = SemanticEdgeSchema.omit({ id: true, from: true, to: true }).extend({
	id: QualifiedSubjectIdSchema,
	to: QualifiedSubjectIdSchema,
});
const ArchitectureModuleSchema = SemanticNodeSchema.omit({
	id: true,
	parent: true,
	drillDown: true,
}).extend({
	schemaVersion: z.literal(1),
	id: QualifiedSubjectIdSchema,
	parent: QualifiedSubjectIdSchema.optional(),
	formerNames: z.array(DisplayNameSchema).optional(),
	documents: z.array(DocumentReferenceSchema).optional(),
	outgoing: z.array(OwnedRelationshipSchema),
});

export { StateMetadataSchema, ArchitectureManifestSchema, ArchitectureModuleSchema };

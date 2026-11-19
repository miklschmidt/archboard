// The records the store keeps beside a vault's files, built from the contract's
// own shapes: a retained checkpoint, the archive's records, the journal of an
// installation in progress, the claims, a publication's configuration and a
// proposal's flat step. Only the store writes them and reads them back.

import { z } from "zod";
import {
	ArchitectureCheckpointSchema,
	GitObjectIdSchema,
	ModelRecoverySchema,
	ModelRevisionSchema,
	ArchitecturePublicationDestinationSchema,
} from "#shared/canonical-contracts/schemas/model.ts";
import {
	ArchitectureClaimSchema,
	ArchitectureEditSuccessSchema,
	RecordedModuleEditSchema,
} from "#shared/canonical-contracts/schemas/model-operations.ts";
import { ModelFlowSchema } from "#shared/canonical-contracts/schemas/model-flows.ts";
import { MigrationInstallationSchema } from "#shared/schemas/migration-installation.ts";
import {
	InitializationInstallationSchema,
	PortableInstallationSchema,
} from "#shared/schemas/model-portable.ts";
import { FamilyStandingSchema } from "#shared/schemas/model-proposals.ts";
import { QualifiedSubjectIdSchema } from "#shared/schemas/primitives.ts";
import { FlowDecisionSchema, FlowLoopSchema } from "#shared/schemas/views.ts";

/** A retained checkpoint's record. */
const CheckpointRecordSchema = ArchitectureCheckpointSchema.omit({ id: true, publication: true })
	.extend({
		schemaVersion: z.literal(1),
		kind: z.literal("checkpoint"),
		vault: z.string(),
		narrativeDependencies: z.array(ArchitectureCheckpointSchema.shape.id).optional(),
		referenceDependencies: z.array(ArchitectureCheckpointSchema.shape.id).optional(),
		edit: RecordedModuleEditSchema.optional(),
		installation: z
			.union([
				PortableInstallationSchema,
				InitializationInstallationSchema,
				MigrationInstallationSchema,
			])
			.optional(),
		reconciliations: FamilyStandingSchema.optional(),
		confirmed: ArchitectureEditSuccessSchema.shape.confirmed,
		subjects: z.array(QualifiedSubjectIdSchema).optional(),
	})
	.strict()
	.refine(
		(record) => record.correction === undefined || record.state !== null,
		"A correction requires an existing state identity.",
	);

/** A record of the history archive: a checkpoint or a synchronization. */
const ArchiveRecordSchema = z.discriminatedUnion("kind", [
	CheckpointRecordSchema,
	z.object({ schemaVersion: z.literal(1), kind: z.literal("synchronization") }).strict(),
]);

/** The checkout an installation began in. */
const CheckoutContextSchema = z
	.object({
		root: z.string(),
		vault: z.string(),
		...ModelRecoverySchema.shape.checkout.shape,
	})
	.strict();

/** The journal of an installation in progress. */
const JournalSchema = z
	.object({
		schemaVersion: z.literal(1),
		context: CheckoutContextSchema,
		request: z.union([
			RecordedModuleEditSchema,
			PortableInstallationSchema,
			InitializationInstallationSchema,
			MigrationInstallationSchema,
		]),
		subjects: z.array(QualifiedSubjectIdSchema).optional(),
		before: ModelRevisionSchema,
		after: ModelRevisionSchema,
		checkpoint: GitObjectIdSchema,
		ref: z.string(),
		phase: ModelRecoverySchema.shape.phase,
		files: z.array(
			z
				.object({ path: z.string(), before: z.string().nullable(), after: z.string().nullable() })
				.strict(),
		),
	})
	.strict();

/** The claims held on a vault, and the ones revoked. */
const ClaimsStateSchema = z
	.object({ claims: z.array(ArchitectureClaimSchema), revoked: z.array(z.string()) })
	.strict();

/** A vault's publication destination as the store keeps it. */
const PublicationConfigurationSchema = ArchitecturePublicationDestinationSchema.extend({
	schemaVersion: z.literal(1),
	fingerprint: z.string(),
}).strict();

/** A flow step as a proposal holds it, flat: a holder keeps no steps and a decision names its alternatives. */
const FlatStepSchema = z.union([
	ModelFlowSchema.shape.steps.element.options[0],
	FlowDecisionSchema.omit({ alternatives: true }).extend({
		id: QualifiedSubjectIdSchema,
		alternatives: z.array(z.string()),
	}),
	FlowLoopSchema.omit({ steps: true }).extend({ id: QualifiedSubjectIdSchema }),
]);

export {
	ArchiveRecordSchema,
	CheckpointRecordSchema,
	ClaimsStateSchema,
	FlatStepSchema,
	JournalSchema,
	PublicationConfigurationSchema,
};

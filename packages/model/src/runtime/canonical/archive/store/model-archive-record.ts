import { z } from "zod";
import { MigrationInstallationSchema } from "#shared/schemas/migration-installation.ts";
import { UpgradeInstallationSchema } from "#shared/upgrade/schemas/upgrade.ts";
import { FamilyStandingSchema } from "#shared/schemas/model-proposals.ts";
import { ArchiveError } from "#runtime/canonical/archive/store/model-archive-location.ts";
import {
	ArchitectureCheckpointSchema,
	QualifiedSubjectIdSchema,
} from "#shared/canonical-contracts/schemas/model.ts";
import {
	RecordedModuleEditSchema,
	ArchitectureEditSuccessSchema,
} from "#shared/canonical-contracts/schemas/model-operations.ts";
import {
	PortableInstallationSchema,
	InitializationInstallationSchema,
} from "#shared/schemas/model-portable.ts";

/**
 * The history record format this Archboard writes. It reads every format up to
 * this one, and a record of a higher format comes from a newer Archboard. Raise
 * it whenever the record schema changes, so an older reader says so.
 */
const RECORD_FORMAT = 1;
const RecordFormatSchema = z.int().min(1).max(RECORD_FORMAT);

const CheckpointRecordSchema = ArchitectureCheckpointSchema.omit({ id: true, publication: true })
	.extend({
		schemaVersion: RecordFormatSchema,
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
				UpgradeInstallationSchema,
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
const ArchiveRecordSchema = z.discriminatedUnion("kind", [
	CheckpointRecordSchema,
	z.object({ schemaVersion: RecordFormatSchema, kind: z.literal("synchronization") }).strict(),
]);

/**
 * Decode one history record. A record from a newer Archboard and a damaged
 * record are refused apart, each with what was found and never the schema dump.
 * @param id The commit that holds the record.
 * @param bytes The record's text.
 * @returns The checkpoint or synchronization record.
 */
function decodeRecord(id: string, bytes: string) {
	let value: unknown;
	try {
		value = JSON.parse(bytes);
	} catch {
		throw new ArchiveError(
			"ARCHIVE_UNREADABLE",
			`History record ${id} is damaged: it is not JSON.`,
			id,
		);
	}
	const format = z.looseObject({ schemaVersion: z.int() }).safeParse(value);
	if (format.success && format.data.schemaVersion > RECORD_FORMAT)
		throw new ArchiveError(
			"ARCHIVE_NEWER",
			`This vault's history was written by a newer Archboard: record ${id} has format ${format.data.schemaVersion}, and this Archboard reads formats up to ${RECORD_FORMAT}.`,
			id,
		);
	const record = ArchiveRecordSchema.safeParse(value);
	if (record.success) return record.data;
	const [issue] = record.error.issues;
	const where = issue!.path.length === 0 ? "" : `${issue!.path.join(".")}: `;
	throw new ArchiveError(
		"ARCHIVE_UNREADABLE",
		`History record ${id} is damaged: ${where}${issue!.message}.`,
		id,
	);
}

export { ArchiveRecordSchema, CheckpointRecordSchema, decodeRecord, RECORD_FORMAT };

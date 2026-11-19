// The records the store keeps beside a vault's files, by kind: the documents
// only the store writes and reads back.

import {
	ArchiveRecordSchema,
	CheckpointRecordSchema,
	ClaimsStateSchema,
	FlatStepSchema,
	JournalSchema,
	PublicationConfigurationSchema,
} from "#shared/schemas/store-records.ts";

/** The store's own records, by kind. */
const STORE_DOCUMENTS = {
	checkpointRecord: CheckpointRecordSchema,
	archiveRecord: ArchiveRecordSchema,
	journal: JournalSchema,
	claimsState: ClaimsStateSchema,
	publicationConfiguration: PublicationConfigurationSchema,
	flatStep: FlatStepSchema,
} as const;

export { STORE_DOCUMENTS };

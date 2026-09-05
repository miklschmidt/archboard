import { z } from "zod";

const ElementIdSchema = z.string();
type ElementId = z.infer<typeof ElementIdSchema>;

const ElementTypeSchema = z.enum([
	"rectangle",
	"ellipse",
	"diamond",
	"arrow",
	"text",
	"line",
	"freedraw",
	"image",
]);

/** Server-owned element payloads keep fields that the command does not interpret. */
const ServerElementSchema = z.looseObject({
	id: ElementIdSchema,
	type: ElementTypeSchema,
	x: z.number(),
	y: z.number(),
});
type ServerElementResult = z.infer<typeof ServerElementSchema>;

const BoardAddressSchema = z.object({
	board: z.string(),
	variant: z.string(),
	level: z.string().optional(),
	displayName: z.string().optional(),
});
type BoardAddress = z.infer<typeof BoardAddressSchema>;

/** Stable fields returned by the server's protected board identity response. */
const BoardIdentityStateSchema = z.looseObject({
	board: z.string(),
	identity: BoardAddressSchema,
	elementCount: z.number().int().nonnegative(),
	version: z.number().int().nonnegative().nullable(),
	placeholder: z.boolean(),
	file: z.string().optional(),
	savedAt: z.string().optional(),
	loadedAt: z.string().optional(),
});
type BoardIdentityState = z.infer<typeof BoardIdentityStateSchema>;

const BoardVersionSchema = z.number().int().nonnegative().nullable();
type BoardVersion = z.infer<typeof BoardVersionSchema>;

const BoardFingerprintSchema = z.object({
	elements: z.number().int().nonnegative(),
	note: z.string(),
	version: BoardVersionSchema,
});
type BoardFingerprint = z.infer<typeof BoardFingerprintSchema>;

const BoardRefusalSchema = z.looseObject({
	success: z.literal(false),
	code: z.string(),
	error: z.string(),
	document: z.array(ServerElementSchema),
	version: BoardVersionSchema,
});
type BoardRefusal = z.infer<typeof BoardRefusalSchema>;

const BoardConflictOutcomesSchema = z.object({
	reload: z.string(),
	overwrite: z.string(),
	saveAs: z.string(),
});

const BoardWriteConflictSchema = z.looseObject({
	board: z.string(),
	file: z.string(),
	reason: z.enum(["changed", "unseen"]),
	actualHash: z.string(),
	versionMove: z.enum(["unchanged", "behind", "ahead", "unknown"]),
	outcomes: BoardConflictOutcomesSchema,
	message: z.string(),
});
type BoardWriteConflict = z.infer<typeof BoardWriteConflictSchema>;

const HoldReportSchema = z.looseObject({
	board: z.string(),
	message: z.string(),
});
type HoldReport = z.infer<typeof HoldReportSchema>;

const PaneRefSchema = z.looseObject({
	paneId: z.string(),
	clientId: z.string(),
	place: z.string(),
	position: z.number().int(),
});
type PaneRef = z.infer<typeof PaneRefSchema>;

const RepositoryIdentitySchema = z.string();
type RepositoryIdentity = z.infer<typeof RepositoryIdentitySchema>;

const CodeBindingSchema = z.looseObject({
	repository: RepositoryIdentitySchema,
	path: z.string(),
	branch: z.string().optional(),
	commit: z.string().optional(),
});
type CodeBinding = z.infer<typeof CodeBindingSchema>;

const SnapshotNameSchema = z.string().min(1);
type SnapshotName = z.infer<typeof SnapshotNameSchema>;

const ChangeCursorSchema = z.string().min(1);
type ChangeCursor = z.infer<typeof ChangeCursorSchema>;

const LibraryItemIdSchema = z.string().min(1);
type LibraryItemId = z.infer<typeof LibraryItemIdSchema>;

const ServerStateSchema = z.looseObject({
	running: z.boolean(),
	url: z.string(),
});
type ServerState = z.infer<typeof ServerStateSchema>;

const ClaimSchema = z.looseObject({
	board: z.string(),
	reason: z.string(),
});
type Claim = z.infer<typeof ClaimSchema>;

const AffectedElementsSchema = z.array(ServerElementSchema);
type AffectedElements = z.infer<typeof AffectedElementsSchema>;

const BoardDocumentSchema = z.array(ServerElementSchema);
type BoardDocument = z.infer<typeof BoardDocumentSchema>;

const GeneratedHandlesSchema = z.array(z.string());
type GeneratedHandles = z.infer<typeof GeneratedHandlesSchema>;

const WriteReceiptSchema = z.looseObject({
	success: z.literal(true),
	elements: AffectedElementsSchema,
	fingerprint: BoardFingerprintSchema,
	document: BoardDocumentSchema.optional(),
	held: HoldReportSchema.optional(),
});
type WriteReceipt = z.infer<typeof WriteReceiptSchema>;

const PendingArtifactSchema = z.discriminatedUnion("encoding", [
	z.object({
		path: z.string(),
		content: z.string(),
		encoding: z.literal("utf8"),
	}),
	z.object({
		path: z.string(),
		content: z.instanceof(Uint8Array),
		encoding: z.literal("binary"),
	}),
	z
		.object({
			path: z.string(),
			encoding: z.literal("files"),
			files: z.array(
				z.strictObject({
					name: z.string().regex(/^[^/\\]+$/u),
					content: z.instanceof(Uint8Array),
				}),
			),
			manifest: z.strictObject({ name: z.literal("manifest.json"), content: z.string() }),
		})
		.superRefine((artifact, context) => {
			const names = artifact.files.map(({ name }) => name);
			if (new Set(names).size !== names.length) {
				context.addIssue({
					code: "custom",
					path: ["files"],
					message: "Artifact file names must be unique.",
				});
			}
		}),
]);
type PendingArtifactValue = z.infer<typeof PendingArtifactSchema>;

export {
	ElementIdSchema,
	type ElementId,
	ElementTypeSchema,
	ServerElementSchema,
	type ServerElementResult,
	BoardAddressSchema,
	type BoardAddress,
	BoardIdentityStateSchema,
	type BoardIdentityState,
	BoardVersionSchema,
	type BoardVersion,
	BoardFingerprintSchema,
	type BoardFingerprint,
	BoardRefusalSchema,
	type BoardRefusal,
	BoardConflictOutcomesSchema,
	BoardWriteConflictSchema,
	type BoardWriteConflict,
	HoldReportSchema,
	type HoldReport,
	PaneRefSchema,
	type PaneRef,
	RepositoryIdentitySchema,
	type RepositoryIdentity,
	CodeBindingSchema,
	type CodeBinding,
	SnapshotNameSchema,
	type SnapshotName,
	ChangeCursorSchema,
	type ChangeCursor,
	LibraryItemIdSchema,
	type LibraryItemId,
	ServerStateSchema,
	type ServerState,
	ClaimSchema,
	type Claim,
	AffectedElementsSchema,
	type AffectedElements,
	BoardDocumentSchema,
	type BoardDocument,
	GeneratedHandlesSchema,
	type GeneratedHandles,
	WriteReceiptSchema,
	type WriteReceipt,
	PendingArtifactSchema,
	type PendingArtifactValue,
};

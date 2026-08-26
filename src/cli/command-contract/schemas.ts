import { z } from "zod";

export const ElementIdSchema = z.string();
export type ElementId = z.infer<typeof ElementIdSchema>;

export const ElementTypeSchema = z.enum([
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
export const ServerElementSchema = z.looseObject({
	id: ElementIdSchema,
	type: ElementTypeSchema,
	x: z.number(),
	y: z.number(),
});
export type ServerElementResult = z.infer<typeof ServerElementSchema>;

export const BoardAddressSchema = z.object({
	board: z.string(),
	variant: z.string(),
	level: z.string().optional(),
	displayName: z.string().optional(),
});
export type BoardAddress = z.infer<typeof BoardAddressSchema>;

/** Stable fields returned by the server's protected board identity response. */
export const BoardIdentityStateSchema = z.looseObject({
	board: z.string(),
	identity: BoardAddressSchema,
	elementCount: z.number().int().nonnegative(),
	version: z.number().int().nonnegative().nullable(),
	placeholder: z.boolean(),
	file: z.string().optional(),
	savedAt: z.string().optional(),
	loadedAt: z.string().optional(),
});
export type BoardIdentityState = z.infer<typeof BoardIdentityStateSchema>;

export const BoardVersionSchema = z.number().int().nonnegative().nullable();
export type BoardVersion = z.infer<typeof BoardVersionSchema>;

export const BoardFingerprintSchema = z.object({
	elements: z.number().int().nonnegative(),
	note: z.string(),
	version: BoardVersionSchema,
});
export type BoardFingerprint = z.infer<typeof BoardFingerprintSchema>;

export const BoardRefusalSchema = z.looseObject({
	success: z.literal(false),
	code: z.string(),
	error: z.string(),
	document: z.array(ServerElementSchema),
	version: BoardVersionSchema,
});
export type BoardRefusal = z.infer<typeof BoardRefusalSchema>;

export const BoardConflictOutcomesSchema = z.object({
	reload: z.string(),
	overwrite: z.string(),
	saveAs: z.string(),
});

export const BoardWriteConflictSchema = z.looseObject({
	board: z.string(),
	file: z.string(),
	reason: z.enum(["changed", "unseen"]),
	actualHash: z.string(),
	versionMove: z.enum(["unchanged", "behind", "ahead", "unknown"]),
	outcomes: BoardConflictOutcomesSchema,
	message: z.string(),
});
export type BoardWriteConflict = z.infer<typeof BoardWriteConflictSchema>;

export const HoldReportSchema = z.looseObject({
	board: z.string(),
	message: z.string(),
});
export type HoldReport = z.infer<typeof HoldReportSchema>;

export const PaneRefSchema = z.looseObject({
	paneId: z.string(),
	clientId: z.string(),
	place: z.string(),
	position: z.number().int(),
});
export type PaneRef = z.infer<typeof PaneRefSchema>;

export const RepositoryIdentitySchema = z.string();
export type RepositoryIdentity = z.infer<typeof RepositoryIdentitySchema>;

export const CodeBindingSchema = z.looseObject({
	repository: RepositoryIdentitySchema,
	path: z.string(),
	branch: z.string().optional(),
	commit: z.string().optional(),
});
export type CodeBinding = z.infer<typeof CodeBindingSchema>;

export const SnapshotNameSchema = z.string().min(1);
export type SnapshotName = z.infer<typeof SnapshotNameSchema>;

export const ChangeCursorSchema = z.string().min(1);
export type ChangeCursor = z.infer<typeof ChangeCursorSchema>;

export const LibraryItemIdSchema = z.string().min(1);
export type LibraryItemId = z.infer<typeof LibraryItemIdSchema>;

export const ServerStateSchema = z.looseObject({
	running: z.boolean(),
	url: z.string(),
});
export type ServerState = z.infer<typeof ServerStateSchema>;

export const ClaimSchema = z.looseObject({
	board: z.string(),
	reason: z.string(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const AffectedElementsSchema = z.array(ServerElementSchema);
export type AffectedElements = z.infer<typeof AffectedElementsSchema>;

export const BoardDocumentSchema = z.array(ServerElementSchema);
export type BoardDocument = z.infer<typeof BoardDocumentSchema>;

export const GeneratedHandlesSchema = z.array(z.string());
export type GeneratedHandles = z.infer<typeof GeneratedHandlesSchema>;

export const WriteReceiptSchema = z.looseObject({
	success: z.literal(true),
	elements: AffectedElementsSchema,
	fingerprint: BoardFingerprintSchema,
	document: BoardDocumentSchema.optional(),
	held: HoldReportSchema.optional(),
});
export type WriteReceipt = z.infer<typeof WriteReceiptSchema>;

export const PendingArtifactSchema = z.discriminatedUnion("encoding", [
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
]);
export type PendingArtifactValue = z.infer<typeof PendingArtifactSchema>;

import { z } from "zod";
import { ArchitectureModelReadSchema } from "@archboard/model/contract";
import { LocalityAnswerSchema, PeriodStartSchema } from "#shared/protocol/locality.ts";
import { FootprintAnswerSchema } from "#shared/protocol/footprint.ts";
import { SourceRefsAnswerSchema } from "#shared/protocol/source-refs.ts";
const SelectionSchema = z.strictObject({
	state: z.string().optional(),
	checkpoint: z.string().optional(),
	against: z.string().optional(),
});
const ArchitectureLocalityRequestSchema = SelectionSchema.extend({
	since: PeriodStartSchema.optional(),
});
/**
 * Where a footprint with a head reads the vault: `head`, the default, reads it as the vault's
 * repository holds that head when that repository resolves it, and `checkout` always reads the
 * vault on disk. Without a head, both read the vault on disk.
 */
const ArchitectureFootprintRequestSchema = SelectionSchema.extend({
	base: z.string().min(1),
	head: z.string().min(1).optional(),
	modelAt: z.enum(["head", "checkout"]).optional(),
});
/** With both `base` and `head`, the listing also names the range's merge base in the vault's repository. */
const ArchitectureSourceRefsRequestSchema = SelectionSchema.extend({
	ref: z.string().min(1).optional(),
	base: z.string().min(1).optional(),
	head: z.string().min(1).optional(),
});
const IdentitySchema = z.strictObject({
	success: z.literal(true),
	model: z.string(),
	state: ArchitectureModelReadSchema.options[0].shape.selectedState,
	revision: ArchitectureModelReadSchema.options[0].shape.revision,
	checkpoint: z.string().optional(),
});
/** The vault a footprint read: the vault on disk, or the vault at the head's ref and commit. */
const FootprintVaultSchema = z.discriminatedUnion("at", [
	z.strictObject({ at: z.literal("checkout") }),
	ArchitectureModelReadSchema.options[0].shape.sourceRef.unwrap().extend({ at: z.literal("ref") }),
]);
const FootprintIdentitySchema = z.strictObject({
	...IdentitySchema.shape,
	analysis: z.literal("footprint"),
	vaultRead: FootprintVaultSchema,
});
const ArchitectureHistoryRequestSchema = z.discriminatedUnion("analysis", [
	ArchitectureLocalityRequestSchema.extend({ analysis: z.literal("locality") }),
	ArchitectureFootprintRequestSchema.extend({ analysis: z.literal("footprint") }),
	ArchitectureSourceRefsRequestSchema.extend({ analysis: z.literal("refs") }),
]);
const ArchitectureHistoryResultSchema = z.union([
	LocalityAnswerSchema.omit({ model: true, version: true, variant: true }).extend({
		...IdentitySchema.shape,
		analysis: z.literal("locality"),
	}),
	FootprintAnswerSchema.options[0]
		.omit({ model: true, version: true })
		.extend(FootprintIdentitySchema.shape),
	FootprintAnswerSchema.options[1]
		.omit({ model: true, version: true })
		.extend(FootprintIdentitySchema.shape),
	SourceRefsAnswerSchema.extend({ ...IdentitySchema.shape, analysis: z.literal("refs") }),
	ArchitectureModelReadSchema.options[1],
]);
export {
	ArchitectureLocalityRequestSchema,
	ArchitectureFootprintRequestSchema,
	ArchitectureSourceRefsRequestSchema,
	ArchitectureHistoryRequestSchema,
	ArchitectureHistoryResultSchema,
};

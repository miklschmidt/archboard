import { z } from "zod";
import { ArchitectureModelReadSchema } from "@archboard/board/model";
import { LocalityAnswerSchema, PeriodStartSchema } from "#shared/protocol/locality.ts";
import { FootprintAnswerSchema } from "#shared/protocol/footprint.ts";
const ArchitectureHistoryRequestSchema = z.strictObject({
	state: z.string().optional(),
	checkpoint: z.string().optional(),
	against: z.string().optional(),
});
const ArchitectureLocalityRequestSchema = ArchitectureHistoryRequestSchema.extend({
	since: PeriodStartSchema.optional(),
});
const ArchitectureFootprintRequestSchema = ArchitectureHistoryRequestSchema.extend({
	base: z.string().min(1),
	head: z.string().min(1).optional(),
});
const IdentitySchema = z.strictObject({
	success: z.literal(true),
	model: z.string(),
	state: ArchitectureModelReadSchema.options[0].shape.selectedState,
	revision: ArchitectureModelReadSchema.options[0].shape.revision,
	checkpoint: z.string().optional(),
});
const ArchitectureLocalityResultSchema = z.union([
	LocalityAnswerSchema.omit({ board: true, version: true, variant: true }).extend(
		IdentitySchema.shape,
	),
	ArchitectureModelReadSchema.options[1],
]);
const ArchitectureFootprintResultSchema = z.union([
	FootprintAnswerSchema.options[0]
		.omit({ board: true, version: true })
		.extend(IdentitySchema.shape),
	FootprintAnswerSchema.options[1]
		.omit({ board: true, version: true })
		.extend(IdentitySchema.shape),
	ArchitectureModelReadSchema.options[1],
]);
export {
	ArchitectureLocalityRequestSchema,
	ArchitectureFootprintRequestSchema,
	ArchitectureLocalityResultSchema,
	ArchitectureFootprintResultSchema,
};

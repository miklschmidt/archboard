import { z } from "zod";
import { ArchitectureRenderRequestSchema } from "#shared/schemas/model-operations.ts";
import { ReadingSelectionSchema } from "#shared/schemas/model-explanation.ts";
const ArchitecturePaneReadingSchema = ArchitectureRenderRequestSchema.omit({ theme: true }).extend({
	...ReadingSelectionSchema.shape,
	model: z.string().min(1).optional(),
	beat: z.int().nonnegative().optional(),
});
export { ArchitecturePaneReadingSchema };

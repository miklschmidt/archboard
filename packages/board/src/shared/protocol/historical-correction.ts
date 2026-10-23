import { z } from "zod";
import { VariantEditInputSchema } from "#shared/protocol/board-input.ts";
import { DescriptionSchema } from "#shared/schemas/primitives.ts";
import { HistoricalRevisionsSchema } from "#shared/schemas/historical-correction.ts";

/** Corrections can restate one historical variant, never shared board presentation. */
const HistoricalCorrectionInputSchema = z
	.object({
		variant: z.string().trim().min(1),
		reason: DescriptionSchema,
		revisions: HistoricalRevisionsSchema,
		edit: VariantEditInputSchema.omit({
			variant: true,
			level: true,
			views: true,
			removeViews: true,
		}),
	})
	.strict();
type HistoricalCorrectionInput = z.infer<typeof HistoricalCorrectionInputSchema>;
export { HistoricalCorrectionInputSchema, type HistoricalCorrectionInput };
export {
	HistoricalRevisionSchema,
	type HistoricalRevision,
} from "#shared/schemas/historical-correction.ts";

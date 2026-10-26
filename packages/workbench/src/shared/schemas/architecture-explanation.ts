import { z } from "zod";
import { ArchitectureModelReadSchema } from "@archboard/board/model";

const CaptureSchema = ArchitectureModelReadSchema.options[0].shape.explanation.unwrap();
const ExplanationActionRequestSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("invoke"),
		tabSessionId: z.string().min(1),
		request: CaptureSchema.shape.request,
		selection: CaptureSchema.shape.selection.optional(),
	}),
	z.strictObject({
		type: z.enum(["read", "retry", "cancel"]),
		tabSessionId: z.string().min(1),
		actionId: z.string().min(1),
	}),
]);
const ExplanationActionResultSchema = z.discriminatedUnion("success", [
	z.strictObject({
		success: z.literal(true),
		action: z.strictObject({
			actionId: z.string(),
			status: z.enum([
				"captured",
				"queued",
				"running",
				"completed",
				"failed",
				"cancelled",
				"unavailable",
			]),
			attempt: z.number().int(),
			capture: CaptureSchema,
			text: z.string(),
			error: z.string().optional(),
			retryable: z.boolean(),
		}),
	}),
	z
		.object({
			success: z.literal(false),
			code: z.string(),
			error: z.string(),
			diagnostics: ArchitectureModelReadSchema.options[1].shape.diagnostics.optional(),
		})
		.strict(),
]);
export { ExplanationActionRequestSchema, ExplanationActionResultSchema };

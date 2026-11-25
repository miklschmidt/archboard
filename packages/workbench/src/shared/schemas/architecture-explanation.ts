import { z } from "zod";
import { architectureModelReadSchema } from "@archboard/model/contract";

const CaptureSchema = architectureModelReadSchema().options[0].shape.explanation.unwrap();
const ExplanationActionRequestSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("latest"), tabSessionId: z.string().min(1) }),
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
			vault: z.string(),
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
			/** What the action is about, in the words of the model. */
			about: z.string(),
			/** What Codex is doing now. */
			activity: z.string().optional(),
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
			diagnostics: architectureModelReadSchema().options[1].shape.diagnostics.optional(),
		})
		.strict(),
]);
type ExplanationActionRequest = z.infer<typeof ExplanationActionRequestSchema>;
type ExplanationActionResult = z.infer<typeof ExplanationActionResultSchema>;

/**
 * The schema of an explanation request, for a caller that parses what it receives or sends.
 * @returns The request schema.
 */
function explanationActionRequestSchema(): typeof ExplanationActionRequestSchema {
	return ExplanationActionRequestSchema;
}

/**
 * The schema of an explanation result, for a caller that parses what it receives or sends.
 * @returns The result schema.
 */
function explanationActionResultSchema(): typeof ExplanationActionResultSchema {
	return ExplanationActionResultSchema;
}

export {
	ExplanationActionRequestSchema,
	ExplanationActionResultSchema,
	explanationActionRequestSchema,
	explanationActionResultSchema,
};
export type { ExplanationActionRequest, ExplanationActionResult };

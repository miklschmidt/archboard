import { z } from "zod";

// Process tests check the common wire envelope here and the result value at each call site.
const ResponseSchema = z.strictObject({
	contentItems: z.tuple([z.strictObject({ type: z.literal("inputText"), text: z.string() })]),
	success: z.boolean(),
});

const OperationId = z.string().min(1).refine((text) => Array.from(text).length <= 128);
const ShortText = z
	.string()
	.min(1)
	.refine((text) => Buffer.byteLength(text, "utf8") <= 512);
const EnvelopeSchema = z.discriminatedUnion("tag", [
	z.strictObject({ tag: z.literal("ok"), operationId: OperationId, value: z.json() }),
	z.strictObject({
		tag: z.literal("approval_required"),
		operationId: OperationId,
		summary: ShortText,
	}),
	z.strictObject({
		tag: z.literal("outcome_unknown"),
		operationId: OperationId,
		message: z.literal(
			"The request may have taken effect. Inspect authoritative state before another mutation.",
		),
	}),
	z.strictObject({ tag: z.literal("refused"), reason: z.string().min(1), message: ShortText }),
]);

export type ToolEnvelope = z.infer<typeof EnvelopeSchema>;

/**
 * Read a dynamic tool call response as the tool's result envelope.
 * @param response - The raw response frame result.
 * @returns The envelope, after proving its text is the one compact JSON the tool sends.
 * @throws {Error} When the response is not one text item holding a compact JSON envelope.
 */
export function parseDynamicToolCallResponse(response: unknown): { envelope: ToolEnvelope } {
	const parsed = ResponseSchema.parse(response);
	const text = parsed.contentItems[0].text;
	const envelope = EnvelopeSchema.parse(JSON.parse(text));
	if (Array.from(text).length > 16_384 || JSON.stringify(envelope) !== text) {
		throw new Error("The tool result envelope is not compact JSON.");
	}
	if (
		!parsed.success &&
		(envelope.tag !== "refused" ||
			(envelope.reason !== "invalid_call" && envelope.reason !== "unsupported"))
	) {
		throw new Error("An unsuccessful tool call must carry a boundary refusal.");
	}
	return { envelope };
}

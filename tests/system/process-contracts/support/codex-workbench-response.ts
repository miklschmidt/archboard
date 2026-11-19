import { z } from "zod";

// What a dynamic tool call answered with on the wire: one text item holding the result envelope,
// and whether the call succeeded. The envelope is read as the loose record the tests then compare
// field by field; its closed shape is proven in the workbench package's own tests.
const ResponseSchema = z.strictObject({
	contentItems: z.tuple([z.strictObject({ type: z.literal("inputText"), text: z.string() })]),
	success: z.boolean(),
});

const EnvelopeSchema = z.looseObject({
	tag: z.string(),
	operationId: z.string().optional(),
	value: z.json().optional(),
	summary: z.string().optional(),
	reason: z.string().optional(),
	message: z.string().optional(),
});

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
	const value: unknown = JSON.parse(text);
	if (JSON.stringify(value) !== text) {
		throw new Error("The tool result envelope is not compact JSON.");
	}
	return { envelope: EnvelopeSchema.parse(value) };
}

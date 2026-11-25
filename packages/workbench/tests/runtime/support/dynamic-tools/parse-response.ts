import { z } from "zod";

import type { GeneralThreadToolName } from "#runtime/thread-tools/protocol/manifest.ts";
import { boundedText } from "#runtime/thread-tools/protocol/limits.ts";
import { parseToolResultEnvelope } from "#runtime/thread-tools/protocol/results.ts";

const OUTER_FAILURE_REASONS = new Set(["invalid_call", "unsupported"]);

export const DynamicToolCallResponseSchema = z.strictObject({
	contentItems: z.tuple([
		z.strictObject({ type: z.literal("inputText"), text: boundedText(16_384) }),
	]),
	success: z.boolean(),
});

export interface ParsedDynamicToolCallResponse<Name extends GeneralThreadToolName> {
	readonly contentItems: z.infer<typeof DynamicToolCallResponseSchema>["contentItems"];
	readonly success: boolean;
	readonly envelope: ReturnType<typeof parseToolResultEnvelope<Name>>;
}

/**
 * Freeze a value and everything reachable from it.
 * @param value - The value to freeze.
 * @returns The same value, frozen.
 */
function freezeDeep<T>(value: T): T {
	if (typeof value !== "object" || value === null) {
		return value;
	}
	for (const child of Object.values(value)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

export function parseDynamicToolCallResponse<Name extends GeneralThreadToolName>(
	name: Name,
	response: unknown,
): ParsedDynamicToolCallResponse<Name>;
export function parseDynamicToolCallResponse(
	name: unknown,
	response: unknown,
): ParsedDynamicToolCallResponse<GeneralThreadToolName>;
/**
 * Parse a dynamic tool call response as this tool's result, the way a reader of the wire would:
 * the response envelope first, then the single text item it carries, parsed as that tool's
 * result envelope. Production code builds these responses and never parses one, so the proof of
 * what it sent lives here.
 * @param name - The tool that was called.
 * @param response - The raw dynamic tool call response.
 * @returns The content items, the success flag, and the parsed envelope.
 * @throws {TypeError} When the response or its envelope is not the reviewed shape.
 */
export function parseDynamicToolCallResponse(
	name: unknown,
	response: unknown,
): ParsedDynamicToolCallResponse<GeneralThreadToolName> {
	const parsed = DynamicToolCallResponseSchema.safeParse(response);
	if (!parsed.success) {
		throw new TypeError(
			`Invalid ${String(name)} dynamic tool response: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
		);
	}
	const envelope = parseToolResultEnvelope(name, parsed.data.contentItems[0].text);
	if (!parsed.data.success) {
		if (envelope.tag !== "refused" || !OUTER_FAILURE_REASONS.has(envelope.reason)) {
			throw new TypeError(
				`${String(name)} dynamic tool response must use a boundary-refusal envelope when success is false.`,
			);
		}
	}
	return freezeDeep({
		contentItems: parsed.data.contentItems,
		success: parsed.data.success,
		envelope,
	});
}

import { z } from "zod";

import { deepFreeze } from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/manifest.ts";

const DYNAMIC_TOOL_REFUSAL_REASONS = Object.freeze([
	"invalid_call",
	"not_ready",
	"not_loaded",
	"not_controllable",
	"system_error",
	"stale_child",
	"prior_epoch",
	"unknown_provenance",
	"approval_declined",
	"cycle",
	"busy",
	"expired",
	"unsupported",
] as const);
type DynamicToolRefusalReason = (typeof DYNAMIC_TOOL_REFUSAL_REASONS)[number];
const DynamicToolRefusalReasonSchema = z.enum(DYNAMIC_TOOL_REFUSAL_REASONS);

const OpaqueIdSchema = z.string().min(1).max(128);
const BoundedDiagnosticSchema = z.string().min(1).max(4_096);
const JsonObjectSchema = z.record(z.string(), z.json());

const DynamicToolOkEnvelopeSchema = z
	.object({
		tag: z.literal("ok"),
		operationId: OpaqueIdSchema,
		value: JsonObjectSchema,
	})
	.strict();
const DynamicToolRefusedEnvelopeSchema = z
	.object({
		tag: z.literal("refused"),
		reason: DynamicToolRefusalReasonSchema,
		message: BoundedDiagnosticSchema,
	})
	.strict();
const DynamicToolApprovalRequiredEnvelopeSchema = z
	.object({
		tag: z.literal("approval_required"),
		operationId: OpaqueIdSchema,
		summary: BoundedDiagnosticSchema,
	})
	.strict();
const DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE =
	"The request may have taken effect. Inspect authoritative state before another mutation." as const;
const DynamicToolOutcomeUnknownEnvelopeSchema = z
	.object({
		tag: z.literal("outcome_unknown"),
		operationId: OpaqueIdSchema,
		message: z.literal(DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE),
	})
	.strict();

const DynamicToolEnvelopeSchema = z.discriminatedUnion("tag", [
	DynamicToolOkEnvelopeSchema,
	DynamicToolRefusedEnvelopeSchema,
	DynamicToolApprovalRequiredEnvelopeSchema,
	DynamicToolOutcomeUnknownEnvelopeSchema,
]);

const DynamicToolEnvelopeTextSchema = z
	.string()
	.min(1)
	.max(16_384)
	.superRefine((text, context) => {
		let value: unknown;
		try {
			value = JSON.parse(text) as unknown;
		} catch {
			context.addIssue({ code: "custom", message: "tool response text must be JSON" });
			return;
		}
		const parsed = DynamicToolEnvelopeSchema.safeParse(value);
		if (!parsed.success || JSON.stringify(parsed.data) !== text) {
			context.addIssue({ code: "custom", message: "tool response text must be canonical JSON" });
		}
	});

const DynamicToolContentItemsSchema = z.tuple([
	z.object({ type: z.literal("inputText"), text: DynamicToolEnvelopeTextSchema }).strict(),
]);

/** Responses for calls that passed the coordinator's identity/manifest checks. */
const ValidDynamicToolResponseSchema = z
	.object({
		contentItems: DynamicToolContentItemsSchema,
		success: z.literal(true),
	})
	.strict();

/**
 * Reads the envelope tag out of response text without trusting it to be an envelope.
 * @param text - The tool response text.
 * @returns The tag when the text is a valid envelope, otherwise undefined.
 */
function envelopeTag(text: string): string | undefined {
	let value: unknown;
	try {
		value = JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
	const parsed = DynamicToolEnvelopeSchema.safeParse(value);
	return parsed.success ? parsed.data.tag : undefined;
}

/** Responses for calls rejected before a tool call could be established. */
const UnknownDynamicToolResponseSchema = z
	.object({
		contentItems: DynamicToolContentItemsSchema,
		success: z.literal(false),
	})
	.strict()
	.superRefine((response, context) => {
		if (envelopeTag(response.contentItems[0].text) !== "refused") {
			context.addIssue({
				code: "custom",
				path: ["contentItems"],
				message: "unknown calls must return a refused envelope",
			});
		}
	});

type DynamicToolEnvelope = z.infer<typeof DynamicToolEnvelopeSchema>;
/** The result an `ok` envelope carries. */
type DynamicToolValue = z.infer<typeof DynamicToolOkEnvelopeSchema>["value"];
type ToolResponse =
	| z.infer<typeof ValidDynamicToolResponseSchema>
	| z.infer<typeof UnknownDynamicToolResponseSchema>;

/**
 * Read the reviewed refusal reason out of a value, such as the code a thrown error carries.
 * @param value - Any value.
 * @returns The refusal reason, or null when the value is not a reviewed reason.
 */
function refusalReasonOf(value: unknown): DynamicToolRefusalReason | null {
	const reason = DynamicToolRefusalReasonSchema.safeParse(value);
	return reason.success ? reason.data : null;
}

/**
 * The envelope for an effect whose outcome the server cannot prove either way.
 * @param operationId - The server-issued operation identity.
 * @returns The envelope, with the one reviewed message.
 */
function outcomeUnknownEnvelope(operationId: string): DynamicToolEnvelope {
	return DynamicToolOutcomeUnknownEnvelopeSchema.parse({
		tag: "outcome_unknown",
		operationId,
		message: DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE,
	});
}

/**
 * Wrap an envelope as the app-server's dynamic tool response text, checked against the response
 * schemas and frozen so it cannot change after it is built.
 * @param envelope - The envelope to serialize.
 * @param success - Whether the app-server should treat the call as succeeded.
 * @returns The frozen, schema-checked response.
 */
function toolResponseFor(envelope: DynamicToolEnvelope, success: boolean): ToolResponse {
	const text = JSON.stringify(DynamicToolEnvelopeSchema.parse(envelope));
	const candidate = {
		contentItems: [{ type: "inputText" as const, text }],
		success,
	};
	return deepFreeze(
		success
			? ValidDynamicToolResponseSchema.parse(candidate)
			: UnknownDynamicToolResponseSchema.parse(candidate),
	);
}

export {
	type DynamicToolRefusalReason,
	type DynamicToolValue,
	type ToolResponse,
	OpaqueIdSchema,
	refusalReasonOf,
	outcomeUnknownEnvelope,
	toolResponseFor,
};

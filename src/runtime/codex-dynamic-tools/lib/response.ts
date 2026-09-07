import {
	parseToolResultEnvelope,
	type DynamicToolCallResponse,
	type GeneralThreadToolName,
} from "@/runtime/codex-thread-tools";
import type { DynamicRefusalReason } from "@/runtime/codex-dynamic-tools/lib/vocabulary";
import {
	RESPONSE_TEXT_MAX_UTF8_BYTES,
	boundedMessage,
	encodeJsonText,
	truncateUtf8,
} from "@/runtime/codex-dynamic-tools/lib/text-bounds";

const OUTCOME_UNKNOWN_MESSAGE =
	"The request may have taken effect. Inspect authoritative state before another mutation." as const;
const REFUSED_FALLBACK_MESSAGE = "The dynamic call was refused." as const;

/**
 * Bound a refusal message to the response text budget, substituting the
 * generic refusal text when the message is blank.
 * @param value Raw message text.
 * @returns The bounded message.
 */
function messageOf(value: string): string {
	return boundedMessage(value, REFUSED_FALLBACK_MESSAGE);
}

/**
 * Freeze one wire response whose text is the canonical JSON of an envelope
 * that round-trips through the reviewed result schema for the tool.
 * @param name Tool whose result schema validates the envelope.
 * @param envelope Result envelope to encode.
 * @param success Whether the response reports success to the caller.
 * @returns The frozen wire response.
 */
function dynamicResponse(
	name: GeneralThreadToolName,
	envelope: unknown,
	success = true,
): DynamicToolCallResponse {
	const text = encodeJsonText(envelope);
	if (text === undefined) {
		throw new TypeError("The dynamic response envelope could not be encoded.");
	}
	const parsed = parseToolResultEnvelope(name, text);
	const canonicalText = encodeJsonText(parsed);
	if (canonicalText === undefined) {
		throw new TypeError("The dynamic response could not be encoded.");
	}
	const response: DynamicToolCallResponse = {
		contentItems: [{ type: "inputText", text: canonicalText }],
		success,
	};
	return Object.freeze(response);
}

/**
 * Build a failed response for a call that never reached a known tool, so the
 * envelope cannot be validated against any tool's result schema.
 * @param reason Why the call was refused before dispatch.
 * @param message Human-readable explanation.
 * @returns The frozen failed wire response.
 */
function invalidDynamicResponse(
	reason: Extract<DynamicRefusalReason, "invalid_call" | "unsupported">,
	message: string,
): DynamicToolCallResponse {
	const envelope = JSON.stringify({ tag: "refused", reason, message: messageOf(message) });
	const response: DynamicToolCallResponse = {
		contentItems: [{ type: "inputText", text: envelope }],
		success: false,
	};
	return Object.freeze(response);
}

/**
 * Build a refused response for a known tool.
 * @param name Tool that was refused.
 * @param reason Refusal reason returned to the caller.
 * @param message Human-readable explanation.
 * @returns The frozen wire response.
 */
function refusedDynamicResponse(
	name: GeneralThreadToolName,
	reason: DynamicRefusalReason,
	message: string,
): DynamicToolCallResponse {
	return dynamicResponse(name, {
		tag: "refused",
		reason,
		message: messageOf(message),
	});
}

/**
 * Build the response telling the caller a person must approve the effect.
 * @param name Mutation tool awaiting approval.
 * @param operationId Wire identity of the pending operation.
 * @param summary Visual summary shown to the person.
 * @returns The frozen wire response.
 */
function approvalRequiredDynamicResponse(
	name: GeneralThreadToolName,
	operationId: string,
	summary: string,
): DynamicToolCallResponse {
	return dynamicResponse(name, {
		tag: "approval_required",
		operationId,
		summary: truncateUtf8(summary, RESPONSE_TEXT_MAX_UTF8_BYTES),
	});
}

/**
 * Build the response for a mutation whose remote outcome could not be proven.
 * @param name Mutation tool whose outcome is unknown.
 * @param operationId Wire identity of the operation to inspect.
 * @returns The frozen wire response.
 */
function outcomeUnknownDynamicResponse(
	name: GeneralThreadToolName,
	operationId: string,
): DynamicToolCallResponse {
	return dynamicResponse(name, {
		tag: "outcome_unknown",
		operationId,
		message: OUTCOME_UNKNOWN_MESSAGE,
	});
}

/**
 * The fixed text that accompanies every unknown-outcome result.
 * @returns The reviewed outcome-unknown message.
 */
function outcomeUnknownMessage(): typeof OUTCOME_UNKNOWN_MESSAGE {
	return OUTCOME_UNKNOWN_MESSAGE;
}

export {
	dynamicResponse,
	invalidDynamicResponse,
	refusedDynamicResponse,
	approvalRequiredDynamicResponse,
	outcomeUnknownDynamicResponse,
	outcomeUnknownMessage,
};

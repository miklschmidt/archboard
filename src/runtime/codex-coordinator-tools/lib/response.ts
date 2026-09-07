import {
	DelegateToWorkhorseResultSchema,
	DynamicToolEnvelopeSchema,
	DynamicToolOutcomeUnknownEnvelopeSchema,
	DynamicToolResponseSchema,
	InspectWorkhorseResultSchema,
	ManageWorkhorseQueueResultSchema,
	ResolveSpokenApprovalResultSchema,
	SteerWorkhorseResultSchema,
	UnknownDynamicToolResponseSchema,
	ValidDynamicToolResponseSchema,
	parseCoordinatorToolResult,
	type CoordinatorToolName,
	type DynamicToolRefusalReason,
} from "@/runtime/codex-coordinator-tool-contract";
import type { DynamicToolOkEnvelopeSchema } from "@/runtime/codex-coordinator-tool-contract";
import type {
	CoordinatorToolValue,
	CoordinatorToolValueFor,
	DynamicToolResponse,
} from "@/runtime/codex-coordinator-tools/lib/contract";
import { DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE } from "@/runtime/codex-coordinator-tool-contract";
import { z } from "zod";

type DynamicToolEnvelope = z.infer<typeof DynamicToolEnvelopeSchema>;
type DynamicToolValue = z.infer<typeof DynamicToolOkEnvelopeSchema>["value"];

/**
 * The reviewed result shapes without their strictness: parsing through these keeps exactly the
 * declared fields, in declared order, and drops anything else a workhorse result carried.
 */
const CANONICAL_RESULT_SCHEMAS = Object.freeze({
	inspect_workhorse: z.object(InspectWorkhorseResultSchema.shape),
	delegate_to_workhorse: z.object(DelegateToWorkhorseResultSchema.shape),
	manage_workhorse_queue: z.object(ManageWorkhorseQueueResultSchema.shape),
	steer_workhorse: z.object(SteerWorkhorseResultSchema.shape),
	resolve_spoken_approval: z.object(ResolveSpokenApprovalResultSchema.shape),
} satisfies Readonly<Record<CoordinatorToolName, z.ZodObject>>);

/**
 * Freeze a value and everything reachable from it so a response cannot change after it is built.
 * @param value - The value to freeze in place.
 * @returns The same value, frozen.
 */
function freezeDeep<T>(value: T): T {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

/**
 * Keep a diagnostic inside the envelope's bounds and never empty.
 * @param message - The diagnostic text.
 * @returns The text, defaulted when empty and truncated when too long.
 */
function boundedMessage(message: string): string {
	const value = message.length === 0 ? "The coordinator tool call was refused." : message;
	return value.length <= 4_096 ? value : `${value.slice(0, 4_093)}...`;
}

/**
 * Insist on a host-supplied operation identity before an envelope may name one.
 * @param operationId - The wire form of the operation identity.
 * @returns The same identity when it is present and bounded.
 */
function requireOperationId(operationId: string | null | undefined): string {
	if (typeof operationId !== "string" || operationId.length === 0 || operationId.length > 128) {
		throw new TypeError(
			"A coordinator tool response requires one host-supplied operation identity.",
		);
	}
	return operationId;
}

/**
 * Reduce a tool result to the reviewed fields so the envelope carries nothing undeclared.
 * @param name - The tool the result belongs to.
 * @param value - The result as the port produced it.
 * @returns A fresh object holding only the declared fields.
 */
function canonicalValue(name: CoordinatorToolName, value: CoordinatorToolValue): DynamicToolValue {
	return CANONICAL_RESULT_SCHEMAS[name].parse(value);
}

/**
 * Wrap an envelope as the app-server's dynamic tool response text.
 * @param envelope - The envelope to serialize.
 * @param success - Whether the app-server should treat the call as succeeded.
 * @returns The frozen, schema-checked response.
 */
function responseForEnvelope(envelope: DynamicToolEnvelope, success: boolean): DynamicToolResponse {
	const text = JSON.stringify(DynamicToolEnvelopeSchema.parse(envelope));
	const candidate = {
		contentItems: [{ type: "inputText" as const, text }],
		success,
	};
	const parsed = success
		? ValidDynamicToolResponseSchema.parse(candidate)
		: UnknownDynamicToolResponseSchema.parse(candidate);
	return freezeDeep(parsed);
}

/**
 * Build the successful response for one tool, checked against that tool's reviewed result schema.
 * @param name - The tool that succeeded.
 * @param operationId - The wire form of the host-issued operation identity.
 * @param value - The tool's result.
 * @returns The frozen response.
 */
function okResponse<Name extends CoordinatorToolName>(
	name: Name,
	operationId: string,
	value: CoordinatorToolValueFor<Name>,
): DynamicToolResponse {
	const canonical = canonicalValue(name, value);
	parseCoordinatorToolResult(name, canonical);
	return responseForEnvelope(
		{
			tag: "ok",
			operationId: requireOperationId(operationId),
			value: canonical,
		},
		true,
	);
}

/**
 * Build a refusal response.
 * @param reason - The reviewed refusal reason.
 * @param message - The diagnostic for the caller.
 * @param outerFailure - Whether the app-server should see the call itself as failed rather than a
 * successful call that refused.
 * @returns The frozen response.
 */
function refusedResponse(
	reason: DynamicToolRefusalReason,
	message: string,
	outerFailure = false,
): DynamicToolResponse {
	return responseForEnvelope(
		{ tag: "refused", reason, message: boundedMessage(message) },
		!outerFailure,
	);
}

/**
 * Build the response that tells the coordinator a person must approve before the effect runs.
 * @param operationId - The wire form of the host-issued operation identity.
 * @param summary - What is awaiting approval.
 * @returns The frozen response.
 */
function approvalRequiredResponse(operationId: string, summary: string): DynamicToolResponse {
	return responseForEnvelope(
		{
			tag: "approval_required",
			operationId: requireOperationId(operationId),
			summary: boundedMessage(summary),
		},
		true,
	);
}

/**
 * Build the response for an effect whose outcome the host cannot prove either way.
 * @param operationId - The wire form of the host-issued operation identity.
 * @returns The frozen response.
 */
function outcomeUnknownResponse(operationId: string): DynamicToolResponse {
	const envelope = DynamicToolOutcomeUnknownEnvelopeSchema.parse({
		tag: "outcome_unknown",
		operationId: requireOperationId(operationId),
		message: DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE,
	});
	return responseForEnvelope(envelope, true);
}

/**
 * Re-check a response against the response schemas and freeze it.
 * @param response - A response to verify.
 * @returns The frozen, schema-checked response.
 */
function parseResponseText(response: DynamicToolResponse): DynamicToolResponse {
	const parsed = response.success
		? DynamicToolResponseSchema.parse(response)
		: UnknownDynamicToolResponseSchema.parse(response);
	return freezeDeep(parsed);
}

export {
	type DynamicToolEnvelope,
	okResponse,
	refusedResponse,
	approvalRequiredResponse,
	outcomeUnknownResponse,
	parseResponseText,
};

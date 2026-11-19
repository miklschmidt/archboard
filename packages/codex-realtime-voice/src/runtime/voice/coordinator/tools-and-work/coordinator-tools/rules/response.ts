import { canonicalToolResult } from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/tool-results.ts";
import {
	outcomeUnknownEnvelope,
	toolResponseFor,
	type DynamicToolRefusalReason,
} from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/dynamic-tool-envelopes.ts";
import { type CoordinatorToolName } from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/manifest.ts";
import type {
	CoordinatorToolValueFor,
	DynamicToolResponse,
} from "#runtime/voice/coordinator/tools-and-work/coordinator-tools/protocol/contract.ts";

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
 * Insist on a server-supplied operation identity before an envelope may name one.
 * @param operationId - The wire form of the operation identity.
 * @returns The same identity when it is present and bounded.
 */
function requireOperationId(operationId: string | null | undefined): string {
	if (typeof operationId !== "string" || operationId.length === 0 || operationId.length > 128) {
		throw new TypeError(
			"A coordinator tool response requires one server-supplied operation identity.",
		);
	}
	return operationId;
}

/**
 * Build the successful response for one tool, checked against that tool's reviewed result schema.
 * @param name - The tool that succeeded.
 * @param operationId - The wire form of the server-issued operation identity.
 * @param value - The tool's result.
 * @returns The frozen response.
 */
function okResponse<Name extends CoordinatorToolName>(
	name: Name,
	operationId: string,
	value: CoordinatorToolValueFor<Name>,
): DynamicToolResponse {
	return okPortResponse(name, operationId, value);
}

/**
 * Build the successful response for one tool from the result its port produced, proving the
 * result against the tool's reviewed schema at runtime. This is how a port result whose static
 * type the dispatcher does not track becomes a checked response.
 * @param name - The tool that succeeded.
 * @param operationId - The wire form of the server-issued operation identity.
 * @param value - The result as the port produced it.
 * @returns The frozen response.
 */
function okPortResponse(
	name: CoordinatorToolName,
	operationId: string,
	value: unknown,
): DynamicToolResponse {
	const canonical = canonicalToolResult(name, value);
	return toolResponseFor(
		{ tag: "ok", operationId: requireOperationId(operationId), value: canonical },
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
	return toolResponseFor(
		{ tag: "refused", reason, message: boundedMessage(message) },
		!outerFailure,
	);
}

/**
 * Build the response that tells the coordinator a person must approve before the effect runs.
 * @param operationId - The wire form of the server-issued operation identity.
 * @param summary - What is awaiting approval.
 * @returns The frozen response.
 */
function approvalRequiredResponse(operationId: string, summary: string): DynamicToolResponse {
	return toolResponseFor(
		{
			tag: "approval_required",
			operationId: requireOperationId(operationId),
			summary: boundedMessage(summary),
		},
		true,
	);
}

/**
 * Build the response for an effect whose outcome the server cannot prove either way.
 * @param operationId - The wire form of the server-issued operation identity.
 * @returns The frozen response.
 */
function outcomeUnknownResponse(operationId: string): DynamicToolResponse {
	return toolResponseFor(outcomeUnknownEnvelope(requireOperationId(operationId)), true);
}

export {
	okPortResponse,
	okResponse,
	refusedResponse,
	approvalRequiredResponse,
	outcomeUnknownResponse,
};

import {
	CodexWorkhorseOperationsError,
	type ManageWorkhorseQueueRequest,
	type WorkhorseCoordinatorCall,
} from "@/runtime/codex-workhorse-operations";
import {
	DynamicToolRefusalReasonSchema,
	type CoordinatorToolName,
	type DynamicToolRefusalReason,
	type ManageWorkhorseQueueInput,
} from "@/runtime/codex-coordinator-tool-contract";
import type { OperationId } from "@/shared/codex-workbench-identity";
import type {
	CodexCoordinatorToolsOptions,
	DynamicToolResponse,
} from "@/runtime/codex-coordinator-tools/lib/contract";
import type {
	ValidatedCoordinatorToolCall,
	ValidatedWorkhorseCall,
} from "@/runtime/codex-coordinator-tools/lib/validation";
import {
	okPortResponse,
	okResponse,
	outcomeUnknownResponse,
	refusedResponse,
} from "@/runtime/codex-coordinator-tools/lib/response";

interface IssuedOperationIdentity {
	readonly id: OperationId;
	readonly wire: string;
}

/** The tools whose ok value is the result a workhorse port call produced. */
type WorkhorseToolName = Exclude<CoordinatorToolName, "resolve_spoken_approval">;

/**
 * Prove an operation identity is a current host-issued one and pair it with its wire form.
 * @param options - The dispatcher options carrying the operation authority.
 * @param value - The candidate identity in any form.
 * @returns The typed identity and its wire text.
 */
function operationIdentity(
	options: CodexCoordinatorToolsOptions,
	value: unknown,
): IssuedOperationIdentity {
	const id = options.operation.decoder.parseOperationId(value);
	options.operation.validator.assertCurrentOperationId(id);
	return Object.freeze({ id, wire: options.operation.decoder.serializeOperationId(id) });
}

/**
 * Mint the host operation identity one workhorse effect will run under.
 * @param options - The dispatcher options carrying the operation authority.
 * @returns The fresh identity.
 */
function issueOperationIdentity(options: CodexCoordinatorToolsOptions): IssuedOperationIdentity {
	return operationIdentity(options, options.operation.issuer.mintOperationId());
}

/**
 * Read the spoken-approval gate's current classifier operation identity, if it has a valid one.
 * @param options - The dispatcher options carrying the gate and operation authority.
 * @returns The identity, or null when the gate has none or it is not current.
 */
function captureSpokenOperationIdentity(
	options: CodexCoordinatorToolsOptions,
): IssuedOperationIdentity | null {
	try {
		const value = options.spokenApproval.snapshot().operationId;
		return value === null ? null : operationIdentity(options, value);
	} catch {
		return null;
	}
}

/**
 * A diagnostic from any thrown value.
 * @param error - Whatever was thrown.
 * @returns Its message, or a placeholder.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error && error.message.length > 0 ? error.message : "unknown error";
}

/**
 * Read one field off a thrown value without assuming its shape.
 * @param error - Whatever was thrown.
 * @param field - The property to read.
 * @returns The property value, or undefined when the error is not an object.
 */
function errorField(error: unknown, field: string): unknown {
	return error !== null && typeof error === "object" ? Reflect.get(error, field) : undefined;
}

/**
 * Classify what a workhorse error says about the effect it interrupted.
 * @param error - Whatever the workhorse port threw.
 * @returns The delivery outcome it names, or null when it names none.
 */
function outcomeFromError(error: unknown): "not_delivered" | "outcome_unknown" | null {
	if (error instanceof CodexWorkhorseOperationsError && error.code === "outcome_unknown") {
		return "outcome_unknown";
	}
	const outcome = errorField(error, "outcome");
	return outcome === "not_delivered" || outcome === "outcome_unknown" ? outcome : null;
}

/**
 * Read the reviewed refusal reason a thrown error carries as its code, if any.
 * @param error - Whatever was thrown.
 * @returns The refusal reason, or null when the code is not a reviewed reason.
 */
function refusalFromError(error: unknown): DynamicToolRefusalReason | null {
	const code = DynamicToolRefusalReasonSchema.safeParse(errorField(error, "code"));
	return code.success ? code.data : null;
}

/**
 * Whether a call changes workhorse state, so an unproven outcome must be reported as unknown
 * rather than refused.
 * @param call - The validated call.
 * @returns True for every workhorse tool except reads.
 */
function isMutation(call: ValidatedCoordinatorToolCall): boolean {
	return (
		call.tool === "delegate_to_workhorse" ||
		call.tool === "steer_workhorse" ||
		(call.tool === "manage_workhorse_queue" && call.input.operation !== "list")
	);
}

/**
 * Build the queue request for the workhorse port, attaching the issued operation to mutations.
 * @param call - The coordinator call.
 * @param input - The parsed queue input.
 * @param operation - The issued operation identity.
 * @returns The port request.
 */
function queueRequest(
	call: WorkhorseCoordinatorCall,
	input: ManageWorkhorseQueueInput,
	operation: IssuedOperationIdentity,
): ManageWorkhorseQueueRequest {
	if (input.operation === "list") {
		return { call, operation: "list" };
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the reviewed input schema carries submission ids as plain strings while the port brands them as QueuedSubmissionId; the brand is nominal, the port passes the ids to Codex unchanged, and the session boundary parses them as issued identities before they reach the wire, so branding them here would only move that refusal.
	return { call, operationId: operation.id, ...input } as ManageWorkhorseQueueRequest;
}

/**
 * Start one workhorse tool through the operations port. The port's promise is returned as it is,
 * with its result widened to unknown, so the caller's single await sits directly on the port and
 * the result is proven against the tool's reviewed schema when the response is built.
 * @param operations - The workhorse operations port.
 * @param validated - The validated workhorse call.
 * @param operation - The issued operation identity the effect runs under.
 * @returns The port's pending result.
 */
function invokeWorkhorse(
	operations: CodexCoordinatorToolsOptions["operations"],
	validated: ValidatedWorkhorseCall,
	operation: IssuedOperationIdentity,
): Promise<unknown> {
	const { call } = validated;
	if (validated.tool === "inspect_workhorse") {
		return operations.inspect({ call, ...validated.input });
	}
	if (validated.tool === "delegate_to_workhorse") {
		return operations.delegate({ call, ...validated.input, operationId: operation.id });
	}
	if (validated.tool === "manage_workhorse_queue") {
		return operations.manageQueue(queueRequest(call, validated.input, operation));
	}
	return operations.steer({
		call,
		expectedTurnId: validated.expectedTurnId,
		...validated.input,
		operationId: operation.id,
	});
}

/**
 * Build the successful response for a workhorse port result under its still-current operation.
 * The result is narrowed by the tool's reviewed result schema rather than by a static pairing of
 * tool name and port type.
 * @param options - The dispatcher options carrying the operation authority.
 * @param tool - The tool that produced the result.
 * @param operation - The issued operation identity the effect ran under.
 * @param result - The result as the port produced it.
 * @returns The frozen response.
 */
function workhorseResponse(
	options: CodexCoordinatorToolsOptions,
	tool: WorkhorseToolName,
	operation: IssuedOperationIdentity,
	result: unknown,
): DynamicToolResponse {
	const current = operationIdentity(options, operation.id);
	if (current.id !== operation.id) {
		throw new TypeError("The workhorse operation identity changed.");
	}
	return okPortResponse(tool, current.wire, result);
}

/**
 * Whether a thrown error belongs to this call's operation; an error naming no operation is taken
 * as this call's own.
 * @param options - The dispatcher options carrying the operation authority.
 * @param error - Whatever the workhorse port threw.
 * @param operation - The issued operation identity the effect ran under.
 * @returns False only when the error names a different or invalid operation.
 */
function errorUsesOperation(
	options: CodexCoordinatorToolsOptions,
	error: unknown,
	operation: IssuedOperationIdentity,
): boolean {
	const value = errorField(error, "operationId");
	if (value === null || value === undefined) {
		return true;
	}
	try {
		return operationIdentity(options, value).id === operation.id;
	} catch {
		return false;
	}
}

/**
 * The response for an error whose delivery outcome could not be classified.
 * @param validated - The validated call.
 * @param error - Whatever the workhorse port threw.
 * @param operation - The issued operation identity the effect ran under.
 * @returns A refusal when the error names a reviewed reason or the call was a read, otherwise an
 * unknown outcome.
 */
function unclassifiedErrorResponse(
	validated: ValidatedCoordinatorToolCall,
	error: unknown,
	operation: IssuedOperationIdentity,
): DynamicToolResponse {
	const reason = refusalFromError(error);
	if (reason !== null) {
		return refusedResponse(reason, errorMessage(error));
	}
	if (isMutation(validated)) {
		return outcomeUnknownResponse(operation.wire);
	}
	return refusedResponse("system_error", `The workhorse tool failed: ${errorMessage(error)}`);
}

/**
 * Translate a workhorse port failure into the response the coordinator receives.
 * @param options - The dispatcher options carrying the operation authority.
 * @param validated - The validated call.
 * @param error - Whatever the workhorse port threw.
 * @param operation - The issued operation identity the effect ran under.
 * @returns The frozen response.
 */
function responseForWorkhorseError(
	options: CodexCoordinatorToolsOptions,
	validated: ValidatedCoordinatorToolCall,
	error: unknown,
	operation: IssuedOperationIdentity,
): DynamicToolResponse {
	if (!errorUsesOperation(options, error, operation)) {
		if (isMutation(validated)) {
			return outcomeUnknownResponse(operation.wire);
		}
		return refusedResponse(
			"system_error",
			"The workhorse returned an operation identity that does not match this call.",
		);
	}
	const outcome = outcomeFromError(error);
	if (outcome === "outcome_unknown") {
		return outcomeUnknownResponse(operation.wire);
	}
	if (outcome === "not_delivered") {
		return refusedResponse(
			"system_error",
			`The workhorse operation was not delivered: ${errorMessage(error)}`,
		);
	}
	return unclassifiedErrorResponse(validated, error, operation);
}

/**
 * Build the response for a settled spoken approval.
 * @param result - What the spoken approval gate returned.
 * @param operation - The gate's classifier operation identity captured before resolving.
 * @returns The frozen response.
 */
function spokenResponse(
	result: Awaited<ReturnType<CodexCoordinatorToolsOptions["spokenApproval"]["resolve"]>>,
	operation: IssuedOperationIdentity | null,
): DynamicToolResponse {
	if (result.tag === "refused") {
		return refusedResponse(result.reason, result.message);
	}
	if (operation === null) {
		return refusedResponse(
			"system_error",
			"The spoken approval settled without its canonical classifier operation identity.",
		);
	}
	return okResponse("resolve_spoken_approval", operation.wire, {
		verdict: result.value.verdict,
		settlement: result.value.settlement,
	});
}

export {
	type IssuedOperationIdentity,
	type WorkhorseToolName,
	issueOperationIdentity,
	captureSpokenOperationIdentity,
	isMutation,
	invokeWorkhorse,
	workhorseResponse,
	responseForWorkhorseError,
	spokenResponse,
};

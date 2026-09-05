import {
	CodexWorkhorseOperationsError,
	type CodexWorkhorseOperations,
} from "../../codex-workhorse-operations/index.js";
import type {
	DelegateToWorkhorseInput,
	DelegateToWorkhorseResult,
	DynamicToolRefusalReason,
	InspectWorkhorseInput,
	InspectWorkhorseResult,
	ManageWorkhorseQueueInput,
	ManageWorkhorseQueueResult,
	ResolveSpokenApprovalInput,
	SteerWorkhorseInput,
	SteerWorkhorseResult,
} from "../../codex-coordinator-tool-contract/index.js";
import type { OperationId } from "../../../shared/codex-workbench-identity/index.js";
import type { CodexCoordinatorToolsOptions, DynamicToolResponse } from "./contract.js";
import type { ValidatedCoordinatorToolCall } from "./validation.js";
import { okResponse, outcomeUnknownResponse, refusedResponse } from "./response.js";

export interface IssuedOperationIdentity {
	readonly id: OperationId;
	readonly wire: string;
}

function operationIdentity(
	options: CodexCoordinatorToolsOptions,
	value: unknown,
): IssuedOperationIdentity {
	const id = options.operation.decoder.parseOperationId(value);
	options.operation.validator.assertCurrentOperationId(id);
	return Object.freeze({ id, wire: options.operation.decoder.serializeOperationId(id) });
}

export function issueOperationIdentity(
	options: CodexCoordinatorToolsOptions,
): IssuedOperationIdentity {
	return operationIdentity(options, options.operation.issuer.mintOperationId());
}

export function captureSpokenOperationIdentity(
	options: CodexCoordinatorToolsOptions,
): IssuedOperationIdentity | null {
	try {
		const value = options.spokenApproval.snapshot().operationId;
		return value === null ? null : operationIdentity(options, value);
	} catch {
		return null;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error && error.message.length > 0 ? error.message : "unknown error";
}

function errorField(error: unknown, field: string): unknown {
	return error !== null && typeof error === "object" ? Reflect.get(error, field) : undefined;
}

function outcomeFromError(error: unknown): "not_delivered" | "outcome_unknown" | null {
	const outcome = errorField(error, "outcome");
	return outcome === "not_delivered" || outcome === "outcome_unknown" ? outcome : null;
}

function refusalFromError(error: unknown): DynamicToolRefusalReason | null {
	const code = errorField(error, "code");
	if (
		code === "invalid_call" ||
		code === "not_ready" ||
		code === "not_loaded" ||
		code === "not_controllable" ||
		code === "system_error" ||
		code === "stale_child" ||
		code === "prior_epoch" ||
		code === "unknown_provenance" ||
		code === "approval_declined" ||
		code === "cycle" ||
		code === "busy" ||
		code === "expired" ||
		code === "unsupported"
	) {
		return code;
	}
	return null;
}

export function isMutation(call: ValidatedCoordinatorToolCall): boolean {
	return (
		call.tool === "delegate_to_workhorse" ||
		call.tool === "steer_workhorse" ||
		(call.tool === "manage_workhorse_queue" &&
			(call.input as ManageWorkhorseQueueInput).operation !== "list")
	);
}

export function invokeWorkhorse(
	operations: CodexCoordinatorToolsOptions["operations"],
	validated: ValidatedCoordinatorToolCall,
	operation: IssuedOperationIdentity,
): Promise<unknown> {
	switch (validated.tool) {
		case "inspect_workhorse":
			return operations.inspect({
				call: validated.call,
				...(validated.input as InspectWorkhorseInput),
			});
		case "delegate_to_workhorse":
			return operations.delegate({
				call: validated.call,
				...(validated.input as DelegateToWorkhorseInput),
				operationId: operation.id,
			});
		case "manage_workhorse_queue": {
			const input = validated.input as ManageWorkhorseQueueInput;
			return operations.manageQueue({
				call: validated.call,
				...(input.operation === "list" ? {} : { operationId: operation.id }),
				...input,
			} as Parameters<CodexWorkhorseOperations["manageQueue"]>[0]);
		}
		case "steer_workhorse":
			if (validated.expectedTurnId === null) {
				return Promise.reject(new Error("The host did not supply expectedTurnId."));
			}
			return operations.steer({
				call: validated.call,
				expectedTurnId: validated.expectedTurnId,
				...(validated.input as SteerWorkhorseInput),
				operationId: operation.id,
			});
		case "resolve_spoken_approval":
			return Promise.reject(new Error("voice calls do not use the workhorse operations port"));
	}
}

export function workhorseResponse(
	options: CodexCoordinatorToolsOptions,
	validated: ValidatedCoordinatorToolCall,
	operation: IssuedOperationIdentity,
	result: unknown,
): DynamicToolResponse {
	const current = operationIdentity(options, operation.id);
	if (current.id !== operation.id) {
		throw new TypeError("The workhorse operation identity changed.");
	}
	switch (validated.tool) {
		case "inspect_workhorse":
			return okResponse(validated.tool, current.wire, result as InspectWorkhorseResult);
		case "delegate_to_workhorse":
			return okResponse(validated.tool, current.wire, result as DelegateToWorkhorseResult);
		case "manage_workhorse_queue":
			return okResponse(validated.tool, current.wire, result as ManageWorkhorseQueueResult);
		case "steer_workhorse":
			return okResponse(validated.tool, current.wire, result as SteerWorkhorseResult);
		case "resolve_spoken_approval":
			throw new Error("voice calls do not use the workhorse response port");
	}
}

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

export function responseForWorkhorseError(
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
	if (
		outcome === "outcome_unknown" ||
		(error instanceof CodexWorkhorseOperationsError && error.code === "outcome_unknown")
	) {
		return outcomeUnknownResponse(operation.wire);
	}
	if (outcome === "not_delivered") {
		return refusedResponse(
			"system_error",
			`The workhorse operation was not delivered: ${errorMessage(error)}`,
		);
	}
	const reason = refusalFromError(error);
	if (reason !== null) {
		return refusedResponse(reason, errorMessage(error));
	}
	if (isMutation(validated)) {
		return outcomeUnknownResponse(operation.wire);
	}
	return refusedResponse("system_error", `The workhorse tool failed: ${errorMessage(error)}`);
}

export function spokenResponse(
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

export function spokenInput(call: ValidatedCoordinatorToolCall): ResolveSpokenApprovalInput {
	return call.input as ResolveSpokenApprovalInput;
}

import { createHash } from "node:crypto";

import {
	ARCHBOARD_VOICE_MANIFEST_SHA256,
	ARCHBOARD_VOICE_TOOL_NAMES,
	ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	ARCHBOARD_WORKHORSE_TOOL_NAMES,
	DelegateToWorkhorseInputSchema,
	InspectWorkhorseInputSchema,
	ManageWorkhorseQueueInputSchema,
	ResolveSpokenApprovalInputSchema,
	SteerWorkhorseInputSchema,
	parseCoordinatorToolInput,
	type CoordinatorToolName,
	type DelegateToWorkhorseInput,
	type InspectWorkhorseInput,
	type ManageWorkhorseQueueInput,
	type NamespaceName,
	type ResolveSpokenApprovalInput,
	type SteerWorkhorseInput,
} from "../../codex-coordinator-tool-contract/index.js";
import type { CodexCoordinatorToolsOptions } from "./contract.js";
import {
	COORDINATOR_TOOLS_OWNER,
	type CoordinatorToolCoordinatorAuthority,
	type CoordinatorToolsServerRequest,
} from "./contract.js";
import type {
	DynamicServerRequest,
	TransportServerRequest,
} from "../../codex-transport/server-requests.js";
import type {
	LogicalToolCallCorrelation,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import { IdentityValidationError } from "../../../shared/codex-workbench-identity/index.js";
import {
	type WorkhorseCoordinatorCall,
	type WorkhorseOperationBinding,
} from "../../codex-workhorse-operations/index.js";

export type CoordinatorToolInput =
	| InspectWorkhorseInput
	| DelegateToWorkhorseInput
	| ManageWorkhorseQueueInput
	| SteerWorkhorseInput
	| ResolveSpokenApprovalInput;

export interface ValidatedCoordinatorToolCall {
	readonly namespace: NamespaceName;
	readonly tool: CoordinatorToolName;
	readonly call: WorkhorseCoordinatorCall;
	readonly input: CoordinatorToolInput;
	readonly inputFingerprint: string;
	readonly coordinator: CoordinatorToolCoordinatorAuthority;
	readonly workhorseBinding: WorkhorseOperationBinding | null;
	readonly expectedTurnId: TurnId | null;
}

function canonicalInput(tool: CoordinatorToolName, input: CoordinatorToolInput): string {
	switch (tool) {
		case "inspect_workhorse":
			return "{}";
		case "delegate_to_workhorse": {
			const value = input as DelegateToWorkhorseInput;
			return JSON.stringify({ input: value.input, transcriptDelta: value.transcriptDelta });
		}
		case "manage_workhorse_queue": {
			const value = input as ManageWorkhorseQueueInput;
			switch (value.operation) {
				case "list":
					return JSON.stringify({ operation: value.operation });
				case "add":
					return JSON.stringify({ operation: value.operation, prompt: value.prompt });
				case "update":
					return JSON.stringify({
						operation: value.operation,
						submissionId: value.submissionId,
						prompt: value.prompt,
					});
				case "delete":
				case "start":
					return JSON.stringify({
						operation: value.operation,
						submissionId: value.submissionId,
					});
				case "reorder":
					return JSON.stringify({
						operation: value.operation,
						orderedSubmissionIds: value.orderedSubmissionIds,
					});
			}
		}
		case "steer_workhorse":
			return JSON.stringify({ input: (input as SteerWorkhorseInput).input });
		case "resolve_spoken_approval":
			return JSON.stringify({ verdict: (input as ResolveSpokenApprovalInput).verdict });
	}
}

function inputFingerprint(
	namespace: NamespaceName,
	tool: CoordinatorToolName,
	input: CoordinatorToolInput,
): string {
	return createHash("sha256")
		.update(namespace, "utf8")
		.update("\0", "utf8")
		.update(tool, "utf8")
		.update("\0", "utf8")
		.update(canonicalInput(tool, input), "utf8")
		.digest("hex");
}

export class CoordinatorToolValidationError extends Error {
	override readonly name = "CoordinatorToolValidationError";
	readonly reason:
		| "invalid_call"
		| "not_ready"
		| "stale_child"
		| "prior_epoch"
		| "unknown_provenance"
		| "not_loaded"
		| "not_controllable"
		| "system_error"
		| "busy";

	constructor(reason: CoordinatorToolValidationError["reason"], message: string, cause?: unknown) {
		super(message, { cause });
		this.reason = reason;
	}
}

function fail(
	reason: CoordinatorToolValidationError["reason"],
	message: string,
	cause?: unknown,
): never {
	throw new CoordinatorToolValidationError(reason, message, cause);
}

function sameCall(left: LogicalToolCallCorrelation, right: LogicalToolCallCorrelation): boolean {
	return (
		left.child === right.child &&
		left.epoch === right.epoch &&
		left.threadId === right.threadId &&
		left.turnId === right.turnId &&
		left.callId === right.callId &&
		left.namespace === right.namespace &&
		left.tool === right.tool &&
		left.manifestHash === right.manifestHash
	);
}

function mapIdentityFailure(error: unknown): CoordinatorToolValidationError {
	if (error instanceof IdentityValidationError) {
		if (error.code === "wrong-child")
			return new CoordinatorToolValidationError(
				"stale_child",
				"The coordinator tool call belongs to another Codex child.",
				error,
			);
		if (error.code === "stale-epoch")
			return new CoordinatorToolValidationError(
				"prior_epoch",
				"The coordinator tool call belongs to a prior child epoch.",
				error,
			);
		if (error.code === "wrong-domain")
			return new CoordinatorToolValidationError(
				"unknown_provenance",
				"The coordinator tool call contains an identity from the wrong domain.",
				error,
			);
	}
	return new CoordinatorToolValidationError(
		"invalid_call",
		"The coordinator tool call identity is not a current issued correlation.",
		error,
	);
}

function assertRequestEnvelope(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
): void {
	if (request.owner !== COORDINATOR_TOOLS_OWNER || request.method !== "item/tool/call")
		fail(
			"invalid_call",
			"Only coordinator-owned item/tool/call requests may enter this dispatcher.",
		);
	if (request.correlation.requestId !== request.requestId)
		fail("invalid_call", "The dynamic request and wire correlation use different request ids.");
	if (request.correlation.child !== request.child || request.correlation.epoch !== request.epoch)
		fail("invalid_call", "The dynamic request correlation is not internally consistent.");
	try {
		options.identity.validator.assertCurrentEpoch(request.child, request.epoch);
	} catch (error) {
		throw mapIdentityFailure(error);
	}
	try {
		const correlation = options.identity.decoder.parseWireRequestCorrelation(request.correlation);
		if (
			correlation.child !== request.child ||
			correlation.epoch !== request.epoch ||
			correlation.requestId !== request.requestId
		)
			fail("invalid_call", "The dynamic wire correlation is not internally consistent.");
	} catch (error) {
		if (error instanceof CoordinatorToolValidationError) throw error;
		throw mapIdentityFailure(error);
	}
}

function assertLogicalCall(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
): LogicalToolCallCorrelation {
	let call: LogicalToolCallCorrelation;
	try {
		call = options.identity.decoder.parseLogicalToolCallCorrelation(request.logicalCall);
	} catch (error) {
		throw mapIdentityFailure(error);
	}
	if (call.child !== request.child || call.epoch !== request.epoch)
		fail("invalid_call", "The logical call does not belong to the dynamic request epoch.");
	if (typeof request.params.namespace !== "string")
		fail("invalid_call", "The dynamic tool namespace must be present.");
	if (
		call.namespace !== request.params.namespace ||
		call.tool !== request.params.tool ||
		call.threadId === undefined ||
		call.turnId === undefined ||
		call.callId === undefined
	)
		fail("invalid_call", "The logical call does not match the app-server tool-call fields.");
	try {
		if (options.identity.decoder.serializeCodexIdentity(call.threadId) !== request.params.threadId)
			fail(
				"unknown_provenance",
				"The caller thread identity is not the issued logical-call target.",
			);
		if (options.identity.decoder.serializeCodexIdentity(call.turnId) !== request.params.turnId)
			fail("unknown_provenance", "The caller turn identity is not the issued logical-call target.");
		if (options.identity.decoder.serializeCodexIdentity(call.callId) !== request.params.callId)
			fail("unknown_provenance", "The dynamic call identity is not the issued logical-call id.");
	} catch (error) {
		if (error instanceof CoordinatorToolValidationError) throw error;
		throw mapIdentityFailure(error);
	}
	const expectedHash =
		call.namespace === "archboard_workhorse"
			? ARCHBOARD_WORKHORSE_MANIFEST_SHA256
			: call.namespace === "archboard_voice"
				? ARCHBOARD_VOICE_MANIFEST_SHA256
				: null;
	if (expectedHash === null || call.manifestHash !== expectedHash)
		fail("invalid_call", "The dynamic call does not carry the reviewed namespace manifest hash.");
	const current = options.authority.currentCall();
	if (current === null || !sameCall(current, call))
		fail("invalid_call", "The coordinator call is no longer the current executing call.");
	return call;
}

function currentCoordinator(
	options: CodexCoordinatorToolsOptions,
	call: LogicalToolCallCorrelation,
): CoordinatorToolCoordinatorAuthority {
	const current = options.authority.currentCoordinator();
	if (current?.state !== "ready")
		fail("not_ready", "The coordinator is not ready to execute dynamic tools.");
	if (current.childId !== options.identity.validator.childId)
		fail("stale_child", "The coordinator belongs to another Codex child.");
	if (current.epoch !== options.identity.validator.epoch)
		fail("prior_epoch", "The coordinator belongs to a prior Codex child epoch.");
	if (current.threadId === null || current.threadId !== call.threadId)
		fail("invalid_call", "The dynamic call did not originate from the current coordinator thread.");
	return current;
}

function workhorseBinding(
	options: CodexCoordinatorToolsOptions,
	call: LogicalToolCallCorrelation,
	coordinator: CoordinatorToolCoordinatorAuthority,
): WorkhorseOperationBinding {
	const binding = options.authority.currentWorkhorseBinding();
	if (binding === null) fail("not_ready", "The coordinator has no current host-bound workhorse.");
	if (binding.childId !== options.identity.validator.childId)
		fail("stale_child", "The bound workhorse belongs to another Codex child.");
	if (binding.epoch !== options.identity.validator.epoch)
		fail("prior_epoch", "The bound workhorse belongs to a prior Codex child epoch.");
	if (
		binding.coordinator.threadId !== call.threadId ||
		binding.coordinator.childId !== coordinator.childId ||
		binding.coordinator.epoch !== coordinator.epoch
	)
		fail("unknown_provenance", "The host workhorse binding is not attached to this coordinator.");
	if (
		binding.workhorse.childId !== binding.childId ||
		binding.workhorse.epoch !== binding.epoch ||
		binding.workhorse.threadId === binding.coordinator.threadId
	)
		fail(
			"unknown_provenance",
			"The workhorse target is missing or points back to the coordinator.",
		);
	if (binding.workhorse.operationId.length === 0)
		fail("unknown_provenance", "The workhorse binding has no host ownership proof.");
	return binding;
}

function parseInput(
	namespace: NamespaceName,
	tool: CoordinatorToolName,
	value: unknown,
): CoordinatorToolInput {
	try {
		const parsed = parseCoordinatorToolInput(namespace, tool, value);
		switch (tool) {
			case "inspect_workhorse":
				return InspectWorkhorseInputSchema.parse(parsed);
			case "delegate_to_workhorse":
				return DelegateToWorkhorseInputSchema.parse(parsed);
			case "manage_workhorse_queue":
				return ManageWorkhorseQueueInputSchema.parse(parsed);
			case "steer_workhorse":
				return SteerWorkhorseInputSchema.parse(parsed);
			case "resolve_spoken_approval":
				return ResolveSpokenApprovalInputSchema.parse(parsed);
		}
	} catch (error) {
		fail(
			"invalid_call",
			"The dynamic tool arguments do not match the reviewed closed schema.",
			error,
		);
	}
}

export function validateCoordinatorToolRequest(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
): ValidatedCoordinatorToolCall {
	assertRequestEnvelope(options, request);
	const call = assertLogicalCall(options, request);
	const namespace = call.namespace as NamespaceName;
	const tool = call.tool as CoordinatorToolName;
	if (
		(namespace === "archboard_workhorse" &&
			!ARCHBOARD_WORKHORSE_TOOL_NAMES.includes(
				tool as (typeof ARCHBOARD_WORKHORSE_TOOL_NAMES)[number],
			)) ||
		(namespace === "archboard_voice" &&
			!ARCHBOARD_VOICE_TOOL_NAMES.includes(tool as (typeof ARCHBOARD_VOICE_TOOL_NAMES)[number]))
	)
		fail("invalid_call", `The reviewed namespace does not declare ${tool}.`);
	const coordinator = currentCoordinator(options, call);
	const input = parseInput(namespace, tool, request.params.arguments);
	const fingerprint = inputFingerprint(namespace, tool, input);
	if (namespace === "archboard_voice")
		return Object.freeze({
			namespace,
			tool,
			call,
			input,
			inputFingerprint: fingerprint,
			coordinator,
			workhorseBinding: null,
			expectedTurnId: null,
		});
	const binding = workhorseBinding(options, call, coordinator);
	let expectedTurnId: TurnId | null = null;
	if (tool === "steer_workhorse") {
		expectedTurnId = options.authority.expectedTurnId();
		if (expectedTurnId === null) fail("busy", "The host has not proven an active workhorse turn.");
		try {
			options.identity.decoder.parseTurnId(expectedTurnId);
		} catch (error) {
			throw mapIdentityFailure(error);
		}
	}
	return Object.freeze({
		namespace,
		tool,
		call,
		input,
		inputFingerprint: fingerprint,
		coordinator,
		workhorseBinding: binding,
		expectedTurnId,
	});
}

export function isCoordinatorToolRequest(
	request: TransportServerRequest,
): request is CoordinatorToolsServerRequest {
	return request.owner === COORDINATOR_TOOLS_OWNER && request.method === "item/tool/call";
}

export function callKey(request: DynamicServerRequest): string {
	return `${request.child}\u0000${request.epoch}\u0000${String(request.requestId)}`;
}

export function logicalCallKey(call: LogicalToolCallCorrelation): string {
	return [
		call.child,
		call.epoch,
		call.threadId,
		call.turnId,
		call.callId,
		call.namespace,
		call.tool,
		call.manifestHash,
	].join("\u0000");
}

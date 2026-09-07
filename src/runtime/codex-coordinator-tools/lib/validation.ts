import { createHash } from "node:crypto";

import {
	ARCHBOARD_VOICE_MANIFEST_SHA256,
	ARCHBOARD_VOICE_TOOL_NAMES,
	ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	ARCHBOARD_WORKHORSE_TOOL_NAMES,
	COORDINATOR_NAMESPACE_NAMES,
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
} from "@/runtime/codex-coordinator-tool-contract";
import type { CodexCoordinatorToolsOptions } from "@/runtime/codex-coordinator-tools/lib/contract";
import {
	COORDINATOR_TOOLS_OWNER,
	type CoordinatorToolCoordinatorAuthority,
	type CoordinatorToolsServerRequest,
} from "@/runtime/codex-coordinator-tools/lib/contract";
import type {
	DynamicServerRequest,
	TransportServerRequest,
} from "@/runtime/codex-transport/server-requests";
import type { LogicalToolCallCorrelation, TurnId } from "@/shared/codex-workbench-identity";
import { IdentityValidationError, logicalToolCallKey } from "@/shared/codex-workbench-identity";
import {
	type WorkhorseCoordinatorCall,
	type WorkhorseOperationBinding,
} from "@/runtime/codex-workhorse-operations";
import { z } from "zod";

type CoordinatorToolInput =
	| InspectWorkhorseInput
	| DelegateToWorkhorseInput
	| ManageWorkhorseQueueInput
	| SteerWorkhorseInput
	| ResolveSpokenApprovalInput;

/** The reviewed namespace and tool name pair a logical call may carry. */
const DeclaredToolSchema = z.union([
	z.object({
		namespace: z.literal("archboard_workhorse"),
		tool: z.enum(ARCHBOARD_WORKHORSE_TOOL_NAMES),
	}),
	z.object({
		namespace: z.literal("archboard_voice"),
		tool: z.enum(ARCHBOARD_VOICE_TOOL_NAMES),
	}),
]);

type DeclaredTool = z.infer<typeof DeclaredToolSchema>;

/** One parsed tool input, tagged with the tool so its shape is known wherever it travels. */
type ParsedToolInput =
	| { readonly tool: "inspect_workhorse"; readonly input: InspectWorkhorseInput }
	| { readonly tool: "delegate_to_workhorse"; readonly input: DelegateToWorkhorseInput }
	| { readonly tool: "manage_workhorse_queue"; readonly input: ManageWorkhorseQueueInput }
	| { readonly tool: "steer_workhorse"; readonly input: SteerWorkhorseInput }
	| { readonly tool: "resolve_spoken_approval"; readonly input: ResolveSpokenApprovalInput };

interface ValidatedCallEvidence {
	readonly call: WorkhorseCoordinatorCall;
	readonly inputFingerprint: string;
	readonly coordinator: CoordinatorToolCoordinatorAuthority;
}

type ValidatedWorkhorseCall = ValidatedCallEvidence & {
	readonly namespace: "archboard_workhorse";
	readonly workhorseBinding: WorkhorseOperationBinding;
} & (
		| {
				readonly tool: "inspect_workhorse";
				readonly input: InspectWorkhorseInput;
				readonly expectedTurnId: null;
		  }
		| {
				readonly tool: "delegate_to_workhorse";
				readonly input: DelegateToWorkhorseInput;
				readonly expectedTurnId: null;
		  }
		| {
				readonly tool: "manage_workhorse_queue";
				readonly input: ManageWorkhorseQueueInput;
				readonly expectedTurnId: null;
		  }
		| {
				readonly tool: "steer_workhorse";
				readonly input: SteerWorkhorseInput;
				readonly expectedTurnId: TurnId;
		  }
	);

type ValidatedVoiceCall = ValidatedCallEvidence & {
	readonly namespace: "archboard_voice";
	readonly tool: "resolve_spoken_approval";
	readonly input: ResolveSpokenApprovalInput;
	readonly workhorseBinding: null;
	readonly expectedTurnId: null;
};

type ValidatedCoordinatorToolCall = ValidatedWorkhorseCall | ValidatedVoiceCall;

/**
 * Canonical text for the queue operations that name exactly one submission.
 * @param value - A delete or start request.
 * @returns The JSON text whose key order is part of the fingerprint contract.
 */
function canonicalQueueTarget(
	value: Extract<ManageWorkhorseQueueInput, { readonly operation: "delete" | "start" }>,
): string {
	return JSON.stringify({ operation: value.operation, submissionId: value.submissionId });
}

/**
 * Canonical text for a queue operation: only the fields the reviewed schema declares, in a fixed
 * key order, so replays with reordered arguments fingerprint identically.
 * @param value - The parsed queue input.
 * @returns The JSON text to hash.
 */
function canonicalQueueInput(value: ManageWorkhorseQueueInput): string {
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
		case "reorder":
			return JSON.stringify({
				operation: value.operation,
				orderedSubmissionIds: value.orderedSubmissionIds,
			});
		default:
			return canonicalQueueTarget(value);
	}
}

/**
 * Canonical text for any tool input, so equal arguments always hash equally.
 * @param parsed - The tool and its parsed input.
 * @returns The JSON text to hash.
 */
function canonicalInput(parsed: ParsedToolInput): string {
	switch (parsed.tool) {
		case "inspect_workhorse":
			return "{}";
		case "delegate_to_workhorse":
			return JSON.stringify({
				input: parsed.input.input,
				transcriptDelta: parsed.input.transcriptDelta,
			});
		case "manage_workhorse_queue":
			return canonicalQueueInput(parsed.input);
		case "steer_workhorse":
			return JSON.stringify({ input: parsed.input.input });
		default:
			return JSON.stringify({ verdict: parsed.input.verdict });
	}
}

/**
 * Hash the namespace, tool and canonical input so a replayed logical call can prove it carries the
 * same arguments as the original without retaining those arguments.
 * @param namespace - The reviewed namespace.
 * @param parsed - The tool and its parsed input.
 * @returns A hex SHA-256 digest.
 */
function inputFingerprint(namespace: NamespaceName, parsed: ParsedToolInput): string {
	return createHash("sha256")
		.update(namespace, "utf8")
		.update("\0", "utf8")
		.update(parsed.tool, "utf8")
		.update("\0", "utf8")
		.update(canonicalInput(parsed), "utf8")
		.digest("hex");
}

class CoordinatorToolValidationError extends Error {
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

	/**
	 * Build a validation failure that carries the dynamic-tool refusal reason to report.
	 * @param reason - The refusal reason the response will name.
	 * @param message - The diagnostic for the caller.
	 * @param cause - The underlying failure, when there is one.
	 */
	constructor(reason: CoordinatorToolValidationError["reason"], message: string, cause?: unknown) {
		super(message, { cause });
		this.reason = reason;
	}
}

/**
 * Throw a validation failure; exists so each check reads as one line.
 * @param reason - The refusal reason the response will name.
 * @param message - The diagnostic for the caller.
 * @param cause - The underlying failure, when there is one.
 * @returns Never; it always throws.
 */
function fail(
	reason: CoordinatorToolValidationError["reason"],
	message: string,
	cause?: unknown,
): never {
	throw new CoordinatorToolValidationError(reason, message, cause);
}

const LOGICAL_CALL_FIELDS = [
	"child",
	"epoch",
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"manifestHash",
] as const satisfies readonly (keyof LogicalToolCallCorrelation)[];

/**
 * Compare two logical call correlations field by field.
 * @param left - One correlation.
 * @param right - The other correlation.
 * @returns Whether every field matches.
 */
function sameCall(left: LogicalToolCallCorrelation, right: LogicalToolCallCorrelation): boolean {
	return LOGICAL_CALL_FIELDS.every((field) => left[field] === right[field]);
}

interface IdentityRefusal {
	readonly reason: CoordinatorToolValidationError["reason"];
	readonly message: string;
}

const IDENTITY_REFUSALS: Readonly<
	Partial<Record<IdentityValidationError["code"], IdentityRefusal>>
> = Object.freeze({
	"wrong-child": {
		reason: "stale_child",
		message: "The coordinator tool call belongs to another Codex child.",
	},
	"stale-epoch": {
		reason: "prior_epoch",
		message: "The coordinator tool call belongs to a prior child epoch.",
	},
	"wrong-domain": {
		reason: "unknown_provenance",
		message: "The coordinator tool call contains an identity from the wrong domain.",
	},
});

/**
 * Translate an identity-authority failure into the refusal reason the coordinator reports.
 * @param error - Whatever the identity authority threw.
 * @returns The validation failure to throw, carrying the original as its cause.
 */
function mapIdentityFailure(error: unknown): CoordinatorToolValidationError {
	const refusal =
		error instanceof IdentityValidationError ? IDENTITY_REFUSALS[error.code] : undefined;
	if (refusal !== undefined) {
		return new CoordinatorToolValidationError(refusal.reason, refusal.message, error);
	}
	return new CoordinatorToolValidationError(
		"invalid_call",
		"The coordinator tool call identity is not a current issued correlation.",
		error,
	);
}

/**
 * Rethrow a validation failure as-is and wrap any other error as an identity failure.
 * @param error - Whatever a check threw.
 * @returns Never; it always throws.
 */
function rethrowAsIdentityFailure(error: unknown): never {
	if (error instanceof CoordinatorToolValidationError) {
		throw error;
	}
	throw mapIdentityFailure(error);
}

/**
 * Check that the wire request is internally consistent before any identity is trusted.
 * @param request - The dynamic request from the transport.
 */
function assertWireShape(request: DynamicServerRequest): void {
	if (request.owner !== COORDINATOR_TOOLS_OWNER) {
		fail(
			"invalid_call",
			"Only coordinator-owned item/tool/call requests may enter this dispatcher.",
		);
	}
	if (request.correlation.requestId !== request.requestId) {
		fail("invalid_call", "The dynamic request and wire correlation use different request ids.");
	}
	if (request.correlation.child !== request.child || request.correlation.epoch !== request.epoch) {
		fail("invalid_call", "The dynamic request correlation is not internally consistent.");
	}
}

/**
 * Check that the wire correlation decodes to the request's own child, epoch and request id.
 * @param options - The dispatcher options carrying the identity authority.
 * @param request - The dynamic request from the transport.
 */
function assertWireCorrelation(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
): void {
	try {
		const correlation = options.identity.decoder.parseWireRequestCorrelation(request.correlation);
		if (
			correlation.child !== request.child ||
			correlation.epoch !== request.epoch ||
			correlation.requestId !== request.requestId
		) {
			fail("invalid_call", "The dynamic wire correlation is not internally consistent.");
		}
	} catch (error) {
		rethrowAsIdentityFailure(error);
	}
}

/**
 * Check the request envelope: owner, internal consistency, current epoch and wire correlation.
 * @param options - The dispatcher options carrying the identity authority.
 * @param request - The dynamic request from the transport.
 */
function assertRequestEnvelope(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
): void {
	assertWireShape(request);
	try {
		options.identity.validator.assertCurrentEpoch(request.child, request.epoch);
	} catch (error) {
		throw mapIdentityFailure(error);
	}
	assertWireCorrelation(options, request);
}

/**
 * Check that the logical call's issued identities are the ones the app-server named in its
 * tool-call parameters.
 * @param options - The dispatcher options carrying the identity authority.
 * @param call - The decoded logical call.
 * @param request - The dynamic request from the transport.
 */
function assertCallIdentitiesMatchParams(
	options: CodexCoordinatorToolsOptions,
	call: LogicalToolCallCorrelation,
	request: DynamicServerRequest,
): void {
	const { serializeCodexIdentity } = options.identity.decoder;
	try {
		if (serializeCodexIdentity(call.threadId) !== request.params.threadId) {
			fail(
				"unknown_provenance",
				"The caller thread identity is not the issued logical-call target.",
			);
		}
		if (serializeCodexIdentity(call.turnId) !== request.params.turnId) {
			fail("unknown_provenance", "The caller turn identity is not the issued logical-call target.");
		}
		if (serializeCodexIdentity(call.callId) !== request.params.callId) {
			fail("unknown_provenance", "The dynamic call identity is not the issued logical-call id.");
		}
	} catch (error) {
		rethrowAsIdentityFailure(error);
	}
}

const MANIFEST_HASHES: Readonly<Record<NamespaceName, string>> = Object.freeze({
	archboard_workhorse: ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	archboard_voice: ARCHBOARD_VOICE_MANIFEST_SHA256,
});

const NamespaceNameSchema = z.enum(COORDINATOR_NAMESPACE_NAMES);

/**
 * Check that the call names a reviewed namespace with that namespace's reviewed manifest hash.
 * @param call - The decoded logical call.
 */
function assertReviewedManifest(call: LogicalToolCallCorrelation): void {
	const namespace = NamespaceNameSchema.safeParse(call.namespace);
	const expectedHash = namespace.success ? MANIFEST_HASHES[namespace.data] : null;
	if (expectedHash === null || call.manifestHash !== expectedHash) {
		fail("invalid_call", "The dynamic call does not carry the reviewed namespace manifest hash.");
	}
}

/**
 * Decode the logical call and check that it belongs to this request, matches the app-server's
 * tool-call fields, carries the reviewed manifest hash and is the call the host is executing now.
 * @param options - The dispatcher options carrying the identity and host authorities.
 * @param request - The dynamic request from the transport.
 * @returns The decoded logical call.
 */
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
	if (call.child !== request.child || call.epoch !== request.epoch) {
		fail("invalid_call", "The logical call does not belong to the dynamic request epoch.");
	}
	if (typeof request.params.namespace !== "string") {
		fail("invalid_call", "The dynamic tool namespace must be present.");
	}
	if (call.namespace !== request.params.namespace || call.tool !== request.params.tool) {
		fail("invalid_call", "The logical call does not match the app-server tool-call fields.");
	}
	assertCallIdentitiesMatchParams(options, call, request);
	assertReviewedManifest(call);
	const current = options.authority.currentCall();
	if (current === null || !sameCall(current, call)) {
		fail("invalid_call", "The coordinator call is no longer the current executing call.");
	}
	return call;
}

/**
 * Check that a host fact belongs to the identity authority's current child and epoch.
 * @param options - The dispatcher options carrying the identity authority.
 * @param owner - The child and epoch the fact claims.
 * @param subject - How the diagnostic names the fact.
 */
function assertCurrentChildEpoch(
	options: CodexCoordinatorToolsOptions,
	owner: { readonly childId: unknown; readonly epoch: unknown },
	subject: string,
): void {
	if (owner.childId !== options.identity.validator.childId) {
		fail("stale_child", `The ${subject} belongs to another Codex child.`);
	}
	if (owner.epoch !== options.identity.validator.epoch) {
		fail("prior_epoch", `The ${subject} belongs to a prior Codex child epoch.`);
	}
}

/**
 * Resolve the ready coordinator the call originated from.
 * @param options - The dispatcher options carrying the host authority.
 * @param call - The decoded logical call.
 * @returns The current coordinator facts.
 */
function currentCoordinator(
	options: CodexCoordinatorToolsOptions,
	call: LogicalToolCallCorrelation,
): CoordinatorToolCoordinatorAuthority {
	const current = options.authority.currentCoordinator();
	if (current?.state !== "ready") {
		fail("not_ready", "The coordinator is not ready to execute dynamic tools.");
	}
	assertCurrentChildEpoch(options, current, "coordinator");
	if (current.threadId === null || current.threadId !== call.threadId) {
		fail("invalid_call", "The dynamic call did not originate from the current coordinator thread.");
	}
	return current;
}

/**
 * Check that the binding is attached to this coordinator and names a distinct, owned workhorse.
 * @param binding - The host's current workhorse binding.
 * @param call - The decoded logical call.
 * @param coordinator - The current coordinator facts.
 */
function assertBindingProvenance(
	binding: WorkhorseOperationBinding,
	call: LogicalToolCallCorrelation,
	coordinator: CoordinatorToolCoordinatorAuthority,
): void {
	if (
		binding.coordinator.threadId !== call.threadId ||
		binding.coordinator.childId !== coordinator.childId ||
		binding.coordinator.epoch !== coordinator.epoch
	) {
		fail("unknown_provenance", "The host workhorse binding is not attached to this coordinator.");
	}
	if (
		binding.workhorse.childId !== binding.childId ||
		binding.workhorse.epoch !== binding.epoch ||
		binding.workhorse.threadId === binding.coordinator.threadId
	) {
		fail(
			"unknown_provenance",
			"The workhorse target is missing or points back to the coordinator.",
		);
	}
	if (binding.workhorse.operationId.length === 0) {
		fail("unknown_provenance", "The workhorse binding has no host ownership proof.");
	}
}

/**
 * Resolve the host-bound workhorse a workhorse-namespace call operates on.
 * @param options - The dispatcher options carrying the host authority.
 * @param call - The decoded logical call.
 * @param coordinator - The current coordinator facts.
 * @returns The current workhorse binding.
 */
function workhorseBinding(
	options: CodexCoordinatorToolsOptions,
	call: LogicalToolCallCorrelation,
	coordinator: CoordinatorToolCoordinatorAuthority,
): WorkhorseOperationBinding {
	const binding = options.authority.currentWorkhorseBinding();
	if (binding === null) {
		fail("not_ready", "The coordinator has no current host-bound workhorse.");
	}
	assertCurrentChildEpoch(options, binding, "bound workhorse");
	assertBindingProvenance(binding, call, coordinator);
	return binding;
}

/**
 * Parse an already namespace-checked input against the tool's own closed schema and tag it.
 * @param tool - The reviewed tool name.
 * @param parsed - The input after the contract's namespace-level parse.
 * @returns The tagged, typed input.
 */
function taggedInput(tool: CoordinatorToolName, parsed: unknown): ParsedToolInput {
	switch (tool) {
		case "inspect_workhorse":
			return { tool, input: InspectWorkhorseInputSchema.parse(parsed) };
		case "delegate_to_workhorse":
			return { tool, input: DelegateToWorkhorseInputSchema.parse(parsed) };
		case "manage_workhorse_queue":
			return { tool, input: ManageWorkhorseQueueInputSchema.parse(parsed) };
		case "steer_workhorse":
			return { tool, input: SteerWorkhorseInputSchema.parse(parsed) };
		default:
			return { tool, input: ResolveSpokenApprovalInputSchema.parse(parsed) };
	}
}

/**
 * Parse the dynamic tool arguments against the reviewed closed schema.
 * @param namespace - The reviewed namespace.
 * @param tool - The reviewed tool name.
 * @param value - The raw arguments from the app-server.
 * @returns The tagged, typed input.
 */
function parseInput(
	namespace: NamespaceName,
	tool: CoordinatorToolName,
	value: unknown,
): ParsedToolInput {
	try {
		return taggedInput(tool, parseCoordinatorToolInput(namespace, tool, value));
	} catch (error) {
		return fail(
			"invalid_call",
			"The dynamic tool arguments do not match the reviewed closed schema.",
			error,
		);
	}
}

/**
 * Resolve the namespace and tool the call declares, refusing anything the reviewed manifests do
 * not declare.
 * @param call - The decoded logical call.
 * @returns The declared namespace and tool.
 */
function declaredTool(call: LogicalToolCallCorrelation): DeclaredTool {
	const declared = DeclaredToolSchema.safeParse({ namespace: call.namespace, tool: call.tool });
	if (!declared.success) {
		fail("invalid_call", `The reviewed namespace does not declare ${call.tool}.`);
	}
	return declared.data;
}

/**
 * Resolve the active workhorse turn a steer must target; the host proves it, never the caller.
 * @param options - The dispatcher options carrying the host authority.
 * @returns The expected turn id.
 */
function steerExpectedTurnId(options: CodexCoordinatorToolsOptions): TurnId {
	const expectedTurnId = options.authority.expectedTurnId();
	if (expectedTurnId === null) {
		fail("busy", "The host has not proven an active workhorse turn.");
	}
	try {
		options.identity.decoder.parseTurnId(expectedTurnId);
	} catch (error) {
		throw mapIdentityFailure(error);
	}
	return expectedTurnId;
}

/**
 * Assemble a validated workhorse-namespace call for one parsed input.
 * @param options - The dispatcher options carrying the host authority.
 * @param evidence - The call, fingerprint and coordinator facts.
 * @param parsed - The tagged workhorse tool input.
 * @param binding - The current workhorse binding.
 * @returns The validated call.
 */
function workhorseCall(
	options: CodexCoordinatorToolsOptions,
	evidence: ValidatedCallEvidence,
	parsed: Exclude<ParsedToolInput, { readonly tool: "resolve_spoken_approval" }>,
	binding: WorkhorseOperationBinding,
): ValidatedWorkhorseCall {
	const namespace = "archboard_workhorse" as const;
	if (parsed.tool === "steer_workhorse") {
		return Object.freeze({
			...evidence,
			namespace,
			...parsed,
			workhorseBinding: binding,
			expectedTurnId: steerExpectedTurnId(options),
		});
	}
	return Object.freeze({
		...evidence,
		namespace,
		...parsed,
		workhorseBinding: binding,
		expectedTurnId: null,
	});
}

/**
 * Validate one coordinator dynamic-tool request end to end: envelope, logical call, coordinator,
 * arguments and, for workhorse tools, the host-bound workhorse.
 * @param options - The dispatcher options carrying the identity and host authorities.
 * @param request - The dynamic request from the transport.
 * @returns The validated call with its typed input and host facts.
 */
function validateCoordinatorToolRequest(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
): ValidatedCoordinatorToolCall {
	assertRequestEnvelope(options, request);
	const call = assertLogicalCall(options, request);
	const declared = declaredTool(call);
	const coordinator = currentCoordinator(options, call);
	const parsed = parseInput(declared.namespace, declared.tool, request.params.arguments);
	const evidence: ValidatedCallEvidence = {
		call,
		inputFingerprint: inputFingerprint(declared.namespace, parsed),
		coordinator,
	};
	if (parsed.tool === "resolve_spoken_approval") {
		return Object.freeze({
			...evidence,
			namespace: "archboard_voice",
			...parsed,
			workhorseBinding: null,
			expectedTurnId: null,
		});
	}
	return workhorseCall(options, evidence, parsed, workhorseBinding(options, call, coordinator));
}

/**
 * Tell coordinator-owned dynamic tool calls apart from every other server request.
 * @param request - Any server request from the transport.
 * @returns Whether this dispatcher owns the request.
 */
function isCoordinatorToolRequest(
	request: TransportServerRequest,
): request is CoordinatorToolsServerRequest {
	return request.owner === COORDINATOR_TOOLS_OWNER;
}

/**
 * The key one wire request is tracked under: its child, epoch and JSON-RPC request id.
 * @param request - The dynamic request.
 * @returns A stable string key.
 */
function callKey(request: DynamicServerRequest): string {
	return `${request.child}\u0000${request.epoch}\u0000${String(request.requestId)}`;
}

/**
 * The key one logical call is tracked under across wire retries.
 * @param call - The decoded logical call.
 * @returns A stable string key.
 */
function logicalCallKey(call: LogicalToolCallCorrelation): string {
	return logicalToolCallKey(call);
}

export {
	type CoordinatorToolInput,
	type ValidatedCoordinatorToolCall,
	type ValidatedVoiceCall,
	type ValidatedWorkhorseCall,
	CoordinatorToolValidationError,
	validateCoordinatorToolRequest,
	isCoordinatorToolRequest,
	callKey,
	logicalCallKey,
};

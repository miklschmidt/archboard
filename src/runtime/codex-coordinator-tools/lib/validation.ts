import { createHash } from "node:crypto";

import {
	ARCHBOARD_VOICE_TOOL_NAMES,
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
import { logicalToolCallKey } from "@/shared/codex-workbench-identity";
import {
	CoordinatorToolValidationError,
	assertLogicalCall,
	assertRequestEnvelope,
	fail,
	mapIdentityFailure,
} from "@/runtime/codex-coordinator-tools/lib/call-identity";
import {
	currentCoordinator,
	workhorseBinding,
} from "@/runtime/codex-coordinator-tools/lib/call-provenance";
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

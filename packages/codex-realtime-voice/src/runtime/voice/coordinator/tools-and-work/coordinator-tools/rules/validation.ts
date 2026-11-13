import { createHash } from "node:crypto";

import {
	VOICE_TOOL_NAMES,
	WORKHORSE_TOOL_NAMES,
	type CoordinatorToolName,
	type CoordinatorNamespaceRole,
} from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/manifest.ts";
import { toolRoleOf } from "#runtime/host/toolset/rules/toolset.ts";
import {
	DelegateToWorkhorseInputSchema,
	InspectWorkhorseInputSchema,
	ManageWorkhorseQueueInputSchema,
	ResolveSpokenApprovalInputSchema,
	SteerWorkhorseInputSchema,
	StopWorkhorsesInputSchema,
	parseCoordinatorToolInput,
	type DelegateToWorkhorseInput,
	type InspectWorkhorseInput,
	type ManageWorkhorseQueueInput,
	type ResolveSpokenApprovalInput,
	type SteerWorkhorseInput,
	type StopWorkhorsesInput,
} from "#runtime/voice/coordinator/tools-and-work/tool-contract/protocol/tool-inputs.ts";
import type { CodexCoordinatorToolsOptions } from "#runtime/voice/coordinator/tools-and-work/coordinator-tools/protocol/contract.ts";
import {
	COORDINATOR_TOOLS_OWNER,
	type CoordinatorToolCoordinatorAuthority,
	type CoordinatorToolsServerRequest,
} from "#runtime/voice/coordinator/tools-and-work/coordinator-tools/protocol/contract.ts";
import type {
	DynamicServerRequest,
	TransportServerRequest,
} from "@archboard/codex-app-server/transport";
import {
	type LogicalToolCallCorrelation,
	logicalToolCallKey,
} from "@archboard/codex-app-server/identity";
import {
	CoordinatorToolValidationError,
	assertLogicalCall,
	assertRequestEnvelope,
	fail,
} from "#runtime/voice/coordinator/tools-and-work/coordinator-tools/rules/call-identity.ts";
import {
	currentCoordinator,
	workhorseBinding,
} from "#runtime/voice/coordinator/tools-and-work/coordinator-tools/rules/call-provenance.ts";
import {
	type WorkhorseCoordinatorCall,
	type WorkhorseOperationBinding,
} from "#runtime/workhorses/workhorse-operations/protocol/contract.ts";
import { z } from "zod";

/** The reviewed namespace role and tool name pair a logical call may carry. */
const DeclaredToolSchema = z.union([
	z.object({ role: z.literal("workhorse"), tool: z.enum(WORKHORSE_TOOL_NAMES) }),
	z.object({ role: z.literal("voice"), tool: z.enum(VOICE_TOOL_NAMES) }),
]);

type DeclaredTool = z.infer<typeof DeclaredToolSchema>;

/** One parsed tool input, tagged with the tool so its shape is known wherever it travels. */
type ParsedToolInput =
	| { readonly tool: "inspect_workhorse"; readonly input: InspectWorkhorseInput }
	| { readonly tool: "delegate_to_workhorse"; readonly input: DelegateToWorkhorseInput }
	| { readonly tool: "manage_workhorse_queue"; readonly input: ManageWorkhorseQueueInput }
	| { readonly tool: "steer_workhorse"; readonly input: SteerWorkhorseInput }
	| { readonly tool: "stop_workhorses"; readonly input: StopWorkhorsesInput }
	| { readonly tool: "resolve_spoken_approval"; readonly input: ResolveSpokenApprovalInput };

interface ValidatedCallEvidence {
	readonly call: WorkhorseCoordinatorCall;
	readonly inputFingerprint: string;
	readonly coordinator: CoordinatorToolCoordinatorAuthority;
}

type ValidatedWorkhorseCall = ValidatedCallEvidence & {
	readonly role: "workhorse";
	readonly workhorseBinding: WorkhorseOperationBinding;
} & (
		| { readonly tool: "inspect_workhorse"; readonly input: InspectWorkhorseInput }
		| { readonly tool: "delegate_to_workhorse"; readonly input: DelegateToWorkhorseInput }
		| { readonly tool: "manage_workhorse_queue"; readonly input: ManageWorkhorseQueueInput }
		| { readonly tool: "steer_workhorse"; readonly input: SteerWorkhorseInput }
	);

/**
 * A stop names no checkout, so it has no workhorse binding to resolve and proves no turn: the
 * server finds the workhorses of the tab session itself.
 */
type ValidatedStopCall = ValidatedCallEvidence & {
	readonly role: "workhorse";
	readonly tool: "stop_workhorses";
	readonly input: StopWorkhorsesInput;
	readonly workhorseBinding: null;
};

/** A call whose effect runs under a server-issued operation identity. */
type ValidatedOperationCall = ValidatedWorkhorseCall | ValidatedStopCall;

type ValidatedVoiceCall = ValidatedCallEvidence & {
	readonly role: "voice";
	readonly tool: "resolve_spoken_approval";
	readonly input: ResolveSpokenApprovalInput;
	readonly workhorseBinding: null;
};

type ValidatedCoordinatorToolCall = ValidatedOperationCall | ValidatedVoiceCall;

/**
 * Canonical text for the queue operations that name exactly one submission.
 * @param value - A delete or start request.
 * @returns The JSON text whose key order is part of the fingerprint contract.
 */
function canonicalQueueTarget(
	value: Extract<ManageWorkhorseQueueInput, { readonly operation: "delete" | "start" }>,
): string {
	return JSON.stringify({
		checkout: value.checkout,
		operation: value.operation,
		submissionId: value.submissionId,
	});
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
			return JSON.stringify({ checkout: value.checkout, operation: value.operation });
		case "add":
			return JSON.stringify({
				checkout: value.checkout,
				operation: value.operation,
				prompt: value.prompt,
			});
		case "update":
			return JSON.stringify({
				checkout: value.checkout,
				operation: value.operation,
				submissionId: value.submissionId,
				prompt: value.prompt,
			});
		case "reorder":
			return JSON.stringify({
				checkout: value.checkout,
				operation: value.operation,
				orderedSubmissionIds: value.orderedSubmissionIds,
			});
		default:
			return canonicalQueueTarget(value);
	}
}

/**
 * Canonical text for any tool input, so equal arguments always hash equally. A workhorse tool's
 * text leads with the checkout it names, because the same arguments in another checkout are work
 * for another workhorse. A stop names none, so its canonical input is empty.
 * @param parsed - The tool and its parsed input.
 * @returns The JSON text to hash.
 */
function canonicalInput(parsed: ParsedToolInput): string {
	switch (parsed.tool) {
		case "inspect_workhorse":
			return JSON.stringify({ checkout: parsed.input.checkout });
		case "delegate_to_workhorse":
			return JSON.stringify({
				checkout: parsed.input.checkout,
				input: parsed.input.input,
				transcriptDelta: parsed.input.transcriptDelta,
			});
		case "manage_workhorse_queue":
			return canonicalQueueInput(parsed.input);
		case "steer_workhorse":
			return JSON.stringify({ checkout: parsed.input.checkout, input: parsed.input.input });
		case "stop_workhorses":
			return JSON.stringify({});
		default:
			return JSON.stringify({ verdict: parsed.input.verdict });
	}
}

/**
 * Hash the namespace, tool and canonical input so a replayed logical call can prove it carries the
 * same arguments as the original without retaining those arguments.
 * @param namespace - The reviewed namespace, as the host names it.
 * @param parsed - The tool and its parsed input.
 * @returns A hex SHA-256 digest.
 */
function inputFingerprint(namespace: string, parsed: ParsedToolInput): string {
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
		case "stop_workhorses":
			return { tool, input: StopWorkhorsesInputSchema.parse(parsed) };
		default:
			return { tool, input: ResolveSpokenApprovalInputSchema.parse(parsed) };
	}
}

/**
 * Parse the dynamic tool arguments against the reviewed closed schema.
 * @param role - The role of the reviewed namespace.
 * @param tool - The reviewed tool name.
 * @param value - The raw arguments from the app-server.
 * @returns The tagged, typed input.
 */
function parseInput(
	role: CoordinatorNamespaceRole,
	tool: CoordinatorToolName,
	value: unknown,
): ParsedToolInput {
	try {
		return taggedInput(tool, parseCoordinatorToolInput(role, tool, value));
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
 * @param options - The dispatcher options carrying the host's built-in namespaces.
 * @param call - The decoded logical call.
 * @returns The declared namespace role and tool.
 */
function declaredTool(
	options: CodexCoordinatorToolsOptions,
	call: LogicalToolCallCorrelation,
): DeclaredTool {
	const declared = DeclaredToolSchema.safeParse({
		role: toolRoleOf(options.tools, call),
		tool: call.tool,
	});
	if (!declared.success) {
		fail("invalid_call", `The reviewed namespace does not declare ${call.tool}.`);
	}
	return declared.data;
}

/**
 * Assemble a validated workhorse-namespace call for one parsed input.
 * @param evidence - The call, fingerprint and coordinator facts.
 * @param parsed - The tagged workhorse tool input.
 * @param binding - The current workhorse binding.
 * @returns The validated call.
 */
function workhorseCall(
	evidence: ValidatedCallEvidence,
	parsed: Exclude<
		ParsedToolInput,
		{ readonly tool: "resolve_spoken_approval" | "stop_workhorses" }
	>,
	binding: WorkhorseOperationBinding,
): ValidatedWorkhorseCall {
	return Object.freeze({
		...evidence,
		role: "workhorse" as const,
		...parsed,
		workhorseBinding: binding,
	});
}

/**
 * Validate one coordinator dynamic-tool request end to end: envelope, logical call, coordinator,
 * arguments and, for workhorse tools, the server-bound workhorse.
 * @param options - The dispatcher options carrying the identity and server authorities.
 * @param request - The dynamic request from the transport.
 * @returns The validated call with its typed input and server facts.
 */
function validateCoordinatorToolRequest(
	options: CodexCoordinatorToolsOptions,
	request: DynamicServerRequest,
): ValidatedCoordinatorToolCall {
	assertRequestEnvelope(options, request);
	const call = assertLogicalCall(options, request);
	const declared = declaredTool(options, call);
	const coordinator = currentCoordinator(options, call);
	const parsed = parseInput(declared.role, declared.tool, request.params.arguments);
	const evidence: ValidatedCallEvidence = {
		call,
		inputFingerprint: inputFingerprint(call.namespace, parsed),
		coordinator,
	};
	if (parsed.tool === "resolve_spoken_approval") {
		return Object.freeze({
			...evidence,
			role: "voice",
			...parsed,
			workhorseBinding: null,
		});
	}
	if (parsed.tool === "stop_workhorses") {
		return Object.freeze({
			...evidence,
			role: "workhorse",
			...parsed,
			workhorseBinding: null,
		});
	}
	return workhorseCall(
		evidence,
		parsed,
		workhorseBinding(options, call, coordinator, {
			checkout: parsed.input.checkout,
			delegation: parsed.tool === "delegate_to_workhorse",
		}),
	);
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
	type ValidatedCoordinatorToolCall,
	type ValidatedOperationCall,
	type ValidatedVoiceCall,
	type ValidatedWorkhorseCall,
	CoordinatorToolValidationError,
	validateCoordinatorToolRequest,
	isCoordinatorToolRequest,
	callKey,
	logicalCallKey,
};

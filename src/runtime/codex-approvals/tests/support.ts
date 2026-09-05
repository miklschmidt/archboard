import { expect } from "bun:test";

import type {
	ApprovalResponsePort,
	CodexApprovalBroker,
	CodexApprovalBrokerOptions,
} from "../index.js";
import { createCodexApprovalBroker } from "../index.js";
import {
	createIdentityAuthority,
	type ChildEpoch,
	type ChildId,
	type IdentityAuthority,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	HumanApprovalMethod,
	ReverseResponse,
	TransportServerRequest,
} from "../../codex-transport/server-requests.js";
import {
	CodexTransportOwnershipError,
	CodexTransportUsageError,
} from "../../codex-transport/errors.js";

export interface CapturedResponse {
	readonly request: TransportServerRequest;
	readonly owner: "codex-approvals";
	readonly response: ReverseResponse;
}

export type ResponseMode =
	| "delivered"
	| "not_delivered"
	| "outcome_unknown"
	| "deferred"
	| "ownership_error"
	| "usage_error"
	| "generic_error";

export class FakeApprovalPort implements ApprovalResponsePort {
	readonly responses: CapturedResponse[] = [];
	readonly requests: TransportServerRequest[] = [];
	readonly mode: ResponseMode;
	private readonly requestListeners = new Set<(request: TransportServerRequest) => void>();
	private readonly exitListeners = new Set<
		(exit: { readonly child: ChildId; readonly epoch: ChildEpoch }) => void
	>();
	private deferredSettlement:
		| {
				readonly resolve: () => void;
				readonly reject: (reason: unknown) => void;
		  }
		| undefined;

	constructor(mode: ResponseMode = "delivered") {
		this.mode = mode;
	}

	respond(
		request: TransportServerRequest,
		owner: "codex-approvals",
		response: ReverseResponse,
	): Promise<void> {
		this.responses.push({ request, owner, response });
		if (this.mode === "delivered") return Promise.resolve();
		if (this.mode === "not_delivered")
			return Promise.reject({ accepted: false, outcome: "not_delivered", reason: "backpressure" });
		if (this.mode === "deferred")
			return new Promise<void>((resolve, reject) => {
				this.deferredSettlement = { resolve, reject };
			});
		if (this.mode === "ownership_error")
			return Promise.reject(new CodexTransportOwnershipError("the response owner is invalid"));
		if (this.mode === "usage_error")
			return Promise.reject(new CodexTransportUsageError("the response payload is invalid"));
		if (this.mode === "generic_error") return Promise.reject(new Error("ambiguous write failure"));
		return Promise.reject({ accepted: true, reason: "write-error" });
	}

	resolveDeferred(): void {
		const deferred = this.deferredSettlement;
		if (deferred === undefined) throw new Error("No deferred response is pending.");
		this.deferredSettlement = undefined;
		deferred.resolve();
	}

	rejectDeferred(outcome: "not_delivered" | "outcome_unknown"): void {
		const deferred = this.deferredSettlement;
		if (deferred === undefined) throw new Error("No deferred response is pending.");
		this.deferredSettlement = undefined;
		deferred.reject(
			outcome === "not_delivered"
				? { accepted: false, outcome, reason: "backpressure" }
				: { accepted: true, outcome, reason: "write-error" },
		);
	}

	onServerRequest(listener: (request: TransportServerRequest) => void): () => void {
		this.requestListeners.add(listener);
		return () => this.requestListeners.delete(listener);
	}

	onExit(
		listener: (exit: { readonly child: ChildId; readonly epoch: ChildEpoch }) => void,
	): () => void {
		this.exitListeners.add(listener);
		return () => this.exitListeners.delete(listener);
	}

	emit(request: TransportServerRequest): void {
		this.requests.push(request);
		for (const listener of this.requestListeners) listener(request);
	}

	emitExit(identity: IdentityAuthority): void {
		const exit = {
			child: identity.validator.childId,
			epoch: identity.validator.epoch,
		};
		for (const listener of this.exitListeners) listener(exit);
	}
}

export function testBroker(
	mode: ResponseMode = "delivered",
	input: Omit<CodexApprovalBrokerOptions, "transport" | "identity"> = {},
): {
	readonly identity: IdentityAuthority;
	readonly port: FakeApprovalPort;
	readonly broker: CodexApprovalBroker;
} {
	const identity = createIdentityAuthority();
	const port = new FakeApprovalPort(mode);
	const broker = createCodexApprovalBroker({ ...input, identity, transport: port });
	return { identity, port, broker };
}

function requestEnvelope<M extends HumanApprovalMethod>(
	identity: IdentityAuthority,
	method: M,
	params: unknown,
	label: string,
): Extract<TransportServerRequest, { readonly method: M }> {
	const requestId = identity.decoder.adoptJsonRpcRequestId(`request-${label}`);
	return {
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		requestId,
		correlation: identity.decoder.createWireRequestCorrelation({ requestId }),
		method,
		params,
		owner: "codex-approvals",
	} as Extract<TransportServerRequest, { readonly method: M }>;
}

function itemParams(
	identity: IdentityAuthority,
	label: string,
): {
	readonly threadId: string;
	readonly turnId: string;
	readonly itemId: string;
} {
	void identity;
	return {
		threadId: `thread-${label}`,
		turnId: `turn-${label}`,
		itemId: `item-${label}`,
	};
}

export function commandRequest(
	identity: IdentityAuthority,
	label: string,
	availableDecisions = ["accept", "decline"],
): Extract<TransportServerRequest, { readonly method: "item/commandExecution/requestApproval" }> {
	return commandRequestWithAvailableDecisions(identity, label, availableDecisions);
}

export function commandRequestWithAvailableDecisions(
	identity: IdentityAuthority,
	label: string,
	availableDecisions: readonly unknown[] | null | undefined,
): Extract<TransportServerRequest, { readonly method: "item/commandExecution/requestApproval" }> {
	const params = {
		...itemParams(identity, label),
		kind: "command",
		startedAtMs: 10,
		approvalId: `approval-${label}`,
		environmentId: null,
		reason: `Run ${label}`,
		networkApprovalContext: null,
		command: `echo ${label}`,
		cwd: "/workspace",
		commandActions: null,
		additionalPermissions: null,
		proposedExecpolicyAmendment: null,
		proposedNetworkPolicyAmendments: null,
	};
	return requestEnvelope(
		identity,
		"item/commandExecution/requestApproval",
		availableDecisions === undefined ? params : { ...params, availableDecisions },
		label,
	);
}

export function commandRequestWithParams(
	identity: IdentityAuthority,
	label: string,
	overrides: Partial<
		Extract<
			TransportServerRequest,
			{ readonly method: "item/commandExecution/requestApproval" }
		>["params"]
	>,
): Extract<TransportServerRequest, { readonly method: "item/commandExecution/requestApproval" }> {
	const request = commandRequest(identity, label);
	return { ...request, params: { ...request.params, ...overrides } };
}

export function commandRequestWithoutCommand(
	identity: IdentityAuthority,
	label: string,
	shape: "null" | "omitted",
): Extract<TransportServerRequest, { readonly method: "item/commandExecution/requestApproval" }> {
	const request = commandRequest(identity, label);
	if (shape === "null") return { ...request, params: { ...request.params, command: null } };
	const { command: omittedCommand, ...params } = request.params;
	void omittedCommand;
	return { ...request, params };
}

export function commandRequestWithoutAvailableDecisions(
	identity: IdentityAuthority,
	label: string,
): TransportServerRequest {
	return commandRequestWithAvailableDecisions(identity, label, undefined);
}

export function fileRequest(identity: IdentityAuthority, label: string): TransportServerRequest {
	return requestEnvelope(
		identity,
		"item/fileChange/requestApproval",
		{
			...itemParams(identity, label),
			startedAtMs: 10,
			reason: `Change ${label}`,
			grantRoot: "/workspace",
		},
		label,
	);
}

export function userInputRequest(
	identity: IdentityAuthority,
	label: string,
	questionCount = 1,
	secret = false,
): TransportServerRequest {
	return requestEnvelope(
		identity,
		"item/tool/requestUserInput",
		{
			...itemParams(identity, label),
			questions: Array.from({ length: questionCount }, (_, index) => ({
				id: `${label}-${index}`,
				header: `Question ${index}`,
				question: `Answer ${index}`,
				isOther: false,
				isSecret: secret,
				options: null,
			})),
			isBlocking: false,
			autoResolutionMs: null,
		},
		label,
	);
}

export function elicitationRequest(
	identity: IdentityAuthority,
	label: string,
	mode: "form" | "openai/form" | "url" = "form",
	url = "https://example.test/approve",
): TransportServerRequest {
	const common = {
		threadId: `thread-${label}`,
		turnId: null,
		serverName: `server-${label}`,
		mode,
		_meta: null,
		message: `Provide ${label}`,
	};
	return requestEnvelope(
		identity,
		"mcpServer/elicitation/request",
		mode === "url"
			? { ...common, url, elicitationId: `elicitation-${label}` }
			: {
					...common,
					requestedSchema: {
						type: "object",
						properties: {
							name: {
								type: "string",
								title: "Name",
								description: "Display name",
								minLength: 2,
								maxLength: 40,
								default: "Ada",
							},
							kind: { type: "string", enum: ["a", "b"], default: "a" },
						},
						required: ["name"],
					},
				},
		label,
	);
}

export function permissionsRequest(
	identity: IdentityAuthority,
	label: string,
): TransportServerRequest {
	return requestEnvelope(
		identity,
		"item/permissions/requestApproval",
		{
			...itemParams(identity, label),
			environmentId: null,
			startedAtMs: 10,
			cwd: "/workspace",
			reason: `Permission ${label}`,
			permissions: {
				network: { enabled: true },
				fileSystem: {
					read: ["/workspace"],
					write: null,
					entries: [{ path: { type: "path", path: "/private/blocked" }, access: "deny" }],
				},
			},
		},
		label,
	);
}

export function applyPatchRequest(
	identity: IdentityAuthority,
	label: string,
): TransportServerRequest {
	return requestEnvelope(
		identity,
		"applyPatchApproval",
		{
			conversationId: `conversation-${label}`,
			callId: `call-${label}`,
			fileChanges: { "/workspace/file.ts": { type: "add", content: "export {};" } },
			reason: `Patch ${label}`,
			grantRoot: "/workspace",
		},
		label,
	);
}

export function execCommandRequest(
	identity: IdentityAuthority,
	label: string,
): TransportServerRequest {
	return requestEnvelope(
		identity,
		"execCommandApproval",
		{
			conversationId: `conversation-${label}`,
			callId: `call-${label}`,
			approvalId: `approval-${label}`,
			command: ["echo", label],
			cwd: "/workspace",
			reason: `Exec ${label}`,
			parsedCmd: [{ type: "unknown", cmd: `echo ${label}` }],
		},
		label,
	);
}

export function expectSingleResponse(port: FakeApprovalPort): ReverseResponse {
	expect(port.responses).toHaveLength(1);
	return port.responses[0]!.response;
}

export function closeBroker(broker: CodexApprovalBroker): void {
	broker.dispose();
}

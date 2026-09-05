import { createHash } from "node:crypto";

import type {
	ApprovalBinding,
	ApprovalBindingInput,
	ApprovalRequest,
	ApprovalRequestIdentity,
	ApplyPatchApprovalRequest,
	CommandApprovalRequest,
	ElicitationApprovalRequest,
	ExecCommandApprovalRequest,
	FileApprovalRequest,
	PermissionsApprovalRequest,
	UserInputApprovalRequest,
} from "./contract.js";
import { CodexApprovalError } from "./contract.js";
import type {
	ApprovalId,
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	ItemId,
	JsonRpcRequestId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type { TransportServerRequest } from "../../codex-transport/server-requests.js";

type HumanRequest = Extract<TransportServerRequest, { readonly owner: "codex-approvals" }>;

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
	if (value === null || typeof value !== "object" || seen.has(value)) return value;
	seen.add(value);
	for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key), seen);
	return Object.freeze(value);
}

function cloneAndFreeze<T>(value: T): T {
	return deepFreeze(structuredClone(value));
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") {
		const primitive = JSON.stringify(value);
		return primitive === undefined ? "null" : primitive;
	}
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.toSorted()
		.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
		.join(",")}}`;
}

function effectFingerprint(params: unknown): string {
	return createHash("sha256").update(stableJson(params), "utf8").digest("hex");
}

function adopt<T>(raw: unknown, parse: (value: unknown) => T, adoptRaw: (value: unknown) => T): T {
	try {
		return parse(raw);
	} catch {
		return adoptRaw(raw);
	}
}

function optionalApprovalId(authority: IdentityAuthority, raw: unknown): ApprovalId | null {
	if (raw === null || raw === undefined) return null;
	return adopt(raw, authority.decoder.parseApprovalId, authority.decoder.adoptApprovalId);
}

function itemIdentity(
	authority: IdentityAuthority,
	params: { readonly threadId: unknown; readonly turnId: unknown; readonly itemId: unknown },
	approvalId: unknown,
): {
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly itemId: ItemId;
	readonly approvalId: ApprovalId | null;
	readonly identity: Extract<ApprovalRequestIdentity, { readonly kind: "item" }>;
} {
	const threadId = adopt(
		params.threadId,
		authority.decoder.parseThreadId,
		authority.decoder.adoptThreadId,
	);
	const turnId = adopt(params.turnId, authority.decoder.parseTurnId, authority.decoder.adoptTurnId);
	const itemId = adopt(params.itemId, authority.decoder.parseItemId, authority.decoder.adoptItemId);
	const adoptedApprovalId = optionalApprovalId(authority, approvalId);
	return {
		threadId,
		turnId,
		itemId,
		approvalId: adoptedApprovalId,
		identity: Object.freeze({
			kind: "item",
			threadId,
			turnId,
			itemId,
			approvalId: adoptedApprovalId,
		}),
	};
}

function envelope(
	authority: IdentityAuthority,
	request: HumanRequest,
): { readonly child: ChildId; readonly epoch: ChildEpoch; readonly requestId: JsonRpcRequestId } {
	try {
		authority.decoder.parseChildId(request.child);
		authority.decoder.parseChildEpoch(request.epoch);
		authority.decoder.parseJsonRpcRequestId(request.requestId);
		authority.validator.assertCurrentEpoch(request.child, request.epoch);
	} catch (error) {
		throw new CodexApprovalError(
			"invalid_identity",
			`The approval request child, epoch, or request identity is invalid: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (request.correlation.child !== request.child || request.correlation.epoch !== request.epoch) {
		throw new CodexApprovalError(
			"invalid_identity",
			"The approval request correlation does not match its child epoch.",
		);
	}
	if (request.correlation.requestId !== request.requestId) {
		throw new CodexApprovalError(
			"invalid_identity",
			"The approval request correlation does not match its request identity.",
		);
	}
	return Object.freeze({
		child: request.child,
		epoch: request.epoch,
		requestId: request.requestId,
	});
}

function bindingText(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
		throw new CodexApprovalError(
			"invalid_request",
			`Approval ${field} must be a non-empty string.`,
		);
	}
	return value;
}

export function completeBinding(
	request: ApprovalRequest,
	input: ApprovalBindingInput | undefined,
): ApprovalBinding {
	const link =
		input !== undefined && Object.hasOwn(input, "link") ? input.link : request.binding.link;
	if (link === undefined) {
		throw new CodexApprovalError(
			"invalid_request",
			"Approval link must be null or a non-empty string.",
		);
	}
	const candidate = {
		child: input?.child ?? request.child,
		epoch: input?.epoch ?? request.epoch,
		link,
		target: input?.target ?? request.binding.target,
		effect: input?.effect ?? request.binding.effect,
	};
	if (candidate.link !== null) bindingText(candidate.link, "link");
	bindingText(candidate.target, "target");
	bindingText(candidate.effect, "effect");
	return Object.freeze(candidate);
}

function identityFor(authority: IdentityAuthority, request: HumanRequest): ApprovalRequestIdentity {
	switch (request.method) {
		case "item/commandExecution/requestApproval": {
			const item = itemIdentity(authority, request.params, request.params.approvalId);
			return item.identity;
		}
		case "item/fileChange/requestApproval":
		case "item/tool/requestUserInput":
		case "item/permissions/requestApproval": {
			const item = itemIdentity(authority, request.params, undefined);
			return item.identity;
		}
		case "mcpServer/elicitation/request": {
			const threadId = adopt(
				request.params.threadId,
				authority.decoder.parseThreadId,
				authority.decoder.adoptThreadId,
			);
			const turnId =
				request.params.turnId === null
					? null
					: adopt(
							request.params.turnId,
							authority.decoder.parseTurnId,
							authority.decoder.adoptTurnId,
						);
			return Object.freeze({
				kind: "elicitation",
				threadId,
				turnId,
				serverName: request.params.serverName,
				elicitationId: request.params.mode === "url" ? request.params.elicitationId : null,
			});
		}
		case "applyPatchApproval":
		case "execCommandApproval": {
			const conversationId = adopt(
				request.params.conversationId,
				authority.decoder.parseThreadId,
				authority.decoder.adoptThreadId,
			);
			const callId = adopt(
				request.params.callId,
				authority.decoder.parseDynamicToolCallId,
				authority.decoder.adoptDynamicToolCallId,
			);
			const approvalId =
				request.method === "execCommandApproval"
					? optionalApprovalId(authority, request.params.approvalId)
					: null;
			return Object.freeze({ kind: "legacy", conversationId, callId, approvalId });
		}
	}
}

function targetFor(identity: ApprovalRequestIdentity): string {
	switch (identity.kind) {
		case "item":
			return `thread:${identity.threadId}/turn:${identity.turnId}/item:${identity.itemId}`;
		case "elicitation":
			return `thread:${identity.threadId}/turn:${identity.turnId ?? "none"}/server:${identity.serverName}/elicitation:${identity.elicitationId ?? "none"}`;
		case "legacy":
			return `conversation:${identity.conversationId}/call:${identity.callId}`;
	}
}

function base(
	authority: IdentityAuthority,
	request: HumanRequest,
	expiresAtMs: number,
	input: ApprovalBindingInput | undefined,
): {
	readonly envelope: {
		readonly child: ChildId;
		readonly epoch: ChildEpoch;
		readonly requestId: JsonRpcRequestId;
	};
	readonly identity: ApprovalRequestIdentity;
	readonly binding: ApprovalBinding;
} {
	const envelopeValue = envelope(authority, request);
	const identity = identityFor(authority, request);
	const provisional = {
		family: "command_execution" as const,
		method: request.method,
		request,
		params: request.params,
		...envelopeValue,
		identity,
		binding: Object.freeze({
			child: envelopeValue.child,
			epoch: envelopeValue.epoch,
			link: null,
			target: targetFor(identity),
			effect: effectFingerprint({ method: request.method, params: request.params }),
		}),
		expiresAtMs,
	} as unknown as ApprovalRequest;
	return {
		envelope: envelopeValue,
		identity,
		binding: completeBinding(provisional, input),
	};
}

export function normalizeApprovalRequest(
	authority: IdentityAuthority,
	request: TransportServerRequest,
	expiresAtMs: number,
	input?: ApprovalBindingInput,
): ApprovalRequest {
	if (request.owner !== "codex-approvals") {
		throw new CodexApprovalError(
			"unsupported_request",
			`The ${request.method} request is not owned by codex-approvals.`,
		);
	}
	const ownedRequest = cloneAndFreeze(request);
	const common = base(authority, ownedRequest, expiresAtMs, input);
	const { child, epoch, requestId } = common.envelope;
	const { identity } = common;
	const binding = common.binding;

	switch (ownedRequest.method) {
		case "item/commandExecution/requestApproval": {
			const item = itemIdentity(authority, ownedRequest.params, ownedRequest.params.approvalId);
			const result: CommandApprovalRequest = {
				family: "command_execution",
				method: ownedRequest.method,
				request: ownedRequest,
				params: ownedRequest.params,
				child,
				epoch,
				requestId,
				identity: item.identity,
				binding,
				expiresAtMs,
				threadId: item.threadId,
				turnId: item.turnId,
				itemId: item.itemId,
				approvalId: item.approvalId,
			};
			return deepFreeze(result);
		}
		case "item/fileChange/requestApproval": {
			const item = itemIdentity(authority, ownedRequest.params, undefined);
			const result: FileApprovalRequest = {
				family: "file_change",
				method: ownedRequest.method,
				request: ownedRequest,
				params: ownedRequest.params,
				child,
				epoch,
				requestId,
				identity: item.identity,
				binding,
				expiresAtMs,
				threadId: item.threadId,
				turnId: item.turnId,
				itemId: item.itemId,
				approvalId: null,
			};
			return deepFreeze(result);
		}
		case "item/tool/requestUserInput": {
			const item = itemIdentity(authority, ownedRequest.params, undefined);
			const result: UserInputApprovalRequest = {
				family: "user_input",
				method: ownedRequest.method,
				request: ownedRequest,
				params: ownedRequest.params,
				child,
				epoch,
				requestId,
				identity: item.identity,
				binding,
				expiresAtMs,
				threadId: item.threadId,
				turnId: item.turnId,
				itemId: item.itemId,
				approvalId: null,
			};
			return deepFreeze(result);
		}
		case "mcpServer/elicitation/request": {
			const elicitation = identity as Extract<
				ApprovalRequestIdentity,
				{ readonly kind: "elicitation" }
			>;
			const result: ElicitationApprovalRequest = {
				family: "elicitation",
				method: ownedRequest.method,
				request: ownedRequest,
				params: ownedRequest.params,
				child,
				epoch,
				requestId,
				identity: elicitation,
				binding,
				expiresAtMs,
				threadId: elicitation.threadId,
				turnId: elicitation.turnId,
				serverName: elicitation.serverName,
				elicitationId: elicitation.elicitationId,
				itemId: null,
				approvalId: null,
			};
			return deepFreeze(result);
		}
		case "item/permissions/requestApproval": {
			const item = itemIdentity(authority, ownedRequest.params, undefined);
			const result: PermissionsApprovalRequest = {
				family: "permissions",
				method: ownedRequest.method,
				request: ownedRequest,
				params: ownedRequest.params,
				child,
				epoch,
				requestId,
				identity: item.identity,
				binding,
				expiresAtMs,
				threadId: item.threadId,
				turnId: item.turnId,
				itemId: item.itemId,
				approvalId: null,
			};
			return deepFreeze(result);
		}
		case "applyPatchApproval": {
			const legacy = identity as Extract<ApprovalRequestIdentity, { readonly kind: "legacy" }>;
			const result: ApplyPatchApprovalRequest = {
				family: "apply_patch",
				method: ownedRequest.method,
				request: ownedRequest,
				params: ownedRequest.params,
				child,
				epoch,
				requestId,
				identity: legacy,
				binding,
				expiresAtMs,
				conversationId: legacy.conversationId,
				callId: legacy.callId,
				approvalId: null,
				threadId: legacy.conversationId,
				turnId: null,
				itemId: null,
			};
			return deepFreeze(result);
		}
		case "execCommandApproval": {
			const legacy = identity as Extract<ApprovalRequestIdentity, { readonly kind: "legacy" }>;
			const result: ExecCommandApprovalRequest = {
				family: "exec_command",
				method: ownedRequest.method,
				request: ownedRequest,
				params: ownedRequest.params,
				child,
				epoch,
				requestId,
				identity: legacy,
				binding,
				expiresAtMs,
				conversationId: legacy.conversationId,
				callId: legacy.callId,
				approvalId: legacy.approvalId,
				threadId: legacy.conversationId,
				turnId: null,
				itemId: null,
			};
			return deepFreeze(result);
		}
	}
}

export function rebindApprovalRequest(
	request: ApprovalRequest,
	input: ApprovalBindingInput,
): ApprovalRequest {
	return deepFreeze({ ...request, binding: completeBinding(request, input) });
}

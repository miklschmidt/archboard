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
} from "@/runtime/codex-approvals/lib/contract";
import { CodexApprovalError } from "@/runtime/codex-approvals/lib/contract";
import { effectFingerprint } from "@/runtime/codex-approvals/lib/effect-fingerprint";
import {
	elicitationIdentity,
	envelope,
	isElicitationRequest,
	isItemRequest,
	itemIdentity,
	legacyIdentity,
	targetFor,
	type ApprovalEnvelope,
	type ElicitationRequest,
	type HumanRequest,
	type ItemRequest,
	type LegacyRequest,
} from "@/runtime/codex-approvals/lib/request-identity";
import type { IdentityAuthority } from "@/shared/codex-workbench-identity";
import type { TransportServerRequest } from "@/runtime/codex-transport/server-requests";

/** The part of a request a binding is completed from. */
type BindingSource = Pick<ApprovalRequest, "child" | "epoch" | "binding">;

/** Everything a normaliser needs besides the request itself. */
interface NormalizeContext {
	readonly authority: IdentityAuthority;
	readonly envelope: ApprovalEnvelope;
	readonly expiresAtMs: number;
	readonly input: ApprovalBindingInput | undefined;
}

/**
 * Freezes a value and everything reachable from it, so a normalised request
 * can be shared with listeners without any of them changing it.
 * @param value - The value to freeze in place.
 * @param seen - Objects already frozen, to stop on cycles.
 * @returns The same value, frozen.
 */
function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
	if (value === null || typeof value !== "object" || seen.has(value)) return value;
	seen.add(value);
	for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key), seen);
	return Object.freeze(value);
}

/**
 * Takes a private frozen copy of a transport request, so later mutation by
 * the transport cannot change what the broker recorded.
 * @param value - The value to copy.
 * @returns A deep-frozen structured clone.
 */
function cloneAndFreeze<T>(value: T): T {
	return deepFreeze(structuredClone(value));
}

/**
 * Validates one binding text field: non-empty and free of NUL.
 * @param value - The candidate text.
 * @param field - The field name for the refusal message.
 * @returns The text, once valid.
 */
function bindingText(value: unknown, field: string): string {
	if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
		throw new CodexApprovalError(
			"invalid_request",
			`Approval ${field} must be a non-empty string.`,
		);
	}
	return value;
}

/**
 * Chooses the link a completed binding carries: the caller's when it supplied
 * one explicitly (null included), otherwise the request's own.
 * @param request - The request whose binding is completed.
 * @param input - The caller's partial binding, if any.
 * @returns The link, or null for an unlinked pane.
 */
function bindingLink(
	request: BindingSource,
	input: ApprovalBindingInput | undefined,
): string | null {
	const link =
		input !== undefined && Object.hasOwn(input, "link") ? input.link : request.binding.link;
	if (link === undefined) {
		throw new CodexApprovalError(
			"invalid_request",
			"Approval link must be null or a non-empty string.",
		);
	}
	return link;
}

/**
 * Completes a caller's partial binding with the request's own values and
 * validates the result, so every binding the broker compares is whole.
 * @param request - The request whose binding is completed.
 * @param input - The caller's partial binding, if any.
 * @returns The frozen, validated binding.
 */
export function completeBinding(
	request: BindingSource,
	input: ApprovalBindingInput | undefined,
): ApprovalBinding {
	const candidate = bindingCandidate(request, input);
	assertBindingText(candidate);
	return Object.freeze(candidate);
}

/**
 * The completed binding: each field taken from the caller when they supplied one, and from the
 * request itself when they did not.
 * @param request - The request whose binding is completed.
 * @param input - The caller's partial binding, if any.
 * @returns The completed binding, before its text is checked.
 */
function bindingCandidate(
	request: BindingSource,
	input: ApprovalBindingInput | undefined,
): ApprovalBinding {
	const supplied = input ?? {};
	return {
		child: supplied.child ?? request.child,
		epoch: supplied.epoch ?? request.epoch,
		link: bindingLink(request, input),
		target: supplied.target ?? request.binding.target,
		effect: supplied.effect ?? request.binding.effect,
	};
}

/**
 * Prove every text field of a completed binding is usable. A binding is what an answer is proven
 * against later, so an empty or oversized field is refused now rather than at settlement.
 * @param candidate - The completed binding.
 * @throws {CodexApprovalError} When any field is not bounded text.
 */
function assertBindingText(candidate: ApprovalBinding): void {
	if (candidate.link !== null) {
		bindingText(candidate.link, "link");
	}
	bindingText(candidate.target, "target");
	bindingText(candidate.effect, "effect");
}

/**
 * Derives a request's binding: the envelope's child and epoch, the identity's
 * target and the effect fingerprint of the method and parameters, completed
 * with whatever the caller supplied.
 * @param context - The normalisation context.
 * @param request - The owned request.
 * @param identity - The request's identity.
 * @returns The completed binding.
 */
function bindingFor(
	context: NormalizeContext,
	request: HumanRequest,
	identity: ApprovalRequestIdentity,
): ApprovalBinding {
	const provisional: BindingSource = {
		child: context.envelope.child,
		epoch: context.envelope.epoch,
		binding: Object.freeze({
			child: context.envelope.child,
			epoch: context.envelope.epoch,
			link: null,
			target: targetFor(identity),
			effect: effectFingerprint({ method: request.method, params: request.params }),
		}),
	};
	return completeBinding(provisional, context.input);
}

/**
 * Reads the raw approval id of an item request; only command approvals carry one.
 * @param request - The owned item request.
 * @returns The raw approval id, or undefined for the methods without one.
 */
function itemApprovalId(request: ItemRequest): unknown {
	return request.method === "item/commandExecution/requestApproval"
		? request.params.approvalId
		: undefined;
}

/**
 * Normalises the four item-addressed methods, which share their identity
 * shape and differ in family and in whether an approval id is carried.
 * @param context - The normalisation context.
 * @param request - The owned item request.
 * @returns The frozen normalised request.
 */
function normalizeItemRequest(context: NormalizeContext, request: ItemRequest): ApprovalRequest {
	const item = itemIdentity(context.authority, request.params, itemApprovalId(request));
	const common = {
		...context.envelope,
		identity: item.identity,
		binding: bindingFor(context, request, item.identity),
		expiresAtMs: context.expiresAtMs,
		threadId: item.threadId,
		turnId: item.turnId,
		itemId: item.itemId,
	};
	switch (request.method) {
		case "item/commandExecution/requestApproval": {
			const result: CommandApprovalRequest = {
				family: "command_execution",
				method: request.method,
				request,
				params: request.params,
				...common,
				approvalId: item.approvalId,
			};
			return deepFreeze(result);
		}
		case "item/fileChange/requestApproval": {
			const result: FileApprovalRequest = {
				family: "file_change",
				method: request.method,
				request,
				params: request.params,
				...common,
				approvalId: null,
			};
			return deepFreeze(result);
		}
		case "item/tool/requestUserInput": {
			const result: UserInputApprovalRequest = {
				family: "user_input",
				method: request.method,
				request,
				params: request.params,
				...common,
				approvalId: null,
			};
			return deepFreeze(result);
		}
		case "item/permissions/requestApproval": {
			const result: PermissionsApprovalRequest = {
				family: "permissions",
				method: request.method,
				request,
				params: request.params,
				...common,
				approvalId: null,
			};
			return deepFreeze(result);
		}
		default:
			return unreachableRequest(request);
	}
}

/**
 * Normalises an MCP elicitation request.
 * @param context - The normalisation context.
 * @param request - The owned elicitation request.
 * @returns The frozen normalised request.
 */
function normalizeElicitationRequest(
	context: NormalizeContext,
	request: ElicitationRequest,
): ApprovalRequest {
	const identity = elicitationIdentity(context.authority, request);
	const result: ElicitationApprovalRequest = {
		family: "elicitation",
		method: request.method,
		request,
		params: request.params,
		...context.envelope,
		identity,
		binding: bindingFor(context, request, identity),
		expiresAtMs: context.expiresAtMs,
		threadId: identity.threadId,
		turnId: identity.turnId,
		serverName: identity.serverName,
		elicitationId: identity.elicitationId,
		itemId: null,
		approvalId: null,
	};
	return deepFreeze(result);
}

/**
 * Normalises the two legacy conversation-and-call methods.
 * @param context - The normalisation context.
 * @param request - The owned legacy request.
 * @returns The frozen normalised request.
 */
function normalizeLegacyRequest(
	context: NormalizeContext,
	request: LegacyRequest,
): ApprovalRequest {
	const identity = legacyIdentity(context.authority, request);
	const common = {
		...context.envelope,
		identity,
		binding: bindingFor(context, request, identity),
		expiresAtMs: context.expiresAtMs,
		conversationId: identity.conversationId,
		callId: identity.callId,
		threadId: identity.conversationId,
		turnId: null,
		itemId: null,
	};
	if (request.method === "applyPatchApproval") {
		const result: ApplyPatchApprovalRequest = {
			family: "apply_patch",
			method: request.method,
			request,
			params: request.params,
			...common,
			approvalId: null,
		};
		return deepFreeze(result);
	}
	// Named rather than assumed: the union holds exactly two methods today, so the
	// compiler reads this as redundant, and that is the point. A third legacy method
	// would reach unreachableRequest instead of being normalized as an exec_command.
	// oxlint-disable-next-line typescript/no-unnecessary-condition -- exhaustiveness, not narrowing
	if (request.method === "execCommandApproval") {
		const result: ExecCommandApprovalRequest = {
			family: "exec_command",
			method: request.method,
			request,
			params: request.params,
			...common,
			approvalId: identity.approvalId,
		};
		return deepFreeze(result);
	}
	// Named rather than defaulted: a legacy method added to the union must be given
	// its own family here instead of silently arriving as an exec_command.
	return unreachableRequest(request);
}

/**
 * Fails when a method reaches a normaliser that handles no such method, which
 * the type system rules out but the code path analysis cannot see.
 * @param request - The request no branch handled.
 */
function unreachableRequest(request: never): never {
	throw new CodexApprovalError(
		"unsupported_request",
		`The approval request method is not supported: ${JSON.stringify(request)}`,
	);
}

/**
 * Turns a transport request into the broker's frozen, identity-verified
 * approval request: the one shape every later step reasons about.
 * @param authority - The session identity authority.
 * @param request - The transport request as delivered.
 * @param expiresAtMs - When the approval expires unresolved.
 * @param input - The caller's partial binding, if it already knows one.
 * @returns The frozen normalised request.
 */
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
	const context: NormalizeContext = {
		authority,
		envelope: envelope(authority, ownedRequest),
		expiresAtMs,
		input,
	};
	if (isItemRequest(ownedRequest)) {
		return normalizeItemRequest(context, ownedRequest);
	}
	if (isElicitationRequest(ownedRequest)) {
		return normalizeElicitationRequest(context, ownedRequest);
	}
	return normalizeLegacyRequest(context, ownedRequest);
}

/**
 * Replaces a request's binding with one completed from new caller evidence.
 * @param request - The normalised request.
 * @param input - The caller's partial binding.
 * @returns A frozen copy carrying the completed binding.
 */
export function rebindApprovalRequest(
	request: ApprovalRequest,
	input: ApprovalBindingInput,
): ApprovalRequest {
	return deepFreeze({ ...request, binding: completeBinding(request, input) });
}

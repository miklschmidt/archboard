import type {
	ApprovalRequestIdentity,
	ElicitationApprovalIdentity,
	ItemApprovalIdentity,
	LegacyApprovalIdentity,
} from "@/runtime/codex-approvals/lib/contract";
import { CodexApprovalError } from "@/runtime/codex-approvals/lib/contract";
import type {
	ApprovalId,
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	ItemId,
	JsonRpcRequestId,
	ThreadId,
	TurnId,
} from "@/shared/codex-workbench-identity";
import type { TransportServerRequest } from "@/runtime/codex-transport/server-requests";

type HumanRequest = Extract<TransportServerRequest, { readonly owner: "codex-approvals" }>;
type OwnedRequest<Method extends HumanRequest["method"]> = Extract<
	HumanRequest,
	{ readonly method: Method }
>;
type ItemRequest = OwnedRequest<
	| "item/commandExecution/requestApproval"
	| "item/fileChange/requestApproval"
	| "item/tool/requestUserInput"
	| "item/permissions/requestApproval"
>;
type ElicitationRequest = OwnedRequest<"mcpServer/elicitation/request">;
type LegacyRequest = OwnedRequest<"applyPatchApproval" | "execCommandApproval">;

/** The child, epoch and JSON-RPC identity every approval request carries. */
interface ApprovalEnvelope {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly requestId: JsonRpcRequestId;
}

/** An item identity together with the ids the request types repeat at top level. */
interface ItemIdentityFields {
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly itemId: ItemId;
	readonly approvalId: ApprovalId | null;
	readonly identity: ItemApprovalIdentity;
}

const ITEM_METHODS: ReadonlySet<HumanRequest["method"]> = new Set<HumanRequest["method"]>([
	"item/commandExecution/requestApproval",
	"item/fileChange/requestApproval",
	"item/tool/requestUserInput",
	"item/permissions/requestApproval",
]);

/**
 * Tells whether a request is addressed by thread, turn and item ids.
 * @param request - Any human approval request.
 * @returns True for the four item-addressed approval methods.
 */
function isItemRequest(request: HumanRequest): request is ItemRequest {
	return ITEM_METHODS.has(request.method);
}

/**
 * Tells whether a request is an MCP elicitation.
 * @param request - Any human approval request.
 * @returns True for the elicitation method.
 */
function isElicitationRequest(request: HumanRequest): request is ElicitationRequest {
	return request.method === "mcpServer/elicitation/request";
}

/**
 * Parses an id with the session decoder and, when the id was minted outside
 * this session, adopts it instead, so a foreign id is still tracked exactly.
 * @param raw - The id as it arrived on the wire.
 * @param parse - The strict decoder for ids minted here.
 * @param adoptRaw - The adopter for ids minted elsewhere.
 * @returns The typed id.
 */
function adopt<T>(raw: unknown, parse: (value: unknown) => T, adoptRaw: (value: unknown) => T): T {
	try {
		return parse(raw);
	} catch {
		return adoptRaw(raw);
	}
}

/**
 * Adopts an approval id that Codex may omit.
 * @param authority - The session identity authority.
 * @param raw - The approval id as it arrived, possibly absent.
 * @returns The typed approval id, or null when Codex sent none.
 */
function optionalApprovalId(authority: IdentityAuthority, raw: unknown): ApprovalId | null {
	if (raw === null || raw === undefined) return null;
	return adopt(raw, authority.decoder.parseApprovalId, authority.decoder.adoptApprovalId);
}

/**
 * Adopts the thread, turn and item ids of an item-addressed request and builds
 * the item identity from them.
 * @param authority - The session identity authority.
 * @param params - The request parameters carrying the raw ids.
 * @param approvalId - The raw approval id, when the method carries one.
 * @returns The adopted ids and the identity built from them.
 */
function itemIdentity(
	authority: IdentityAuthority,
	params: { readonly threadId: unknown; readonly turnId: unknown; readonly itemId: unknown },
	approvalId: unknown,
): ItemIdentityFields {
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

/**
 * Builds the identity of an MCP elicitation, which is addressed by server
 * name rather than item and only carries an elicitation id in URL mode.
 * @param authority - The session identity authority.
 * @param request - The elicitation request.
 * @returns The elicitation identity.
 */
function elicitationIdentity(
	authority: IdentityAuthority,
	request: ElicitationRequest,
): ElicitationApprovalIdentity {
	const threadId = adopt(
		request.params.threadId,
		authority.decoder.parseThreadId,
		authority.decoder.adoptThreadId,
	);
	const turnId =
		request.params.turnId === null
			? null
			: adopt(request.params.turnId, authority.decoder.parseTurnId, authority.decoder.adoptTurnId);
	return Object.freeze({
		kind: "elicitation",
		threadId,
		turnId,
		serverName: request.params.serverName,
		elicitationId: request.params.mode === "url" ? request.params.elicitationId : null,
	});
}

/**
 * Builds the identity of a legacy conversation-and-call approval. Only the
 * exec-command form carries an approval id.
 * @param authority - The session identity authority.
 * @param request - The legacy request.
 * @returns The legacy identity.
 */
function legacyIdentity(
	authority: IdentityAuthority,
	request: LegacyRequest,
): LegacyApprovalIdentity {
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

/**
 * Verifies that a request's child, epoch and JSON-RPC id are valid in this
 * session and agree with its transport correlation, then returns them.
 * @param authority - The session identity authority.
 * @param request - The request to verify.
 * @returns The verified envelope.
 */
function envelope(authority: IdentityAuthority, request: HumanRequest): ApprovalEnvelope {
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

/**
 * Renders an identity as the stable target string a binding is compared by.
 * @param identity - The request identity.
 * @returns The target string.
 */
function targetFor(identity: ApprovalRequestIdentity): string {
	switch (identity.kind) {
		case "item":
			return `thread:${identity.threadId}/turn:${identity.turnId}/item:${identity.itemId}`;
		case "elicitation":
			return `thread:${identity.threadId}/turn:${identity.turnId ?? "none"}/server:${identity.serverName}/elicitation:${identity.elicitationId ?? "none"}`;
		case "legacy":
			return `conversation:${identity.conversationId}/call:${identity.callId}`;
		default:
			return unreachableIdentity(identity);
	}
}

/**
 * Fails when a new identity kind reaches the target renderer, which the type
 * system rules out but the code path analysis cannot see.
 * @param identity - The identity no branch handled.
 * @returns Never.
 */
function unreachableIdentity(identity: never): never {
	throw new CodexApprovalError(
		"invalid_request",
		`The approval identity kind is not supported: ${JSON.stringify(identity)}`,
	);
}

export {
	type ApprovalEnvelope,
	type ElicitationRequest,
	type HumanRequest,
	type ItemIdentityFields,
	type ItemRequest,
	type LegacyRequest,
	type OwnedRequest,
	elicitationIdentity,
	envelope,
	isElicitationRequest,
	isItemRequest,
	itemIdentity,
	legacyIdentity,
	targetFor,
};

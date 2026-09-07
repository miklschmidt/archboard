import type { ResponseMethod, ResponsePayloads } from "@/runtime/codex-protocol";
import type { TrustedIdentityDecoder } from "@/shared/codex-workbench-identity";
import { SESSION_PROTOCOL_METHODS } from "@/runtime/codex-session/lib/response-contract";
import { collectResponseIdentities } from "@/runtime/codex-session/lib/response-identity-collection";
import {
	adoptedMap,
	brandResponse,
	type ResponseIdentityMaps,
} from "@/runtime/codex-session/lib/response-identity-branding";
import type {
	ExactSessionRequestIdentityTuple,
	SessionAccountLoginResult,
	SessionAgentMessageItem,
	SessionCollabAgentItem,
	SessionLoadedThreadPageResult,
	SessionQueueAddResult,
	SessionQueuedSubmission,
	SessionQueueListResult,
	SessionQueueStartResult,
	SessionQueueUpdateResult,
	SessionRequestIdentityField,
	SessionResponse,
	SessionResponsePayloads,
	SessionSubAgentActivityItem,
	SessionThread,
	SessionThreadForkResult,
	SessionThreadItem,
	SessionThreadItemPageResult,
	SessionThreadPageResult,
	SessionThreadReadResult,
	SessionThreadSource,
	SessionThreadSpawnSource,
	SessionThreadStartResult,
	SessionThreadTurnPageResult,
	SessionTurn,
	SessionTurnResult,
	SessionTurnSteerResult,
} from "@/runtime/codex-session/lib/response-contract";

/**
 * Adopts every identity in one decoded response as a single authority transaction.
 * @param method - Protocol method that owns the decoded response.
 * @param payload - Schema-decoded response to adopt.
 * @param decoder - Authority responsible for atomic identity adoption.
 * @returns The response with its server identities adopted.
 */
function adoptSessionResponse<Method extends ResponseMethod>(
	method: Method,
	payload: ResponsePayloads[Method],
	decoder: TrustedIdentityDecoder,
): SessionResponsePayloads[Method] {
	const kind = SESSION_PROTOCOL_METHODS[method].responseIdentities;
	const raw = collectResponseIdentities(kind, payload);
	const adopted = decoder.adoptCodexResponseIdentities(raw);
	const maps: ResponseIdentityMaps = {
		threadIds: adoptedMap(raw.threadIds, adopted.threadIds),
		turnIds: adoptedMap(raw.turnIds, adopted.turnIds),
		itemIds: adoptedMap(raw.itemIds, adopted.itemIds),
		queuedSubmissionIds: adoptedMap(raw.queuedSubmissionIds, adopted.queuedSubmissionIds),
		loginIds: adoptedMap(raw.loginIds, adopted.loginIds),
	};
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the payload was schema-decoded as ResponsePayloads[Method]; branding only substitutes each collected identity string with its adopted brand of the same runtime value, so the shape is SessionResponsePayloads[Method] by construction, which TypeScript cannot follow through untyped records
	return brandResponse(kind, payload, maps) as SessionResponsePayloads[Method];
}

export {
	adoptSessionResponse,
	SESSION_PROTOCOL_METHODS,
	type ExactSessionRequestIdentityTuple,
	type SessionAccountLoginResult,
	type SessionAgentMessageItem,
	type SessionCollabAgentItem,
	type SessionLoadedThreadPageResult,
	type SessionQueueAddResult,
	type SessionQueuedSubmission,
	type SessionQueueListResult,
	type SessionQueueStartResult,
	type SessionQueueUpdateResult,
	type SessionResponse,
	type SessionResponsePayloads,
	type SessionRequestIdentityField,
	type SessionSubAgentActivityItem,
	type SessionThread,
	type SessionThreadForkResult,
	type SessionThreadItem,
	type SessionThreadItemPageResult,
	type SessionThreadPageResult,
	type SessionThreadReadResult,
	type SessionThreadSource,
	type SessionThreadSpawnSource,
	type SessionThreadStartResult,
	type SessionThreadTurnPageResult,
	type SessionTurn,
	type SessionTurnResult,
	type SessionTurnSteerResult,
};

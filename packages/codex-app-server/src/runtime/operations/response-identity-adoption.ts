import type { ResponseMethod } from "#runtime/protocol/protocol-methods.ts";
import type { ResponsePayloads } from "#runtime/protocol/protocol-decoder.ts";
import type { TrustedIdentityDecoder } from "#shared/rules/workbench-identity.ts";
import { SESSION_PROTOCOL_METHODS } from "#runtime/schemas/session-responses.ts";
import { collectResponseIdentities } from "#runtime/operations/response-identity-collection.ts";
import {
	adoptedMap,
	brandResponse,
	type ResponseIdentityMaps,
} from "#runtime/operations/response-identity-branding.ts";
import type { SessionResponsePayloads } from "#runtime/schemas/session-responses.ts";

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

export { adoptSessionResponse };

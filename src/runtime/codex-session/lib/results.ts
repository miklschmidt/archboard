import type { ResponseMethod, ResponsePayloads } from "../../codex-protocol/index.js";
import type {
	ItemId,
	LoginId,
	QueuedSubmissionId,
	ThreadId,
	TrustedIdentityDecoder,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import { SESSION_PROTOCOL_METHODS } from "./response-contract.js";
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
} from "./response-contract.js";

type ResponseIdentityKind = (typeof SESSION_PROTOCOL_METHODS)[ResponseMethod]["responseIdentities"];
type DecodedResponse = {
	[Method in ResponseMethod]: {
		readonly kind: (typeof SESSION_PROTOCOL_METHODS)[Method]["responseIdentities"];
		readonly payload: ResponsePayloads[Method];
	};
}[ResponseMethod];
interface ResponseIdentityCollection {
	readonly threadIds: unknown[];
	readonly turnIds: unknown[];
	readonly itemIds: unknown[];
	readonly queuedSubmissionIds: unknown[];
	readonly loginIds: unknown[];
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
	return Array.isArray(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !isUnknownArray(value);
}

function collection(): ResponseIdentityCollection {
	return { threadIds: [], turnIds: [], itemIds: [], queuedSubmissionIds: [], loginIds: [] };
}

function collectThreadItem(value: unknown, identities: ResponseIdentityCollection): void {
	if (!isRecord(value)) {
		return;
	}
	identities.itemIds.push(value["id"]);
	if (value["type"] === "agentMessage" && isRecord(value["memoryCitation"])) {
		const { threadIds } = value["memoryCitation"];
		if (isUnknownArray(threadIds)) {
			identities.threadIds.push(...threadIds);
		}
	}
	if (value["type"] === "collabAgentToolCall") {
		identities.threadIds.push(value["senderThreadId"]);
		if (isUnknownArray(value["receiverThreadIds"])) {
			identities.threadIds.push(...value["receiverThreadIds"]);
		}
		if (isRecord(value["agentsStates"])) {
			identities.threadIds.push(...Object.keys(value["agentsStates"]));
		}
	}
	if (value["type"] === "subAgentActivity") {
		identities.threadIds.push(value["agentThreadId"]);
	}
}

function collectTurn(value: unknown, identities: ResponseIdentityCollection): void {
	if (!isRecord(value)) {
		return;
	}
	identities.turnIds.push(value["id"]);
	if (isUnknownArray(value["items"])) {
		for (const item of value["items"]) {
			collectThreadItem(item, identities);
		}
	}
}

function collectThreadSource(value: unknown, identities: ResponseIdentityCollection): void {
	if (
		!isRecord(value) ||
		!isRecord(value["subAgent"]) ||
		!isRecord(value["subAgent"]["thread_spawn"])
	) {
		return;
	}
	identities.threadIds.push(value["subAgent"]["thread_spawn"]["parent_thread_id"]);
}

function collectThread(value: unknown, identities: ResponseIdentityCollection): void {
	if (!isRecord(value)) {
		return;
	}
	identities.threadIds.push(value["id"]);
	if (value["forkedFromId"] !== null) {
		identities.threadIds.push(value["forkedFromId"]);
	}
	if (value["parentThreadId"] !== null) {
		identities.threadIds.push(value["parentThreadId"]);
	}
	collectThreadSource(value["source"], identities);
	if (isUnknownArray(value["turns"])) {
		for (const turn of value["turns"]) {
			collectTurn(turn, identities);
		}
	}
}

function collectQueue(value: unknown, identities: ResponseIdentityCollection): void {
	if (isRecord(value)) {
		identities.queuedSubmissionIds.push(value["id"]);
	}
}

function collectResponseIdentities(
	kind: ResponseIdentityKind,
	payload: unknown,
): ResponseIdentityCollection {
	const identities = collection();
	if (!isRecord(payload)) {
		return identities;
	}
	switch (kind) {
		case "login": {
			if (Object.hasOwn(payload, "loginId")) {
				identities.loginIds.push(payload["loginId"]);
			}
			break;
		}
		case "thread-start":
		case "thread": {
			collectThread(payload["thread"], identities);
			break;
		}
		case "thread-page": {
			if (isUnknownArray(payload["data"])) {
				for (const thread of payload["data"]) {
					collectThread(thread, identities);
				}
			}
			break;
		}
		case "loaded-thread-page": {
			if (isUnknownArray(payload["data"])) {
				identities.threadIds.push(...payload["data"]);
			}
			break;
		}
		case "turn": {
			collectTurn(payload["turn"], identities);
			break;
		}
		case "turn-page": {
			if (isUnknownArray(payload["data"])) {
				for (const turn of payload["data"]) {
					collectTurn(turn, identities);
				}
			}
			break;
		}
		case "item-page": {
			if (isUnknownArray(payload["data"])) {
				for (const entry of payload["data"]) {
					if (!isRecord(entry)) {
						continue;
					}
					identities.turnIds.push(entry["turnId"]);
					collectThreadItem(entry["item"], identities);
				}
			}
			break;
		}
		case "turn-id": {
			identities.turnIds.push(payload["turnId"]);
			break;
		}
		case "queue": {
			collectQueue(payload["queuedSubmission"], identities);
			break;
		}
		case "queue-page": {
			if (isUnknownArray(payload["data"])) {
				for (const queued of payload["data"]) {
					collectQueue(queued, identities);
				}
			}
			break;
		}
		case "none":
		case "raw-realtime": {
			break;
		}
		default: {
			const checked: never = kind;
			return checked;
		}
	}
	return identities;
}

interface ResponseIdentityMaps {
	readonly threadIds: Readonly<ReadonlyMap<unknown, ThreadId>>;
	readonly turnIds: Readonly<ReadonlyMap<unknown, TurnId>>;
	readonly itemIds: Readonly<ReadonlyMap<unknown, ItemId>>;
	readonly queuedSubmissionIds: Readonly<ReadonlyMap<unknown, QueuedSubmissionId>>;
	readonly loginIds: Readonly<ReadonlyMap<unknown, LoginId>>;
}

function adoptedMap<Identity extends string>(
	raw: readonly unknown[],
	adopted: readonly Identity[],
): ReadonlyMap<unknown, Identity> {
	return new Map(adopted.map((identity, index) => [raw[index], identity]));
}

function brandThreadItem(
	value: Readonly<Record<string, unknown>>,
	maps: ResponseIdentityMaps,
): unknown {
	const branded: Record<string, unknown> = { ...value, id: maps.itemIds.get(value["id"]) };
	if (value["type"] === "agentMessage" && isRecord(value["memoryCitation"])) {
		const citation = value["memoryCitation"];
		branded["memoryCitation"] = {
			...citation,
			threadIds: isUnknownArray(citation["threadIds"])
				? citation["threadIds"].map((threadId) => maps.threadIds.get(threadId))
				: citation["threadIds"],
		};
	}
	if (value["type"] === "collabAgentToolCall") {
		branded["senderThreadId"] = maps.threadIds.get(value["senderThreadId"]);
		branded["receiverThreadIds"] = isUnknownArray(value["receiverThreadIds"])
			? value["receiverThreadIds"].map((threadId) => maps.threadIds.get(threadId))
			: value["receiverThreadIds"];
		if (isRecord(value["agentsStates"])) {
			branded["agentsStates"] = Object.fromEntries(
				Object.entries(value["agentsStates"]).map(
					([threadId, state]: readonly [string, unknown]) => [maps.threadIds.get(threadId), state],
				),
			);
		}
	}
	if (value["type"] === "subAgentActivity") {
		branded["agentThreadId"] = maps.threadIds.get(value["agentThreadId"]);
	}
	return branded;
}

function brandTurn(
	value: Readonly<Record<string, unknown>>,
	maps: ResponseIdentityMaps,
): SessionTurn {
	return {
		...value,
		id: maps.turnIds.get(value["id"]),
		items: isUnknownArray(value["items"])
			? value["items"].map((item) =>
					brandThreadItem(item as Readonly<Record<string, unknown>>, maps),
				)
			: value["items"],
	} as SessionTurn;
}

function brandThreadSource(value: unknown, maps: ResponseIdentityMaps): unknown {
	if (
		!isRecord(value) ||
		!isRecord(value["subAgent"]) ||
		!isRecord(value["subAgent"]["thread_spawn"])
	) {
		return value;
	}
	return {
		...value,
		subAgent: {
			...value["subAgent"],
			thread_spawn: {
				...value["subAgent"]["thread_spawn"],
				parent_thread_id: maps.threadIds.get(value["subAgent"]["thread_spawn"]["parent_thread_id"]),
			},
		},
	};
}

function brandThread(
	value: Readonly<Record<string, unknown>>,
	maps: ResponseIdentityMaps,
): SessionThread {
	return {
		...value,
		id: maps.threadIds.get(value["id"]),
		forkedFromId: value["forkedFromId"] === null ? null : maps.threadIds.get(value["forkedFromId"]),
		parentThreadId:
			value["parentThreadId"] === null ? null : maps.threadIds.get(value["parentThreadId"]),
		source: brandThreadSource(value["source"], maps),
		turns: isUnknownArray(value["turns"])
			? value["turns"].map((turn) => brandTurn(turn as Readonly<Record<string, unknown>>, maps))
			: value["turns"],
	} as SessionThread;
}

function brandQueue(value: Readonly<Record<string, unknown>>, maps: ResponseIdentityMaps): unknown {
	return { ...value, id: maps.queuedSubmissionIds.get(value["id"]) };
}

function brandItemEntry(
	entry: Readonly<Record<string, unknown>>,
	maps: ResponseIdentityMaps,
): Record<string, unknown> {
	return {
		...entry,
		turnId: maps.turnIds.get(entry["turnId"]),
		item: brandThreadItem(entry["item"] as Readonly<Record<string, unknown>>, maps),
	};
}

function brandResponse(
	kind: ResponseIdentityKind,
	payload: unknown,
	maps: ResponseIdentityMaps,
): unknown {
	if (!isRecord(payload)) {
		return payload;
	}
	const { kind: decodedKind, payload: decodedPayload } = { kind, payload } as DecodedResponse;
	switch (decodedKind) {
		case "login": {
			return Object.hasOwn(decodedPayload, "loginId")
				? { ...decodedPayload, loginId: maps.loginIds.get(decodedPayload.loginId) }
				: decodedPayload;
		}
		case "thread-start":
		case "thread": {
			return {
				...decodedPayload,
				thread: brandThread(decodedPayload.thread, maps),
			};
		}
		case "thread-page": {
			return {
				...decodedPayload,
				data: decodedPayload.data.map((thread: Readonly<Record<string, unknown>>) =>
					brandThread(thread, maps),
				),
			};
		}
		case "loaded-thread-page": {
			return {
				...decodedPayload,
				data: decodedPayload.data.map((threadId: string) => maps.threadIds.get(threadId)),
			};
		}
		case "turn": {
			return { ...decodedPayload, turn: brandTurn(decodedPayload.turn, maps) };
		}
		case "turn-page": {
			return {
				...decodedPayload,
				data: decodedPayload.data.map((turn: Readonly<Record<string, unknown>>) =>
					brandTurn(turn, maps),
				),
			};
		}
		case "item-page": {
			return {
				...decodedPayload,
				data: decodedPayload.data.map((entry: Readonly<Record<string, unknown>>) =>
					brandItemEntry(entry, maps),
				),
			};
		}
		case "turn-id": {
			return { ...decodedPayload, turnId: maps.turnIds.get(decodedPayload.turnId) };
		}
		case "queue": {
			return {
				...decodedPayload,
				queuedSubmission: brandQueue(decodedPayload.queuedSubmission, maps),
			};
		}
		case "queue-page": {
			return {
				...decodedPayload,
				data: decodedPayload.data.map((queued: Readonly<Record<string, unknown>>) =>
					brandQueue(queued, maps),
				),
			};
		}
		case "none":
		case "raw-realtime": {
			return decodedPayload;
		}
		default: {
			const checked: never = decodedKind;
			return checked;
		}
	}
}

/**
 * Adopts every identity in one decoded response as a single authority transaction.
 * @param method Protocol method that owns the decoded response.
 * @param payload Schema-decoded response to adopt.
 * @param decoder Authority responsible for atomic identity adoption.
 * @returns The response with its server identities adopted.
 */
function adoptSessionResponse<Method extends ResponseMethod>(
	method: Method,
	payload: ResponsePayloads[Method],
	decoder: TrustedIdentityDecoder,
): SessionResponsePayloads[Method] {
	const kind = SESSION_PROTOCOL_METHODS[method].responseIdentities;
	if (kind === "none" || kind === "raw-realtime") {
		return payload as SessionResponsePayloads[Method];
	}
	const raw = collectResponseIdentities(kind, payload);
	const adopted = decoder.adoptCodexResponseIdentities(raw);
	const maps: ResponseIdentityMaps = {
		threadIds: adoptedMap(raw.threadIds, adopted.threadIds),
		turnIds: adoptedMap(raw.turnIds, adopted.turnIds),
		itemIds: adoptedMap(raw.itemIds, adopted.itemIds),
		queuedSubmissionIds: adoptedMap(raw.queuedSubmissionIds, adopted.queuedSubmissionIds),
		loginIds: adoptedMap(raw.loginIds, adopted.loginIds),
	};
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

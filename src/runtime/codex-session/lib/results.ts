import type { ResponseMethod, ResponsePayloads } from "@/runtime/codex-protocol";
import type {
	ItemId,
	LoginId,
	QueuedSubmissionId,
	ThreadId,
	TrustedIdentityDecoder,
	TurnId,
} from "@/shared/codex-workbench-identity";
import { SESSION_PROTOCOL_METHODS } from "@/runtime/codex-session/lib/response-contract";
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

type ResponseIdentityKind = (typeof SESSION_PROTOCOL_METHODS)[ResponseMethod]["responseIdentities"];
type UnknownRecord = Readonly<Record<string, unknown>>;
interface ResponseIdentityCollection {
	readonly threadIds: unknown[];
	readonly turnIds: unknown[];
	readonly itemIds: unknown[];
	readonly queuedSubmissionIds: unknown[];
	readonly loginIds: unknown[];
}

/**
 * Narrows to an array without claiming anything about its elements.
 * @param value - Any value.
 * @returns Whether the value is an array.
 */
function isUnknownArray(value: unknown): value is readonly unknown[] {
	return Array.isArray(value);
}

/**
 * Narrows to a plain object so fields can be read by key.
 * @param value - Any value.
 * @returns Whether the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is UnknownRecord {
	return value !== null && typeof value === "object" && !isUnknownArray(value);
}

/**
 * Creates an empty identity collection.
 * @returns Fresh empty lists for every identity kind.
 */
function collection(): ResponseIdentityCollection {
	return { threadIds: [], turnIds: [], itemIds: [], queuedSubmissionIds: [], loginIds: [] };
}

/**
 * Collects the thread ids cited by an agent message's memory citation.
 * @param item - The agent message item.
 * @param identities - The collection to append to.
 */
function collectAgentMessageThreads(
	item: UnknownRecord,
	identities: ResponseIdentityCollection,
): void {
	if (!isRecord(item["memoryCitation"])) {
		return;
	}
	const { threadIds } = item["memoryCitation"];
	if (isUnknownArray(threadIds)) {
		identities.threadIds.push(...threadIds);
	}
}

/**
 * Collects the sender, receiver and agent-state thread ids of a collab tool call.
 * @param item - The collab agent tool call item.
 * @param identities - The collection to append to.
 */
function collectCollabAgentThreads(
	item: UnknownRecord,
	identities: ResponseIdentityCollection,
): void {
	identities.threadIds.push(item["senderThreadId"]);
	if (isUnknownArray(item["receiverThreadIds"])) {
		identities.threadIds.push(...item["receiverThreadIds"]);
	}
	if (isRecord(item["agentsStates"])) {
		identities.threadIds.push(...Object.keys(item["agentsStates"]));
	}
}

/**
 * Collects the item id and every thread id a thread item refers to, by item type.
 * @param value - The candidate thread item.
 * @param identities - The collection to append to.
 */
function collectThreadItem(value: unknown, identities: ResponseIdentityCollection): void {
	if (!isRecord(value)) {
		return;
	}
	identities.itemIds.push(value["id"]);
	switch (value["type"]) {
		case "agentMessage": {
			collectAgentMessageThreads(value, identities);
			break;
		}
		case "collabAgentToolCall": {
			collectCollabAgentThreads(value, identities);
			break;
		}
		case "subAgentActivity": {
			identities.threadIds.push(value["agentThreadId"]);
			break;
		}
		default: {
			break;
		}
	}
}

/**
 * Collects a turn id and the identities of its items.
 * @param value - The candidate turn.
 * @param identities - The collection to append to.
 */
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

/**
 * Collects the parent thread id of a subagent thread-spawn source.
 * @param value - The candidate thread source.
 * @param identities - The collection to append to.
 */
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

/**
 * Collects a thread id, its ancestry, its source and the identities of its turns.
 * @param value - The candidate thread.
 * @param identities - The collection to append to.
 */
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

/**
 * Collects a queued submission id.
 * @param value - The candidate queued submission.
 * @param identities - The collection to append to.
 */
function collectQueue(value: unknown, identities: ResponseIdentityCollection): void {
	if (isRecord(value)) {
		identities.queuedSubmissionIds.push(value["id"]);
	}
}

/**
 * Applies a collector to every element of a payload's `data` page.
 * @param payload - The page payload.
 * @param collect - The collector for one element.
 * @param identities - The collection to append to.
 */
function collectPage(
	payload: UnknownRecord,
	collect: (value: unknown, identities: ResponseIdentityCollection) => void,
	identities: ResponseIdentityCollection,
): void {
	if (isUnknownArray(payload["data"])) {
		for (const entry of payload["data"]) {
			collect(entry, identities);
		}
	}
}

/**
 * Collects the login id a hosted login response carries.
 * @param payload - The login response.
 * @param identities - The collection to append to.
 */
function collectLogin(payload: UnknownRecord, identities: ResponseIdentityCollection): void {
	if (Object.hasOwn(payload, "loginId")) {
		identities.loginIds.push(payload["loginId"]);
	}
}

/**
 * Collects a turn id and the identities of one item-page entry.
 * @param entry - The candidate page entry.
 * @param identities - The collection to append to.
 */
function collectItemEntry(entry: unknown, identities: ResponseIdentityCollection): void {
	if (!isRecord(entry)) {
		return;
	}
	identities.turnIds.push(entry["turnId"]);
	collectThreadItem(entry["item"], identities);
}

type PayloadCollector = (payload: UnknownRecord, identities: ResponseIdentityCollection) => void;

/**
 * Collects nothing, for responses that carry no server identities.
 */
function collectNothing(): void {
	/* Raw and identity-free responses are adopted as they are. */
}

/** Which identities each response kind carries, mirrored exactly by RESPONSE_BRANDERS. */
const RESPONSE_COLLECTORS: Readonly<Record<ResponseIdentityKind, PayloadCollector>> = {
	none: collectNothing,
	"raw-realtime": collectNothing,
	login: collectLogin,
	"thread-start": (payload, identities) => collectThread(payload["thread"], identities),
	thread: (payload, identities) => collectThread(payload["thread"], identities),
	"thread-page": (payload, identities) => collectPage(payload, collectThread, identities),
	"loaded-thread-page": (payload, identities) => {
		if (isUnknownArray(payload["data"])) {
			identities.threadIds.push(...payload["data"]);
		}
	},
	turn: (payload, identities) => collectTurn(payload["turn"], identities),
	"turn-page": (payload, identities) => collectPage(payload, collectTurn, identities),
	"item-page": (payload, identities) => collectPage(payload, collectItemEntry, identities),
	"turn-id": (payload, identities) => identities.turnIds.push(payload["turnId"]),
	queue: (payload, identities) => collectQueue(payload["queuedSubmission"], identities),
	"queue-page": (payload, identities) => collectPage(payload, collectQueue, identities),
};

/**
 * Gathers every raw server identity in a decoded response so they can be adopted as one
 * batch before any of them is trusted.
 * @param kind - Which identities the response kind carries.
 * @param payload - The decoded response.
 * @returns The raw identities, grouped by kind.
 */
function collectResponseIdentities(
	kind: ResponseIdentityKind,
	payload: unknown,
): ResponseIdentityCollection {
	const identities = collection();
	if (isRecord(payload)) {
		RESPONSE_COLLECTORS[kind](payload, identities);
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

/**
 * Pairs each raw identity with its adopted counterpart by position.
 * @param raw - The raw identities in collection order.
 * @param adopted - The adopted identities in the same order.
 * @returns A lookup from raw value to adopted identity.
 */
function adoptedMap<Identity extends string>(
	raw: readonly unknown[],
	adopted: readonly Identity[],
): ReadonlyMap<unknown, Identity> {
	return new Map(adopted.map((identity, index) => [raw[index], identity]));
}

/**
 * Maps every element of an array value, leaving non-arrays untouched.
 * @param value - The candidate array.
 * @param brand - The branding applied to each element.
 * @returns The branded array, or the original value when it is not an array.
 */
function brandEach(value: unknown, brand: (element: unknown) => unknown): unknown {
	return isUnknownArray(value) ? value.map(brand) : value;
}

/**
 * Brands the thread ids cited by an agent message's memory citation.
 * @param item - The agent message item.
 * @param maps - The adopted identity lookups.
 * @returns The fields to overlay on the item.
 */
function brandAgentMessage(item: UnknownRecord, maps: ResponseIdentityMaps): UnknownRecord {
	if (!isRecord(item["memoryCitation"])) {
		return {};
	}
	const citation = item["memoryCitation"];
	return {
		memoryCitation: {
			...citation,
			threadIds: brandEach(citation["threadIds"], (threadId) => maps.threadIds.get(threadId)),
		},
	};
}

/**
 * Brands the sender, receiver and agent-state thread ids of a collab tool call.
 * @param item - The collab agent tool call item.
 * @param maps - The adopted identity lookups.
 * @returns The fields to overlay on the item.
 */
function brandCollabAgent(item: UnknownRecord, maps: ResponseIdentityMaps): UnknownRecord {
	const branded: Record<string, unknown> = {
		senderThreadId: maps.threadIds.get(item["senderThreadId"]),
		receiverThreadIds: brandEach(item["receiverThreadIds"], (threadId) =>
			maps.threadIds.get(threadId),
		),
	};
	if (isRecord(item["agentsStates"])) {
		branded["agentsStates"] = Object.fromEntries(
			Object.entries(item["agentsStates"]).map(([threadId, state]: readonly [string, unknown]) => [
				maps.threadIds.get(threadId),
				state,
			]),
		);
	}
	return branded;
}

/**
 * Brands the item id and, by item type, every thread id a thread item refers to.
 * @param value - The candidate thread item.
 * @param maps - The adopted identity lookups.
 * @returns The branded item, or the original value when it is not an object.
 */
function brandThreadItem(value: unknown, maps: ResponseIdentityMaps): unknown {
	if (!isRecord(value)) {
		return value;
	}
	const branded: Record<string, unknown> = { ...value, id: maps.itemIds.get(value["id"]) };
	switch (value["type"]) {
		case "agentMessage": {
			return { ...branded, ...brandAgentMessage(value, maps) };
		}
		case "collabAgentToolCall": {
			return { ...branded, ...brandCollabAgent(value, maps) };
		}
		case "subAgentActivity": {
			return { ...branded, agentThreadId: maps.threadIds.get(value["agentThreadId"]) };
		}
		default: {
			return branded;
		}
	}
}

/**
 * Brands a turn id and the items of a turn.
 * @param value - The candidate turn.
 * @param maps - The adopted identity lookups.
 * @returns The branded turn, or the original value when it is not an object.
 */
function brandTurn(value: unknown, maps: ResponseIdentityMaps): unknown {
	if (!isRecord(value)) {
		return value;
	}
	return {
		...value,
		id: maps.turnIds.get(value["id"]),
		items: brandEach(value["items"], (item) => brandThreadItem(item, maps)),
	};
}

/**
 * Brands the parent thread id of a subagent thread-spawn source.
 * @param value - The candidate thread source.
 * @param maps - The adopted identity lookups.
 * @returns The branded source, or the original value for every other source shape.
 */
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

/**
 * Brands a nullable thread reference.
 * @param value - The raw thread id or null.
 * @param maps - The adopted identity lookups.
 * @returns The branded id, or null when the reference is null.
 */
function brandNullableThreadId(value: unknown, maps: ResponseIdentityMaps): unknown {
	return value === null ? null : maps.threadIds.get(value);
}

/**
 * Brands a thread id, its ancestry, its source and its turns.
 * @param value - The candidate thread.
 * @param maps - The adopted identity lookups.
 * @returns The branded thread, or the original value when it is not an object.
 */
function brandThread(value: unknown, maps: ResponseIdentityMaps): unknown {
	if (!isRecord(value)) {
		return value;
	}
	return {
		...value,
		id: maps.threadIds.get(value["id"]),
		forkedFromId: brandNullableThreadId(value["forkedFromId"], maps),
		parentThreadId: brandNullableThreadId(value["parentThreadId"], maps),
		source: brandThreadSource(value["source"], maps),
		turns: brandEach(value["turns"], (turn) => brandTurn(turn, maps)),
	};
}

/**
 * Brands a queued submission id.
 * @param value - The candidate queued submission.
 * @param maps - The adopted identity lookups.
 * @returns The branded submission, or the original value when it is not an object.
 */
function brandQueue(value: unknown, maps: ResponseIdentityMaps): unknown {
	return isRecord(value) ? { ...value, id: maps.queuedSubmissionIds.get(value["id"]) } : value;
}

/**
 * Brands the turn id and item of one item-page entry.
 * @param entry - The candidate page entry.
 * @param maps - The adopted identity lookups.
 * @returns The branded entry, or the original value when it is not an object.
 */
function brandItemEntry(entry: unknown, maps: ResponseIdentityMaps): unknown {
	if (!isRecord(entry)) {
		return entry;
	}
	return {
		...entry,
		turnId: maps.turnIds.get(entry["turnId"]),
		item: brandThreadItem(entry["item"], maps),
	};
}

/**
 * Brands the login id a hosted login response carries.
 * @param payload - The login response.
 * @param maps - The adopted identity lookups.
 * @returns The branded response.
 */
function brandLogin(payload: UnknownRecord, maps: ResponseIdentityMaps): unknown {
	return Object.hasOwn(payload, "loginId")
		? { ...payload, loginId: maps.loginIds.get(payload["loginId"]) }
		: payload;
}

/**
 * Replaces one field of a payload with its branded form.
 * @param payload - The decoded response.
 * @param field - The field to replace.
 * @param brand - The branding applied to that field's value.
 * @returns The payload with the field replaced.
 */
function brandField(
	payload: UnknownRecord,
	field: string,
	brand: (value: unknown) => unknown,
): unknown {
	return { ...payload, [field]: brand(payload[field]) };
}

type PayloadBrander = (payload: UnknownRecord, maps: ResponseIdentityMaps) => unknown;

/**
 * Leaves a payload untouched, for responses that carry no server identities.
 * @param payload - The decoded response.
 * @returns The same payload.
 */
function brandNothing(payload: UnknownRecord): unknown {
	return payload;
}

/** How each response kind is branded, mirroring RESPONSE_COLLECTORS field for field. */
const RESPONSE_BRANDERS: Readonly<Record<ResponseIdentityKind, PayloadBrander>> = {
	none: brandNothing,
	"raw-realtime": brandNothing,
	login: brandLogin,
	"thread-start": (payload, maps) => brandField(payload, "thread", (t) => brandThread(t, maps)),
	thread: (payload, maps) => brandField(payload, "thread", (t) => brandThread(t, maps)),
	"thread-page": (payload, maps) =>
		brandField(payload, "data", (data) => brandEach(data, (t) => brandThread(t, maps))),
	"loaded-thread-page": (payload, maps) =>
		brandField(payload, "data", (data) => brandEach(data, (id) => maps.threadIds.get(id))),
	turn: (payload, maps) => brandField(payload, "turn", (t) => brandTurn(t, maps)),
	"turn-page": (payload, maps) =>
		brandField(payload, "data", (data) => brandEach(data, (t) => brandTurn(t, maps))),
	"item-page": (payload, maps) =>
		brandField(payload, "data", (data) => brandEach(data, (e) => brandItemEntry(e, maps))),
	"turn-id": (payload, maps) => brandField(payload, "turnId", (id) => maps.turnIds.get(id)),
	queue: (payload, maps) => brandField(payload, "queuedSubmission", (q) => brandQueue(q, maps)),
	"queue-page": (payload, maps) =>
		brandField(payload, "data", (data) => brandEach(data, (q) => brandQueue(q, maps))),
};

/**
 * Rewrites a decoded response with every collected identity replaced by its adopted form.
 * @param kind - Which identities the response kind carries.
 * @param payload - The decoded response.
 * @param maps - The adopted identity lookups.
 * @returns The branded response.
 */
function brandResponse(
	kind: ResponseIdentityKind,
	payload: unknown,
	maps: ResponseIdentityMaps,
): unknown {
	return isRecord(payload) ? RESPONSE_BRANDERS[kind](payload, maps) : payload;
}

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

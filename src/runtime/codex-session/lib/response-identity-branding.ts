import type {
	ItemId,
	LoginId,
	QueuedSubmissionId,
	ThreadId,
	TurnId,
} from "@/shared/codex-workbench-identity";
import {
	isRecord,
	isUnknownArray,
	type ResponseIdentityKind,
	type UnknownRecord,
} from "@/runtime/codex-session/lib/response-identity-collection";

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

/**
 * Brands the single thread a response carries under `thread`.
 * @param payload - The decoded response.
 * @param maps - The adopted identity lookups.
 * @returns The branded response.
 */
function brandThreadField(payload: UnknownRecord, maps: ResponseIdentityMaps): unknown {
	return brandField(payload, "thread", (thread) => brandThread(thread, maps));
}

/**
 * Brands every thread on a thread page.
 * @param payload - The decoded response.
 * @param maps - The adopted identity lookups.
 * @returns The branded response.
 */
function brandThreadPage(payload: UnknownRecord, maps: ResponseIdentityMaps): unknown {
	return brandField(payload, "data", (data) =>
		brandEach(data, (thread) => brandThread(thread, maps)),
	);
}

/**
 * Brands a loaded-thread page, whose entries are bare thread ids.
 * @param payload - The decoded response.
 * @param maps - The adopted identity lookups.
 * @returns The branded response.
 */
function brandLoadedThreadPage(payload: UnknownRecord, maps: ResponseIdentityMaps): unknown {
	return brandField(payload, "data", (data) =>
		brandEach(data, (threadId) => maps.threadIds.get(threadId)),
	);
}

/**
 * Brands the single turn a response carries under `turn`.
 * @param payload - The decoded response.
 * @param maps - The adopted identity lookups.
 * @returns The branded response.
 */
function brandTurnField(payload: UnknownRecord, maps: ResponseIdentityMaps): unknown {
	return brandField(payload, "turn", (turn) => brandTurn(turn, maps));
}

/**
 * Brands every turn on a turn page.
 * @param payload - The decoded response.
 * @param maps - The adopted identity lookups.
 * @returns The branded response.
 */
function brandTurnPage(payload: UnknownRecord, maps: ResponseIdentityMaps): unknown {
	return brandField(payload, "data", (data) => brandEach(data, (turn) => brandTurn(turn, maps)));
}

/**
 * Brands every entry on an item page.
 * @param payload - The decoded response.
 * @param maps - The adopted identity lookups.
 * @returns The branded response.
 */
function brandItemPage(payload: UnknownRecord, maps: ResponseIdentityMaps): unknown {
	return brandField(payload, "data", (data) =>
		brandEach(data, (entry) => brandItemEntry(entry, maps)),
	);
}

/**
 * Brands the bare turn id a response carries under `turnId`.
 * @param payload - The decoded response.
 * @param maps - The adopted identity lookups.
 * @returns The branded response.
 */
function brandTurnId(payload: UnknownRecord, maps: ResponseIdentityMaps): unknown {
	return brandField(payload, "turnId", (turnId) => maps.turnIds.get(turnId));
}

/**
 * Brands the single queued submission a response carries.
 * @param payload - The decoded response.
 * @param maps - The adopted identity lookups.
 * @returns The branded response.
 */
function brandQueueField(payload: UnknownRecord, maps: ResponseIdentityMaps): unknown {
	return brandField(payload, "queuedSubmission", (queued) => brandQueue(queued, maps));
}

/**
 * Brands every submission on a queue page.
 * @param payload - The decoded response.
 * @param maps - The adopted identity lookups.
 * @returns The branded response.
 */
function brandQueuePage(payload: UnknownRecord, maps: ResponseIdentityMaps): unknown {
	return brandField(payload, "data", (data) =>
		brandEach(data, (queued) => brandQueue(queued, maps)),
	);
}

/** How each response kind is branded, mirroring RESPONSE_COLLECTORS field for field. */
const RESPONSE_BRANDERS: Readonly<Record<ResponseIdentityKind, PayloadBrander>> = {
	none: brandNothing,
	"raw-realtime": brandNothing,
	login: brandLogin,
	"thread-start": brandThreadField,
	thread: brandThreadField,
	"thread-page": brandThreadPage,
	"loaded-thread-page": brandLoadedThreadPage,
	turn: brandTurnField,
	"turn-page": brandTurnPage,
	"item-page": brandItemPage,
	"turn-id": brandTurnId,
	queue: brandQueueField,
	"queue-page": brandQueuePage,
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

export { brandResponse, adoptedMap, type ResponseIdentityMaps };

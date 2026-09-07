import type { ResponseMethod } from "@/runtime/codex-protocol";
import { SESSION_PROTOCOL_METHODS } from "@/runtime/codex-session/lib/response-contract";

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

/**
 * Collects the identities of the single thread a response carries under `thread`.
 * @param payload - The decoded response.
 * @param identities - The collection to append to.
 */
function collectThreadField(payload: UnknownRecord, identities: ResponseIdentityCollection): void {
	collectThread(payload["thread"], identities);
}

/**
 * Collects the identities of every thread on a thread page.
 * @param payload - The decoded response.
 * @param identities - The collection to append to.
 */
function collectThreadPage(payload: UnknownRecord, identities: ResponseIdentityCollection): void {
	collectPage(payload, collectThread, identities);
}

/**
 * Collects the thread ids of a loaded-thread page, whose entries are bare ids rather than
 * whole threads.
 * @param payload - The decoded response.
 * @param identities - The collection to append to.
 */
function collectLoadedThreadPage(
	payload: UnknownRecord,
	identities: ResponseIdentityCollection,
): void {
	if (isUnknownArray(payload["data"])) {
		identities.threadIds.push(...payload["data"]);
	}
}

/**
 * Collects the identities of the single turn a response carries under `turn`.
 * @param payload - The decoded response.
 * @param identities - The collection to append to.
 */
function collectTurnField(payload: UnknownRecord, identities: ResponseIdentityCollection): void {
	collectTurn(payload["turn"], identities);
}

/**
 * Collects the identities of every turn on a turn page.
 * @param payload - The decoded response.
 * @param identities - The collection to append to.
 */
function collectTurnPage(payload: UnknownRecord, identities: ResponseIdentityCollection): void {
	collectPage(payload, collectTurn, identities);
}

/**
 * Collects the identities of every entry on an item page.
 * @param payload - The decoded response.
 * @param identities - The collection to append to.
 */
function collectItemPage(payload: UnknownRecord, identities: ResponseIdentityCollection): void {
	collectPage(payload, collectItemEntry, identities);
}

/**
 * Collects the bare turn id a response carries under `turnId`.
 * @param payload - The decoded response.
 * @param identities - The collection to append to.
 */
function collectTurnId(payload: UnknownRecord, identities: ResponseIdentityCollection): void {
	identities.turnIds.push(payload["turnId"]);
}

/**
 * Collects the identity of the single queued submission a response carries.
 * @param payload - The decoded response.
 * @param identities - The collection to append to.
 */
function collectQueueField(payload: UnknownRecord, identities: ResponseIdentityCollection): void {
	collectQueue(payload["queuedSubmission"], identities);
}

/**
 * Collects the identities of every submission on a queue page.
 * @param payload - The decoded response.
 * @param identities - The collection to append to.
 */
function collectQueuePage(payload: UnknownRecord, identities: ResponseIdentityCollection): void {
	collectPage(payload, collectQueue, identities);
}

/** Which identities each response kind carries, mirrored exactly by RESPONSE_BRANDERS. */
const RESPONSE_COLLECTORS: Readonly<Record<ResponseIdentityKind, PayloadCollector>> = {
	none: collectNothing,
	"raw-realtime": collectNothing,
	login: collectLogin,
	"thread-start": collectThreadField,
	thread: collectThreadField,
	"thread-page": collectThreadPage,
	"loaded-thread-page": collectLoadedThreadPage,
	turn: collectTurnField,
	"turn-page": collectTurnPage,
	"item-page": collectItemPage,
	"turn-id": collectTurnId,
	queue: collectQueueField,
	"queue-page": collectQueuePage,
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

export {
	collectResponseIdentities,
	collection,
	isRecord,
	isUnknownArray,
	type ResponseIdentityCollection,
	type ResponseIdentityKind,
	type UnknownRecord,
};

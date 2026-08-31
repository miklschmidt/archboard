import type {
	ClientRequestMethod,
	CodexSessionRequestParams,
	ResponseMethod,
	ResponsePayloads,
} from "../../codex-protocol/index.js";
import type {
	AnyIdentity,
	ItemId,
	LoginId,
	QueuedSubmissionId,
	ThreadId,
	TrustedIdentityDecoder,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";

type Replace<Value, Fields extends object> = Value & Fields;
type RawThread = ResponsePayloads["thread/read"]["thread"];
type RawTurn = ResponsePayloads["turn/start"]["turn"];
type RawThreadItem = RawTurn["items"][number];
type RawAgentMessageItem = Extract<RawThreadItem, { readonly type: "agentMessage" }>;
type RawCollabAgentItem = Extract<RawThreadItem, { readonly type: "collabAgentToolCall" }>;
type RawSubAgentActivityItem = Extract<RawThreadItem, { readonly type: "subAgentActivity" }>;
type RelatedThreadItemType = "agentMessage" | "collabAgentToolCall" | "subAgentActivity";

type RawMemoryCitation = NonNullable<RawAgentMessageItem["memoryCitation"]>;

export type SessionAgentMessageItem = Replace<
	RawAgentMessageItem,
	{
		readonly id: ItemId;
		readonly memoryCitation: Replace<
			RawMemoryCitation,
			{ readonly threadIds: readonly ThreadId[] }
		> | null;
	}
>;

export type SessionCollabAgentItem = Replace<
	RawCollabAgentItem,
	{
		readonly id: ItemId;
		readonly senderThreadId: ThreadId;
		readonly receiverThreadIds: readonly ThreadId[];
		readonly agentsStates: Readonly<Record<ThreadId, RawCollabAgentItem["agentsStates"][string]>>;
	}
>;

export type SessionSubAgentActivityItem = Replace<
	RawSubAgentActivityItem,
	{ readonly id: ItemId; readonly agentThreadId: ThreadId }
>;

type SessionOtherThreadItem = RawThreadItem extends infer Item
	? Item extends { readonly type: infer Type; readonly id: unknown }
		? Type extends RelatedThreadItemType
			? never
			: Replace<Item, { readonly id: ItemId }>
		: never
	: never;

/** One decoded thread item with every app-server identity adopted by the session. */
export type SessionThreadItem =
	| SessionAgentMessageItem
	| SessionCollabAgentItem
	| SessionSubAgentActivityItem
	| SessionOtherThreadItem;

type RawThreadSource = RawThread["source"];
type RawSubAgentThreadSource = Extract<RawThreadSource, { readonly subAgent: unknown }>;
type RawSubAgentSource = RawSubAgentThreadSource["subAgent"];
type RawThreadSpawnSource = Extract<RawSubAgentSource, { readonly thread_spawn: unknown }>;
export type SessionThreadSpawnSource = Replace<
	RawThreadSpawnSource,
	{
		readonly thread_spawn: Replace<
			RawThreadSpawnSource["thread_spawn"],
			{ readonly parent_thread_id: ThreadId }
		>;
	}
>;
type SessionSubAgentSource =
	| Exclude<RawSubAgentSource, RawThreadSpawnSource>
	| SessionThreadSpawnSource;
type BrandSubAgentThreadSource<Value> = Value extends unknown
	? Replace<RawSubAgentThreadSource, { readonly subAgent: Value }>
	: never;

/** Thread provenance with a branded parent for generated subagent sources. */
export type SessionThreadSource =
	| Exclude<RawThreadSource, RawSubAgentThreadSource>
	| BrandSubAgentThreadSource<SessionSubAgentSource>;

/** One decoded turn with branded turn and item identities. */
export type SessionTurn = Replace<
	RawTurn,
	{ readonly id: TurnId; readonly items: readonly SessionThreadItem[] }
>;

/** One decoded thread with branded ancestry, turns, and nested item identities. */
export type SessionThread = Replace<
	RawThread,
	{
		readonly id: ThreadId;
		readonly forkedFromId: ThreadId | null;
		readonly parentThreadId: ThreadId | null;
		readonly source: SessionThreadSource;
		readonly turns: readonly SessionTurn[];
	}
>;

/** Hosted and device-code login results carry a session-issued LoginId. */
type BrandLoginResult<Value> = Value extends { readonly loginId: unknown }
	? Replace<Value, { readonly loginId: LoginId }>
	: Value;
export type SessionAccountLoginResult = BrandLoginResult<ResponsePayloads["account/login/start"]>;

export type SessionThreadStartResult = Replace<
	ResponsePayloads["thread/start"],
	{ readonly thread: SessionThread }
>;
export type SessionThreadForkResult = Replace<
	ResponsePayloads["thread/fork"],
	{ readonly thread: SessionThread }
>;
export type SessionThreadPageResult = Replace<
	ResponsePayloads["thread/list"],
	{ readonly data: readonly SessionThread[] }
>;
export type SessionLoadedThreadPageResult = Replace<
	ResponsePayloads["thread/loaded/list"],
	{ readonly data: readonly ThreadId[] }
>;
export type SessionThreadReadResult = Replace<
	ResponsePayloads["thread/read"],
	{ readonly thread: SessionThread }
>;
export type SessionThreadTurnPageResult = Replace<
	ResponsePayloads["thread/turns/list"],
	{ readonly data: readonly SessionTurn[] }
>;
type RawThreadItemEntry = ResponsePayloads["thread/items/list"]["data"][number];
type SessionThreadItemEntry = Replace<
	RawThreadItemEntry,
	{ readonly turnId: TurnId; readonly item: SessionThreadItem }
>;
export type SessionThreadItemPageResult = Replace<
	ResponsePayloads["thread/items/list"],
	{ readonly data: readonly SessionThreadItemEntry[] }
>;
export type SessionTurnResult = Replace<
	ResponsePayloads["turn/start"],
	{ readonly turn: SessionTurn }
>;
export type SessionTurnSteerResult = Replace<
	ResponsePayloads["turn/steer"],
	{ readonly turnId: TurnId }
>;

type RawQueuedSubmission = ResponsePayloads["thread/queue/add"]["queuedSubmission"];
export type SessionQueuedSubmission = Replace<
	RawQueuedSubmission,
	{ readonly id: QueuedSubmissionId }
>;
export type SessionQueueAddResult = Replace<
	ResponsePayloads["thread/queue/add"],
	{ readonly queuedSubmission: SessionQueuedSubmission }
>;
export type SessionQueueListResult = Replace<
	ResponsePayloads["thread/queue/list"],
	{ readonly data: readonly SessionQueuedSubmission[] }
>;
export type SessionQueueUpdateResult = Replace<
	ResponsePayloads["thread/queue/update"],
	{ readonly queuedSubmission: SessionQueuedSubmission }
>;
export type SessionQueueStartResult = Replace<
	ResponsePayloads["thread/queue/start"],
	{ readonly turn: SessionTurn }
>;

interface BrandedSessionResponseOverrides {
	readonly "account/login/start": SessionAccountLoginResult;
	readonly "thread/start": SessionThreadStartResult;
	readonly "thread/fork": SessionThreadForkResult;
	readonly "thread/list": SessionThreadPageResult;
	readonly "thread/loaded/list": SessionLoadedThreadPageResult;
	readonly "thread/read": SessionThreadReadResult;
	readonly "thread/turns/list": SessionThreadTurnPageResult;
	readonly "thread/items/list": SessionThreadItemPageResult;
	readonly "turn/start": SessionTurnResult;
	readonly "turn/steer": SessionTurnSteerResult;
	readonly "thread/queue/add": SessionQueueAddResult;
	readonly "thread/queue/list": SessionQueueListResult;
	readonly "thread/queue/update": SessionQueueUpdateResult;
	readonly "thread/queue/start": SessionQueueStartResult;
}

/** Session-facing results. Realtime methods and timeline data remain raw by contract. */
export type SessionResponsePayloads = {
	[Method in ResponseMethod]: Method extends keyof BrandedSessionResponseOverrides
		? BrandedSessionResponseOverrides[Method]
		: ResponsePayloads[Method];
};

export type SessionResponse<Method extends ResponseMethod> = SessionResponsePayloads[Method];

type SessionRequestIdentityValue = AnyIdentity | readonly AnyIdentity[];
type IdentityBearingRequestKey<Method extends ResponseMethod> = Method extends ClientRequestMethod
	? CodexSessionRequestParams<Method> extends infer Params
		? Params extends undefined
			? never
			: {
					[Key in keyof Params]-?: [Exclude<Params[Key], null | undefined>] extends [
						SessionRequestIdentityValue,
					]
						? Key
						: never;
				}[keyof Params] &
					string
		: never
	: never;

/** Every request property whose protocol type carries a branded session identity. */
export type SessionRequestIdentityField = {
	[Method in ResponseMethod]: IdentityBearingRequestKey<Method>;
}[ResponseMethod];

type HasDuplicate<Value extends readonly unknown[], Seen = never> = Value extends readonly [
	infer First,
	...infer Rest,
]
	? First extends Seen
		? true
		: HasDuplicate<Rest, Seen | First>
	: false;

/**
 * Returns the tuple only when it contains every branded request key exactly once.
 * Missing, extra, and duplicate identity fields reduce to never.
 */
export type ExactSessionRequestIdentityTuple<
	Method extends ResponseMethod,
	Value extends readonly SessionRequestIdentityField[],
> =
	HasDuplicate<Value> extends true
		? never
		: [Exclude<IdentityBearingRequestKey<Method>, Value[number]>] extends [never]
			? [Exclude<Value[number], IdentityBearingRequestKey<Method>>] extends [never]
				? Value
				: never
			: never;

type ResponseIdentityKind =
	| "none"
	| "login"
	| "thread-start"
	| "thread"
	| "thread-page"
	| "loaded-thread-page"
	| "turn"
	| "turn-page"
	| "item-page"
	| "turn-id"
	| "queue"
	| "queue-page"
	| "raw-realtime";

interface SessionProtocolMethodDescriptor {
	readonly requestIdentities: readonly SessionRequestIdentityField[];
	readonly responseIdentities: ResponseIdentityKind;
}

type SessionProtocolMethodTable = Record<ResponseMethod, SessionProtocolMethodDescriptor>;
type ExactSessionProtocolMethodTable<Table extends SessionProtocolMethodTable> = {
	[Method in ResponseMethod]: Omit<Table[Method], "requestIdentities"> & {
		readonly requestIdentities: ExactSessionRequestIdentityTuple<
			Method,
			Table[Method]["requestIdentities"]
		>;
	};
};
type NoExtraSessionProtocolMethods<Table> =
	Exclude<keyof Table, ResponseMethod> extends never ? unknown : never;
function defineSessionProtocolMethods<const Table extends SessionProtocolMethodTable>(
	table: Table & ExactSessionProtocolMethodTable<Table> & NoExtraSessionProtocolMethods<Table>,
): Table {
	return table;
}

/**
 * The one exhaustive owner of request serialization and response adoption.
 * Protocol schemas still own wire validation; this table only names trusted identities.
 * Compile-time request branding remains in the protocol-owned request types. The
 * table builder derives each method's identity-bearing keys from those brands and
 * rejects any missing, extra, or duplicate runtime field.
 */
export const SESSION_PROTOCOL_METHODS = defineSessionProtocolMethods({
	initialize: { requestIdentities: [], responseIdentities: "none" },
	"config/read": { requestIdentities: [], responseIdentities: "none" },
	"configRequirements/read": { requestIdentities: [], responseIdentities: "none" },
	"account/read": { requestIdentities: [], responseIdentities: "none" },
	"account/login/start": { requestIdentities: [], responseIdentities: "login" },
	"account/login/cancel": { requestIdentities: ["loginId"], responseIdentities: "none" },
	"account/logout": { requestIdentities: [], responseIdentities: "none" },
	"model/list": { requestIdentities: [], responseIdentities: "none" },
	"thread/start": { requestIdentities: [], responseIdentities: "thread-start" },
	"thread/fork": {
		requestIdentities: ["threadId", "lastTurnId", "beforeTurnId"],
		responseIdentities: "thread-start",
	},
	"thread/list": {
		requestIdentities: ["parentThreadId", "ancestorThreadId"],
		responseIdentities: "thread-page",
	},
	"thread/loaded/list": { requestIdentities: [], responseIdentities: "loaded-thread-page" },
	"thread/read": { requestIdentities: ["threadId"], responseIdentities: "thread" },
	"thread/turns/list": { requestIdentities: ["threadId"], responseIdentities: "turn-page" },
	"thread/items/list": {
		requestIdentities: ["threadId", "turnId"],
		responseIdentities: "item-page",
	},
	"thread/delete": { requestIdentities: ["threadId"], responseIdentities: "none" },
	"thread/settings/update": { requestIdentities: ["threadId"], responseIdentities: "none" },
	"turn/start": { requestIdentities: ["threadId"], responseIdentities: "turn" },
	"turn/steer": {
		requestIdentities: ["threadId", "expectedTurnId"],
		responseIdentities: "turn-id",
	},
	"turn/interrupt": {
		requestIdentities: ["threadId", "turnId"],
		responseIdentities: "none",
	},
	"thread/queue/add": { requestIdentities: ["threadId"], responseIdentities: "queue" },
	"thread/queue/list": {
		requestIdentities: ["threadId"],
		responseIdentities: "queue-page",
	},
	"thread/queue/update": {
		requestIdentities: ["threadId", "queuedSubmissionId"],
		responseIdentities: "queue",
	},
	"thread/queue/delete": {
		requestIdentities: ["threadId", "queuedSubmissionId"],
		responseIdentities: "none",
	},
	"thread/queue/reorder": {
		requestIdentities: ["threadId", "queuedSubmissionIds"],
		responseIdentities: "none",
	},
	"thread/queue/start": {
		requestIdentities: ["threadId", "queuedSubmissionId"],
		responseIdentities: "turn",
	},
	"thread/inject_items": { requestIdentities: ["threadId"], responseIdentities: "none" },
	"thread/realtime/start": {
		requestIdentities: ["threadId", "realtimeSessionId"],
		responseIdentities: "raw-realtime",
	},
	"thread/realtime/appendText": {
		requestIdentities: ["threadId"],
		responseIdentities: "raw-realtime",
	},
	"thread/realtime/appendSpeech": {
		requestIdentities: ["threadId"],
		responseIdentities: "raw-realtime",
	},
	"thread/realtime/stop": {
		requestIdentities: ["threadId"],
		responseIdentities: "raw-realtime",
	},
	"thread/timeline/list": {
		requestIdentities: ["threadId"],
		responseIdentities: "raw-realtime",
	},
	"currentTime/read": { requestIdentities: [], responseIdentities: "none" },
});

interface ResponseIdentityCollection {
	readonly threadIds: unknown[];
	readonly turnIds: unknown[];
	readonly itemIds: unknown[];
	readonly queuedSubmissionIds: unknown[];
	readonly loginIds: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collection(): ResponseIdentityCollection {
	return { threadIds: [], turnIds: [], itemIds: [], queuedSubmissionIds: [], loginIds: [] };
}

function collectThreadItem(value: unknown, identities: ResponseIdentityCollection): void {
	if (!isRecord(value)) return;
	identities.itemIds.push(value.id);
	if (value.type === "agentMessage" && isRecord(value.memoryCitation)) {
		const threadIds = value.memoryCitation.threadIds;
		if (Array.isArray(threadIds)) identities.threadIds.push(...threadIds);
	}
	if (value.type === "collabAgentToolCall") {
		identities.threadIds.push(value.senderThreadId);
		if (Array.isArray(value.receiverThreadIds))
			identities.threadIds.push(...value.receiverThreadIds);
		if (isRecord(value.agentsStates)) identities.threadIds.push(...Object.keys(value.agentsStates));
	}
	if (value.type === "subAgentActivity") identities.threadIds.push(value.agentThreadId);
}

function collectTurn(value: unknown, identities: ResponseIdentityCollection): void {
	if (!isRecord(value)) return;
	identities.turnIds.push(value.id);
	if (Array.isArray(value.items)) {
		for (const item of value.items) collectThreadItem(item, identities);
	}
}

function collectThreadSource(value: unknown, identities: ResponseIdentityCollection): void {
	if (!isRecord(value) || !isRecord(value.subAgent) || !isRecord(value.subAgent.thread_spawn))
		return;
	identities.threadIds.push(value.subAgent.thread_spawn.parent_thread_id);
}

function collectThread(value: unknown, identities: ResponseIdentityCollection): void {
	if (!isRecord(value)) return;
	identities.threadIds.push(value.id);
	if (value.forkedFromId !== null) identities.threadIds.push(value.forkedFromId);
	if (value.parentThreadId !== null) identities.threadIds.push(value.parentThreadId);
	collectThreadSource(value.source, identities);
	if (Array.isArray(value.turns)) {
		for (const turn of value.turns) collectTurn(turn, identities);
	}
}

function collectQueue(value: unknown, identities: ResponseIdentityCollection): void {
	if (isRecord(value)) identities.queuedSubmissionIds.push(value.id);
}

function collectResponseIdentities(
	kind: ResponseIdentityKind,
	payload: unknown,
): ResponseIdentityCollection {
	const identities = collection();
	if (!isRecord(payload)) return identities;
	switch (kind) {
		case "login":
			if (Object.hasOwn(payload, "loginId")) identities.loginIds.push(payload.loginId);
			break;
		case "thread-start":
		case "thread":
			collectThread(payload.thread, identities);
			break;
		case "thread-page":
			if (Array.isArray(payload.data)) {
				for (const thread of payload.data) collectThread(thread, identities);
			}
			break;
		case "loaded-thread-page":
			if (Array.isArray(payload.data)) identities.threadIds.push(...payload.data);
			break;
		case "turn":
			collectTurn(payload.turn, identities);
			break;
		case "turn-page":
			if (Array.isArray(payload.data)) {
				for (const turn of payload.data) collectTurn(turn, identities);
			}
			break;
		case "item-page":
			if (Array.isArray(payload.data)) {
				for (const entry of payload.data) {
					if (!isRecord(entry)) continue;
					identities.turnIds.push(entry.turnId);
					collectThreadItem(entry.item, identities);
				}
			}
			break;
		case "turn-id":
			identities.turnIds.push(payload.turnId);
			break;
		case "queue":
			collectQueue(payload.queuedSubmission, identities);
			break;
		case "queue-page":
			if (Array.isArray(payload.data)) {
				for (const queued of payload.data) collectQueue(queued, identities);
			}
			break;
		case "none":
		case "raw-realtime":
			break;
	}
	return identities;
}

interface ResponseIdentityMaps {
	readonly threadIds: ReadonlyMap<unknown, ThreadId>;
	readonly turnIds: ReadonlyMap<unknown, TurnId>;
	readonly itemIds: ReadonlyMap<unknown, ItemId>;
	readonly queuedSubmissionIds: ReadonlyMap<unknown, QueuedSubmissionId>;
	readonly loginIds: ReadonlyMap<unknown, LoginId>;
}

function adoptedMap<Identity>(
	raw: readonly unknown[],
	adopted: readonly Identity[],
): ReadonlyMap<unknown, Identity> {
	return new Map(raw.map((value, index) => [value, adopted[index] as Identity]));
}

function brandThreadItem(value: Record<string, unknown>, maps: ResponseIdentityMaps): unknown {
	const branded: Record<string, unknown> = { ...value, id: maps.itemIds.get(value.id) };
	if (value.type === "agentMessage" && isRecord(value.memoryCitation)) {
		const citation = value.memoryCitation;
		branded.memoryCitation = {
			...citation,
			threadIds: Array.isArray(citation.threadIds)
				? citation.threadIds.map((threadId) => maps.threadIds.get(threadId))
				: citation.threadIds,
		};
	}
	if (value.type === "collabAgentToolCall") {
		branded.senderThreadId = maps.threadIds.get(value.senderThreadId);
		branded.receiverThreadIds = Array.isArray(value.receiverThreadIds)
			? value.receiverThreadIds.map((threadId) => maps.threadIds.get(threadId))
			: value.receiverThreadIds;
		if (isRecord(value.agentsStates)) {
			branded.agentsStates = Object.fromEntries(
				Object.entries(value.agentsStates).map(([threadId, state]) => [
					maps.threadIds.get(threadId),
					state,
				]),
			);
		}
	}
	if (value.type === "subAgentActivity") {
		branded.agentThreadId = maps.threadIds.get(value.agentThreadId);
	}
	return branded;
}

function brandTurn(value: Record<string, unknown>, maps: ResponseIdentityMaps): SessionTurn {
	return {
		...value,
		id: maps.turnIds.get(value.id),
		items: Array.isArray(value.items)
			? value.items.map((item) => brandThreadItem(item as Record<string, unknown>, maps))
			: value.items,
	} as SessionTurn;
}

function brandThreadSource(value: unknown, maps: ResponseIdentityMaps): unknown {
	if (!isRecord(value) || !isRecord(value.subAgent) || !isRecord(value.subAgent.thread_spawn))
		return value;
	return {
		...value,
		subAgent: {
			...value.subAgent,
			thread_spawn: {
				...value.subAgent.thread_spawn,
				parent_thread_id: maps.threadIds.get(value.subAgent.thread_spawn.parent_thread_id),
			},
		},
	};
}

function brandThread(value: Record<string, unknown>, maps: ResponseIdentityMaps): SessionThread {
	return {
		...value,
		id: maps.threadIds.get(value.id),
		forkedFromId: value.forkedFromId === null ? null : maps.threadIds.get(value.forkedFromId),
		parentThreadId: value.parentThreadId === null ? null : maps.threadIds.get(value.parentThreadId),
		source: brandThreadSource(value.source, maps),
		turns: Array.isArray(value.turns)
			? value.turns.map((turn) => brandTurn(turn as Record<string, unknown>, maps))
			: value.turns,
	} as SessionThread;
}

function brandQueue(value: Record<string, unknown>, maps: ResponseIdentityMaps): unknown {
	return { ...value, id: maps.queuedSubmissionIds.get(value.id) };
}

function brandItemEntry(
	entry: Record<string, unknown>,
	maps: ResponseIdentityMaps,
): Record<string, unknown> {
	return {
		...entry,
		turnId: maps.turnIds.get(entry.turnId),
		item: brandThreadItem(entry.item as Record<string, unknown>, maps),
	};
}

function brandResponse(kind: ResponseIdentityKind, payload: unknown, maps: ResponseIdentityMaps) {
	if (!isRecord(payload)) return payload;
	switch (kind) {
		case "login":
			return Object.hasOwn(payload, "loginId")
				? { ...payload, loginId: maps.loginIds.get(payload.loginId) }
				: payload;
		case "thread-start":
		case "thread":
			return { ...payload, thread: brandThread(payload.thread as Record<string, unknown>, maps) };
		case "thread-page":
			return {
				...payload,
				data: (payload.data as Record<string, unknown>[]).map((thread) =>
					brandThread(thread, maps),
				),
			};
		case "loaded-thread-page":
			return {
				...payload,
				data: (payload.data as unknown[]).map((threadId) => maps.threadIds.get(threadId)),
			};
		case "turn":
			return { ...payload, turn: brandTurn(payload.turn as Record<string, unknown>, maps) };
		case "turn-page":
			return {
				...payload,
				data: (payload.data as Record<string, unknown>[]).map((turn) => brandTurn(turn, maps)),
			};
		case "item-page":
			return {
				...payload,
				data: (payload.data as Record<string, unknown>[]).map((entry) =>
					brandItemEntry(entry, maps),
				),
			};
		case "turn-id":
			return { ...payload, turnId: maps.turnIds.get(payload.turnId) };
		case "queue":
			return {
				...payload,
				queuedSubmission: brandQueue(payload.queuedSubmission as Record<string, unknown>, maps),
			};
		case "queue-page":
			return {
				...payload,
				data: (payload.data as Record<string, unknown>[]).map((queued) => brandQueue(queued, maps)),
			};
		case "none":
		case "raw-realtime":
			return payload;
	}
}

/** Adopts every identity in one decoded response as a single authority transaction. */
export function adoptSessionResponse<Method extends ResponseMethod>(
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

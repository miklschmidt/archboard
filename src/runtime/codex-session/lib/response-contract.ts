import type { z } from "zod";

import type {
	ClientRequestMethod,
	CodexSessionRequestParams,
	LoadedThreadPageSchema,
	LoginAccountResponseSchema,
	QueueStartSchema,
	QueuedSubmissionSchema,
	ResponseMethod,
	ResponsePayloads,
	SessionSourceSchema,
	ThreadForkResponseSchema,
	ThreadItemEntrySchema,
	ThreadItemPageSchema,
	ThreadItemSchema,
	ThreadPageSchema,
	ThreadQueueAddResponseSchema,
	ThreadQueueListResponseSchema,
	ThreadQueueUpdateResponseSchema,
	ThreadReadSchema,
	ThreadSchema,
	ThreadStartResponseSchema,
	ThreadTurnPageSchema,
	TurnSchema,
	TurnStartSchema,
	TurnSteerResponseSchema,
} from "../../codex-protocol/index.js";
import type {
	AnyIdentity,
	ItemId,
	LoginId,
	QueuedSubmissionId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";

type ProtocolObjectFields<
	Schema extends z.ZodObject,
	Retained extends boolean,
	Shape extends z.ZodRawShape = Schema["shape"],
	Output extends object = z.output<Schema>,
> = {
	[
		Key in keyof Shape as Key extends keyof Output
			? {} extends Pick<Output, Key>
				? never
				: Key
			: never
	]-?: ProtocolOutput<Shape[Key], Retained>;
} & {
	[
		Key in keyof Shape as Key extends keyof Output
			? {} extends Pick<Output, Key>
				? Key
				: never
			: never
	]?: ProtocolOutput<Shape[Key], Retained>;
};
type ProtocolObjectOutput<
	Schema extends z.ZodObject,
	Retained extends boolean,
> = Retained extends true
	? Readonly<ProtocolObjectFields<Schema, Retained>>
	: ProtocolObjectFields<Schema, Retained>;
type ProtocolOutput<Schema, Retained extends boolean = false> =
	Schema extends z.ZodLazy<infer Inner>
		? ProtocolOutput<Inner, Retained>
		: Schema extends z.ZodObject
			? ProtocolObjectOutput<Schema, Retained>
			: Schema extends z.ZodArray<infer Element>
				? Retained extends true
					? readonly ProtocolOutput<Element, Retained>[]
					: ProtocolOutput<Element, Retained>[]
				: Schema extends z.ZodRecord<infer Key, infer Value>
					? Retained extends true
						? {
								readonly [RecordKey in z.output<Key> & PropertyKey]: ProtocolOutput<
									Value,
									Retained
								>;
							}
						: z.output<Schema>
					: Schema extends z.ZodNullable<infer Inner>
						? ProtocolOutput<Inner, Retained> | null
						: Schema extends z.ZodOptional<infer Inner>
							? ProtocolOutput<Inner, Retained> | undefined
							: Schema extends z.ZodUnion<infer Options>
								? ProtocolOutput<Options[number], Retained>
								: Schema extends z.core.$ZodType
									? z.output<Schema>
									: never;
type Replace<Value, Fields extends object> = Value extends unknown
	? Omit<Value, keyof Fields> & Fields
	: never;
type RawThread = ProtocolOutput<typeof ThreadSchema, true>;
type RawTurn = ProtocolOutput<typeof TurnSchema, true>;
type RawThreadItem = ProtocolOutput<typeof ThreadItemSchema, true>;
type RawAgentMessageItem = Extract<RawThreadItem, { readonly type: "agentMessage" }>;
type RawCollabAgentItem = Extract<RawThreadItem, { readonly type: "collabAgentToolCall" }>;
type RawSubAgentActivityItem = Extract<RawThreadItem, { readonly type: "subAgentActivity" }>;
type RelatedThreadItemType = "agentMessage" | "collabAgentToolCall" | "subAgentActivity";

type RawMemoryCitation = NonNullable<RawAgentMessageItem["memoryCitation"]>;

type SessionAgentMessageItem = Replace<
	RawAgentMessageItem,
	{
		readonly id: ItemId;
		readonly memoryCitation: Replace<
			RawMemoryCitation,
			{ readonly threadIds: readonly ThreadId[] }
		> | null;
	}
>;

type SessionCollabAgentItem = Replace<
	RawCollabAgentItem,
	{
		readonly id: ItemId;
		readonly senderThreadId: ThreadId;
		readonly receiverThreadIds: readonly ThreadId[];
		readonly agentsStates: Readonly<Record<ThreadId, RawCollabAgentItem["agentsStates"][string]>>;
	}
>;

type SessionSubAgentActivityItem = Replace<
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
type SessionThreadItem =
	| SessionAgentMessageItem
	| SessionCollabAgentItem
	| SessionSubAgentActivityItem
	| SessionOtherThreadItem;

type RawThreadSource = ProtocolOutput<typeof SessionSourceSchema, true>;
type RawNamedThreadSource = Extract<RawThreadSource, string>;
type RawCustomThreadSource = Extract<RawThreadSource, { readonly custom: unknown }>;
type RawSubAgentThreadSource = Extract<RawThreadSource, { readonly subAgent: unknown }>;
type RawSubAgentSource = RawSubAgentThreadSource["subAgent"];
type RawNamedSubAgentSource = Extract<RawSubAgentSource, string>;
type RawOtherSubAgentSource = Extract<RawSubAgentSource, { readonly other: unknown }>;
type RawThreadSpawnSource = Extract<RawSubAgentSource, { readonly thread_spawn: unknown }>;
type SessionThreadSpawnSource = Replace<
	RawThreadSpawnSource,
	{
		readonly thread_spawn: Replace<
			RawThreadSpawnSource["thread_spawn"],
			{ readonly parent_thread_id: ThreadId }
		>;
	}
>;
type SessionSubAgentSource =
	| RawNamedSubAgentSource
	| RawOtherSubAgentSource
	| SessionThreadSpawnSource;
type BrandSubAgentThreadSource<Value> = Value extends unknown
	? Replace<RawSubAgentThreadSource, { readonly subAgent: Value }>
	: never;

/** Thread provenance with a branded parent for generated subagent sources. */
type SessionThreadSource =
	| RawNamedThreadSource
	| RawCustomThreadSource
	| BrandSubAgentThreadSource<SessionSubAgentSource>;

/** One decoded turn with branded turn and item identities. */
type SessionTurn = Replace<
	RawTurn,
	{ readonly id: TurnId; readonly items: readonly SessionThreadItem[] }
>;

/** One decoded thread with branded ancestry, turns, and nested item identities. */
type SessionThread = Replace<
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
type SessionAccountLoginResult = BrandLoginResult<
	ProtocolOutput<typeof LoginAccountResponseSchema>
>;

type SessionThreadStartResult = Replace<
	ProtocolOutput<typeof ThreadStartResponseSchema>,
	{ readonly thread: SessionThread }
>;
type SessionThreadForkResult = Replace<
	ProtocolOutput<typeof ThreadForkResponseSchema>,
	{ readonly thread: SessionThread }
>;
type SessionThreadPageResult = Replace<
	ProtocolOutput<typeof ThreadPageSchema>,
	{ readonly data: readonly SessionThread[] }
>;
type SessionLoadedThreadPageResult = Replace<
	ProtocolOutput<typeof LoadedThreadPageSchema>,
	{ readonly data: readonly ThreadId[] }
>;
type SessionThreadReadResult = Replace<
	ProtocolOutput<typeof ThreadReadSchema>,
	{ readonly thread: SessionThread }
>;
type SessionThreadTurnPageResult = Replace<
	ProtocolOutput<typeof ThreadTurnPageSchema>,
	{ readonly data: readonly SessionTurn[] }
>;
type RawThreadItemEntry = ProtocolOutput<typeof ThreadItemEntrySchema>;
type SessionThreadItemEntry = Replace<
	RawThreadItemEntry,
	{ readonly turnId: TurnId; readonly item: SessionThreadItem }
>;
type SessionThreadItemPageResult = Replace<
	ProtocolOutput<typeof ThreadItemPageSchema>,
	{ readonly data: readonly SessionThreadItemEntry[] }
>;
type SessionTurnResult = Replace<
	ProtocolOutput<typeof TurnStartSchema>,
	{ readonly turn: SessionTurn }
>;
type SessionTurnSteerResult = Replace<
	ProtocolOutput<typeof TurnSteerResponseSchema>,
	{ readonly turnId: TurnId }
>;

type RawQueuedSubmission = ProtocolOutput<typeof QueuedSubmissionSchema>;
type SessionQueuedSubmission = Replace<RawQueuedSubmission, { readonly id: QueuedSubmissionId }>;
type SessionQueueAddResult = Replace<
	ProtocolOutput<typeof ThreadQueueAddResponseSchema>,
	{ readonly queuedSubmission: SessionQueuedSubmission }
>;
type SessionQueueListResult = Replace<
	ProtocolOutput<typeof ThreadQueueListResponseSchema>,
	{ readonly data: readonly SessionQueuedSubmission[] }
>;
type SessionQueueUpdateResult = Replace<
	ProtocolOutput<typeof ThreadQueueUpdateResponseSchema>,
	{ readonly queuedSubmission: SessionQueuedSubmission }
>;
type SessionQueueStartResult = Replace<
	ProtocolOutput<typeof QueueStartSchema>,
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
type SessionResponsePayloads = {
	[Method in ResponseMethod]: Method extends keyof BrandedSessionResponseOverrides
		? BrandedSessionResponseOverrides[Method]
		: ResponsePayloads[Method];
};

type SessionResponse<Method extends ResponseMethod> = SessionResponsePayloads[Method];

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
type SessionRequestIdentityField = {
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
type ExactSessionRequestIdentityTuple<
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
const SESSION_PROTOCOL_METHODS = defineSessionProtocolMethods({
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

export {
	type ExactSessionRequestIdentityTuple,
	SESSION_PROTOCOL_METHODS,
	type SessionAccountLoginResult,
	type SessionAgentMessageItem,
	type SessionCollabAgentItem,
	type SessionLoadedThreadPageResult,
	type SessionQueueAddResult,
	type SessionQueuedSubmission,
	type SessionQueueListResult,
	type SessionQueueStartResult,
	type SessionQueueUpdateResult,
	type SessionRequestIdentityField,
	type SessionResponse,
	type SessionResponsePayloads,
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

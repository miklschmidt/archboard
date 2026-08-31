import type { ResponseMethod, ResponsePayloads } from "../../codex-protocol/index.js";
import type {
	ItemId,
	LoginId,
	QueuedSubmissionId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	CodexSession,
	ExactSessionRequestIdentityTuple,
	SessionAgentMessageItem,
	SessionCollabAgentItem,
	SessionParams,
	SessionQueuedSubmission,
	SessionRequestIdentityField,
	SessionSubAgentActivityItem,
	SessionThread,
	SessionThreadSpawnSource,
	SessionTurn,
} from "../index.js";

declare const session: CodexSession;
declare const threadId: ThreadId;

const turns = { threadId } satisfies SessionParams<"thread/turns/list">;
const items = { threadId } satisfies SessionParams<"thread/items/list">;
const queue = { threadId } satisfies SessionParams<"thread/queue/list">;
const timeline = { threadId } satisfies SessionParams<"thread/timeline/list">;

void session.threadTurnsListPage(turns);
void session.threadItemsListPage(items);
void session.queueListPage(queue);
void session.timelineListPage(timeline);

// @ts-expect-error The generated thread/turns/list request requires threadId.
void session.threadTurnsListPage();
// @ts-expect-error The generated thread/items/list request requires threadId.
void session.threadItemsListPage();
// @ts-expect-error The generated thread/queue/list request requires threadId.
void session.queueListPage();
// @ts-expect-error The generated thread/timeline/list request requires threadId.
void session.timelineListPage();

type Equal<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
type Assert<Value extends true> = Value;
type Result<Method extends keyof CodexSession> = Awaited<ReturnType<CodexSession[Method]>>;

type HostedLogin = Extract<Result<"accountLogin">, { readonly type: "chatgpt" }>;
type ThreadStart = Result<"threadStart">;
type ThreadItems = Result<"threadItemsListPage">;
type QueueAdd = Result<"queueAdd">;
type Timeline = Result<"timelineListPage">;
type RawThread = ResponsePayloads["thread/read"]["thread"];
type RawTurn = ResponsePayloads["turn/start"]["turn"];
type RawThreadItem = RawTurn["items"][number];
type RawAgentMessage = Extract<RawThreadItem, { readonly type: "agentMessage" }>;
type RawCollabAgent = Extract<RawThreadItem, { readonly type: "collabAgentToolCall" }>;
type RawQueuedSubmission = ResponsePayloads["thread/queue/add"]["queuedSubmission"];

declare function acceptExactRequestIdentities<
	Method extends ResponseMethod,
	Value extends readonly SessionRequestIdentityField[],
>(method: Method, value: Value & ExactSessionRequestIdentityTuple<Method, Value>): void;

acceptExactRequestIdentities("thread/read", ["threadId"] as const);
// @ts-expect-error thread/read must name its branded threadId.
acceptExactRequestIdentities("thread/read", [] as const);
// @ts-expect-error turnId is not an identity-bearing thread/read request property.
acceptExactRequestIdentities("thread/read", ["threadId", "turnId"] as const);
// @ts-expect-error each identity-bearing request property must appear exactly once.
acceptExactRequestIdentities("thread/read", ["threadId", "threadId"] as const);

export type SessionResponseIdentityFixture = [
	Assert<Equal<HostedLogin["loginId"], LoginId>>,
	Assert<Equal<ThreadStart["thread"]["id"], ThreadId>>,
	Assert<Equal<ThreadStart["thread"]["turns"][number]["id"], TurnId>>,
	Assert<Equal<ThreadStart["thread"]["turns"][number]["items"][number]["id"], ItemId>>,
	Assert<Equal<ThreadItems["data"][number]["turnId"], TurnId>>,
	Assert<Equal<QueueAdd["queuedSubmission"]["id"], QueuedSubmissionId>>,
	Assert<Equal<SessionThreadSpawnSource["thread_spawn"]["parent_thread_id"], ThreadId>>,
	Assert<
		Equal<NonNullable<SessionAgentMessageItem["memoryCitation"]>["threadIds"][number], ThreadId>
	>,
	Assert<Equal<SessionCollabAgentItem["senderThreadId"], ThreadId>>,
	Assert<Equal<SessionCollabAgentItem["receiverThreadIds"][number], ThreadId>>,
	Assert<
		Equal<SessionCollabAgentItem["agentsStates"][ThreadId], RawCollabAgent["agentsStates"][string]>
	>,
	Assert<Equal<SessionSubAgentActivityItem["agentThreadId"], ThreadId>>,
	Assert<Equal<Extract<Timeline["data"][number], { type: "turnStarted" }>["turnId"], string>>,
];

export type SessionResponseShapeFixture = [
	Assert<
		Equal<
			Omit<SessionThread, "id" | "forkedFromId" | "parentThreadId" | "source" | "turns">,
			Omit<RawThread, "id" | "forkedFromId" | "parentThreadId" | "source" | "turns">
		>
	>,
	Assert<Equal<Omit<SessionTurn, "id" | "items">, Omit<RawTurn, "id" | "items">>>,
	Assert<
		Equal<
			Omit<SessionAgentMessageItem, "id" | "memoryCitation">,
			Omit<RawAgentMessage, "id" | "memoryCitation">
		>
	>,
	Assert<Equal<Omit<SessionQueuedSubmission, "id">, Omit<RawQueuedSubmission, "id">>>,
];

export type SessionPageParameterFixture = [
	typeof turns,
	typeof items,
	typeof queue,
	typeof timeline,
];

import type {
	ItemId,
	LoginId,
	QueuedSubmissionId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	CodexSession,
	SessionAgentMessageItem,
	SessionCollabAgentItem,
	SessionParams,
	SessionSubAgentActivityItem,
	SessionThreadSource,
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
type SubAgentSource = Extract<SessionThreadSource, { readonly subAgent: unknown }>["subAgent"];
type SpawnSource = Extract<SubAgentSource, { readonly thread_spawn: unknown }>;

export type SessionResponseIdentityFixture = [
	Assert<Equal<HostedLogin["loginId"], LoginId>>,
	Assert<Equal<ThreadStart["thread"]["id"], ThreadId>>,
	Assert<Equal<ThreadStart["thread"]["turns"][number]["id"], TurnId>>,
	Assert<Equal<ThreadStart["thread"]["turns"][number]["items"][number]["id"], ItemId>>,
	Assert<Equal<ThreadItems["data"][number]["turnId"], TurnId>>,
	Assert<Equal<QueueAdd["queuedSubmission"]["id"], QueuedSubmissionId>>,
	Assert<Equal<SpawnSource["thread_spawn"]["parent_thread_id"], ThreadId>>,
	Assert<
		Equal<NonNullable<SessionAgentMessageItem["memoryCitation"]>["threadIds"][number], ThreadId>
	>,
	Assert<Equal<SessionCollabAgentItem["senderThreadId"], ThreadId>>,
	Assert<Equal<SessionCollabAgentItem["receiverThreadIds"][number], ThreadId>>,
	Assert<Equal<keyof SessionCollabAgentItem["agentsStates"], ThreadId>>,
	Assert<Equal<SessionSubAgentActivityItem["agentThreadId"], ThreadId>>,
	Assert<Equal<Extract<Timeline["data"][number], { type: "turnStarted" }>["turnId"], string>>,
];

export type SessionPageParameterFixture = [
	typeof turns,
	typeof items,
	typeof queue,
	typeof timeline,
];

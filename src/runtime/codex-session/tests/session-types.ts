import type { ThreadId } from "../../../shared/codex-workbench-identity/index.js";
import type { CodexSession, SessionParams } from "../index.js";

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

export type SessionPageParameterFixture = [
	typeof turns,
	typeof items,
	typeof queue,
	typeof timeline,
];

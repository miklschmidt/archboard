// What a workhorse does now, read from Codex rather than from a thread summary.
//
// A thread summary carries no turns, so only thread/turns/list names the turn that runs, the
// request that started it and what it did last. Sub-agents come from thread/list by native
// ancestry, at any depth and from every source, and the queue only from the workhorse this
// server created and proved. Each read that fails, or that ownership does not allow, is named as
// unavailable, so an empty answer always means that Codex reported nothing.

import type { CodexSession, SessionParams, SessionTurn } from "@archboard/codex-app-server/session";
import type { CodexThreadStatusType } from "@archboard/codex-app-server/contract";
import type { ThreadId, TurnId } from "@archboard/codex-app-server/identity";
import type {
	InspectWorkhorseRequest,
	InspectWorkhorseResult,
} from "#runtime/workhorses/workhorse-operations/protocol/contract.ts";
import {
	freeze,
	queueIds,
	threadIdWire,
	type WorkhorseRuntime,
} from "#runtime/workhorses/workhorse-operations/rules/internal.ts";
import { isCreatedWorkhorse } from "#runtime/workhorses/workhorse-operations/rules/link-provenance.ts";

/** How many progress entries an inspection reports, newest last. */
const PROGRESS_ENTRIES = 3;
/** The longest text an inspection reports for one request or progress entry. */
const TEXT_LIMIT = 400;
/** The most sub-agents an inspection lists. */
const SUB_AGENT_LIMIT = 50;

/**
 * Every thread source. Codex lists only interactive threads when a listing names no source, and
 * a sub-agent is not one.
 */
const EVERY_SOURCE_KIND = [
	"cli",
	"vscode",
	"exec",
	"appServer",
	"subAgent",
	"subAgentReview",
	"subAgentCompact",
	"subAgentThreadSpawn",
	"subAgentOther",
	"unknown",
] as const satisfies NonNullable<SessionParams<"thread/list">["sourceKinds"]>;

type TurnItem = SessionTurn["items"][number];

/**
 * Cut a text to the inspection's bound.
 * @param text The text.
 * @returns The text, or its start with an ellipsis.
 */
function bounded(text: string): string {
	const trimmed = text.trim();
	return trimmed.length <= TEXT_LIMIT ? trimmed : `${trimmed.slice(0, TEXT_LIMIT - 3)}...`;
}

/**
 * The text a person or the coordinator sent in one user message.
 * @param item A turn item.
 * @returns Its text, or null when the item is no user message with text.
 */
function requestText(item: TurnItem): string | null {
	if (item.type !== "userMessage") {
		return null;
	}
	const text = item.content
		.flatMap((input) => (input.type === "text" ? [input.text] : []))
		.join("\n");
	return text.trim().length === 0 ? null : bounded(text);
}

/**
 * What one turn item says the turn did.
 * @param item A turn item.
 * @returns A short line, or null for an item that says nothing about progress.
 */
function progressLine(item: TurnItem): string | null {
	if (item.type === "agentMessage" && item.text.trim().length > 0) {
		return bounded(item.text);
	}
	if (item.type === "commandExecution") {
		return bounded(`ran ${item.command}`);
	}
	if (item.type === "plan" && item.text.trim().length > 0) {
		return bounded(`plan: ${item.text}`);
	}
	return null;
}

/**
 * The newest turn of the workhorse thread, with the items Codex keeps in its summary view.
 * @param runtime The operations runtime.
 * @param threadId The workhorse thread.
 * @returns The turn, or null when the thread has none.
 */
async function newestTurn(
	runtime: WorkhorseRuntime,
	threadId: ThreadId,
): Promise<SessionTurn | null> {
	const page = await runtime.options.session.threadTurnsListPage({
		threadId,
		limit: 1,
		sortDirection: "desc",
		itemsView: "summary",
	});
	return page.data[0] ?? null;
}

/**
 * The turn that runs on the workhorse thread now, as Codex lists it.
 * @param runtime The operations runtime.
 * @param threadId The workhorse thread.
 * @returns The running turn, or null when none runs.
 */
async function readActiveTurn(
	runtime: WorkhorseRuntime,
	threadId: ThreadId,
): Promise<TurnId | null> {
	const turn = await newestTurn(runtime, threadId);
	return turn?.status === "inProgress" ? turn.id : null;
}

/**
 * The sub-agents a thread spawned, at any depth, oldest first, so a parent comes before the
 * agents it spawned.
 * @param session Lists threads.
 * @param threadId The thread.
 * @param limit The most sub-agents to list.
 * @returns Each sub-agent and its status.
 */
async function listSubAgents(
	session: Pick<CodexSession, "threadListPage">,
	threadId: ThreadId,
	limit: number = Number.POSITIVE_INFINITY,
): Promise<readonly { readonly threadId: ThreadId; readonly status: CodexThreadStatusType }[]> {
	const found: { readonly threadId: ThreadId; readonly status: CodexThreadStatusType }[] = [];
	let cursor: string | null = null;
	do {
		// oxlint-disable-next-line no-await-in-loop -- pagination is sequential by contract: each page's cursor comes from the one before it
		const page = await session.threadListPage({
			ancestorThreadId: threadId,
			sourceKinds: [...EVERY_SOURCE_KIND],
			sortDirection: "asc",
			cursor,
		});
		found.push(...page.data.map((thread) => ({ threadId: thread.id, status: thread.status.type })));
		cursor = page.nextCursor;
	} while (cursor !== null && found.length < limit);
	return found.slice(0, limit);
}

/**
 * Record the running turn for later notifications, so the operations owner follows it.
 * @param runtime The operations runtime.
 * @param threadId The workhorse thread.
 * @param turnId The running turn, or null.
 */
function noteActiveTurn(
	runtime: WorkhorseRuntime,
	threadId: ThreadId,
	turnId: TurnId | null,
): void {
	const key = threadIdWire(runtime.options, threadId);
	if (turnId === null) {
		runtime.activeTurns.delete(key);
	} else {
		runtime.activeTurns.set(key, turnId);
	}
}

type Unavailable = InspectWorkhorseResult["unavailable"][number];

/**
 * The queued requests of a workhorse that this server created and proved; the queue of any other
 * thread is not this server's to read.
 * @param runtime The operations runtime.
 * @param created Whether this server created the workhorse thread.
 * @param unavailable The reads that failed; added to.
 * @returns The queued requests.
 */
async function readQueue(
	runtime: WorkhorseRuntime,
	created: boolean,
	unavailable: Unavailable[],
): Promise<InspectWorkhorseResult["queuedSubmissionIds"]> {
	if (!created) {
		unavailable.push("queue");
		return [];
	}
	return runtime.options.queue.list().then(
		(result) => queueIds(result.queue),
		() => (unavailable.push("queue"), []),
	);
}

/**
 * The request and progress a turn's items report.
 * @param turn The newest turn, or null.
 * @returns The first request text and the newest progress lines.
 */
function turnStory(
	turn: SessionTurn | null,
): Pick<InspectWorkhorseResult, "request" | "recentProgress"> {
	const items = turn?.items ?? [];
	return {
		request: items.map(requestText).find((text) => text !== null) ?? null,
		recentProgress: items
			.map(progressLine)
			.filter((line): line is string => line !== null)
			.slice(-PROGRESS_ENTRIES),
	};
}

/**
 * Create the inspect operation: a read of the link, the running turn, its request and progress,
 * the sub-agents and the queue, which never mutates anything.
 * @param runtime The operations runtime.
 * @returns The inspect operation.
 */
function createInspect(
	runtime: WorkhorseRuntime,
): (request: InspectWorkhorseRequest) => Promise<InspectWorkhorseResult> {
	return (request) =>
		runtime.enqueue(async () => {
			const binding = runtime.currentBinding();
			const { threadId } = binding.workhorse;
			const initial = await runtime.classify(binding, request.call, "inspect_workhorse");
			const unavailable: Unavailable[] = [];
			const [turn, agents, queue] = await Promise.all([
				newestTurn(runtime, threadId).catch(() => (unavailable.push("turns"), null)),
				listSubAgents(runtime.options.session, threadId, SUB_AGENT_LIMIT).catch(
					() => (unavailable.push("subAgents"), []),
				),
				readQueue(runtime, isCreatedWorkhorse(initial.workhorse), unavailable),
			]);
			const final = await runtime.classify(binding, request.call, "inspect_workhorse");
			const activeTurnId = turn?.status === "inProgress" ? turn.id : null;
			noteActiveTurn(runtime, threadId, activeTurnId);
			return freeze({
				threadId,
				status: final.workhorse.link.status,
				activeTurnId,
				...turnStory(turn),
				subAgents: agents,
				queuedSubmissionIds: queue,
				unavailable: unavailable.toSorted(),
			});
		});
}

export { createInspect, listSubAgents, readActiveTurn };

// Controlled external-provider queue behavior used by the production fixture.
import type { FixtureThread } from "./fake-codex-production-data.ts";
import { promptItem, unixSeconds } from "./fake-codex-production-data.ts";

type Frame = { id?: unknown; method?: string; params?: Record<string, unknown> };
export function explanationQueue(
	threads: Map<string, FixtureThread>,
	respond: (frame: never, value: unknown) => void,
	notify: (method: string, params: unknown) => void,
	control: () => Record<string, unknown>,
	reject: (frame: never, message: string) => void,
) {
	const queues = new Map<string, Record<string, unknown>[]>();
	let sequence = 0;
	return (frame: Frame): boolean => {
		const params = frame.params ?? {};
		const threadId = String(params["threadId"]);
		const queue = queues.get(threadId) ?? [];
		queues.set(threadId, queue);
		if (frame.method === "thread/queue/list")
			respond(frame as never, { data: queue, nextCursor: null });
		else if (frame.method === "thread/queue/add") {
			const submission = {
				id: `queue-${++sequence}`,
				clientUserMessageId: params["clientUserMessageId"],
				input: params["input"],
				source: "user",
				createdAt: unixSeconds(),
			};
			if (control()["rejectExplanationQueueAdd"] === true) {
				reject(frame as never, "Controlled queue rejection");
				return true;
			}
			queue.push(submission);
			const response =
				control()["uncertainExplanationQueueAdd"] === true
					? { ...submission, clientUserMessageId: "uncorrelated-message" }
					: submission;
			respond(frame as never, { queuedSubmission: response });
		} else if (frame.method === "thread/queue/delete") {
			queues.set(
				threadId,
				queue.filter((item) => item["id"] !== params["queuedSubmissionId"]),
			);
			respond(frame as never, { deleted: true });
		} else if (frame.method === "thread/queue/start") {
			const submission = queue.find((item) => item["id"] === params["queuedSubmissionId"]);
			queues.set(
				threadId,
				queue.filter((item) => item !== submission),
			);
			const prompt = {
				...promptItem(`explain-${sequence}-prompt`, submission?.["input"]),
				clientId: submission?.["clientUserMessageId"],
			};
			const turn = {
				id: `explain-${sequence}`,
				items: [prompt],
				itemsView: "full",
				status: "inProgress",
				error: null,
				startedAt: unixSeconds(),
				completedAt: null,
				durationMs: null,
			};
			const thread = threads.get(threadId);
			if (thread) {
				thread.turns = [turn];
				thread.status = { type: "active", activeFlags: [] };
			}
			respond(frame as never, { turn });
			notify("turn/started", { threadId, turn });
		} else return false;
		return true;
	};
}

/** Emit the one controlled final answer through the ordinary provider protocol. */
export function completeExplanationTurn(
	threadId: string,
	turn: Record<string, unknown>,
	notify: (method: string, params: unknown) => void,
	text = "The gateway accepts shopping requests.",
): void {
	if (text === "") return;
	const item = {
		type: "agentMessage",
		id: "explanation-answer",
		text,
		phase: "final_answer",
		memoryCitation: null,
		delivery: null,
		questions: null,
	};
	(turn["items"] as unknown[]).push(item);
	notify("item/completed", { threadId, turnId: turn["id"], item });
}

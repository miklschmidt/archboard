// Controlled external-provider queue behavior used by the production fixture.
import type { FixtureThread } from "./fake-codex-production-data.ts";
import { promptItem, unixSeconds } from "./fake-codex-production-data.ts";
import type { CodexServerNotificationParamsByMethod } from "@archboard/codex-app-server/contract";

type EventMethod = "turn/started" | "turn/completed" | "item/started" | "item/completed";
export type ExplanationNotification = {
	[M in EventMethod]: { method: M; params: CodexServerNotificationParamsByMethod[M] };
}[EventMethod];

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
	let sentNotifications = 0;
	const start = (threadId: string, submission: Record<string, unknown>, automatic: boolean) => {
		const queue = queues.get(threadId) ?? [];
		queues.set(
			threadId,
			queue.filter((item) => item !== submission),
		);
		const prompt = {
			...promptItem(`${submission["id"]}-prompt`, submission["input"]),
			clientId: submission["clientUserMessageId"],
		};
		const turn = {
			id: `explain-${submission["id"]}`,
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
		if (automatic) {
			// Codex 0.160.0 sends an unloaded lifecycle and separate item notifications.
			turn.items = [];
			turn.itemsView = "notLoaded";
			notify("turn/started", { threadId, turn });
			notify("item/started", { threadId, turnId: turn.id, item: prompt, startedAtMs: Date.now() });
		}
		return turn;
	};
	const handle = (frame: Frame): boolean => {
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
			if (!submission) throw new Error("Cannot start a missing queued submission.");
			const turn = start(threadId, submission, false);
			respond(frame as never, { turn });
			notify("turn/started", { threadId, turn });
		} else return false;
		return true;
	};
	return Object.assign(handle, {
		advance() {
			const current = control();
			const events = (current["explanationNotifications"] ?? []) as ExplanationNotification[];
			for (; sentNotifications < events.length; sentNotifications++) {
				const event = events[sentNotifications]!;
				notify(event.method, event.params);
			}
			if (current["autoConsumeExplanationQueue"] !== true) return;
			for (const [threadId, queue] of queues) {
				if (threads.get(threadId)?.status.type === "idle" && queue[0])
					start(threadId, queue[0], true);
			}
		},
	});
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

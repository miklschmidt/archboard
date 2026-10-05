// Workhorse news: what the coordinator is told about the linked workhorse thread itself (TASK-321).
//
// The coordinator decides what the voice model says, so it hears when a workhorse turn ends or
// starts waiting on the user, whoever started the turn: work the coordinator gave it, and a turn
// the user started from the conversation alike. That comes from the workhorse thread's own
// notifications, one source for every turn, so the coordinator's delegations are not reported
// twice. It also hears what the workhorse tells it through tell_coordinator. What reaches the
// coordinator is one plain sentence; it reads the rest through inspect_workhorse.

import type { DynamicServerRequest, TransportServerNotification } from "@/runtime/codex-transport";
import type { IdentityAuthority } from "@/shared/codex-workbench-identity";
import type {
	CoordinatorCallback,
	CoordinatorCallbackCurrentChild,
	CoordinatorCallbackLinkCorrelation,
	CoordinatorCallbackReadyCoordinator,
	CoordinatorWorkhorseNewsCallback,
	WorkhorseNewsSource,
} from "@/runtime/codex-coordinator-callbacks/lib/contract";

type RawNotification = TransportServerNotification["notification"];
type ThreadStatus = Extract<
	RawNotification,
	{ method: "thread/status/changed" }
>["params"]["status"];
type CompletedTurn = Extract<RawNotification, { method: "turn/completed" }>["params"]["turn"];

/** The thread flags that mean the workhorse waits on the user. */
const WAITING_FLAGS: ReadonlySet<string> = new Set(["waitingOnApproval", "waitingOnUserInput"]);

/** What the observer reads of the Archboard server when a notification arrives. */
interface WorkhorseNewsContext {
	readonly identity: Pick<IdentityAuthority, "decoder" | "validator">;
	readonly currentChild: () => CoordinatorCallbackCurrentChild | null;
	readonly currentCoordinator: () => CoordinatorCallbackReadyCoordinator | null;
	readonly currentWorkhorseLink: () => CoordinatorCallbackLinkCorrelation | null;
}

/** The identities of the current child, coordinator and linked workhorse thread. */
interface NewsScope {
	readonly child: CoordinatorCallbackCurrentChild;
	readonly coordinatorThreadId: CoordinatorCallbackReadyCoordinator["threadId"];
	readonly workhorseThreadId: WorkhorseNewsSource["workhorseThreadId"];
	readonly wire: string;
}

/**
 * The child, coordinator and workhorse thread a notification must belong to, or null when there is
 * no coordinator or no executable workhorse link to tell.
 * @param context - What the observer reads.
 * @returns The scope, or null.
 */
function newsScope(context: WorkhorseNewsContext): NewsScope | null {
	const child = context.currentChild();
	const coordinator = context.currentCoordinator();
	const link = context.currentWorkhorseLink()?.binding.link;
	if (child === null || coordinator === null || link?.state !== "executable") {
		return null;
	}
	return {
		child,
		coordinatorThreadId: coordinator.threadId,
		workhorseThreadId: link.threadId,
		wire: context.identity.decoder.serializeCodexIdentity(link.threadId),
	};
}

/**
 * The scope of a notification from the current epoch, or null for one from another epoch or when
 * nobody is there to tell.
 * @param context - What the observer reads.
 * @param event - The notification.
 * @returns The scope, or null.
 */
function scopeOf(
	context: WorkhorseNewsContext,
	event: TransportServerNotification,
): NewsScope | null {
	const { child, epoch } = event.correlation;
	return context.identity.validator.isCurrentEpoch(child, epoch) ? newsScope(context) : null;
}

/** What the observer answers: news for each notification, and news for a workhorse's message. */
interface WorkhorseNewsObserver {
	readonly observe: (event: TransportServerNotification) => WorkhorseNewsSource | null;
	/**
	 * The news a tell_coordinator call carries, or why there is none: another thread called it, or
	 * nobody is there to tell.
	 */
	readonly message: (
		request: DynamicServerRequest,
		text: string,
	) => WorkhorseNewsSource | "other_thread" | "nobody";
}

/**
 * How a completed turn ended, as workhorse news.
 * @param status - The turn's final status.
 * @returns The news type, or null for a turn that is still running.
 */
function endingOf(status: string): WorkhorseNewsSource["type"] | null {
	if (status === "completed") return "completed";
	if (status === "failed") return "failed";
	if (status === "interrupted") return "stopped";
	return null;
}

/**
 * Build the observer that turns the linked workhorse thread's notifications into workhorse news.
 * A wait is reported when it begins, not on every status change while it lasts.
 * @param context - What the observer reads of the Archboard server.
 * @returns A function that answers each notification with news, or null.
 */
function createWorkhorseNewsObserver(context: WorkhorseNewsContext): WorkhorseNewsObserver {
	// The coordinator and wire thread a wait on the user was news to, so a wait is news once to each
	// coordinator: a new link starts clean, and so does the fresh coordinator of a new voice session.
	let waitingOn: string | null = null;
	let sequence = 0;
	/**
	 * One piece of news in the scope it was observed in.
	 * @param scope - The current identities.
	 * @param type - What happened.
	 * @param turnWire - The turn's wire identity, when the notification names one.
	 * @param detail - What the turn's error said, when it failed.
	 * @returns The news source.
	 */
	const news = (
		scope: NewsScope,
		type: WorkhorseNewsSource["type"],
		turnWire: string | null,
		detail: string | null,
	): WorkhorseNewsSource => {
		sequence += 1;
		const turnId =
			turnWire === null
				? null
				: (context.identity.decoder.adoptCodexResponseIdentities({ turnIds: [turnWire] })
						.turnIds[0] ?? null);
		return Object.freeze({
			kind: "workhorse_news",
			type,
			sequence,
			childId: scope.child.childId,
			epoch: scope.child.epoch,
			coordinatorThreadId: scope.coordinatorThreadId,
			workhorseThreadId: scope.workhorseThreadId,
			turnId,
			detail,
		});
	};
	/**
	 * News that the thread began waiting on the user, or null while a wait lasts or none began.
	 * @param scope - The current identities.
	 * @param status - The thread's new status.
	 * @returns The news, or null.
	 */
	const waitNews = (scope: NewsScope, status: ThreadStatus): WorkhorseNewsSource | null => {
		const nowWaiting =
			status.type === "active" && status.activeFlags.some((flag) => WAITING_FLAGS.has(flag));
		const wait = `${String(scope.coordinatorThreadId)} ${scope.wire}`;
		const began = nowWaiting && waitingOn !== wait;
		waitingOn = nowWaiting ? wait : null;
		return began ? news(scope, "waiting", null, null) : null;
	};
	/**
	 * News that a turn ended, or null for one that did not.
	 * @param scope - The current identities.
	 * @param turn - The turn as the notification carries it.
	 * @returns The news, or null.
	 */
	const endNews = (scope: NewsScope, turn: CompletedTurn): WorkhorseNewsSource | null => {
		waitingOn = null;
		const type = endingOf(turn.status);
		return type === null ? null : news(scope, type, turn.id, turn.error?.message ?? null);
	};
	const observer: WorkhorseNewsObserver = {
		/**
		 * The news one notification carries about the linked workhorse thread, or null.
		 * @param event - The notification.
		 * @returns The news, or null.
		 */
		observe: (event) => {
			const scope = scopeOf(context, event);
			if (scope === null) return null;
			const notification: RawNotification = event.notification;
			if (notification.method === "thread/status/changed") {
				return notification.params.threadId === scope.wire
					? waitNews(scope, notification.params.status)
					: null;
			}
			if (notification.method === "turn/completed") {
				return notification.params.threadId === scope.wire
					? endNews(scope, notification.params.turn)
					: null;
			}
			return null;
		},
		/**
		 * The news one tell_coordinator call carries, or why there is none.
		 * @param request - The call.
		 * @param text - What the workhorse said.
		 * @returns The news, or who is missing.
		 */
		message: (request, text) => {
			const current = context.identity.validator.isCurrentEpoch(request.child, request.epoch);
			const scope = current ? newsScope(context) : null;
			if (scope === null) return "nobody";
			if (request.params.threadId !== scope.wire) return "other_thread";
			return news(scope, "message", request.params.turnId, text);
		},
	};
	return Object.freeze(observer);
}

/** What the coordinator is told for the workhorse news that carries no detail. */
const PLAIN_NEWS: Readonly<
	Record<Exclude<WorkhorseNewsSource["type"], "failed" | "message">, string>
> = Object.freeze({
	completed: "The workhorse finished a turn.",
	stopped: "A workhorse turn was stopped before it finished.",
	waiting:
		"The workhorse is waiting for the user to answer an approval or a question on the workbench, and its work has not finished.",
});

/**
 * The sentence for one piece of workhorse news.
 * @param callback - The news.
 * @returns The sentence.
 */
function newsSentence(callback: CoordinatorWorkhorseNewsCallback): string {
	if (callback.type === "message") {
		return `While it works, the workhorse tells you: ${JSON.stringify(callback.detail ?? "")}`;
	}
	if (callback.type === "failed") {
		return callback.detail === null
			? "A workhorse turn failed."
			: `A workhorse turn failed: ${callback.detail}`;
	}
	return PLAIN_NEWS[callback.type];
}

/**
 * The one sentence the coordinator is given for a piece of workhorse news or an operation
 * outcome, in words it can act on and with no identities in it.
 * @param callback - The callback the news is about.
 * @returns The sentence.
 */
function workhorseNewsSentence(callback: CoordinatorCallback): string {
	return callback.kind === "workhorse_news"
		? newsSentence(callback)
		: "Something you gave the workhorse may or may not have reached it. Read the workhorse before you act on it or tell the user it happened.";
}

export {
	createWorkhorseNewsObserver,
	workhorseNewsSentence,
	type WorkhorseNewsContext,
	type WorkhorseNewsObserver,
};

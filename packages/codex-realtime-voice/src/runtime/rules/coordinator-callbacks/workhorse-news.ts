// Workhorse news: what the coordinator is told about the workhorse threads themselves.
//
// The coordinator decides what the voice model says, so it hears when a workhorse turn ends or
// starts waiting on the user, whoever started the turn: work the coordinator gave it, and a turn
// the user started from the conversation alike. That comes from each workhorse thread's own
// notifications, one source for every turn, so the coordinator's delegations are not reported
// twice. It also hears what a workhorse tells it through tell_coordinator. A tab session has one
// workhorse for each checkout, so each piece of news names the checkout of the
// workhorse it is about. What reaches the coordinator is one plain sentence; it reads the rest
// through inspect_workhorse.

import type {
	DynamicServerRequest,
	TransportServerNotification,
} from "@archboard/codex-app-server/transport";
import type { IdentityAuthority } from "@archboard/codex-app-server/identity";
import type {
	CoordinatorCallback,
	CoordinatorCallbackCurrentChild,
	CoordinatorCallbackLinkCorrelation,
	CoordinatorCallbackReadyCoordinator,
	CoordinatorWorkhorseNewsCallback,
	WorkhorseNewsSource,
} from "#runtime/protocol/coordinator-callbacks/contract.ts";

type RawNotification = TransportServerNotification["notification"];
type ThreadStatus = Extract<
	RawNotification,
	{ method: "thread/status/changed" }
>["params"]["status"];
type CompletedTurn = Extract<RawNotification, { method: "turn/completed" }>["params"]["turn"];

/** The thread flags that mean the workhorse waits on the user. */
const WAITING_FLAGS: ReadonlySet<string> = new Set(["waitingOnApproval", "waitingOnUserInput"]);

/** What the observer reads of the server when a notification arrives. */
interface WorkhorseNewsContext {
	readonly identity: Pick<IdentityAuthority, "decoder" | "validator">;
	readonly currentChild: () => CoordinatorCallbackCurrentChild | null;
	readonly currentCoordinator: () => CoordinatorCallbackReadyCoordinator | null;
	readonly workhorseLinks: () => readonly CoordinatorCallbackLinkCorrelation[];
}

/** The identities of the current child, the coordinator and one linked workhorse thread. */
interface NewsScope {
	readonly child: CoordinatorCallbackCurrentChild;
	readonly coordinatorThreadId: CoordinatorCallbackReadyCoordinator["threadId"];
	readonly workhorseThreadId: WorkhorseNewsSource["workhorseThreadId"];
	readonly wire: string;
}

/** Why a scope could not be found: nobody to tell, or no workhorse on that thread. */
type NoScope = "nobody" | "other_thread";

/**
 * The child, coordinator and workhorse a thread's event belongs to.
 * @param context - What the observer reads.
 * @param wireThreadId - The thread the event names, as Codex spells it.
 * @returns The scope; "nobody" when there is no coordinator to tell, and "other_thread" when no
 * workhorse of the tab session has an executable link on that thread.
 */
function newsScope(context: WorkhorseNewsContext, wireThreadId: string): NewsScope | NoScope {
	const child = context.currentChild();
	const coordinator = context.currentCoordinator();
	if (child === null || coordinator === null) {
		return "nobody";
	}
	for (const correlation of context.workhorseLinks()) {
		const link = correlation.binding.link;
		if (link.state !== "executable") continue;
		const wire = context.identity.decoder.serializeCodexIdentity(link.threadId);
		if (wire === wireThreadId) {
			return {
				child,
				coordinatorThreadId: coordinator.threadId,
				workhorseThreadId: link.threadId,
				wire,
			};
		}
	}
	return "other_thread";
}

/**
 * The scope of a notification from the current epoch about a workhorse thread, or null for one
 * from another epoch or another thread, or when nobody is there to tell.
 * @param context - What the observer reads.
 * @param event - The notification.
 * @param wireThreadId - The thread it names.
 * @returns The scope, or null.
 */
function scopeOf(
	context: WorkhorseNewsContext,
	event: TransportServerNotification,
	wireThreadId: string,
): NewsScope | null {
	const { child, epoch } = event.correlation;
	if (!context.identity.validator.isCurrentEpoch(child, epoch)) return null;
	const scope = newsScope(context, wireThreadId);
	return typeof scope === "string" ? null : scope;
}

/** What the observer answers: news for each notification, and news for a workhorse's message. */
interface WorkhorseNewsObserver {
	readonly observe: (event: TransportServerNotification) => WorkhorseNewsSource | null;
	/**
	 * The news a tell_coordinator call carries, or why there is none: a thread that is no workhorse
	 * of the tab session called it, or nobody is there to tell.
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
 * The key one wait is news under: the coordinator it was told to and the workhorse thread.
 * @param scope - The current identities.
 * @returns The key.
 */
function waitKey(scope: NewsScope): string {
	return `${String(scope.coordinatorThreadId)} ${scope.wire}`;
}

/**
 * Build the observer that turns the notifications of every linked workhorse thread into
 * workhorse news. A wait is reported when it begins, not on every status change while it lasts.
 * @param context - What the observer reads of the server.
 * @returns A function that answers each notification with news, or null.
 */
function createWorkhorseNewsObserver(context: WorkhorseNewsContext): WorkhorseNewsObserver {
	// The waits on the user that were news, each to one coordinator about one workhorse thread, so
	// a wait is news once to each coordinator: a new link starts clean, and so does the fresh
	// coordinator of a new voice session.
	const waiting = new Set<string>();
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
		const wait = waitKey(scope);
		const began = nowWaiting && !waiting.has(wait);
		if (nowWaiting) waiting.add(wait);
		else waiting.delete(wait);
		return began ? news(scope, "waiting", null, null) : null;
	};
	/**
	 * News that a turn ended, or null for one that did not.
	 * @param scope - The current identities.
	 * @param turn - The turn as the notification carries it.
	 * @returns The news, or null.
	 */
	const endNews = (scope: NewsScope, turn: CompletedTurn): WorkhorseNewsSource | null => {
		waiting.delete(waitKey(scope));
		const type = endingOf(turn.status);
		return type === null ? null : news(scope, type, turn.id, turn.error?.message ?? null);
	};
	const observer: WorkhorseNewsObserver = {
		/**
		 * The news one notification carries about a linked workhorse thread, or null.
		 * @param event - The notification.
		 * @returns The news, or null.
		 */
		observe: (event) => {
			const notification: RawNotification = event.notification;
			if (notification.method === "thread/status/changed") {
				const scope = scopeOf(context, event, notification.params.threadId);
				return scope === null ? null : waitNews(scope, notification.params.status);
			}
			if (notification.method === "turn/completed") {
				const scope = scopeOf(context, event, notification.params.threadId);
				return scope === null ? null : endNews(scope, notification.params.turn);
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
			if (!context.identity.validator.isCurrentEpoch(request.child, request.epoch)) {
				return "nobody";
			}
			const scope = newsScope(context, request.params.threadId);
			return typeof scope === "string"
				? scope
				: news(scope, "message", request.params.turnId, text);
		},
	};
	return Object.freeze(observer);
}

/** What the coordinator is told for the workhorse news that carries no detail. */
const PLAIN_NEWS: Readonly<
	Record<Exclude<WorkhorseNewsSource["type"], "failed" | "message">, string>
> = Object.freeze({
	completed: "finished a turn.",
	stopped: "had a turn stopped before it finished.",
	waiting:
		"is waiting for the user to answer an approval or a question on the workbench, and its work has not finished.",
});

/**
 * The sentence for one piece of workhorse news. It names the checkout the workhorse works in,
 * which is the checkout every workhorse tool takes.
 * @param callback - The news.
 * @returns The sentence.
 */
function newsSentence(callback: CoordinatorWorkhorseNewsCallback): string {
	const checkout = callback.correlation.workhorseLink.checkout;
	if (callback.type === "message") {
		return `While it works, the workhorse in ${checkout} tells you: ${JSON.stringify(callback.detail ?? "")}`;
	}
	if (callback.type === "failed") {
		return callback.detail === null
			? `A turn of the workhorse in ${checkout} failed.`
			: `A turn of the workhorse in ${checkout} failed: ${callback.detail}`;
	}
	return `The workhorse in ${checkout} ${PLAIN_NEWS[callback.type]}`;
}

/**
 * The one sentence the coordinator is given for a piece of workhorse news or an operation
 * outcome, in words it can act on: it names the checkout of the workhorse and no identity.
 * @param callback - The callback the news is about.
 * @returns The sentence.
 */
function workhorseNewsSentence(callback: CoordinatorCallback): string {
	return callback.kind === "workhorse_news"
		? newsSentence(callback)
		: `Something you gave the workhorse in ${callback.correlation.workhorseLink.checkout} may or may not have reached it. Read that workhorse before you act on it or tell the user it happened.`;
}

export {
	createWorkhorseNewsObserver,
	workhorseNewsSentence,
	type WorkhorseNewsContext,
	type WorkhorseNewsObserver,
};

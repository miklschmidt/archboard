// What the timeline shows that thread history never carries: the latest plan
// Codex published for each turn and the thread's latest token usage. Both
// arrive only as notifications, so they are held here, keyed by the wire
// spelling of their ids, and bounded so a long-lived server cannot grow. Which thread a
// notification is about is read here too.

import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import type { ThreadId, TrustedIdentityDecoder } from "@archboard/codex-app-server/identity";
import type {
	CodexTimelinePlanInput,
	CodexTimelineUsageInput,
} from "#server/protocol/projection/projection-contract.ts";
import type { TimelineLiveState } from "#server/projections/timeline/budget.ts";
import { boundedPlan } from "#server/rules/timeline/evidence.ts";

/** How many turns' latest plans are held across every thread. */
const TIMELINE_PLANS_HELD = 256;

/** How many threads' latest token usage is held. */
const TIMELINE_USAGES_HELD = 64;

/** The plans and usage held from notifications. */
interface TimelineLiveHolder {
	/** Hold what a plan or token usage notification reports; true when it was one. */
	readonly hold: (event: TransportServerNotification) => boolean;
	/** What is held for one thread. */
	readonly forThread: (threadId: ThreadId) => TimelineLiveState;
	/** Forget everything held. */
	readonly clear: () => void;
}

/**
 * Hold one value under a key as the newest held, forgetting the oldest once
 * more than the limit are held.
 * @param held The held values, oldest first.
 * @param key The key.
 * @param value The value.
 * @param limit How many may be held.
 */
function holdNewest<Value>(
	held: Map<string, Value>,
	key: string,
	value: Value,
	limit: number,
): void {
	held.delete(key);
	held.set(key, value);
	for (const oldest of held.keys()) {
		if (held.size <= limit) {
			return;
		}
		held.delete(oldest);
	}
}

/**
 * The key one turn's plan is held under.
 * @param threadId The thread, as the wire spells it.
 * @param turnId The turn, as the wire spells it.
 * @returns The key.
 */
function planKey(threadId: string, turnId: string): string {
	return JSON.stringify([threadId, turnId]);
}

/**
 * Hold the latest plan of each turn and the latest usage of each thread.
 * @param identity How an id is spelled on the wire.
 * @returns The holder.
 */
function createTimelineLiveHolder(
	identity: Pick<TrustedIdentityDecoder, "serializeCodexIdentity">,
): TimelineLiveHolder {
	const plans = new Map<string, CodexTimelinePlanInput>();
	const usages = new Map<string, CodexTimelineUsageInput>();
	const holder: TimelineLiveHolder = {
		/**
		 * Hold what a plan or token usage notification reports.
		 * @param event The notification.
		 * @param event.notification What it carries.
		 * @returns True when it was one of those.
		 */
		hold: ({ notification }) => {
			if (notification.method === "turn/plan/updated") {
				const { threadId, turnId } = notification.params;
				holdNewest(
					plans,
					planKey(threadId, turnId),
					boundedPlan(notification.params),
					TIMELINE_PLANS_HELD,
				);
				return true;
			}
			if (notification.method === "thread/tokenUsage/updated") {
				const { threadId, tokenUsage } = notification.params;
				holdNewest(usages, threadId, tokenUsage, TIMELINE_USAGES_HELD);
				return true;
			}
			return false;
		},
		/**
		 * What is held for one thread.
		 * @param threadId The thread.
		 * @returns Its usage, and a lookup for each turn's plan.
		 */
		forThread: (threadId) => {
			const wireThreadId = identity.serializeCodexIdentity(threadId);
			return {
				usage: usages.get(wireThreadId) ?? null,
				/**
				 * The latest plan held for one turn.
				 * @param turnId The turn.
				 * @returns The plan, or null.
				 */
				planFor: (turnId) =>
					plans.get(planKey(wireThreadId, identity.serializeCodexIdentity(turnId))) ?? null,
			};
		},
		/** Forget everything held. */
		clear: () => {
			plans.clear();
			usages.clear();
		},
	};
	return Object.freeze(holder);
}

/**
 * Whether a value is a plain object that can be read by key.
 * @param value Anything a notification carried.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The thread one notification is about, read from its parameters or, for a
 * thread that has just started, from the thread it carries.
 * @param event The notification.
 * @returns The thread as the wire spells it, or null.
 */
function eventThreadId(event: TransportServerNotification): string | null {
	const params = event.notification.params;
	if (!isRecord(params)) {
		return null;
	}
	if (typeof params["threadId"] === "string") {
		return params["threadId"];
	}
	return event.notification.method === "thread/started" ? startedThreadId(params) : null;
}

/**
 * The thread a thread/started notification carries.
 * @param params The notification's parameters.
 * @returns The thread as the wire spells it, or null.
 */
function startedThreadId(params: Readonly<Record<string, unknown>>): string | null {
	const thread = params["thread"];
	if (!isRecord(thread) || typeof thread["id"] !== "string") {
		return null;
	}
	return thread["id"];
}

export { eventThreadId, createTimelineLiveHolder, TIMELINE_PLANS_HELD, TIMELINE_USAGES_HELD };
export type { TimelineLiveHolder };

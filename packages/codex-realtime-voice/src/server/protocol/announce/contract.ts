// What a host announces when something its agents should know about has changed, and what each
// audience made of it. The operation is `VoiceAgent.announce`; `services/announce/announce.ts`
// delivers it.

import type { CoordinatorCallbackDeliveryReason } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import type { CodexThreadContextDeliveryReason } from "#runtime/services/thread-context/contract.ts";
import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";

/** Who can be told a context change: a checkout's workhorse, the coordinator, or the live voice. */
type ContextAudience = "workhorse" | "coordinator" | "voice";

/**
 * What one audience is told: the words, or why the host tells it nothing this time. A withheld
 * audience is told nothing, and its receipt says `withheld`.
 */
type ContextWords<Extra extends object = object> =
	| (Extra & { readonly text: string })
	| { readonly withheld: string };

/**
 * One change a host announces. Name at least one audience. Each audience hears one `feed` and
 * `sequence` at most once.
 */
interface ContextChange {
	/** The stream the change belongs to. */
	readonly feed: string;
	/**
	 * The change's place in its feed, a whole number from 0. A workhorse refuses a sequence that
	 * does not pass the last one of the same feed it was given, as `stale_cursor`.
	 */
	readonly sequence: number;
	/** The tab sessions the change is for. Default: every live one. */
	readonly tabSessions?: readonly TabSessionId[];
	/**
	 * The Codex thread that made the change, or null. Nobody is told their own change, and the
	 * receipt says `own_change`: a workhorse is not told a change that it or its tab's coordinator
	 * made, and the coordinator and the voice are not told one that any thread of their tab made.
	 */
	readonly author?: string | null;
	/**
	 * When the change happened, in milliseconds since the epoch. Default: now. The change is fresh
	 * for a fixed window from then, and a workhorse is not told a change that went stale.
	 */
	readonly capturedAtMs?: number;
	/**
	 * What the change is about. While a change for the coordinator or the voice waits in its tab's
	 * queue, a later change of the same feed and topic replaces it. Without a topic, nothing
	 * replaces it.
	 */
	readonly topic?: string;
	/**
	 * The workhorses of these checkouts, told as a developer message that starts no turn, also while
	 * a turn runs. `payload` is your own data: the context codec encodes it with the execution facts,
	 * and it cannot use their keys.
	 */
	readonly workhorse?: { readonly checkouts: readonly string[] } & ContextWords<{
		readonly payload?: Readonly<Record<string, unknown>>;
	}>;
	/** The coordinator, told as a developer message that starts no turn, only while voice is live. */
	readonly coordinator?: ContextWords;
	/**
	 * The live voice, told as quiet context, or as speech it answers once the audio in progress ends.
	 * Only while voice is live.
	 */
	readonly voice?: ContextWords<{ readonly speech?: boolean }>;
}

/** Why an audience was not told a change, or why the outcome of telling it is unknown. */
type ContextReceiptReason =
	| CodexThreadContextDeliveryReason
	| CoordinatorCallbackDeliveryReason
	/** The tab session has no workhorse in that checkout. */
	| "no_workhorse"
	/** No live tab session has that id. */
	| "no_tab_session";

/**
 * What one audience of one tab session made of a change. `outcome_unknown` means the message may
 * have arrived: the agent never sends it again.
 */
interface ContextReceipt {
	readonly tabSessionId: TabSessionId;
	readonly audience: ContextAudience;
	/** The workhorse's checkout; null for the coordinator and the voice. */
	readonly checkout: string | null;
	readonly outcome: "delivered" | "not_delivered" | "outcome_unknown";
	readonly reason: ContextReceiptReason | null;
}

export type { ContextAudience, ContextChange, ContextReceipt, ContextReceiptReason, ContextWords };

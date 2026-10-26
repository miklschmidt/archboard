// The conversation as the workbench shows it: one turn per Codex turn, in
// order, each carrying the items the server published with their evidence, how
// long it ran, how it ended, and the plan it was working to. The voice
// coordinator's turns stand among the workhorse's, tagged by whose they are.

import type { BrowserTimeline } from "#shared/schemas/browser/snapshot.ts";

type BrowserTurn = BrowserTimeline["turns"][number];

/** One item of a turn exactly as the server published it: a prompt, prose, work, a plan, an approval. */
type ConversationItem = BrowserTurn["items"][number];

/** The plan Codex published for a turn. */
type ConversationPlan = NonNullable<BrowserTurn["plan"]>;

/** How a turn ended, in the workbench's words. */
type ConversationOutcome = "running" | "completed" | "interrupted" | "failed";

/** Whose turn it is: the workhorse's, or the voice coordinator's. */
type ConversationOwner = "workhorse" | "coordinator";

/** The voice coordinator's turn that handed a workhorse turn its work. */
interface ConversationDelegation {
	readonly turnId: BrowserTurn["turnId"];
	/** Whether that turn is in the conversation, so the workhorse turn can point to it. */
	readonly shown: boolean;
}

/** One turn of the conversation. */
interface ConversationTurn {
	/** Stable across publications: the thread and the turn. */
	readonly id: string;
	readonly owner: ConversationOwner;
	readonly threadId: BrowserTimeline["threadId"];
	readonly turnId: BrowserTurn["turnId"];
	readonly outcome: ConversationOutcome;
	readonly items: readonly ConversationItem[];
	/** When it started and ended, in milliseconds, when Codex said. */
	readonly startedAtMs: number | null;
	readonly completedAtMs: number | null;
	readonly durationMs: number | null;
	/** Codex's own words for a failure, or null. */
	readonly error: BrowserTurn["error"];
	/** The latest plan Codex published for it, or null. */
	readonly plan: ConversationPlan | null;
	/** The voice coordinator's turn that delegated this one, while the server knows it, or null. */
	readonly delegatedBy: ConversationDelegation | null;
}

/** The thread's token use, and the context window it counts against. */
type ConversationUsage = NonNullable<BrowserTimeline["usage"]>;

export type {
	ConversationDelegation,
	ConversationItem,
	ConversationOutcome,
	ConversationOwner,
	ConversationPlan,
	ConversationTurn,
	ConversationUsage,
};

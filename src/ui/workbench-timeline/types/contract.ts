// The conversation as the workbench shows it: one turn per Codex turn, in
// order, each carrying the items the server published with their evidence, how
// long it ran, how it ended, and the plan it was working to.

import type { BrowserTimeline } from "@/shared/codex-browser-model";

type BrowserTurn = BrowserTimeline["turns"][number];

/** One item of a turn exactly as the server published it: a prompt, prose, work, a plan, an approval. */
type ConversationItem = BrowserTurn["items"][number];

/** The plan Codex published for a turn. */
type ConversationPlan = NonNullable<BrowserTurn["plan"]>;

/** How a turn ended, in the workbench's words. */
type ConversationOutcome = "running" | "completed" | "interrupted" | "failed";

/** One turn of the conversation. */
interface ConversationTurn {
	/** Stable across publications: the thread and the turn. */
	readonly id: string;
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
}

/** The thread's token use, and the context window it counts against. */
type ConversationUsage = NonNullable<BrowserTimeline["usage"]>;

export type {
	ConversationItem,
	ConversationOutcome,
	ConversationPlan,
	ConversationTurn,
	ConversationUsage,
};

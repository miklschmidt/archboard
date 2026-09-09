// The timeline module's typed surface: the decoded app-server thread shapes
// it normalises, the identity-preserving items it produces, and the
// Archboard-owned turn projection the runtime adapts into assistant-ui
// messages at one named seam.

import type { CodexResponseByMethod } from "@/shared/codex-app-server-contract";
import type { BrowserTimeline } from "@/shared/codex-browser-model";

type CodexWorkbenchThread = CodexResponseByMethod["thread/read"]["thread"];
type CodexWorkbenchTurn = CodexWorkbenchThread["turns"][number];
type CodexWorkbenchItem = CodexWorkbenchTurn["items"][number];
type WorkbenchTimelineRuntime = BrowserTimeline;
type WorkbenchTimelineItemId = BrowserTimeline["turns"][number]["items"][number]["itemId"];
type WorkbenchTimelineTurnId = BrowserTimeline["turns"][number]["turnId"];
type WorkbenchTimelineThreadId = BrowserTimeline["threadId"];

/** What the normaliser reads. */
interface WorkbenchTimelineInput {
	/** Stable app-server thread identity shared with the mounted assistant runtime. */
	readonly threadId: CodexWorkbenchThread["id"];
	/** Complete decoded app-server turns. */
	readonly turns: readonly CodexWorkbenchTurn[];
	/** Browser projection used for approval events and terminal state while turns stream. */
	readonly runtimeTimeline?: WorkbenchTimelineRuntime | null;
	readonly history?: "current" | "prior_epoch";
}

/** One normalised item with a stable identity. */
interface TimelineItem {
	readonly identity: string;
	readonly itemId: string;
	readonly label: string;
	readonly type: string;
	readonly value: unknown;
	readonly malformed: boolean;
}

/** One normalised turn. */
interface TimelineTurn {
	readonly turnId: string;
	readonly status: string;
	readonly streaming: boolean;
	readonly items: readonly TimelineItem[];
	readonly error: unknown;
}

/** The normalised timeline. */
interface NormalizedTimeline {
	readonly turns: ReadonlyMap<string, TimelineTurn>;
	readonly streaming: boolean;
	readonly priorEpoch: boolean;
}

/** Authoritative Codex identity retained beside the assistant-ui parts. */
interface WorkbenchCodexItemMetadata {
	readonly itemId: WorkbenchTimelineItemId;
	readonly kind: string;
	readonly supported: boolean;
	readonly value: Readonly<Record<string, unknown>>;
}

/** Archboard's own facts about one turn, kept beside the message. */
interface WorkbenchTurnMetadata {
	readonly threadId: WorkbenchTimelineThreadId;
	readonly turnId: WorkbenchTimelineTurnId;
	readonly summary: string;
	readonly outputsIncluded: boolean;
	readonly outputsTruncated: boolean;
	readonly items: readonly WorkbenchCodexItemMetadata[];
}

/** How a projected turn ended, in Archboard's words. */
type WorkbenchTurnOutcome = "running" | "completed" | "interrupted" | "failed";

/** A text-bearing part of a projected turn. */
interface WorkbenchTurnTextPart {
	readonly kind: "text" | "reasoning";
	readonly text: string;
}

/** A tool-shaped part of a projected turn: a tool, a command, a file change or an approval. */
interface WorkbenchTurnToolPart {
	readonly kind: "tool";
	/** Unique within the turn: the item id qualified by the item kind. */
	readonly callId: string;
	readonly name: string;
	readonly detail: string;
	readonly status: string;
	readonly failed: boolean;
}

type WorkbenchTurnPart = WorkbenchTurnTextPart | WorkbenchTurnToolPart;

/** One turn as the runtime shows it: an identity, parts, an outcome and metadata. */
interface WorkbenchTurnProjection {
	readonly id: string;
	readonly outcome: WorkbenchTurnOutcome;
	/** The words for a failed turn. */
	readonly failure: string | null;
	readonly parts: readonly WorkbenchTurnPart[];
	readonly metadata: WorkbenchTurnMetadata;
}

export type {
	CodexWorkbenchItem,
	CodexWorkbenchThread,
	CodexWorkbenchTurn,
	NormalizedTimeline,
	TimelineItem,
	TimelineTurn,
	WorkbenchCodexItemMetadata,
	WorkbenchTimelineInput,
	WorkbenchTimelineItemId,
	WorkbenchTimelineRuntime,
	WorkbenchTimelineThreadId,
	WorkbenchTimelineTurnId,
	WorkbenchTurnMetadata,
	WorkbenchTurnOutcome,
	WorkbenchTurnPart,
	WorkbenchTurnProjection,
	WorkbenchTurnTextPart,
	WorkbenchTurnToolPart,
};

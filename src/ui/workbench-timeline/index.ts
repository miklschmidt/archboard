// Timeline normalisation and identity: the projection of the host's
// authoritative timeline into Archboard-owned turn projections the runtime
// adapts into assistant-ui messages, the normaliser over decoded thread turns,
// and the bounded details helpers. Rendering belongs to the official thread.

export {
	boundedDetails,
	boundedText,
	safeHttpUrl,
	type BoundedText,
} from "@/ui/workbench-timeline/lib/details";
export { CODEX_THREAD_ITEM_LABELS, normalizeTimeline } from "@/ui/workbench-timeline/lib/normalize";
export {
	failureProjection,
	projectTimelineTurns,
	workbenchRuntimeMessageId,
} from "@/ui/workbench-timeline/lib/projection";
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
} from "@/ui/workbench-timeline/lib/contract";

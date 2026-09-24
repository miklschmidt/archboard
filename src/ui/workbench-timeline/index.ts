// The conversation the workbench shows, projected from the server's
// authoritative timeline: turns with their items, timing, outcome and plan.

export { conversationTurnId, projectTimelineTurns } from "@/ui/workbench-timeline/lib/projection";
export type {
	ConversationItem,
	ConversationOutcome,
	ConversationPlan,
	ConversationTurn,
	ConversationUsage,
} from "@/ui/workbench-timeline/types/contract";

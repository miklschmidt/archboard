// The conversation the workbench shows, projected from the server's
// authoritative timelines: turns with their items, timing, outcome and plan,
// the workhorse's and the voice coordinator's in one order.

export {
	conversationTurnId,
	mergeConversation,
	projectTimelineTurns,
} from "@/ui/workbench-timeline/lib/projection";
export type {
	ConversationDelegation,
	ConversationItem,
	ConversationOutcome,
	ConversationOwner,
	ConversationPlan,
	ConversationTurn,
	ConversationUsage,
} from "@/ui/workbench-timeline/types/contract";

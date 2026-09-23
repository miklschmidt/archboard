// The conversation's assistant-ui runtime: the transport's timeline adapted
// into messages at one named seam, and the provider that places it.

export {
	AgentRuntimeProvider,
	type AgentRuntimeProviderProps,
} from "@/ui/workbench-runtime/components/AgentRuntimeProvider";
export { useConversation, type Conversation } from "@/ui/workbench-runtime/hooks/use-agent-runtime";
export {
	toThreadMessageLike,
	type ActivityItem,
	type ActivityRun,
	type ConversationDataParts,
	type TurnEnd,
} from "@/ui/workbench-runtime/lib/messages";

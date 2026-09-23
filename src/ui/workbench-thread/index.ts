// The conversation as a person reads it: the agent's turns rendered from what
// the host published, over the assistant-ui runtime `src/ui/workbench-runtime`
// provides. This module and the runtime are the only owners of assistant-ui.

export { ActivityRun, type ActivityRunProps } from "@/ui/workbench-thread/components/ActivityRun";
export {
	Conversation,
	type ConversationProps,
} from "@/ui/workbench-thread/components/Conversation";
export { activityLabel, runSummary, shortDuration } from "@/ui/workbench-thread/lib/activity-words";

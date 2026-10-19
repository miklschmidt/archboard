// The conversation's assistant-ui runtime: the provider that places it, the hook that reads the conversation, and the activity items of a turn. Safe for the browser.
export { AgentRuntimeProvider } from "#ui/components/runtime/AgentRuntimeProvider.tsx";
export { useConversation } from "#ui/hooks/runtime/use-agent-runtime.ts";
export type { Conversation } from "#ui/hooks/runtime/use-agent-runtime.ts";
export type { ActivityItem } from "#ui/rules/runtime/messages.ts";

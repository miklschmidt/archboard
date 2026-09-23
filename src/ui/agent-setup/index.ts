// Talking to the agent needs no setup: a message or a press of Talk carries
// itself through sign-in, Codex starting and the conversation's creation.

export { type HeldMessage, type HeldState } from "@/ui/agent-setup/lib/held";
export { agentPhase, type AgentPhase } from "@/ui/agent-setup/lib/phase";
export {
	createAgentSetup,
	type AgentSetup,
	type AgentSetupPorts,
	type AgentSetupSnapshot,
	type AuthTab,
	type SendOptions,
	type SetupStep,
	type TalkOptions,
	type SetupStepResult,
} from "@/ui/agent-setup/lib/setup";

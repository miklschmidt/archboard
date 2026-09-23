// Talking to the agent needs no setup: a message or a press of Talk carries
// itself through sign-in, Codex starting and the conversation's creation.

export { agentPhase, type AgentPhase } from "@/ui/agent-setup/lib/phase";
export {
	createAgentSetup,
	type AgentSetup,
	type AgentSetupPorts,
	type AgentSetupSnapshot,
	type AuthTab,
	type HeldMessage,
	type HeldState,
	type SendOptions,
	type SetupStep,
	type SetupStepResult,
} from "@/ui/agent-setup/lib/setup";

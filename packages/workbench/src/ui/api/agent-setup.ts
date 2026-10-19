// Getting the agent ready: sign-in, Codex starting and the conversation's creation that a message or a press of Talk carries itself through, with the phase the agent is in. Safe for the browser.
export type { AgentPhase } from "#ui/rules/agent-setup/phase.ts";
export { createAgentSetup } from "#ui/state/agent-setup/setup.ts";
export type {
	AgentSetup,
	AgentSetupPorts,
	AgentSetupSnapshot,
	AuthTab,
	SetupStepResult,
	TalkOptions,
} from "#ui/state/agent-setup/setup.ts";

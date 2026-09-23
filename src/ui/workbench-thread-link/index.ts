// The canvas's thread link: the one explicit link naming one workhorse, the
// host's candidate inventory and recoveries, and the controller that runs each
// link and sign-in command against the pane it was asked from. The agent setup
// (`@/ui/agent-setup`) drives it; nothing here renders.

export {
	projectThreadLinkSelection,
	threadLinkReasonLabel,
} from "@/ui/workbench-thread-link/lib/candidates";
export { createThreadLinkController } from "@/ui/workbench-thread-link/lib/controller";
export { threadLinkRecovery } from "@/ui/workbench-thread-link/lib/recovery";

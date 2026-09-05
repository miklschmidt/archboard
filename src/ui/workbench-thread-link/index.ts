// The pane's explicit thread link: the one link naming one workhorse, the
// host's candidate inventory, readiness and recovery, the supported sign-in
// forms, and the controller that runs each command against the pane it was
// offered on. Presentation lives in `@/ui/workbench` and
// `@/ui/agent-settings`; this module owns the logic, the state and the
// projections.

export {
	THREAD_LINK_ACCOUNT_FORMS,
	THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS,
	buildThreadLinkLogin,
	threadLinkAccountForm,
} from "@/ui/workbench-thread-link/lib/account-forms";
export { projectThreadLinkAccount } from "@/ui/workbench-thread-link/lib/account";
export {
	agentSettingsBusy,
	agentSettingsCallbacks,
	agentSettingsErrors,
	workbenchThreadLinkActions,
	type AgentSettingsCallbacks,
	type WorkbenchThreadLinkActionOptions,
} from "@/ui/workbench-thread-link/lib/agent-settings";
export {
	projectThreadLinkSelection,
	threadLinkReasonLabel,
} from "@/ui/workbench-thread-link/lib/candidates";
export { createThreadLinkController } from "@/ui/workbench-thread-link/lib/controller";
export { projectThreadLinkPanel } from "@/ui/workbench-thread-link/lib/projection";
export { projectThreadLinkReadiness } from "@/ui/workbench-thread-link/lib/readiness";
export { threadLinkRecovery } from "@/ui/workbench-thread-link/lib/recovery";

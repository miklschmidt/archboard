// Agent settings: the Codex account, the pane's explicit thread link and the
// voice coordinator, presented over the shared browser-model records. Sign-in,
// linking and unlinking are reported to the host; nothing here talks to Codex.

export { AgentSettingsDialog } from "@/ui/agent-settings/lib/agent-settings-dialog";
export type {
	AgentSettingsBusy,
	AgentSettingsDialogProps,
	AgentSettingsErrors,
	LoginId,
	LoginVariant,
	PendingLogin,
} from "@/ui/agent-settings/lib/contracts";
export {
	LOGIN_VARIANTS,
	approvalPolicyText,
	coordinatorFacts,
	describeAccount,
	describeCandidate,
	describeCoordinator,
	describeLoginOutcome,
	describeThreadLink,
	loginVariantLabel,
	pendingLogin,
	settingsFacts,
	threadLinkFacts,
	type BadgeTone,
	type StateSummary,
} from "@/ui/agent-settings/lib/presentation";

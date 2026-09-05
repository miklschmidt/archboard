// Opener settings: which editor a code-bound element opens, presented over
// the shared `OpenerSettingsReply` contract. Persisting and testing belong to
// the host; this module reports the selection and the test request.

export type {
	CustomCommandCheck,
	CustomCommandDraft,
	CustomCommandIssues,
	OpenerChoice,
	OpenerSettingsBusy,
	OpenerSettingsDialogProps,
	OpenerTestResult,
} from "@/ui/opener-settings/lib/contracts";
export {
	argvOfText,
	checkCustomCommand,
	choiceOfSelection,
	draftOfSelection,
	presetChoice,
	presetOfChoice,
	selectionOfChoice,
	type PresetName,
} from "@/ui/opener-settings/lib/custom-command";
export { OpenerSettingsDialog } from "@/ui/opener-settings/lib/opener-settings-dialog";

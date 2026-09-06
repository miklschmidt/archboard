// The typed inputs and outputs of the opener settings dialog. Every shape on
// the wire is the shared Zod contract's; this file only names the dialog's
// own state and the callbacks the host satisfies.

import type {
	CodeTargetOpenFailure,
	OpenerSelection,
	OpenerSettingsReply,
	OpenerSettingsTestRequest,
	OpenerTestReply,
} from "@/shared/code-target";
import type { DialogError } from "@/ui/board-dialogs";

/** The three actions, each with its own in-flight state. */
interface OpenerSettingsBusy {
	test: boolean;
	save: boolean;
	reset: boolean;
}

/** What a test answered: the shared success, or the shared failure. */
type OpenerTestResult = OpenerTestReply | CodeTargetOpenFailure;

/** One entry of the opener radio group. */
type OpenerChoice = "platform" | "preset:vscode" | "preset:cursor" | "preset:zed" | "custom";

/** The custom command as typed: an executable and one argument per line. */
interface CustomCommandDraft {
	executable: string;
	argvText: string;
}

/** Validation messages for the custom command, per field. */
interface CustomCommandIssues {
	executable: readonly string[];
	argv: readonly string[];
}

/** A custom selection the shared schema accepted, or why it did not. */
type CustomCommandCheck =
	| { ok: true; selection: Extract<OpenerSelection, { kind: "custom" }> }
	| { ok: false; issues: CustomCommandIssues };

/** Inputs for the opener settings dialog. */
interface OpenerSettingsDialogProps {
	open: boolean;
	/** The settings as the server answered, or null while they are being read. */
	settings: OpenerSettingsReply | null;
	busy: OpenerSettingsBusy;
	testResult: OpenerTestResult | null;
	error: DialogError | null;
	onTest: (request: OpenerSettingsTestRequest) => void;
	onSave: (selection: OpenerSelection) => void;
	/** Restore the platform default; the host persists it. */
	onReset: () => void;
	onOpenChange: (open: boolean) => void;
	/** Where focus returns when the dialog closes: the control that opened it. */
	finalFocus?: () => HTMLElement | null;
}

export type {
	CustomCommandCheck,
	CustomCommandDraft,
	CustomCommandIssues,
	OpenerChoice,
	OpenerSettingsBusy,
	OpenerSettingsDialogProps,
	OpenerTestResult,
};

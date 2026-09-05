// The opener settings dialog over the real `OpenerSettingsReply`. The form
// mounts once the reply has arrived, so its draft starts from what is saved.

import { useCallback, useState } from "react";

import type { OpenerSettingsReply } from "@/shared/code-target";
import { BusyText, DialogErrorAlert, OUTLINE_BUTTON_CLASS, Technical } from "@/ui/board-dialogs";
import { Button } from "@/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/ui/components/dialog";
import { Separator } from "@/ui/components/separator";
import type {
	CustomCommandDraft,
	CustomCommandIssues,
	OpenerChoice,
	OpenerSettingsDialogProps,
} from "@/ui/opener-settings/lib/contracts";
import {
	choiceOfSelection,
	draftOfSelection,
	selectionOfChoice,
} from "@/ui/opener-settings/lib/custom-command";
import {
	CustomCommandFields,
	OpenerChoiceGroup,
	formatCommand,
} from "@/ui/opener-settings/lib/selection-fields";
import { RepositoryField, TestResultAlert } from "@/ui/opener-settings/lib/test-section";

/** Inputs for the effective command line. */
interface EffectiveOpenerProps {
	settings: OpenerSettingsReply;
}

/**
 * The command the saved selection resolves to, as the server reports it.
 * @param props The settings reply.
 * @returns One line.
 */
function EffectiveOpener(props: EffectiveOpenerProps): React.JSX.Element {
	const { effectiveCommand } = props.settings;
	return (
		<p className="text-muted-foreground text-xs">
			Saved opener:{" "}
			{effectiveCommand ? <Technical>{formatCommand(effectiveCommand)}</Technical> : "none"}
		</p>
	);
}

/**
 * The checkout a test starts on: the first that can be opened as registered,
 * else the first, else none.
 * @param settings The settings reply.
 * @returns A repository name, or null.
 */
function defaultRepository(settings: OpenerSettingsReply): string | null {
	const usable = settings.repositories.find(
		(checkout) => checkout.exists && checkout.identityMatches,
	);
	return (usable ?? settings.repositories[0])?.repository ?? null;
}

/** What one attempt found: the issues to show, or none. */
type AttemptIssues = CustomCommandIssues | null;

/** Inputs for the form, which needs the reply to have arrived. */
interface OpenerSettingsFormProps {
	settings: OpenerSettingsReply;
	dialog: OpenerSettingsDialogProps;
}

/**
 * The opener form: the choice, the custom fields, the test, and the actions.
 * @param props The settings reply and the dialog's props.
 * @returns The form body and footer.
 */
function OpenerSettingsForm(props: OpenerSettingsFormProps): React.JSX.Element {
	const { settings, dialog } = props;
	const { busy } = dialog;
	const [choice, setChoice] = useState<OpenerChoice>(() => choiceOfSelection(settings.selection));
	const [draft, setDraft] = useState<CustomCommandDraft>(() =>
		draftOfSelection(settings.selection),
	);
	const [repository, setRepository] = useState<string | null>(() => defaultRepository(settings));
	const [issues, setIssues] = useState<AttemptIssues>(null);
	const anyBusy = busy.test || busy.save || busy.reset;
	const handleSave = useCallback(() => {
		const result = selectionOfChoice(choice, draft);
		setIssues(result.ok ? null : result.issues);
		if (result.ok) {
			dialog.onSave(result.selection);
		}
	}, [choice, dialog, draft]);
	const handleTest = useCallback(() => {
		const result = selectionOfChoice(choice, draft);
		setIssues(result.ok ? null : result.issues);
		if (result.ok && repository !== null) {
			dialog.onTest({ selection: result.selection, repository });
		}
	}, [choice, dialog, draft, repository]);
	return (
		<>
			<EffectiveOpener settings={settings} />
			<OpenerChoiceGroup
				settings={settings}
				choice={choice}
				disabled={anyBusy}
				onChoice={setChoice}
			/>
			{choice === "custom" && (
				<CustomCommandFields draft={draft} disabled={anyBusy} issues={issues} onDraft={setDraft} />
			)}
			<Separator />
			<RepositoryField
				repositories={settings.repositories}
				value={repository}
				disabled={anyBusy}
				onChange={setRepository}
			/>
			<TestResultAlert result={dialog.testResult} />
			<DialogErrorAlert error={dialog.error} />
			<BusyText busy={busy.test} text="Testing the opener…" />
			<BusyText busy={busy.save} text="Saving the opener…" />
			<BusyText busy={busy.reset} text="Restoring the platform default…" />
			<DialogFooter>
				<Button variant="ghost" disabled={anyBusy} onClick={dialog.onReset}>
					Reset
				</Button>
				<Button variant="outline" disabled={anyBusy || repository === null} onClick={handleTest}>
					Test
				</Button>
				<DialogClose className={OUTLINE_BUTTON_CLASS} disabled={anyBusy}>
					Close
				</DialogClose>
				<Button disabled={anyBusy} onClick={handleSave}>
					Save
				</Button>
			</DialogFooter>
		</>
	);
}

/**
 * The opener settings dialog.
 * @param props The reply, the state and the callbacks.
 * @returns The dialog.
 */
function OpenerSettingsDialog(props: OpenerSettingsDialogProps): React.JSX.Element {
	const { settings } = props;
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Opener settings</DialogTitle>
					<DialogDescription>
						Which editor a code-bound element opens on this machine. Test it before you save.
					</DialogDescription>
				</DialogHeader>
				{settings ? (
					<OpenerSettingsForm settings={settings} dialog={props} />
				) : (
					<p aria-live="polite" className="text-muted-foreground text-sm">
						Reading opener settings…
					</p>
				)}
			</DialogContent>
		</Dialog>
	);
}

export { OpenerSettingsDialog };

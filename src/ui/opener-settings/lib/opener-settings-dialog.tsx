// The opener settings dialog over the real `OpenerSettingsReply`. The form
// mounts once the reply has arrived, so its draft starts from what is saved.

import { useCallback, useEffect, useRef, useState } from "react";

import type { OpenerSettingsReply } from "@/shared/code-target";
import { BusyText, DialogErrorAlert, CANCEL_BUTTON_CLASS, Technical } from "@/ui/board-dialogs";
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
		<p className="text-muted-foreground text-body">
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

/**
 * The first control of the form: the opener choice group's tab stop (the
 * radio group keeps focus on that item), else the first control there is.
 */
const FIRST_CONTROL = '[role="radio"][tabindex="0"], [role="radio"], button, input';

/**
 * Put keyboard focus on the form's first control once it mounts. The dialog
 * opens before the saved settings arrive, so its own initial focus can only
 * find the close control; the form corrects that when it appears, unless
 * the person has already moved.
 * @returns The ref for the form's root.
 */
function useFirstControlFocus(): React.RefObject<HTMLDivElement | null> {
	const root = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		// One frame later: the radio group marks its chosen item after mounting.
		const frame = requestAnimationFrame(() => {
			if (!personHasMoved(root.current)) {
				root.current?.querySelector<HTMLElement>(FIRST_CONTROL)?.focus();
			}
		});
		return () => {
			cancelAnimationFrame(frame);
		};
	}, []);
	return root;
}

/**
 * Whether keyboard focus already sits on a control of the dialog other than
 * its close control, which is where the dialog's own initial focus lands.
 * @param form The form's root, or null before it mounts.
 * @returns True when the person has moved and focus must stay put.
 */
function personHasMoved(form: HTMLElement | null): boolean {
	const active = document.activeElement;
	if (!(active instanceof HTMLElement) || form === null) {
		return false;
	}
	const inDialog = form.closest('[role="dialog"]')?.contains(active) === true;
	// The dialog's own initial focus lands on its close control or, when the
	// form mounted with it, on the first radio; neither is a move by the person.
	const placedByDialog =
		active.closest('[data-slot="dialog-close"]') !== null ||
		active.closest('[role="radiogroup"]') !== null;
	return inDialog && !placedByDialog;
}

/**
 * The dialog's initial focus when the form is already mounted at open: the
 * opener choice group's tab stop.
 * @returns That radio, or null to let the dialog choose.
 */
function chosenOpenerFocus(): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[role="dialog"] :is(${FIRST_CONTROL})`);
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
	const root = useFirstControlFocus();
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
		<div ref={root} className="contents">
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
				<Button variant="ghost" size="sm" disabled={anyBusy} onClick={dialog.onReset}>
					Reset
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={anyBusy || repository === null}
					onClick={handleTest}
				>
					Test
				</Button>
				<DialogClose className={CANCEL_BUTTON_CLASS} disabled={anyBusy}>
					Close
				</DialogClose>
				<Button size="sm" disabled={anyBusy} onClick={handleSave}>
					Save
				</Button>
			</DialogFooter>
		</div>
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
			<DialogContent
				className="sm:max-w-lg"
				initialFocus={chosenOpenerFocus}
				finalFocus={props.finalFocus}
			>
				<DialogHeader>
					<DialogTitle>Opener settings</DialogTitle>
					<DialogDescription>
						Which editor a code-bound element opens on this machine. Test it before you save.
					</DialogDescription>
				</DialogHeader>
				{settings ? (
					// Keyed by the saved selection: a reset or a save the host reloads
					// starts the form again from what is now saved.
					<OpenerSettingsForm
						key={JSON.stringify(settings.selection)}
						settings={settings}
						dialog={props}
					/>
				) : (
					<p aria-live="polite" className="text-muted-foreground text-body">
						Reading opener settings…
					</p>
				)}
			</DialogContent>
		</Dialog>
	);
}

export { OpenerSettingsDialog };

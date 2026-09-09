// Install an Excalidraw library from an `#addLibrary` request. The source is
// shown and checked here; fetching and installing belong to the host.

import { RiErrorWarningLine } from "@remixicon/react";
import { useCallback } from "react";

import type {
	InstallLibraryDialogProps,
	LibrarySourceCheck,
} from "@/ui/board-dialogs/types/contracts";
import { checkLibrarySource } from "@/ui/board-dialogs/lib/library-source";
import { Alert, AlertDescription, AlertTitle } from "@/ui/components/alert";
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
import {
	BusyText,
	CANCEL_BUTTON_CLASS,
	DialogErrorAlert,
	Facts,
	type FactRow,
} from "@/ui/dialog-parts";

/** Inputs for the refused-source alert. */
interface SourceCheckAlertProps {
	check: LibrarySourceCheck;
}

/**
 * Why the source was refused, when it was.
 * @param props The check result.
 * @returns The alert, or nothing when the source is acceptable.
 */
function SourceCheckAlert(props: SourceCheckAlertProps): React.JSX.Element | null {
	const { check } = props;
	if (check.ok) {
		return null;
	}
	return (
		<Alert variant="destructive">
			<RiErrorWarningLine />
			<AlertTitle>Library source refused</AlertTitle>
			<AlertDescription>{check.message}</AlertDescription>
		</Alert>
	);
}

/**
 * The request's facts as rows.
 * @param source The raw source.
 * @param itemCount The item count, when known.
 * @returns Source and count.
 */
function libraryFacts(source: string, itemCount: number | null): readonly FactRow[] {
	const rows: FactRow[] = [{ label: "Source", value: source, technical: true }];
	if (itemCount !== null) {
		rows.push({ label: "Items", value: String(itemCount), technical: true });
	}
	return rows;
}

/**
 * The library installation dialog.
 * @param props The request, the state and the callbacks.
 * @returns The dialog.
 */
function InstallLibraryDialog(props: InstallLibraryDialogProps): React.JSX.Element {
	const { source, onInstall } = props;
	const check = checkLibrarySource(source);
	const canInstall = check.ok && !props.busy;
	const handleInstall = useCallback(() => {
		if (check.ok) {
			onInstall({ source: check.url });
		}
	}, [check, onInstall]);
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Install library</DialogTitle>
					<DialogDescription>
						A page asked to add an Excalidraw library to this canvas. Its items become stencils
						here; nothing is written to any board.
					</DialogDescription>
				</DialogHeader>
				<Facts rows={libraryFacts(source, props.itemCount)} />
				<SourceCheckAlert check={check} />
				<DialogErrorAlert error={props.error} />
				<BusyText busy={props.busy} text="Installing the library…" />
				<DialogFooter>
					<DialogClose className={CANCEL_BUTTON_CLASS} disabled={props.busy}>
						Cancel
					</DialogClose>
					<Button size="sm" disabled={!canInstall} onClick={handleInstall}>
						Install
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export { InstallLibraryDialog };

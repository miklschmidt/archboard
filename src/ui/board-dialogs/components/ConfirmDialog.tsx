// A destructive confirmation: clear the board, close a pane holding work.
// An alert dialog, so Escape and the backdrop cannot dismiss it by accident.

import type { JSX } from "react";

import type { ConfirmDialogProps } from "@/ui/board-dialogs/types/contracts";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/ui/components/alert-dialog";
import { BusyText, DialogErrorAlert } from "@/ui/dialog-parts";

/**
 * Confirm one irreversible act.
 * @param props The words, the state and the callbacks.
 * @returns The alert dialog.
 */
function ConfirmDialog(props: ConfirmDialogProps): JSX.Element {
	const cancelLabel = props.cancelLabel ?? "Cancel";
	return (
		<AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
			<AlertDialogContent finalFocus={props.finalFocus}>
				<AlertDialogHeader>
					<AlertDialogTitle>{props.title}</AlertDialogTitle>
					<AlertDialogDescription>{props.body}</AlertDialogDescription>
				</AlertDialogHeader>
				<DialogErrorAlert error={props.error} />
				<BusyText busy={props.busy} text={`${props.confirmLabel}…`} />
				<AlertDialogFooter>
					<AlertDialogCancel disabled={props.busy}>{cancelLabel}</AlertDialogCancel>
					<AlertDialogAction
						variant={props.destructive ? "destructive" : "default"}
						disabled={props.busy}
						onClick={props.onConfirm}
					>
						{props.confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export { ConfirmDialog };

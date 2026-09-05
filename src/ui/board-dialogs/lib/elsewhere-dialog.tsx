// A note written elsewhere (TASK-062): the state before a hold. Nothing has
// been refused, so keeping what is on screen is a real choice here.

import { useMemo } from "react";

import {
	describeElsewhereOutcomes,
	describeVersionMove,
	formatVersion,
} from "@/ui/board-dialogs/lib/conflict-outcomes";
import { OutcomeList } from "@/ui/board-dialogs/lib/conflict-dialog";
import type { NoteWrittenElsewhereDialogProps } from "@/ui/board-dialogs/lib/contracts";
import { DialogErrorAlert, Facts, type FactRow } from "@/ui/board-dialogs/lib/dialog-parts";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/ui/components/alert-dialog";
import type { NoteWrittenElsewhere } from "@/ui/types";

/**
 * The notice's facts as rows, versions in the mono face.
 * @param notice The note written elsewhere.
 * @returns Board, file, times and both versions.
 */
function elsewhereFacts(notice: NoteWrittenElsewhere): readonly FactRow[] {
	const rows: FactRow[] = [
		{ label: "Board", value: notice.board, technical: true },
		{ label: "File", value: notice.file, technical: true },
		{
			label: "Reason",
			value: notice.reason === "changed" ? "Changed on disk" : "Never read",
			technical: false,
		},
		{ label: "Written at", value: notice.writtenAt, technical: true },
	];
	if (notice.lastReadAt !== undefined) {
		rows.push({ label: "Read at", value: notice.lastReadAt, technical: true });
	}
	rows.push({ label: "Note version", value: formatVersion(notice.version), technical: true });
	rows.push({ label: "Pane version", value: formatVersion(notice.ourVersion), technical: true });
	return rows;
}

/**
 * The note-written-elsewhere dialog.
 * @param props The notice, the state and the callbacks.
 * @returns The alert dialog.
 */
function NoteWrittenElsewhereDialog(props: NoteWrittenElsewhereDialogProps): React.JSX.Element {
	const { notice } = props;
	const rows = useMemo(() => elsewhereFacts(notice), [notice]);
	const choices = describeElsewhereOutcomes();
	return (
		<AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
			<AlertDialogContent className="data-[size=default]:sm:max-w-lg">
				<AlertDialogHeader>
					<AlertDialogTitle>Note written elsewhere</AlertDialogTitle>
					<AlertDialogDescription>
						{describeVersionMove(notice)} This pane is showing a board the vault no longer holds;
						nothing has been refused yet.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Facts rows={rows} />
				<DialogErrorAlert error={props.error} />
				<OutcomeList choices={choices} busy={props.busy} onOutcome={props.onOutcome} />
				<AlertDialogFooter>
					<AlertDialogCancel disabled={props.busy !== null}>Decide later</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export { NoteWrittenElsewhereDialog };

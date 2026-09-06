// The write conflict as a choice (ADR 0006): what happened, what is held, and
// the three outcomes. Archboard picks none of them.

import { useCallback, useMemo } from "react";

import {
	describeConflictOutcomes,
	describeConflictReason,
} from "@/ui/board-dialogs/lib/conflict-outcomes";
import type { ConflictDialogProps } from "@/ui/board-dialogs/lib/contracts";
import {
	BusyText,
	DialogErrorAlert,
	Facts,
	Technical,
	type FactRow,
} from "@/ui/board-dialogs/lib/dialog-parts";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/ui/components/alert-dialog";
import { Button } from "@/ui/components/button";
import type { BoardHold, BoardWriteConflict } from "@/ui/types";

/** One outcome as the list renders it. */
interface OutcomeChoiceView<Outcome extends string> {
	outcome: Outcome;
	label: string;
	consequence: string;
	/** The equivalent CLI command, when the source of the outcome names one. */
	command?: string;
	destructive: boolean;
}

/** Inputs for one outcome. */
interface OutcomeItemProps<Outcome extends string> {
	choice: OutcomeChoiceView<Outcome>;
	busy: Outcome | null;
	onOutcome: (outcome: Outcome) => void;
}

/**
 * One outcome: its button, its cost, and its command.
 * @param props The choice, which outcome is in flight, and the callback.
 * @returns A list item.
 */
function OutcomeItem<Outcome extends string>(props: OutcomeItemProps<Outcome>): React.JSX.Element {
	const { choice, busy, onOutcome } = props;
	const handleClick = useCallback(() => onOutcome(choice.outcome), [onOutcome, choice.outcome]);
	return (
		<li className="grid grid-cols-[8rem_1fr] items-start gap-x-3 gap-y-0.5">
			<Button
				variant={choice.destructive ? "destructive" : "default"}
				size="sm"
				className="w-full"
				disabled={busy !== null}
				aria-busy={busy === choice.outcome}
				onClick={handleClick}
			>
				{choice.label}
			</Button>
			<div className="text-body min-w-0">
				<p>{choice.consequence}</p>
				{choice.command !== undefined && <Technical>{choice.command}</Technical>}
			</div>
		</li>
	);
}

/** Inputs for the outcome list. */
interface OutcomeListProps<Outcome extends string> {
	choices: readonly OutcomeChoiceView<Outcome>[];
	busy: Outcome | null;
	onOutcome: (outcome: Outcome) => void;
}

/**
 * The outcomes, one per row, with progress text naming the one in flight.
 * @param props The choices, which one is in flight, and the callback.
 * @returns The list.
 */
function OutcomeList<Outcome extends string>(props: OutcomeListProps<Outcome>): React.JSX.Element {
	const running = props.choices.find((choice) => choice.outcome === props.busy);
	return (
		<>
			<ul className="grid gap-3">
				{props.choices.map((choice) => (
					<OutcomeItem
						key={choice.outcome}
						choice={choice}
						busy={props.busy}
						onOutcome={props.onOutcome}
					/>
				))}
			</ul>
			<BusyText busy={running !== undefined} text={`${running?.label ?? ""}…`} />
		</>
	);
}

/**
 * The conflict's facts as rows.
 * @param conflict The refused write.
 * @param hold The hold it started, or null.
 * @returns Board, file, times, and what is held.
 */
function conflictFacts(conflict: BoardWriteConflict, hold: BoardHold | null): readonly FactRow[] {
	const rows: FactRow[] = [
		{ label: "Board", value: conflict.board, technical: true },
		{ label: "File", value: conflict.file, technical: true },
		{
			label: "Reason",
			value: conflict.reason === "changed" ? "Changed on disk" : "Never read",
			technical: false,
		},
	];
	if (conflict.lastReadAt !== undefined) {
		rows.push({ label: "Read at", value: conflict.lastReadAt, technical: true });
	}
	if (conflict.fileModifiedAt !== undefined) {
		rows.push({ label: "Modified at", value: conflict.fileModifiedAt, technical: true });
	}
	if (hold) {
		rows.push({ label: "Held changes", value: String(hold.writes), technical: true });
		rows.push({ label: "Held since", value: hold.since, technical: true });
	}
	return rows;
}

/**
 * The write conflict dialog. Closing it decides nothing: the board stays held
 * and the mark in the header stays up until an outcome is chosen.
 * @param props The conflict, the hold, the state and the callbacks.
 * @returns The alert dialog.
 */
function ConflictDialog(props: ConflictDialogProps): React.JSX.Element {
	const { conflict, hold } = props;
	const rows = useMemo(() => conflictFacts(conflict, hold), [conflict, hold]);
	const choices = useMemo(() => describeConflictOutcomes(conflict), [conflict]);
	return (
		<AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
			<AlertDialogContent className="data-[size=default]:sm:max-w-lg" finalFocus={props.finalFocus}>
				<AlertDialogHeader>
					<AlertDialogTitle>Board stopped saving</AlertDialogTitle>
					<AlertDialogDescription>
						{describeConflictReason(conflict.reason)} Nothing was written. Excalidraw scenes do not
						merge, so one of the two copies has to lose.
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

export { ConflictDialog, OutcomeList, type OutcomeChoiceView };

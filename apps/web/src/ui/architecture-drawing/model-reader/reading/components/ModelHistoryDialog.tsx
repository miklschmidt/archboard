// History: the record of the model in a dialog, drawn after the site's history. The key in the
// left column opens it, and so does the state chip of the pane's header. Its rows are read while
// it is open, so they load only when a reader opens History. A choice of a state, a saved reading
// or a comparison closes the dialog and reads it in the pane.

import { useCallback, type ComponentProps, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";

import { Dialog } from "@archboard/ui-kit/components";
import {
	architectureCheckpointsQuery,
	architectureRecordQuery,
} from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import { ModelReadingSelector } from "#ui/architecture-drawing/model-reader/reading/components/ModelReadingSelector.tsx";

/** What the record reads and what a choice in it does. */
type HistoryReading = Omit<ComponentProps<typeof ModelReadingSelector>, "history" | "catalogue"> & {
	readonly vault: string;
};

/** Inputs for the History dialog. */
type ModelHistoryDialogProps = HistoryReading & {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
};

/**
 * The History dialog.
 * @param props The reading on screen, what a choice does, and whether the dialog is open.
 * @returns The dialog.
 */
function ModelHistoryDialog(props: ModelHistoryDialogProps): JSX.Element {
	const { open, onOpenChange, onState, onSelect, onCompare, ...reading } = props;
	const state = useCallback(
		(id: string): void => {
			onOpenChange(false);
			onState(id);
		},
		[onOpenChange, onState],
	);
	const select = useCallback(
		(checkpoint: string | null): void => {
			onOpenChange(false);
			onSelect(checkpoint);
		},
		[onOpenChange, onSelect],
	);
	const compare = useCallback(
		(against: string): void => {
			onOpenChange(false);
			onCompare(against);
		},
		[onOpenChange, onCompare],
	);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<Dialog.Content
				data-slot="model-history-dialog"
				className="grid max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] gap-5 sm:max-w-3xl"
			>
				<Dialog.Header>
					<Dialog.Title>History</Dialog.Title>
					<Dialog.Description>
						Every state of this model, why it stands where it does, and the readings it saved.
						Choose one to read it in this pane.
					</Dialog.Description>
				</Dialog.Header>
				<div className="-mx-5 -mb-5 min-h-0 overflow-y-auto px-5 pb-5">
					<HistoryRecord {...reading} onState={state} onSelect={select} onCompare={compare} />
				</div>
			</Dialog.Content>
		</Dialog>
	);
}

/**
 * The record of the model. Its rows are read here, so they load while the dialog is open.
 * @param props The reading on screen and what a choice does.
 * @returns The record.
 */
function HistoryRecord(props: HistoryReading): JSX.Element {
	const { vault, ...reading } = props;
	const history = useQuery({ ...architectureCheckpointsQuery(vault), enabled: true });
	const catalogue = useQuery(architectureRecordQuery(vault));
	return <ModelReadingSelector {...reading} catalogue={catalogue} history={history} />;
}

export { ModelHistoryDialog };

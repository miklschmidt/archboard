import { RiHistoryLine } from "@remixicon/react";
import { useCallback, useState, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";

import { architectureRecordQuery } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import { ModelColumn } from "#ui/architecture-drawing/model-reader/reading/components/ModelColumn.tsx";
import { ModelHistoryDialog } from "#ui/architecture-drawing/model-reader/reading/components/ModelHistoryDialog.tsx";
import { useModelLocation } from "#ui/panes/reading-routing/hooks/use-model-location.ts";

/**
 * The column of a reading that failed: its History key alone, which opens the record, so the
 * reader can go on to a reading that can be read. A failed reading lists nothing and measures
 * nothing. A repository with no record to read leaves the column to the list of repositories.
 * @param props The reading.
 * @param props.vault The addressed vault.
 * @param props.paneId The pane.
 * @param props.failed Whether the reading failed with nothing to show.
 * @returns The key and its dialog, or nothing for a reading that shows its own.
 */
function ModelFailedRecords(props: {
	readonly vault: string;
	readonly paneId: string;
	readonly failed: boolean;
}): JSX.Element | null {
	const { vault, failed } = props;
	const { checkpoint, state, against, compareAgainst, selectState, selectCheckpoint } =
		useModelLocation(props.paneId);
	const record = useQuery({ ...architectureRecordQuery(vault), enabled: failed });
	const [open, setOpen] = useState(false);
	const openHistory = useCallback((): void => setOpen(true), []);
	if (!failed || !record.isSuccess) return null;
	return (
		<>
			<ModelColumn.Lists>
				<ModelColumn.Keys>
					<ModelColumn.Key
						dialog="history"
						label="History"
						icon={RiHistoryLine}
						open={open}
						onOpen={openHistory}
					/>
				</ModelColumn.Keys>
			</ModelColumn.Lists>
			<ModelHistoryDialog
				open={open}
				onOpenChange={setOpen}
				vault={vault}
				checkpoint={checkpoint}
				state={state}
				selected={undefined}
				against={against}
				onCompare={compareAgainst}
				onState={selectState}
				onSelect={selectCheckpoint}
			/>
		</>
	);
}

export { ModelFailedRecords };

import type { ComponentProps, JSX } from "react";
import { useQuery } from "@tanstack/react-query";

import {
	architectureCheckpointsQuery,
	architectureRecordQuery,
} from "#ui/clients/architecture-model/queries.ts";
import { ModelColumn, type Destination } from "#ui/components/architecture-model/ModelColumn.tsx";
import { ModelComparisonSelector } from "#ui/components/architecture-model/ModelComparisonSelector.tsx";
import { ModelReadingSelector } from "#ui/components/architecture-model/ModelReadingSelector.tsx";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";

/** Inputs for the History destination. */
type ModelRecordsProps = Omit<
	ComponentProps<typeof ModelReadingSelector>,
	"history" | "catalogue"
> & {
	readonly vault: string;
	readonly against: string | null;
	readonly onCompare: (against: string | null) => void;
};

/**
 * The History destination. Its rows are read here, so they load only when it opens.
 * @param props The selected reading and what a choice does.
 * @returns The comparison choice and the record of the model.
 */
function ModelRecords(props: ModelRecordsProps): JSX.Element {
	const { vault, against, onCompare, ...reading } = props;
	const history = useQuery(architectureCheckpointsQuery(vault));
	const catalogue = useQuery(architectureRecordQuery(vault));
	return (
		<>
			<div className="px-4 pt-3">
				<ModelComparisonSelector
					against={against}
					onSelect={onCompare}
					catalogue={catalogue}
					history={history}
				/>
			</div>
			<ModelReadingSelector {...reading} catalogue={catalogue} history={history} />
		</>
	);
}

/** A reading that failed has only its record to offer. */
const ONLY_HISTORY: readonly Destination[] = ["history"];

/** One destination has nowhere to change to. */
function stay(): void {
	// The one tab is already open.
}

/**
 * The record of a reading that failed, so the reader can go on to one that can be read. A
 * repository with no record to read leaves the column to the list of repositories.
 * @param props The reading.
 * @param props.vault The addressed vault.
 * @param props.paneId The pane.
 * @param props.failed Whether the reading failed with nothing to show.
 * @returns The History destination, or nothing for a reading that shows its own.
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
	if (!failed || !record.isSuccess) return null;
	return (
		<ModelColumn.Destinations destination="history" onDestination={stay} offered={ONLY_HISTORY}>
			<ModelColumn.List value="history">
				<ModelRecords
					vault={vault}
					checkpoint={checkpoint}
					state={state}
					selected={undefined}
					against={against}
					onCompare={compareAgainst}
					onState={selectState}
					onSelect={selectCheckpoint}
				/>
			</ModelColumn.List>
		</ModelColumn.Destinations>
	);
}

export { ModelFailedRecords, ModelRecords };

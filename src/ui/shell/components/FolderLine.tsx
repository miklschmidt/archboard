// The rows that only gather other rows: a folder in the boards' names, with
// how many boards it holds, and a board's Earlier row, with how many
// historical and shelved variants wait behind it. A click opens or closes
// them; neither is something a pane can show.

import { RiFolder3Line, RiFolderOpenLine, RiHistoryLine } from "@remixicon/react";
import type { JSX } from "react";

import { ActivityLamp } from "@/ui/shell/components/ActivityLamp";
import {
	TreeRow,
	TreeRowDisclosure,
	TreeRowFacts,
	TreeRowMarker,
	TreeRowName,
	type RowHandlers,
} from "@/ui/shell/components/TreeRow";
import type { EarlierRow, FolderRow } from "@/ui/shell/types/navigator-rows";

/**
 * A folder's row.
 * @param props The row and the tree's handlers.
 * @returns The row.
 */
function FolderLine(props: RowHandlers & { readonly row: FolderRow }): JSX.Element {
	const { row } = props;
	return (
		<TreeRow
			{...props}
			label={`${row.name}, folder, ${row.count} boards`}
			selected={false}
			expanded={row.expanded}
			toggles
		>
			<TreeRowDisclosure
				id={row.id}
				name={row.name}
				expanded={row.expanded}
				onExpand={props.onExpand}
			/>
			<TreeRowMarker icon={row.expanded ? RiFolderOpenLine : RiFolder3Line}>
				{row.innerActivity && (
					<ActivityLamp
						state="inside"
						title="An agent works on a board inside"
						slot="agent-activity-inside"
						className="absolute -top-px -right-0.5"
					/>
				)}
			</TreeRowMarker>
			<TreeRowName
				text={row.name}
				match={row.match}
				className={`text-control font-medium ${row.dimmed ? "text-muted-foreground" : ""}`}
			/>
			<TreeRowFacts>{row.count}</TreeRowFacts>
		</TreeRow>
	);
}

/**
 * A board's Earlier row.
 * @param props The row and the tree's handlers.
 * @returns The row.
 */
function EarlierLine(props: RowHandlers & { readonly row: EarlierRow }): JSX.Element {
	const { row } = props;
	return (
		<TreeRow
			{...props}
			label={`Earlier variants of ${row.board.name}, ${row.count}`}
			selected={false}
			expanded={row.expanded}
			toggles
		>
			<TreeRowDisclosure
				id={row.id}
				name="earlier variants"
				expanded={row.expanded}
				onExpand={props.onExpand}
			/>
			<TreeRowMarker icon={RiHistoryLine} />
			<TreeRowName text="Earlier" match={null} className="text-body text-muted-foreground" />
			<TreeRowFacts>{row.count}</TreeRowFacts>
		</TreeRow>
	);
}

export { EarlierLine, FolderLine };

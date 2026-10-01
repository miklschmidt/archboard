// A folder's row: a `/` in the boards' names, with how many boards it holds.
// A click opens or closes it; it is nothing a pane can show. A faint lamp on
// its mark says an agent works on a board inside it while it is closed.

import { RiFolder3Line, RiFolderOpenLine } from "@remixicon/react";
import type { JSX } from "react";

import { InsideLamp } from "@/ui/shell/components/ActivityLamp";
import {
	TreeRow,
	TreeRowDisclosure,
	TreeRowFacts,
	TreeRowMarker,
	TreeRowName,
	type RowHandlers,
} from "@/ui/shell/components/TreeRow";
import type { FolderRow } from "@/ui/shell/types/navigator-rows";

/**
 * A folder's row.
 * @param props The row and the tree's handlers.
 * @returns The row.
 */
function FolderLine(props: RowHandlers & { readonly row: FolderRow }): JSX.Element {
	const { row } = props;
	return (
		<TreeRow {...props} label={`${row.name}, folder, ${row.count} boards`}>
			<TreeRowDisclosure row={row} name={row.name} onExpand={props.onExpand} />
			<TreeRowMarker icon={row.expanded ? RiFolderOpenLine : RiFolder3Line}>
				{row.innerActivity && <InsideLamp />}
			</TreeRowMarker>
			<TreeRowName
				text={row.name}
				match={row.match}
				className={`text-nav font-medium ${row.dimmed ? "text-muted-foreground" : ""}`}
			/>
			<TreeRowFacts>{row.count}</TreeRowFacts>
		</TreeRow>
	);
}

export { FolderLine };

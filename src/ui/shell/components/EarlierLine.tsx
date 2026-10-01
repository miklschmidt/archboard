// A board's Earlier row: its historical and shelved variants wait behind it,
// newest first, with how many there are. A click opens or closes it; it is
// nothing a pane can show. It opens by itself when a pane shows one of them.

import { RiHistoryLine } from "@remixicon/react";
import type { JSX } from "react";

import {
	TreeRow,
	TreeRowDisclosure,
	TreeRowFacts,
	TreeRowMarker,
	TreeRowName,
	type RowHandlers,
} from "@/ui/shell/components/TreeRow";
import type { EarlierRow } from "@/ui/shell/types/navigator-rows";

/**
 * A board's Earlier row.
 * @param props The row and the tree's handlers.
 * @returns The row.
 */
function EarlierLine(props: RowHandlers & { readonly row: EarlierRow }): JSX.Element {
	const { row } = props;
	return (
		<TreeRow {...props} label={`Earlier variants of ${row.board.name}, ${row.count}`}>
			<TreeRowDisclosure row={row} name="earlier variants" onExpand={props.onExpand} />
			<TreeRowMarker icon={RiHistoryLine} />
			<TreeRowName text="Earlier" match={null} className="text-body text-muted-foreground" />
			<TreeRowFacts>{row.count}</TreeRowFacts>
		</TreeRow>
	);
}

export { EarlierLine };

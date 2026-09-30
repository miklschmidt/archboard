// One row of the navigator's tree, by what it names: a folder, a board, one
// variant of a board, or the Earlier row that gathers a board's historical
// and shelved variants. Every kind is drawn from the same parts on the same
// grid (TreeRow).

import type { JSX } from "react";

import { BoardLine } from "@/ui/shell/components/BoardLine";
import { EarlierLine, FolderLine } from "@/ui/shell/components/FolderLine";
import type { RowHandlers } from "@/ui/shell/components/TreeRow";
import { VariantLine } from "@/ui/shell/components/VariantLine";
import type { NavigatorRow } from "@/ui/shell/types/navigator-rows";

/** Inputs for one row. */
interface OutlineRowProps extends RowHandlers {
	readonly row: NavigatorRow;
}

/**
 * One row of the navigator's tree.
 * @param props The row and the tree's handlers.
 * @returns The row.
 */
function OutlineRow(props: OutlineRowProps): JSX.Element {
	const { row } = props;
	if (row.kind === "folder") return <FolderLine {...props} row={row} />;
	if (row.kind === "board") return <BoardLine {...props} row={row} />;
	if (row.kind === "earlier") return <EarlierLine {...props} row={row} />;
	return <VariantLine {...props} row={row} />;
}

export { OutlineRow, type OutlineRowProps };

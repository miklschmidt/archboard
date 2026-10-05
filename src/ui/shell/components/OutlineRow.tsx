// One row of the navigator's tree, by what it names: a folder, a board, one
// variant of a board, or the Earlier row that gathers a board's historical
// and shelved variants. Every kind is drawn from the same parts on the same
// grid (TreeRow).

import { memo, type JSX } from "react";

import { BoardLine } from "@/ui/shell/components/BoardLine";
import { EarlierLine } from "@/ui/shell/components/EarlierLine";
import { FolderLine } from "@/ui/shell/components/FolderLine";
import type { RowHandlers } from "@/ui/shell/components/TreeRow";
import { VariantLine } from "@/ui/shell/components/VariantLine";
import { sameData } from "@/ui/shell/lib/same-data";
import type { NavigatorRow } from "@/ui/shell/types/navigator-rows";
import type { Lane } from "@/ui/variant-lifecycle";

/** Inputs for one row. */
interface OutlineRowProps extends RowHandlers {
	readonly row: NavigatorRow;
	/** The row's place on its board's timeline, for a variant or an Earlier row. */
	readonly lane?: Lane | undefined;
	/** The lines that join it to the rows it sits under. */
	readonly guides?: string | undefined;
}

/**
 * One row of the navigator's tree. The navigator makes its rows and their lanes
 * again on every piece of pane news, so a row is drawn again only when its props
 * say something new: its row, its lane and its guides by what they say, and every
 * handler by identity (TASK-385.04).
 * @param props The row and the tree's handlers.
 * @returns The row.
 */
const OutlineRow = memo(function OutlineRow(props: OutlineRowProps): JSX.Element {
	const { row } = props;
	if (row.kind === "folder") return <FolderLine {...props} row={row} />;
	if (row.kind === "board") return <BoardLine {...props} row={row} />;
	if (row.kind === "earlier") return <EarlierLine {...props} row={row} />;
	return <VariantLine {...props} row={row} />;
}, sameData);

export { OutlineRow, type OutlineRowProps };

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
}

/**
 * Whether a row would be drawn the same: its row says the same, and every
 * handler is the same one. The navigator makes its rows again on every piece of
 * pane news, and only the rows that news is about are drawn again (TASK-385.04).
 * @param before The props it was drawn with.
 * @param after The props it is given now.
 * @returns True when nothing it draws changed.
 */
function sameRowProps(before: OutlineRowProps, after: OutlineRowProps): boolean {
	const { row: was, ...wasHandlers } = before;
	const { row: is, ...isHandlers } = after;
	return (
		sameData(was, is) &&
		Object.keys(isHandlers).every(
			(key) => Reflect.get(wasHandlers, key) === Reflect.get(isHandlers, key),
		)
	);
}

/**
 * One row of the navigator's tree.
 * @param props The row and the tree's handlers.
 * @returns The row.
 */
const OutlineRow = memo(function OutlineRow(props: OutlineRowProps): JSX.Element {
	const { row } = props;
	if (row.kind === "folder") return <FolderLine {...props} row={row} />;
	if (row.kind === "board") return <BoardLine {...props} row={row} />;
	if (row.kind === "earlier") return <EarlierLine {...props} row={row} />;
	return <VariantLine {...props} row={row} />;
}, sameRowProps);

export { OutlineRow, type OutlineRowProps };

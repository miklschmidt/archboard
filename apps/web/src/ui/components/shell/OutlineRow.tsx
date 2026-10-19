// One row of the navigator's tree, by what it names: a repository, a folder, a board, one
// variant of a board, or the Earlier row that gathers a board's historical
// and shelved variants. Every kind is drawn from the same parts on the same
// grid (TreeRow).

import { memo, type JSX } from "react";

import { BoardLine } from "#ui/components/shell/BoardLine.tsx";
import { EarlierLine } from "#ui/components/shell/EarlierLine.tsx";
import { FolderLine } from "#ui/components/shell/FolderLine.tsx";
import { RepositoryLine } from "#ui/components/shell/RepositoryLine.tsx";
import type { RowHandlers } from "#ui/components/shell/TreeRow.tsx";
import { VariantLine } from "#ui/components/shell/VariantLine.tsx";
import { sameData } from "#ui/rules/shell/same-data.ts";
import type { NavigatorRow } from "#ui/rules/shell/navigator-row-types.ts";
import type { Lane } from "#ui/rules/variant-lifecycle/timeline.ts";

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
	if (row.kind === "repository") return <RepositoryLine {...props} row={row} />;
	if (row.kind === "folder") return <FolderLine {...props} row={row} />;
	if (row.kind === "board") return <BoardLine {...props} row={row} />;
	if (row.kind === "earlier") return <EarlierLine {...props} row={row} />;
	return <VariantLine {...props} row={row} />;
}, sameData);

export { OutlineRow, type OutlineRowProps };

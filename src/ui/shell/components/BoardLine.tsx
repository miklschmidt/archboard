// A board's row: the board's mark, its name, and the facts about the board as a
// whole: which pane shows it while none of its variants is listed, whether
// anything it describes is built, and how many proposals it has. An agent at
// work on the board lights a lamp on its mark. Hovering the row shows the
// board's whole name with its level, and the row's name says the level to
// assistive technology; the header names the level of the board being read.

import { RiErrorWarningLine, RiFlowChart, RiGitBranchLine } from "@remixicon/react";
import type { CSSProperties, JSX } from "react";

import { InsideLamp, MarkerLamp } from "@/ui/shell/components/ActivityLamp";
import { PaneChips } from "@/ui/shell/components/PaneChips";
import {
	TreeRow,
	TreeRowDisclosure,
	TreeRowFacts,
	TreeRowMarker,
	TreeRowName,
	type RowHandlers,
} from "@/ui/shell/components/TreeRow";
import type { BoardRow } from "@/ui/shell/types/navigator-rows";
import { disclosureX, nameX } from "@/ui/shell/lib/tree-grid";
import type { AgentActivityEntry, CatalogBoard } from "@/ui/types";

/** A read error starts under the name, which sits the same distance into the row at every depth. */
const ERROR_STYLE: CSSProperties = { paddingLeft: nameX(0) - disclosureX(0) };

/**
 * What the lamp says of an agent's work on a board (ADR 0022).
 * @param activity The activity.
 * @returns The words.
 */
function activityWords(activity: AgentActivityEntry): string {
	if (activity.claim === null) return "An agent just wrote this board";
	const reason = activity.claim.reason;
	return reason === undefined
		? "An agent claims this board"
		: `An agent claims this board: ${reason}`;
}

/**
 * How many drafts, in words.
 * @param drafts The count.
 * @returns The words, or nothing for none.
 */
function draftWords(drafts: number): string {
	if (drafts === 0) return "";
	return drafts === 1 ? "1 draft" : `${drafts} drafts`;
}

/**
 * A board row's accessible name: every fact the row shows, and its level, in
 * the order it shows them, so a screen reader hears what a glance sees.
 * @param row The row.
 * @returns The name.
 */
function boardRowName(row: BoardRow): string {
	const facts = [
		row.label,
		row.board.level ?? "",
		row.onScreen.length > 0 ? `shown in pane ${row.onScreen.join(" and ")}` : "",
		row.unbuilt ? "nothing built" : "",
		draftWords(row.drafts),
		row.activity === null ? "" : activityWords(row.activity),
		row.board.error === undefined ? "" : "cannot be read",
	];
	return facts.filter((fact) => fact !== "").join(", ");
}

/**
 * The lamp over the board's mark: its own agent, else one inside it while it is closed.
 * @param props The row.
 * @param props.row The board row.
 * @returns The lamp, or nothing.
 */
function BoardLamp(props: { readonly row: BoardRow }): JSX.Element | null {
	const { activity, innerActivity } = props.row;
	if (activity !== null) {
		return (
			<MarkerLamp
				state={activity.claim === null ? "wrote" : "claimed"}
				title={activityWords(activity)}
				slot="agent-activity"
			/>
		);
	}
	return innerActivity ? <InsideLamp /> : null;
}

/**
 * A board's row.
 * @param props The row and the tree's handlers.
 * @returns The row.
 */
function BoardLine(props: RowHandlers & { readonly row: BoardRow }): JSX.Element {
	const { row } = props;
	return (
		<TreeRow {...props} label={boardRowName(row)}>
			<TreeRowDisclosure row={row} name={row.label} onExpand={props.onExpand} />
			<TreeRowMarker icon={RiFlowChart} title={row.board.level}>
				<BoardLamp row={row} />
			</TreeRowMarker>
			<TreeRowName
				text={row.label}
				match={row.match}
				boardKey={row.board.key}
				title={boardTitle(row.board)}
				className={boardNameClass(row)}
			/>
			<BoardFacts row={row} />
			<BoardError error={row.board.error} />
		</TreeRow>
	);
}

/**
 * What hovering a board's row shows: its whole name, folders included, and its level.
 * @param board The board.
 * @returns The words.
 */
function boardTitle(board: CatalogBoard): string {
	return board.level === undefined ? board.name : `${board.name} · ${board.level}`;
}

/**
 * A board name's type: heavier while the active pane shows the board, quieter
 * while it only places a match, unless it is the selected row.
 * @param row The row.
 * @returns The classes.
 */
function boardNameClass(row: BoardRow): string {
	const weight = row.reading ? "font-semibold" : "font-medium";
	const quiet = row.dimmed && !row.selected;
	return `text-nav ${weight} ${quiet ? "text-muted-foreground" : ""}`;
}

/**
 * The facts about the board as a whole: the panes showing it while none of
 * its variants is listed, whether anything it describes is built, and how
 * many proposals it has.
 * @param props The row.
 * @param props.row The board row.
 * @returns The facts.
 */
function BoardFacts(props: { readonly row: BoardRow }): JSX.Element {
	const { row } = props;
	return (
		<TreeRowFacts>
			<PaneChips letters={row.onScreen} />
			{row.unbuilt && <span data-slot="board-not-built">not built</span>}
			{row.drafts > 0 && (
				<span className="flex items-center gap-0.5">
					<RiGitBranchLine className="size-3" aria-hidden="true" />
					{row.drafts}
				</span>
			)}
		</TreeRowFacts>
	);
}

/**
 * Why a board could not be read, under its name.
 * @param props The error.
 * @param props.error What the server said, or nothing for a readable board.
 * @returns The line, or nothing.
 */
function BoardError(props: { readonly error: string | undefined }): JSX.Element | null {
	if (props.error === undefined) return null;
	return (
		<span
			style={ERROR_STYLE}
			className="text-destructive text-technical flex w-full min-w-0 basis-full items-start gap-1"
		>
			<RiErrorWarningLine className="mt-px size-3 shrink-0" aria-hidden="true" />
			<span className="line-clamp-2 min-w-0">{props.error}</span>
		</span>
	);
}

export { BoardLine };

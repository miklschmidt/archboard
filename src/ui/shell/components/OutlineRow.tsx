// One row of the navigator's tree: a folder, a board, or one state of a board.
// Every row is one fixed line so activity never moves the rows below it; a
// name that does not fit wraps to a second line and no further. The row itself
// is the tree item and opens what it names; its disclosure and its states
// count are pointer targets outside the tab order, reached by the arrow keys.

import {
	RiArrowRightSLine,
	RiErrorWarningLine,
	RiFolder3Line,
	RiFolderOpenLine,
	RiGitBranchLine,
} from "@remixicon/react";
import {
	useCallback,
	useMemo,
	type JSX,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
} from "react";

import { PaneChips } from "@/ui/shell/components/PaneChips";

import type { BoardRow, FolderRow, NavigatorRow, StateRow } from "@/ui/shell/lib/navigator-rows";
import type { TextRange } from "@/ui/shell/lib/text-match";
import type { AgentActivityEntry } from "@/ui/types";

/** Left padding of a row at depth zero, and each level's indent. */
const INDENT_BASE = 8;
const INDENT_STEP = 14;
/** The width of the disclosure column and the lamp column, with their gaps. */
const LEAD_WIDTH = 16 + 6 + 8 + 6;

/**
 * Where a row at a depth starts.
 * @param depth The depth.
 * @returns The left padding in pixels.
 */
function indent(depth: number): number {
	return INDENT_BASE + depth * INDENT_STEP;
}

/** What every row is given by the tree. */
interface RowHandlers {
	/** Whether this row holds the tree's one tab stop. */
	readonly focusable: boolean;
	/** The row was focused, by pointer or keyboard. */
	readonly onFocusRow: (id: string) => void;
	/** Open the row's board or state, in the active pane or beside it. */
	readonly onOpen: (row: NavigatorRow, beside: boolean) => void;
	/** Open or close a folder or board. */
	readonly onExpand: (id: string, open: boolean) => void;
	/** Show or hide a board's states. */
	readonly onToggleStates: (id: string) => void;
	/** A key pressed on a row: the tree decides what it does. */
	readonly onRowKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

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
	return <StateLine {...props} row={row} />;
}

/** Inputs for the row shell every kind shares. */
interface RowShellProps extends RowHandlers {
	readonly row: NavigatorRow;
	readonly label: string;
	readonly selected: boolean;
	readonly expanded: boolean | undefined;
	readonly className: string;
	readonly left: number;
	readonly children: ReactNode;
}

/**
 * The tree item every row is: focus, the click that opens it, and its place
 * among its siblings for assistive technology.
 * @param props The row, its words, its state and its content.
 * @returns The tree item.
 */
function RowShell(props: RowShellProps): JSX.Element {
	const { row, onFocusRow, onOpen, onExpand, left } = props;
	const handleFocus = useCallback(() => onFocusRow(row.id), [onFocusRow, row.id]);
	const style = useMemo(() => ({ paddingLeft: left }), [left]);
	const handleClick = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (row.kind === "folder") onExpand(row.id, !row.expanded);
			else onOpen(row, event.altKey);
		},
		[row, onOpen, onExpand],
	);
	return (
		<div
			role="treeitem"
			aria-level={row.depth + 1}
			aria-posinset={row.position}
			aria-setsize={row.siblings}
			aria-expanded={props.expanded}
			aria-selected={props.selected}
			aria-label={props.label}
			tabIndex={props.focusable ? 0 : -1}
			data-row-id={row.id}
			data-row-kind={row.kind}
			onFocus={handleFocus}
			onClick={handleClick}
			onKeyDown={props.onRowKeyDown}
			style={style}
			className={`group/row focus-visible:ring-ring relative flex w-full min-w-0 cursor-default items-start gap-1.5 rounded-[3px] pr-2 outline-none select-none focus-visible:ring-1 focus-visible:ring-inset ${props.className}`}
		>
			{props.children}
		</div>
	);
}

/**
 * A board's disclosure, or the space one takes.
 * @param props The row's id, name, whether it opens, and the handler.
 * @param props.id The row.
 * @param props.name The row's name, for the control's label.
 * @param props.expandable Whether it has anything to open.
 * @param props.expanded Whether it is open.
 * @param props.onExpand Open or close it.
 * @returns The disclosure column.
 */
function Disclosure(props: {
	readonly id: string;
	readonly name: string;
	readonly expandable: boolean;
	readonly expanded: boolean;
	readonly onExpand: (id: string, open: boolean) => void;
}): JSX.Element {
	const { id, expanded, onExpand } = props;
	const handleClick = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			onExpand(id, !expanded);
		},
		[id, expanded, onExpand],
	);
	if (!props.expandable) return <span aria-hidden="true" className="h-[18px] w-4 shrink-0" />;
	return (
		<button
			type="button"
			tabIndex={-1}
			aria-label={`${expanded ? "Collapse" : "Expand"} ${props.name}`}
			onClick={handleClick}
			className="text-muted-foreground hover:text-foreground -mx-1 -my-[3px] flex size-6 shrink-0 items-center justify-center rounded-[2px]"
		>
			<RiArrowRightSLine
				className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
				aria-hidden="true"
			/>
		</button>
	);
}

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
 * The lamp column: lit where an agent works on the board, a ring where it
 * just wrote without a claim, a faint ring where it works on a board inside a
 * closed row. The column is always there, so names never shift.
 * @param props The activity and whether it is inside.
 * @param props.activity The board's own activity, or null.
 * @param props.inner Whether an agent works on a board inside this closed row.
 * @returns The lamp column.
 */
function Lamp(props: {
	readonly activity: AgentActivityEntry | null;
	readonly inner: boolean;
}): JSX.Element {
	const { activity, inner } = props;
	return (
		<span className="flex h-[18px] w-2 shrink-0 items-center justify-center">
			{activity !== null && (
				<span
					data-slot="agent-activity"
					title={activityWords(activity)}
					className={
						activity.claim === null
							? "ring-status size-1.5 rounded-full ring-[1.5px]"
							: "bg-status size-1.5 rounded-full motion-safe:animate-pulse"
					}
				>
					<span className="sr-only">{activityWords(activity)}</span>
				</span>
			)}
			{activity === null && inner && (
				<span
					data-slot="agent-activity-inside"
					title="An agent works on a board inside"
					className="ring-status/70 size-[5px] rounded-full ring-1"
				/>
			)}
		</span>
	);
}

/**
 * A name with the filter's match marked.
 * @param props The text and the match.
 * @param props.text The name.
 * @param props.match Where the filter matched it, or null.
 * @returns The name.
 */
function Matched(props: { readonly text: string; readonly match: TextRange | null }): JSX.Element {
	const { text, match } = props;
	if (match === null || match.end <= match.start) return <>{text}</>;
	return (
		<>
			{text.slice(0, match.start)}
			<mark className="bg-primary/15 text-foreground rounded-[2px]">
				{text.slice(match.start, match.end)}
			</mark>
			{text.slice(match.end)}
		</>
	);
}

/**
 * A folder row.
 * @param props The row and the tree's handlers.
 * @returns The row.
 */
function FolderLine(props: RowHandlers & { readonly row: FolderRow }): JSX.Element {
	const { row } = props;
	const Icon = row.expanded ? RiFolderOpenLine : RiFolder3Line;
	return (
		<RowShell
			{...props}
			label={`${row.name}, folder, ${row.count} boards`}
			selected={false}
			expanded={row.expanded}
			left={indent(row.depth)}
			className={`hover:bg-sidebar-accent min-h-8 py-[7px] ${row.dimmed ? "text-muted-foreground" : ""}`}
		>
			<Disclosure
				id={row.id}
				name={row.name}
				expandable
				expanded={row.expanded}
				onExpand={props.onExpand}
			/>
			<Lamp activity={null} inner={row.innerActivity} />
			<Icon className="text-muted-foreground mt-px size-4 shrink-0" aria-hidden="true" />
			<span className="text-control min-w-0 flex-1 truncate font-medium">
				<Matched text={row.name} match={row.match} />
			</span>
			<span className="text-muted-foreground text-technical shrink-0 font-mono leading-[18px]">
				{row.count}
			</span>
		</RowShell>
	);
}

/**
 * A board row: its name, where it is on screen, its other states, its level.
 * @param props The row and the tree's handlers.
 * @returns The row.
 */
function BoardLine(props: RowHandlers & { readonly row: BoardRow }): JSX.Element {
	const { row } = props;
	return (
		<RowShell
			{...props}
			label={row.label}
			selected={row.active}
			expanded={row.hasChildren ? row.expanded : undefined}
			left={indent(row.depth)}
			className={`min-h-8 flex-wrap py-[7px] ${rowTone(row.active)}`}
		>
			{row.active && (
				<span
					aria-hidden="true"
					className="bg-primary absolute inset-y-1.5 left-0 w-0.5 rounded-full"
				/>
			)}
			<Disclosure
				id={row.id}
				name={row.label}
				expandable={row.hasChildren}
				expanded={row.expanded}
				onExpand={props.onExpand}
			/>
			<Lamp activity={row.activity} inner={row.innerActivity} />
			<span data-board-key={row.board.key} className={boardNameClass(row)}>
				<Matched text={row.label} match={row.match} />
			</span>
			<BoardTrailing {...props} />
			<BoardError error={row.board.error} />
		</RowShell>
	);
}

/**
 * A row's background: the reading tone while it is the one being read.
 * @param active Whether it is being read.
 * @returns The classes.
 */
function rowTone(active: boolean): string {
	return active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent";
}

/**
 * A board name's type: heavier while it is read, quieter while it only places a match.
 * @param row The row.
 * @returns The classes.
 */
function boardNameClass(row: BoardRow): string {
	const weight = row.active ? "font-semibold" : "font-medium";
	const tone = row.dimmed ? "text-muted-foreground" : "";
	return `text-control line-clamp-2 min-w-0 flex-1 wrap-break-word ${weight} ${tone}`;
}

/**
 * The board row's right-hand facts: its other states, its panes, its level.
 * @param props The row and the tree's handlers.
 * @returns The trailing cluster.
 */
function BoardTrailing(props: RowHandlers & { readonly row: BoardRow }): JSX.Element {
	const { row, onToggleStates } = props;
	const handleStates = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			onToggleStates(row.id);
		},
		[onToggleStates, row.id],
	);
	return (
		<span className="flex h-[18px] shrink-0 items-center gap-1.5">
			{row.otherStates > 0 && (
				<button
					type="button"
					tabIndex={-1}
					aria-expanded={row.statesOpen}
					aria-label={`${row.statesOpen ? "Hide" : "Show"} ${row.otherStates} other ${row.otherStates === 1 ? "state" : "states"} of ${row.label}`}
					onClick={handleStates}
					className={`hover:text-foreground hover:bg-background/60 -my-[3px] flex h-6 items-center gap-0.5 rounded-[2px] px-1 ${row.statesOpen ? "text-foreground" : "text-muted-foreground"}`}
				>
					<RiGitBranchLine className="size-3" aria-hidden="true" />
					<span className="text-technical font-mono">{row.otherStates}</span>
				</button>
			)}
			<PaneChips letters={row.onScreen} />
			<LevelWord row={row} />
		</span>
	);
}

/**
 * The board's level as a quiet word, or that nothing it describes is built.
 * @param props The row.
 * @param props.row The board row.
 * @returns The word, or nothing for a board without a level.
 */
function LevelWord(props: { readonly row: BoardRow }): JSX.Element | null {
	const { row } = props;
	if (row.unbuilt) {
		return (
			<span
				data-slot="board-not-built"
				className="text-technical text-muted-foreground border-muted-foreground/50 inline-flex h-4 items-center rounded-[2px] border border-dashed px-1 font-mono"
			>
				not built
			</span>
		);
	}
	if (row.board.level === undefined) return null;
	return (
		<span className="text-technical text-muted-foreground w-[46px] text-right font-mono">
			{row.board.level}
		</span>
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
		<span className="text-destructive text-technical flex w-full min-w-0 items-start gap-1 pl-[30px]">
			<RiErrorWarningLine className="mt-px size-3 shrink-0" aria-hidden="true" />
			<span className="line-clamp-2 min-w-0">{props.error}</span>
		</span>
	);
}

/**
 * A state row: one variant of the board above it, nested by the variant it
 * was derived from, with its lifecycle as a quiet word.
 * @param props The row and the tree's handlers.
 * @returns The row.
 */
function StateLine(props: RowHandlers & { readonly row: StateRow }): JSX.Element {
	const { row } = props;
	const { variant } = row;
	const guide = indent(row.boardDepth) + LEAD_WIDTH - 9;
	const guideStyle = useMemo(() => ({ left: guide }), [guide]);
	return (
		<RowShell
			{...props}
			label={`${variant.name}, ${variant.lifecycle}`}
			selected={row.active}
			expanded={undefined}
			left={guide + 9 + row.nesting * 12}
			className={`min-h-7 py-[5px] ${rowTone(row.active)}`}
		>
			<span aria-hidden="true" style={guideStyle} className="bg-border absolute inset-y-0 w-px" />
			<span data-board-key={variant.key} className={stateNameClass(row)}>
				<Matched text={variant.name} match={row.match} />
			</span>
			<span className="flex h-4 shrink-0 items-center gap-1.5">
				<PaneChips letters={row.onScreen} />
				<span
					className={`text-technical font-mono ${variant.lifecycle === "current" ? "text-foreground" : "text-muted-foreground"}`}
				>
					{variant.lifecycle}
				</span>
			</span>
		</RowShell>
	);
}

/**
 * A state name's type: cobalt while it is the one being read, quieter for a
 * state the board has moved past.
 * @param row The row.
 * @returns The classes.
 */
function stateNameClass(row: StateRow): string {
	const { lifecycle } = row.variant;
	if (row.active) return "text-body text-primary min-w-0 flex-1 truncate font-semibold";
	const receding = lifecycle === "historical" || lifecycle === "shelved";
	return `text-body min-w-0 flex-1 truncate ${receding ? "text-muted-foreground" : ""}`;
}

export { OutlineRow, type OutlineRowProps, type RowHandlers };

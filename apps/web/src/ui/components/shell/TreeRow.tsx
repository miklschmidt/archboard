// One row of the navigator's tree, as parts every kind of row composes: the
// tree item itself with its guides, then the disclosure, the marker, the name
// and the facts. The tree item places them by the row's depth alone (see
// tree-grid), so a folder, a board, a variant and a nested draft at one depth
// share one grid. The row is the tree item and opens what it names; its
// disclosure is a pointer target outside the tab order, whose work the arrow
// keys do.

import { RiArrowRightSLine, type RemixiconComponentType } from "@remixicon/react";
import {
	useCallback,
	useMemo,
	type CSSProperties,
	type JSX,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
} from "react";

import { paneCanShow, rowOpen, rowSelected } from "#ui/rules/shell/navigator-rows.ts";
import type { NavigatorRow } from "#ui/rules/shell/navigator-row-types.ts";
import {
	DISCLOSURE_WIDTH,
	disclosureX,
	FACTS_GAP,
	FACTS_INSET,
	guideX,
	MARKER_WIDTH,
	markerX,
	NAME_GAP,
	ROW_GUTTER,
	TARGET_SIZE,
	TREE_STEP,
} from "#ui/rules/shell/tree-grid.ts";
import type { TextRange } from "#ui/rules/shell/text-match.ts";
import { TimelineLane, type LaneGeometry } from "#ui/components/variant-lifecycle/TimelineLane.tsx";
import { type Lane } from "#ui/rules/variant-lifecycle/timeline.ts";

/** The disclosure column, as wide as the grid says. */
const DISCLOSURE_STYLE: CSSProperties = { width: DISCLOSURE_WIDTH };

/** A chevron is a full pointer target that reaches past its column, and past its line, on every side. */
const CHEVRON_STYLE: CSSProperties = {
	width: TARGET_SIZE,
	height: TARGET_SIZE,
	marginInline: (DISCLOSURE_WIDTH - TARGET_SIZE) / 2,
	marginBlock: `calc((var(--row-line) - ${TARGET_SIZE}px) / 2)`,
};

/**
 * A board and a folder are the tree's landmarks: a taller row with a larger
 * name. A board's variants and its Earlier row are set closer and smaller
 * under it, so a glance tells a board from what it holds. Each row's first
 * line is `--row-line` high, and every column of the row centres on it.
 * `--row-mid` is the middle of that line, from the row's top.
 * @param line The height of the first line, in pixels.
 * @param padding The padding above and below the row, in pixels.
 * @returns The row's metrics.
 */
function rowMetrics(line: number, padding: number): CSSProperties {
	return {
		"--row-line": `${line}px`,
		"--row-mid": `${padding + line / 2}px`,
		paddingBlock: padding,
	};
}

/** A variant's and an Earlier row's first line, and the padding around the row. */
const HELD_LINE = 18;
const HELD_PADDING = 6;

const LANDMARK_METRICS = rowMetrics(20, 8);
const HELD_METRICS = rowMetrics(HELD_LINE, HELD_PADDING);
const ROW_METRICS: Readonly<Record<NavigatorRow["kind"], CSSProperties>> = {
	repository: LANDMARK_METRICS,
	board: LANDMARK_METRICS,
	folder: LANDMARK_METRICS,
	variant: HELD_METRICS,
	earlier: HELD_METRICS,
};

/**
 * How far an elbow runs from its line: to the chevron's column when the row has
 * a chevron, else on across the column the chevron would take, to the marker.
 */
const TICK_TO_CHEVRON = DISCLOSURE_WIDTH / 2 - 2;
const TICK_TO_MARKER = DISCLOSURE_WIDTH / 2 + DISCLOSURE_WIDTH - 4;

/** The marker column, as wide as the grid says. */
const MARKER_STYLE: CSSProperties = { width: MARKER_WIDTH };

/** The name keeps the grid's gap from the marker column. */
const NAME_STYLE: CSSProperties = { marginLeft: NAME_GAP };

/** The facts keep the grid's gap from the name. */
const FACTS_STYLE: CSSProperties = { marginLeft: FACTS_GAP };

/** What the tree gives every row. */
interface RowHandlers {
	/** Whether this row holds the tree's one tab stop. */
	readonly focusable: boolean;
	/** The row was focused, by pointer or keyboard. */
	readonly onFocusRow: (id: string) => void;
	/** Open the row's board or variant, in the active pane or beside it. */
	readonly onOpen: (row: NavigatorRow, beside: boolean) => void;
	/** Open or close a row. */
	readonly onExpand: (id: string, open: boolean) => void;
	/** Choose a repository's checkout for the whole machine (ADR 0050). */
	readonly onChooseCheckout: (repository: string, root: string) => void;
	/** A key pressed on a row: the tree decides what it does. */
	readonly onRowKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/** Inputs for the tree item. */
interface TreeRowProps extends RowHandlers {
	readonly row: NavigatorRow;
	/** Everything the row shows, for assistive technology. */
	readonly label: string;
	/** The row opens a menu from the keyboard (Shift+F10), so it says it has one. */
	readonly hasMenu?: boolean | undefined;
	/** Its place on its board's timeline, for a variant or an Earlier row. */
	readonly lane?: Lane | undefined;
	/** The lines that join it to the rows it sits under (tree-guides). */
	readonly guides?: string | undefined;
	readonly children: ReactNode;
}

/**
 * The tree item: its place among its siblings, focus, the click, its indent
 * and the guides of the rows it sits under. A click opens or closes a row
 * that only gathers others, and opens what any other row names.
 * @param props The row, its words and its parts.
 * @returns The tree item.
 */
function TreeRow(props: TreeRowProps): JSX.Element {
	const { row, onFocusRow, onOpen, onExpand } = props;
	const expanded = rowOpen(row);
	const selected = rowSelected(row);
	const handleFocus = useCallback(() => onFocusRow(row.id), [onFocusRow, row.id]);
	const opens = expanded !== undefined;
	const style = useMemo(
		(): CSSProperties => ({
			...ROW_METRICS[row.kind],
			"--tick": `${opens ? TICK_TO_CHEVRON : TICK_TO_MARKER}px`,
			paddingLeft: disclosureX(row.depth) - ROW_GUTTER,
			paddingRight: FACTS_INSET - ROW_GUTTER,
		}),
		[row.depth, row.kind, opens],
	);
	const handleClick = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (paneCanShow(row) || (row.kind === "repository" && row.model !== undefined))
				onOpen(row, event.altKey);
			else if (expanded !== undefined) onExpand(row.id, !expanded);
		},
		[row, expanded, onOpen, onExpand],
	);
	return (
		<div
			role="treeitem"
			aria-level={row.depth + 1}
			aria-posinset={row.position}
			aria-setsize={row.siblings}
			aria-expanded={expanded}
			aria-selected={selected}
			aria-label={props.label}
			aria-haspopup={props.hasMenu === true ? "menu" : undefined}
			tabIndex={props.focusable ? 0 : -1}
			data-row-id={row.id}
			data-row-kind={row.kind}
			onFocus={handleFocus}
			onClick={handleClick}
			onKeyDown={props.onRowKeyDown}
			style={style}
			className={`group/row focus-visible:ring-ring rounded-control relative flex w-full min-w-0 cursor-default flex-wrap items-start outline-none select-none focus-visible:ring-1 focus-visible:ring-inset ${selected ? "bg-sidebar-accent shadow-raised" : "hover:bg-sidebar-accent/50"}`}
		>
			<RowGuides guides={props.guides ?? ""} />
			{props.lane !== undefined && <RowLane row={row} lane={props.lane} />}
			{props.children}
		</div>
	);
}

/**
 * A variant's place on its board's timeline: the main line through the marks
 * of the variant the board's name opens and its history, and the branches its
 * drafts take off the variant they came from, through the marker column.
 * @param props The row and its lane.
 * @param props.row The row.
 * @param props.lane Its lane.
 * @returns The lines.
 */
function RowLane(props: { readonly row: NavigatorRow; readonly lane: Lane }): JSX.Element {
	const { row, lane } = props;
	const geometry = useMemo(
		(): LaneGeometry => ({
			origin: markerX(row.depth - lane.depth) + MARKER_WIDTH / 2 - ROW_GUTTER,
			step: TREE_STEP,
			middle: LANE_MIDDLE,
			clearance: LANE_CLEARANCE,
		}),
		[row.depth, lane.depth],
	);
	return <TimelineLane lane={lane} geometry={geometry} />;
}

/** From a variant row's top to the middle of its mark: its padding and half its first line. */
const LANE_MIDDLE = HELD_PADDING + HELD_LINE / 2;

/** How far the timeline stops short of a mark's middle: the mark's half and a little air. */
const LANE_CLEARANCE = 9;

/** What each character of a row's guides draws (tree-guides). */
const GUIDES: Readonly<
	Record<
		string,
		{ readonly kind: "through" | "elbow" | "last"; readonly lit?: "rail" | "mid" | "branch" }
	>
> = {
	t: { kind: "through" },
	T: { kind: "through", lit: "rail" },
	e: { kind: "elbow" },
	E: { kind: "elbow", lit: "rail" },
	P: { kind: "elbow", lit: "mid" },
	l: { kind: "last" },
	L: { kind: "last", lit: "branch" },
};

/**
 * The lines that join this row to the rows it sits under: one for each, through
 * the middle of that row's disclosure, so a reader sees what sits under what.
 * Where the row itself hangs from its parent the line turns to it, and the last
 * of a parent's rows ends the line there.
 * @param props The row's guides.
 * @param props.guides One character for each row it sits under.
 * @returns The guides.
 */
function RowGuides(props: { readonly guides: string }): JSX.Element {
	return (
		<>
			{Array.from(props.guides, (character, level) => (
				<Guide key={level} level={level} character={character} />
			))}
		</>
	);
}

/**
 * The guide of one level of a row.
 * @param props The level and what it draws.
 * @param props.level The depth of the row it hangs from.
 * @param props.character What it draws (tree-guides).
 * @returns The guide, or nothing for a level that draws none.
 */
function Guide(props: { readonly level: number; readonly character: string }): JSX.Element | null {
	const drawn = GUIDES[props.character];
	const style = useMemo(
		(): CSSProperties => ({ left: guideX(props.level) - ROW_GUTTER }),
		[props.level],
	);
	if (drawn === undefined) return null;
	return (
		<span
			aria-hidden="true"
			data-slot="tree-guide"
			data-guide={drawn.kind}
			data-lit={drawn.lit}
			style={style}
		/>
	);
}

/**
 * The disclosure column: a chevron for a row that opens, else the space one takes.
 * @param props The row, its name and the handler.
 * @param props.row The row.
 * @param props.name The row's name, for the control's label.
 * @param props.onExpand Open or close it.
 * @returns The column.
 */
function TreeRowDisclosure(props: {
	readonly row: NavigatorRow;
	readonly name: string;
	readonly onExpand: (id: string, open: boolean) => void;
}): JSX.Element {
	const { row, onExpand } = props;
	const { id } = row;
	const expanded = rowOpen(row);
	const handleClick = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			onExpand(id, expanded !== true);
		},
		[id, expanded, onExpand],
	);
	if (expanded === undefined) {
		return <span aria-hidden="true" style={DISCLOSURE_STYLE} className="h-(--row-line) shrink-0" />;
	}
	return (
		<button
			type="button"
			tabIndex={-1}
			aria-label={`${expanded ? "Collapse" : "Expand"} ${props.name}`}
			onClick={handleClick}
			style={CHEVRON_STYLE}
			className="text-muted-foreground hover:text-foreground rounded-chip flex shrink-0 items-center justify-center"
		>
			<RiArrowRightSLine
				className={`size-3.5 transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
				aria-hidden="true"
			/>
		</button>
	);
}

/**
 * The marker column: what kind of row this is, and what is drawn over it.
 * @param props The icon and its title, or a mark of the row's own, and what is drawn over it.
 * @param props.icon The icon, drawn muted; absent when the children draw the mark.
 * @param props.title What the icon says, on hover.
 * @param props.children A mark of the row's own, or something drawn over the icon's corner, such as an agent at work.
 * @returns The column.
 */
function TreeRowMarker(props: {
	readonly icon?: RemixiconComponentType;
	readonly title?: string | undefined;
	readonly children?: ReactNode;
}): JSX.Element {
	const Icon = props.icon;
	return (
		<span
			title={props.title}
			style={MARKER_STYLE}
			className="relative flex h-(--row-line) shrink-0 items-center justify-center"
		>
			{Icon !== undefined && <Icon className="text-muted-foreground size-3.5" aria-hidden="true" />}
			{props.children}
		</span>
	);
}

/**
 * The name, wrapping to a second line and no further, with the filter's match marked.
 * @param props The words, the match, the classes and the key a test can find it by.
 * @param props.text The name.
 * @param props.match Where the filter matched it, or null.
 * @param props.className Classes for its type.
 * @param props.boardKey The board key the row opens, for the name's identity hook.
 * @param props.title The whole name, on hover.
 * @returns The name.
 */
function TreeRowName(props: {
	readonly text: string;
	readonly match: TextRange | null;
	readonly className: string;
	readonly boardKey?: string;
	readonly title?: string | undefined;
}): JSX.Element {
	return (
		<span
			data-board-key={props.boardKey}
			title={props.title}
			style={NAME_STYLE}
			className={`line-clamp-2 min-w-0 flex-1 leading-(--row-line) wrap-break-word ${props.className}`}
		>
			<Matched text={props.text} match={props.match} />
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
			<mark className="bg-primary/15 text-foreground rounded-chip">
				{text.slice(match.start, match.end)}
			</mark>
			{text.slice(match.end)}
		</>
	);
}

/**
 * The facts on the right of a row, level with its first line and ending at one edge.
 * @param props The facts.
 * @param props.children The facts.
 * @returns The cluster.
 */
function TreeRowFacts(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<span
			style={FACTS_STYLE}
			className="text-technical text-muted-foreground flex h-(--row-line) shrink-0 items-center gap-1.5 font-mono"
		>
			{props.children}
		</span>
	);
}

export {
	TreeRow,
	TreeRowDisclosure,
	TreeRowFacts,
	TreeRowMarker,
	TreeRowName,
	type RowHandlers,
	type TreeRowProps,
};

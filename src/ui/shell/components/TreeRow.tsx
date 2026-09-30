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

import type { NavigatorRow } from "@/ui/shell/types/navigator-rows";
import { disclosureX, FACTS_INSET, guideX, ROW_GUTTER } from "@/ui/shell/lib/tree-grid";
import type { TextRange } from "@/ui/shell/lib/text-match";

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
	/** A key pressed on a row: the tree decides what it does. */
	readonly onRowKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/** Inputs for the tree item. */
interface TreeRowProps extends RowHandlers {
	readonly row: NavigatorRow;
	/** Everything the row shows, for assistive technology. */
	readonly label: string;
	readonly selected: boolean;
	/** Whether what is under it is listed, or undefined for a row nothing is listed under. */
	readonly expanded: boolean | undefined;
	/** A click opens or closes the row rather than opening what it names. */
	readonly toggles: boolean;
	readonly children: ReactNode;
}

/**
 * The tree item: its place among its siblings, focus, the click, its indent
 * and the guides of the rows it sits under.
 * @param props The row, its words, its state and its parts.
 * @returns The tree item.
 */
function TreeRow(props: TreeRowProps): JSX.Element {
	const { row, onFocusRow, onOpen, onExpand, toggles, expanded } = props;
	const handleFocus = useCallback(() => onFocusRow(row.id), [onFocusRow, row.id]);
	const style = useMemo(
		(): CSSProperties => ({
			paddingLeft: disclosureX(row.depth) - ROW_GUTTER,
			paddingRight: FACTS_INSET - ROW_GUTTER,
		}),
		[row.depth],
	);
	const handleClick = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (toggles) onExpand(row.id, expanded !== true);
			else onOpen(row, event.altKey);
		},
		[row, toggles, expanded, onOpen, onExpand],
	);
	return (
		<div
			role="treeitem"
			aria-level={row.depth + 1}
			aria-posinset={row.position}
			aria-setsize={row.siblings}
			aria-expanded={expanded}
			aria-selected={props.selected}
			aria-label={props.label}
			tabIndex={props.focusable ? 0 : -1}
			data-row-id={row.id}
			data-row-kind={row.kind}
			onFocus={handleFocus}
			onClick={handleClick}
			onKeyDown={props.onRowKeyDown}
			style={style}
			className={`group/row focus-visible:ring-ring relative flex min-h-7 w-full min-w-0 cursor-default flex-wrap items-start rounded-[3px] py-[5px] outline-none select-none focus-visible:ring-1 focus-visible:ring-inset ${props.selected ? "bg-sidebar-accent" : "hover:bg-sidebar-accent"}`}
		>
			<RowGuides depth={row.depth} />
			{props.selected && (
				<span
					aria-hidden="true"
					className="bg-primary absolute inset-y-1 left-0 w-0.5 rounded-full"
				/>
			)}
			{props.children}
		</div>
	);
}

/**
 * One guide for each row this one sits under, through the middle of that
 * row's disclosure, so a reader sees what sits under what.
 * @param props The row's depth.
 * @param props.depth How many rows it sits under.
 * @returns The guides.
 */
function RowGuides(props: { readonly depth: number }): JSX.Element {
	const levels = Array.from({ length: props.depth }, (_, level) => level);
	return (
		<>
			{levels.map((level) => (
				<Guide key={level} level={level} />
			))}
		</>
	);
}

/**
 * The guide of one open row.
 * @param props The open row's depth.
 * @param props.level The depth.
 * @returns The guide.
 */
function Guide(props: { readonly level: number }): JSX.Element {
	const style = useMemo(
		(): CSSProperties => ({ left: guideX(props.level) - ROW_GUTTER }),
		[props.level],
	);
	return (
		<span
			aria-hidden="true"
			data-slot="tree-guide"
			style={style}
			className="bg-border absolute inset-y-0 w-px"
		/>
	);
}

/**
 * The disclosure column: a chevron for a row that opens, else the space one takes.
 * @param props The row's id and name, whether it opens, and the handler.
 * @param props.id The row.
 * @param props.name The row's name, for the control's label.
 * @param props.expanded Whether it is open, or undefined for a row that does not open.
 * @param props.onExpand Open or close it.
 * @returns The column.
 */
function TreeRowDisclosure(props: {
	readonly id: string;
	readonly name: string;
	readonly expanded: boolean | undefined;
	readonly onExpand: (id: string, open: boolean) => void;
}): JSX.Element {
	const { id, expanded, onExpand } = props;
	const handleClick = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			onExpand(id, expanded !== true);
		},
		[id, expanded, onExpand],
	);
	if (expanded === undefined) return <span aria-hidden="true" className="h-[18px] w-4 shrink-0" />;
	return (
		<button
			type="button"
			tabIndex={-1}
			aria-label={`${expanded ? "Collapse" : "Expand"} ${props.name}`}
			onClick={handleClick}
			className="text-muted-foreground hover:text-foreground -mx-1 -my-[3px] flex size-6 shrink-0 items-center justify-center rounded-[2px]"
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
 * @param props The icon, its tone and title, and what is drawn over it.
 * @param props.icon The icon.
 * @param props.tone Classes for the icon's colour.
 * @param props.title What the icon says, on hover.
 * @param props.children Something drawn over the icon's corner, such as an agent at work.
 * @returns The column.
 */
function TreeRowMarker(props: {
	readonly icon: RemixiconComponentType;
	readonly tone?: string;
	readonly title?: string | undefined;
	readonly children?: ReactNode;
}): JSX.Element {
	const Icon = props.icon;
	return (
		<span
			title={props.title}
			className="relative flex h-[18px] w-4 shrink-0 items-center justify-center"
		>
			<Icon className={`size-3.5 ${props.tone ?? "text-muted-foreground"}`} aria-hidden="true" />
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
	readonly title?: string;
}): JSX.Element {
	return (
		<span
			data-board-key={props.boardKey}
			title={props.title}
			className={`ml-1.5 line-clamp-2 min-w-0 flex-1 leading-[18px] wrap-break-word ${props.className}`}
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
			<mark className="bg-primary/15 text-foreground rounded-[2px]">
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
		<span className="text-technical text-muted-foreground ml-2 flex h-[18px] shrink-0 items-center gap-1.5 font-mono">
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

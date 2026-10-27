import type { RemixiconComponentType } from "@remixicon/react";
import {
	useCallback,
	type CSSProperties,
	type JSX,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
} from "react";
import type { NavigatorRow } from "#ui/rules/shell/navigator-row-types.ts";
import {
	FACTS_GAP,
	FACTS_INSET,
	MARKER_WIDTH,
	markerX,
	NAME_GAP,
	ROW_GUTTER,
} from "#ui/rules/shell/tree-grid.ts";
import type { TextRange } from "#ui/rules/shell/text-match.ts";

/** Every repository uses the same position and row metrics. */
const ROW_STYLE: CSSProperties = {
	"--row-line": "20px",
	paddingBlock: 8,
	paddingLeft: markerX(0) - ROW_GUTTER,
	paddingRight: FACTS_INSET - ROW_GUTTER,
};
const MARKER_STYLE = { width: MARKER_WIDTH } as const;
const NAME_STYLE = { marginLeft: NAME_GAP } as const;
const FACTS_STYLE = { marginLeft: FACTS_GAP } as const;

/** The list supplies focus, navigation, and checkout actions to each row. */
interface RowHandlers {
	readonly focusable: boolean;
	readonly onFocusRow: (id: string) => void;
	readonly onOpen: (row: NavigatorRow, beside: boolean) => void;
	readonly onChooseCheckout: (repository: string, root: string) => void;
	readonly onRowKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/** The repository row's accessible label and composed visual parts. */
interface TreeRowProps extends RowHandlers {
	readonly row: NavigatorRow;
	readonly label: string;
	readonly hasMenu?: boolean | undefined;
	readonly children: ReactNode;
}

/**
 * Keep one tab stop while pointer and keyboard actions use the same model destination.
 * @param props The repository and composed content.
 * @returns Its selectable row.
 */
function TreeRow(props: TreeRowProps): JSX.Element {
	const { row, onFocusRow, onOpen } = props;
	const handleFocus = useCallback(() => onFocusRow(row.id), [onFocusRow, row.id]);
	const handleClick = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (row.model !== undefined) onOpen(row, event.altKey);
		},
		[row, onOpen],
	);
	return (
		<div
			role="treeitem"
			aria-level={1}
			aria-posinset={row.position}
			aria-setsize={row.siblings}
			aria-selected={row.selected}
			aria-label={props.label}
			aria-haspopup={props.hasMenu === true ? "menu" : undefined}
			tabIndex={props.focusable ? 0 : -1}
			data-row-id={row.id}
			data-row-kind={row.kind}
			onFocus={handleFocus}
			onClick={handleClick}
			onKeyDown={props.onRowKeyDown}
			style={ROW_STYLE}
			className={`group/row focus-visible:ring-ring rounded-control relative flex w-full min-w-0 cursor-default flex-wrap items-start outline-none select-none focus-visible:ring-1 focus-visible:ring-inset ${row.selected ? "bg-sidebar-accent shadow-raised" : "hover:bg-sidebar-accent/50"}`}
		>
			{props.children}
		</div>
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
 * @param props.title The whole name, on hover.
 * @returns The name.
 */
function TreeRowName(props: {
	readonly text: string;
	readonly match: TextRange | null;
	readonly className: string;
	readonly title?: string | undefined;
}): JSX.Element {
	return (
		<span
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

export { TreeRow, TreeRowFacts, TreeRowMarker, TreeRowName, type RowHandlers, type TreeRowProps };

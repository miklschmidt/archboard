// The tree of the left column, whatever it lists: rows on one grid, one tab stop, and the
// keys of a tree. Every row sits on the grid by its depth alone. A row that holds rows
// sticks under the rows that hold it while the column scrolls, so a reader keeps their
// place, and the rows it holds sit in a group, so it lets go when its branch has passed.

import { RiArrowRightSLine, type RemixiconComponentType } from "@remixicon/react";
import {
	createContext,
	useCallback,
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type JSX,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
} from "react";

import { cn } from "@archboard/ui-kit/components";
import { treeKey, type TreeKeyAction, type TreeKeyRow } from "#ui/rules/shell/tree-keys.ts";
import {
	DISCLOSURE_WIDTH,
	disclosureX,
	FACTS_GAP,
	FACTS_INSET,
	guideX,
	MARKER_WIDTH,
	NAME_GAP,
	ROW_GUTTER,
	ROW_HEIGHT,
} from "#ui/rules/shell/tree-grid.ts";
import type { TextRange } from "#ui/rules/shell/text-match.ts";

/** What a row asks of the tree it sits in. */
interface TreeFrame {
	/** The row that holds the one tab stop. */
	readonly stop: string | undefined;
	readonly onFocusRow: (id: string) => void;
	readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

const TreeContext = createContext<TreeFrame | null>(null);

/** The tree keeps the gutter a row's tone keeps from the column's edges. */
const TREE_STYLE: CSSProperties = { paddingInline: ROW_GUTTER };
const DISCLOSURE_STYLE = { width: DISCLOSURE_WIDTH } as const;
const MARKER_STYLE = { width: MARKER_WIDTH } as const;
const NAME_STYLE = { marginLeft: NAME_GAP } as const;
const FACTS_STYLE = { marginLeft: FACTS_GAP } as const;

/** Keys that command rather than type: Space opens, `/` finds, and the rest move the reading. */
const NOT_TYPED: ReadonlySet<string> = new Set([" ", "/", "[", "]", "0"]);

/**
 * Whether a key event types a character rather than commanding something.
 * @param event The key event.
 * @returns True for a single printable character without Ctrl, Cmd or Alt.
 */
function typesCharacter(event: KeyboardEvent<HTMLElement>): boolean {
	return (
		event.key.length === 1 &&
		!NOT_TYPED.has(event.key) &&
		!event.ctrlKey &&
		!event.metaKey &&
		!event.altKey
	);
}

/** Inputs for a tree. */
interface TreeRootProps<Row extends TreeKeyRow> {
	readonly label: string;
	/** The drawn rows, in order. */
	readonly rows: readonly Row[];
	/** The row that holds the tab stop until the person moves it: the row that is lit. */
	readonly home: string | null;
	readonly onOpen: (row: Row, beside: boolean) => void;
	readonly onToggle?: ((row: Row) => void) | undefined;
	/** A printable key typed in the tree, handed to the field that finds. */
	readonly onTypeAhead?: ((text: string) => void) | undefined;
	/** Escape leaves the tree. */
	readonly onLeave?: (() => void) | undefined;
	readonly children: ReactNode;
}

/**
 * Hand on a key that the tree does not answer itself.
 * @param event The key event.
 * @param props What the tree hands keys to.
 * @returns Whether the key was handed on.
 */
function handedOn(
	event: KeyboardEvent<HTMLElement>,
	props: Pick<TreeRootProps<TreeKeyRow>, "onTypeAhead" | "onLeave">,
): boolean {
	const { onTypeAhead, onLeave } = props;
	if (event.key === "Escape" && onLeave !== undefined) {
		event.stopPropagation();
		onLeave();
		return true;
	}
	if (onTypeAhead === undefined || !typesCharacter(event)) return false;
	event.preventDefault();
	onTypeAhead(event.key);
	return true;
}

/**
 * The tree: its rows and the keys that walk them.
 * @param props The rows, the row with the tab stop, the actions and the drawn rows.
 * @returns The tree.
 */
function TreeRoot<Row extends TreeKeyRow>(props: TreeRootProps<Row>): JSX.Element {
	const { rows, home, onOpen, onToggle, onTypeAhead, onLeave } = props;
	const tree = useRef<HTMLDivElement>(null);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const stop = [focusedId, home, rows[0]?.id].find(
		(id): id is string => typeof id === "string" && rows.some((row) => row.id === id),
	);
	const focusRow = useCallback((id: string): void => {
		setFocusedId(id);
		tree.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)?.focus();
	}, []);
	const perform = useCallback(
		(action: TreeKeyAction<Row>): void => {
			if (action.kind === "focus") focusRow(action.id);
			else if (action.kind === "toggle") onToggle?.(action.row);
			else onOpen(action.row, action.beside);
		},
		[focusRow, onOpen, onToggle],
	);
	// The rows as they are when a key is pressed, so a row keeps one handler while news arrives.
	const rowsNow = useRef(rows);
	useLayoutEffect(() => {
		rowsNow.current = rows;
	}, [rows]);
	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLElement>): void => {
			if (stop === undefined || handedOn(event, { onTypeAhead, onLeave })) return;
			const action = treeKey(rowsNow.current, stop, event);
			if (action === null) return;
			event.preventDefault();
			perform(action);
		},
		[stop, onTypeAhead, onLeave, perform],
	);
	const frame = useMemo(() => ({ stop, onFocusRow: setFocusedId, onKeyDown }), [stop, onKeyDown]);
	return (
		<TreeContext value={frame}>
			<div
				ref={tree}
				role="tree"
				aria-label={props.label}
				tabIndex={-1}
				style={TREE_STYLE}
				className="flex flex-col py-1 outline-none"
			>
				{props.children}
			</div>
		</TreeContext>
	);
}

/** Inputs for a row. */
interface TreeRowProps {
	readonly id: string;
	readonly depth: number;
	/** The row that is lit. */
	readonly selected: boolean;
	/** The row of what the pane has open, which wears the gold mark. */
	readonly current?: boolean | undefined;
	/** Whether the rows it holds are drawn, or undefined for a row that holds none. */
	readonly expanded?: boolean | undefined;
	readonly label?: string | undefined;
	readonly disabled?: boolean | undefined;
	/** Data attributes that name what the row stands for. */
	readonly dataset?: Readonly<Record<string, string>> | undefined;
	readonly onOpen: (beside: boolean) => void;
	readonly onToggle?: (() => void) | undefined;
	readonly children: ReactNode;
}

/**
 * Where a row sits, and where it sticks while it is open.
 * @param depth The row's depth.
 * @param expanded Whether it holds drawn rows.
 * @returns The style.
 */
function rowPlace(depth: number, expanded: boolean | undefined): CSSProperties {
	const left = disclosureX(depth) - ROW_GUTTER;
	const place: CSSProperties = { paddingLeft: left, paddingRight: FACTS_INSET - ROW_GUTTER };
	return expanded === true ? { ...place, top: depth * ROW_HEIGHT } : place;
}

/**
 * The classes of a row.
 * @param props The row.
 * @returns The classes.
 */
function rowClass(props: TreeRowProps): string {
	return cn(
		"group/row bg-sidebar focus-visible:ring-ring rounded-control relative flex min-h-7 w-full min-w-0 cursor-default items-center py-1 outline-none select-none focus-visible:ring-1 focus-visible:ring-inset",
		// Square corners, so nothing that scrolls beneath shows at the corners of a stuck row.
		props.expanded === true && "sticky z-10 rounded-none",
		props.selected ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50",
		props.disabled === true && "text-muted-foreground",
	);
}

/**
 * The chevron of a row that holds rows.
 * @param props Whether it is open, and what a click on it does.
 * @param props.expanded Whether the rows it holds are drawn, or undefined for a row with none.
 * @param props.onToggle Fold the row.
 * @returns The chevron's column.
 */
function Disclosure(props: {
	readonly expanded: boolean | undefined;
	readonly onToggle: (() => void) | undefined;
}): JSX.Element {
	const { expanded, onToggle } = props;
	const fold = useCallback(
		(event: MouseEvent) => {
			event.stopPropagation();
			onToggle?.();
		},
		[onToggle],
	);
	return (
		<span style={DISCLOSURE_STYLE} className="flex h-5 shrink-0 items-center justify-center">
			{expanded !== undefined && (
				<RiArrowRightSLine
					aria-hidden="true"
					onClick={fold}
					className={cn(
						"text-muted-foreground size-4 transition-transform motion-reduce:transition-none",
						expanded && "rotate-90",
					)}
				/>
			)}
		</span>
	);
}

/**
 * One row. A click on the row opens its destination, and a click on its chevron folds it.
 * @param props The row.
 * @returns The row.
 */
function TreeRow(props: TreeRowProps): JSX.Element {
	const frame = useContext(TreeContext);
	if (frame === null) throw new Error("A tree row requires its tree.");
	const { id, onOpen, disabled, current } = props;
	const { onFocusRow } = frame;
	const focus = useCallback(() => onFocusRow(id), [onFocusRow, id]);
	const click = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (disabled !== true) onOpen(event.altKey);
		},
		[disabled, onOpen],
	);
	return (
		<div
			role="treeitem"
			aria-level={props.depth + 1}
			aria-selected={props.selected}
			aria-expanded={props.expanded}
			aria-current={current === true ? "location" : undefined}
			aria-label={props.label}
			aria-disabled={disabled}
			tabIndex={frame.stop === id ? 0 : -1}
			data-row-id={id}
			{...props.dataset}
			onFocus={focus}
			onClick={click}
			onKeyDown={frame.onKeyDown}
			style={rowPlace(props.depth, props.expanded)}
			className={rowClass(props)}
		>
			{current === true && (
				<span
					aria-hidden="true"
					className="bg-primary-mark absolute inset-y-1 left-0 w-0.5 rounded-full"
				/>
			)}
			<Disclosure expanded={props.expanded} onToggle={props.onToggle} />
			{props.children}
		</div>
	);
}

/**
 * What a row holds, under the guide that runs down from it.
 * @param props The row's depth and the rows it holds.
 * @param props.depth The depth of the row that holds them.
 * @param props.children The rows.
 * @returns The group.
 */
function TreeGroup(props: { readonly depth: number; readonly children: ReactNode }): JSX.Element {
	const guide = useMemo(() => ({ left: guideX(props.depth) - ROW_GUTTER }), [props.depth]);
	return (
		// The pattern of a tree: the rows of a branch sit in a group inside the tree.
		// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the ARIA tree pattern's group
		<div role="group" className="relative">
			<span aria-hidden="true" style={guide} className="bg-border absolute inset-y-0 w-px" />
			{props.children}
		</div>
	);
}

/**
 * The marker column: what kind of row this is, and what is drawn over it.
 * @param props The icon and its title, and what is drawn over it.
 * @param props.icon The icon, drawn muted.
 * @param props.title What the icon says, on hover.
 * @param props.children Something drawn over the icon's corner, such as an agent at work.
 * @returns The column.
 */
function TreeMarker(props: {
	readonly icon: RemixiconComponentType;
	readonly title?: string | undefined;
	readonly children?: ReactNode;
}): JSX.Element {
	const Icon = props.icon;
	return (
		<span
			title={props.title}
			style={MARKER_STYLE}
			className="relative mr-1.5 flex h-5 shrink-0 items-center justify-center"
		>
			<Icon className="text-muted-foreground size-3.5" aria-hidden="true" />
			{props.children}
		</span>
	);
}

/**
 * The name on one line, with the whole name on hover and what was found in it marked.
 * @param props The words, the match and the classes.
 * @param props.text The name.
 * @param props.match Where the filter matched it, or null.
 * @param props.title The whole name, on hover, where it differs from the name shown.
 * @param props.className Classes for its type.
 * @returns The name.
 */
function TreeName(props: {
	readonly text: string;
	readonly match?: TextRange | null | undefined;
	readonly title?: string | undefined;
	readonly className?: string | undefined;
}): JSX.Element {
	const { text, match } = props;
	return (
		<span
			style={NAME_STYLE}
			title={props.title ?? text}
			className={cn("text-control min-w-0 flex-1 truncate font-normal", props.className)}
		>
			{match === null || match === undefined || match.end <= match.start ? (
				text
			) : (
				<>
					{text.slice(0, match.start)}
					<mark className="bg-primary/15 text-foreground rounded-chip">
						{text.slice(match.start, match.end)}
					</mark>
					{text.slice(match.end)}
				</>
			)}
		</span>
	);
}

/**
 * The facts on the right of a row, ending at one edge.
 * @param props The facts.
 * @param props.children The facts.
 * @returns The cluster.
 */
function TreeFacts(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<span
			style={FACTS_STYLE}
			className="text-technical text-muted-foreground flex h-5 shrink-0 items-center gap-1.5 font-mono"
		>
			{props.children}
		</span>
	);
}

/** A tree, with its parts on it. */
const Tree = Object.assign(TreeRoot, {
	Row: TreeRow,
	Group: TreeGroup,
	Marker: TreeMarker,
	Name: TreeName,
	Facts: TreeFacts,
});

export { Tree };

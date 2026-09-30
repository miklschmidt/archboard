// The left navigator: a filter, the vault's boards as an outline (folders,
// then the boards each board drills down to, then names), and where agents
// are working. Each board is one row; its variants are listed under it while
// a pane shows it or the person opens a board that has a proposal. The way to
// what every pane shows is open, and nothing an agent does reorders the tree.
//
// Nothing here makes a board. A person reads an architecture an agent wrote
// (ADR 0023), so the navigator is a way of choosing which one to look at.

import { RiErrorWarningLine } from "@remixicon/react";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type RefObject } from "react";

import { listedBoard, listedBoardKey, type OutlineNode } from "@/ui/board-catalog";
import { Skeleton } from "@/ui/components/skeleton";
import { boardAddressOf } from "@/ui/semantic-board-canvas";
import { BoardOutline } from "@/ui/shell/components/BoardOutline";
import { NavigatorFilter } from "@/ui/shell/components/NavigatorFilter";
import { WorkingNow, type WorkingEntry } from "@/ui/shell/components/WorkingNow";
import { useFindShortcut } from "@/ui/shell/hooks/use-find-shortcut";
import { useNavigatorExpansion } from "@/ui/shell/hooks/use-navigator-expansion";
import { filterCount, navigatorRows, rowSelected } from "@/ui/shell/lib/navigator-rows";
import { boardRowId } from "@/ui/shell/lib/row-ids";
import { paneLetter } from "@/ui/shell/lib/pane-letters";
import { foldQuery } from "@/ui/shell/lib/text-match";
import { nameX } from "@/ui/shell/lib/tree-grid";
import type { ShellActions, ShellView } from "@/ui/shell/types/contracts";
import type { NavigatorRow, PaneMark } from "@/ui/shell/types/navigator-rows";
import type { CatalogBoard } from "@/ui/types";

/** Inputs for the navigator. */
interface NavigatorProps {
	view: ShellView;
	/** The vault's outline, derived once for the shell. */
	outline: readonly OutlineNode<CatalogBoard>[];
	actions: ShellActions;
}

/** Messages line up with the names at the top of the tree. */
const MESSAGE_STYLE = { paddingLeft: nameX(0) } as const;

/**
 * Every pane as the rows mark it: its letter, its board, its variant and whether it is active.
 * @param view The shell view.
 * @returns The marks, in reading order.
 */
function paneMarks(view: ShellView): PaneMark[] {
	return view.panes.map((pane, index) => ({
		letter: paneLetter(index),
		board: boardAddressOf(pane.status.boardKey)?.board ?? null,
		key: listedBoardKey(view.boards, pane.status.boardKey),
		active: pane.status.paneId === view.activePaneId,
	}));
}

/**
 * The boards agents are working on, named as the vault lists them.
 * @param view The shell view.
 * @param panes The panes, marked.
 * @returns The entries.
 */
function workingEntries(view: ShellView, panes: readonly PaneMark[]): WorkingEntry[] {
	return Object.values(view.agentActivity).map((activity) => {
		const name = listedBoard(view.boards, activity.board)?.name ?? activity.board;
		const letters =
			panes.length < 2
				? []
				: panes
						.filter((pane) => pane.board?.toLowerCase() === name.toLowerCase())
						.map((pane) => pane.letter);
		return { activity, name, onScreen: letters };
	});
}

/**
 * The key a row opens: a board by its bare name, a variant by its own key.
 * @param row The row.
 * @returns The key, or null for a row that only gathers others.
 */
function rowKey(row: NavigatorRow): string | null {
	if (row.kind === "board") return row.board.key;
	return row.kind === "variant" ? row.variant.key : null;
}

/**
 * The row that holds the tree's tab stop and is revealed when a pane moves:
 * the selected row, else the active pane's board.
 * @param rows The rows.
 * @param panes The panes.
 * @returns The row's id, or null.
 */
function homeRowId(rows: readonly NavigatorRow[], panes: readonly PaneMark[]): string | null {
	const selected = rows.find(rowSelected);
	if (selected !== undefined) return selected.id;
	const board = panes.find((pane) => pane.active)?.board ?? null;
	return board === null ? null : boardRowId(board);
}

/**
 * Open a key where the person asked: the active pane, or beside it.
 * @param actions The shell actions.
 * @param key The board key.
 * @param beside Whether it opens beside.
 */
function openKey(actions: ShellActions, key: string, beside: boolean): void {
	if (beside) actions.openBeside(key);
	else actions.selectBoard(key);
}

/**
 * The board navigator.
 * @param props The shell view and actions.
 * @returns The navigator column.
 */
function Navigator(props: NavigatorProps): JSX.Element {
	const { view, actions, outline } = props;
	const listing = view.boards;
	const input = useRef<HTMLInputElement>(null);
	const column = useRef<HTMLElement>(null);
	useFindShortcut(input);
	const [query, setQuery] = useState("");
	const panes = useMemo(() => paneMarks(view), [view]);
	const expansion = useNavigatorExpansion(outline, panes);
	const folded = foldQuery(query);
	const rows = useMemo(
		() =>
			navigatorRows({
				outline,
				expanded: expansion.expanded,
				query: folded,
				panes,
				activity: view.agentActivity,
			}),
		[outline, expansion, folded, panes, view.agentActivity],
	);
	const open = useCallback(
		(row: NavigatorRow, beside: boolean): void => {
			const key = rowKey(row);
			if (key !== null) openKey(actions, key, beside);
		},
		[actions],
	);
	const openBoard = useCallback(
		(board: string, beside: boolean): void => openKey(actions, board, beside),
		[actions],
	);
	const onTypeAhead = useCallback((text: string): void => {
		setQuery((current) => current + text);
		input.current?.focus();
	}, []);
	const onOpenFirst = useCallback(
		(beside: boolean): void => {
			const first = rows.find((row) => rowKey(row) !== null && !row.dimmed);
			if (first !== undefined) open(first, beside);
		},
		[rows, open],
	);
	const onEnterTree = useCallback((): void => {
		column.current?.querySelector<HTMLElement>('[role="tree"] [tabindex="0"]')?.focus();
	}, []);
	const homeId = homeRowId(rows, panes);
	useRevealActive(
		column,
		homeId,
		rows.some((row) => row.id === homeId),
	);

	return (
		<nav
			ref={column}
			aria-label="Boards"
			data-slot="navigator"
			className="border-border bg-sidebar text-sidebar-foreground flex w-(--shell-navigator-width) shrink-0 flex-col border-r"
		>
			<NavigatorFilter
				input={input}
				query={query}
				onQuery={setQuery}
				count={filterCount(rows, listing.boards.length)}
				onOpenFirst={onOpenFirst}
				onEnterTree={onEnterTree}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<ListingState
					loading={view.boardsLoading}
					error={view.boardsError}
					empty={listing.boards.length === 0}
					noMatch={folded.length > 0 && rows.length === 0}
					query={query}
					actions={actions}
					onClear={setQuery}
				/>
				<BoardOutline
					rows={rows}
					homeId={homeId}
					onOpen={open}
					onExpand={expansion.setExpanded}
					onTypeAhead={onTypeAhead}
					filtering={folded.length > 0}
				/>
			</div>
			<WorkingNow entries={workingEntries(view, panes)} onOpen={openBoard} />
		</nav>
	);
}

/**
 * Bring the row being read into view when it changes, unless the person is
 * using the navigator: a row moving under their pointer or focus would be a
 * row they did not choose.
 * @param column The navigator.
 * @param rowId The row being read, or null.
 * @param drawn Whether its row is drawn yet: the listing may arrive after the pane reports.
 */
function useRevealActive(
	column: RefObject<HTMLElement | null>,
	rowId: string | null,
	drawn: boolean,
): void {
	useEffect(() => {
		const root = column.current;
		if (!drawn || rowId === null || root === null || personIsIn(root)) return;
		root
			.querySelector(`[data-row-id="${CSS.escape(rowId)}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [column, rowId, drawn]);
}

/**
 * Whether the person is using the navigator: its focus or their pointer is in it.
 * @param root The navigator.
 * @returns True while they are.
 */
function personIsIn(root: HTMLElement): boolean {
	return root.contains(document.activeElement) || root.matches(":hover");
}

/** Inputs for the line shown when the tree has nothing to show. */
interface ListingStateProps {
	readonly loading: boolean;
	readonly error: string | null;
	readonly empty: boolean;
	readonly noMatch: boolean;
	readonly query: string;
	readonly actions: ShellActions;
	readonly onClear: (query: string) => void;
}

/**
 * What the navigator says while it has nothing to list: that the vault is
 * being read, why the listing failed, that the vault is empty, or that the
 * filter found nothing.
 * @param props The listing state.
 * @returns The state, or nothing while boards are listed.
 */
function ListingState(props: ListingStateProps): JSX.Element | null {
	const { actions, onClear } = props;
	const retry = useCallback(() => actions.refreshBoards(), [actions]);
	const clear = useCallback(() => onClear(""), [onClear]);
	if (props.error !== null) {
		return (
			<div
				role="alert"
				className="text-body m-2 flex items-start gap-2 rounded-[3px] border px-3 py-2"
			>
				<RiErrorWarningLine
					className="text-destructive mt-px size-3.5 shrink-0"
					aria-hidden="true"
				/>
				<span className="min-w-0 flex-1">{props.error}</span>
				<button
					type="button"
					onClick={retry}
					className="text-primary shrink-0 font-medium hover:underline"
				>
					Retry
				</button>
			</div>
		);
	}
	if (props.noMatch) {
		return (
			<p style={MESSAGE_STYLE} className="text-body text-muted-foreground py-3 pr-4">
				No board matches “{props.query.trim()}”.{" "}
				<button type="button" onClick={clear} className="text-primary font-medium hover:underline">
					Clear
				</button>
			</p>
		);
	}
	if (!props.empty) return null;
	if (props.loading) return <ListingSkeleton />;
	return (
		<p style={MESSAGE_STYLE} className="text-body text-muted-foreground py-3 pr-4">
			No boards in this vault yet. An agent makes one with{" "}
			<code className="text-foreground font-mono">archboard semantic new</code>.
		</p>
	);
}

/**
 * The listing's loading state: rows of the shape a board takes, greyed, with
 * the words for assistive technology.
 * @returns The skeleton.
 */
function ListingSkeleton(): JSX.Element {
	return (
		<div aria-busy="true" style={MESSAGE_STYLE} className="flex flex-col gap-3 py-3 pr-4">
			<p aria-live="polite" className="sr-only">
				Reading the vault…
			</p>
			{["w-3/5", "w-1/2", "w-2/3", "w-2/5"].map((width) => (
				<Skeleton key={width} className={`h-3 rounded-[2px] motion-reduce:animate-none ${width}`} />
			))}
		</div>
	);
}

export { Navigator, type NavigatorProps };

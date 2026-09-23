// The left navigator: a filter, the vault's boards as an outline (folders,
// then the boards each board drills down to, then names), and where agents
// are working. Each board is one row; its states are listed under it while it
// is the board being read or the person opens them. The path to the board
// being read is always open, and nothing an agent does reorders the tree.
//
// Nothing here makes a board. A person reads an architecture an agent wrote
// (ADR 0023), so the navigator is a way of choosing which one to look at.

import { RiErrorWarningLine } from "@remixicon/react";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type RefObject } from "react";

import { buildOutline, listedBoard, listedBoardKey } from "@/ui/board-catalog";
import { Skeleton } from "@/ui/components/skeleton";
import { boardAddressOf } from "@/ui/semantic-board-canvas";
import { BoardOutline } from "@/ui/shell/components/BoardOutline";
import { NavigatorFilter } from "@/ui/shell/components/NavigatorFilter";
import { WorkingNow, type WorkingEntry } from "@/ui/shell/components/WorkingNow";
import { useFindShortcut } from "@/ui/shell/hooks/use-find-shortcut";
import { useNavigatorExpansion } from "@/ui/shell/hooks/use-navigator-expansion";
import {
	filterCount,
	navigatorRows,
	type NavigatorRow,
	type PaneMark,
} from "@/ui/shell/lib/navigator-rows";
import { paneLetter } from "@/ui/shell/lib/pane-letters";
import { foldQuery } from "@/ui/shell/lib/text-match";
import type { ShellActions, ShellView } from "@/ui/shell/types/contracts";

/** Inputs for the navigator. */
interface NavigatorProps {
	view: ShellView;
	actions: ShellActions;
}

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * Every pane as the rows mark it: its letter, its board and its state.
 * @param view The shell view.
 * @returns The marks, in reading order.
 */
function paneMarks(view: ShellView): PaneMark[] {
	return view.panes.map((pane, index) => ({
		letter: paneLetter(index),
		board: boardAddressOf(pane.status.boardKey)?.board ?? null,
		key: listedBoardKey(view.boards, pane.status.boardKey),
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
 * The key a row opens: a board by its bare name, a state by its own key.
 * @param row The row.
 * @returns The key, or null for a folder.
 */
function rowKey(row: NavigatorRow): string | null {
	if (row.kind === "board") return row.board.key;
	return row.kind === "state" ? row.variant.key : null;
}

/**
 * What the active pane is reading: the board's name and the listed key of its state.
 * @param view The shell view.
 * @returns The board and key, each null before the pane shows one.
 */
function activeReading(view: ShellView): {
	readonly board: string | null;
	readonly key: string | null;
} {
	const boardKey =
		view.panes.find((pane) => pane.status.paneId === view.activePaneId)?.status.boardKey ?? null;
	return {
		board: boardAddressOf(boardKey)?.board ?? null,
		key: listedBoardKey(view.boards, boardKey),
	};
}

/**
 * The row id of the board being read.
 * @param board The board's name, or null.
 * @returns The id, or null.
 */
function boardRowId(board: string | null): string | null {
	return board === null ? null : `board:${board.toLowerCase()}`;
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
	const { view, actions } = props;
	const listing = view.boards;
	const input = useRef<HTMLInputElement>(null);
	const column = useRef<HTMLElement>(null);
	useFindShortcut(input);
	const [query, setQuery] = useState("");
	const [statesOpen, setStatesOpen] = useState<ReadonlySet<string>>(NO_IDS);
	const outline = useMemo(
		() => buildOutline(listing.boards, listing.levels),
		[listing.boards, listing.levels],
	);
	const active = activeReading(view);
	const expansion = useNavigatorExpansion(outline, active.board);
	const panes = useMemo(() => paneMarks(view), [view]);
	const folded = foldQuery(query);
	const rows = useMemo(
		() =>
			navigatorRows({
				outline,
				expanded: expansion.expanded,
				statesOpen,
				query: folded,
				activeBoard: active.board,
				activeKey: active.key,
				panes,
				activity: view.agentActivity,
			}),
		[outline, expansion, statesOpen, folded, active.board, active.key, panes, view.agentActivity],
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
	const onToggleStates = useCallback((id: string): void => {
		setStatesOpen((current) => {
			const next = new Set(current);
			if (!next.delete(id)) next.add(id);
			return next;
		});
	}, []);
	const onTypeAhead = useCallback((text: string): void => {
		setQuery((current) => current + text);
		input.current?.focus();
	}, []);
	const onOpenFirst = useCallback(
		(beside: boolean): void => {
			const first = rows.find((row) => row.kind !== "folder" && !row.dimmed);
			if (first !== undefined) open(first, beside);
		},
		[rows, open],
	);
	const onEnterTree = useCallback((): void => {
		column.current?.querySelector<HTMLElement>('[role="tree"] [tabindex="0"]')?.focus();
	}, []);
	const homeId = boardRowId(active.board);
	useRevealActive(column, homeId);

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
					onToggleStates={onToggleStates}
					onTypeAhead={onTypeAhead}
				/>
			</div>
			<WorkingNow entries={workingEntries(view, panes)} onOpen={openBoard} />
		</nav>
	);
}

/**
 * Bring the board being read into view when it changes, unless the person is
 * using the navigator: a row moving under their pointer or focus would be a
 * row they did not choose.
 * @param column The navigator.
 * @param rowId The board row being read, or null.
 */
function useRevealActive(column: RefObject<HTMLElement | null>, rowId: string | null): void {
	useEffect(() => {
		const root = column.current;
		if (
			rowId === null ||
			root === null ||
			root.contains(document.activeElement) ||
			root.matches(":hover")
		) {
			return;
		}
		root
			.querySelector(`[data-row-id="${CSS.escape(rowId)}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [column, rowId]);
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
			<p className="text-body text-muted-foreground px-4 py-3">
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
		<p className="text-body text-muted-foreground px-4 py-3">
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
		<div aria-busy="true" className="flex flex-col gap-3 px-4 py-3">
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

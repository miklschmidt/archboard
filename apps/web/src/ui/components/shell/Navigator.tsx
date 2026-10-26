// The left column: the brand bar at its top, a filter, every repository with
// the boards of its chosen checkout under it as an outline (folders, then the
// boards each board drills down to, then names), where agents are working, and
// the agent itself at its foot (ADR 0050). Each
// board is one row; a board with more than one variant lists them under it
// when it is open. The way to what every pane shows is open, and nothing an
// agent does reorders the tree.
//
// Nothing here makes a board. A person reads an architecture an agent wrote
// (ADR 0023), so the navigator is a way of choosing which one to look at.

import { RiErrorWarningLine } from "@remixicon/react";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type JSX,
	type ReactNode,
	type RefObject,
} from "react";

import { listedBoard, listedBoardKey } from "#ui/rules/board-catalog/listing.ts";
import { Skeleton } from "@archboard/ui-kit/components";
import { boardAddressOf } from "#ui/rules/semantic-board-canvas/board/address.ts";
import { BoardOutline } from "#ui/components/shell/BoardOutline.tsx";
import { NavigatorFilter } from "#ui/components/shell/NavigatorFilter.tsx";
import { WorkingNow, type WorkingEntry } from "#ui/components/shell/WorkingNow.tsx";
import { useFindShortcut } from "#ui/hooks/shell/use-find-shortcut.ts";
import { useKept } from "#ui/hooks/shell/use-kept.ts";
import { useNavigatorExpansion } from "#ui/hooks/shell/use-navigator-expansion.ts";
import { filterCount, navigatorRows, rowSelected } from "#ui/rules/shell/navigator-rows.ts";
import { boardRowId, scopedRowId } from "#ui/rules/shell/row-ids.ts";
import { paneLetter } from "#ui/rules/shell/pane-letters.ts";
import { foldQuery } from "#ui/rules/shell/text-match.ts";
import { sameData } from "#ui/rules/shell/same-data.ts";
import { nameX } from "#ui/rules/shell/tree-grid.ts";
import type { ShellActions, ShellRepository, ShellView } from "#ui/rules/shell/contracts.ts";
import type { NavigatorRow, PaneMark } from "#ui/rules/shell/navigator-row-types.ts";

/** Inputs for the navigator. */
interface NavigatorProps {
	/** The application can replace empty-board guidance when another model format is present. */
	emptyNotice?: ReactNode;
	view: ShellView;
	actions: ShellActions;
	/** The column's top row: the brand and the application's own controls. */
	head: ReactNode;
	/** The column's foot: the agent dock, with its voice and the way to the conversation. */
	foot?: ReactNode;
}

/** Messages line up with the names at the top of the tree. */
const MESSAGE_STYLE = { paddingLeft: nameX(0) } as const;

/**
 * Every pane as the rows mark it: its letter, its repository, its board, its
 * variant and whether it is active. The repository is the one the server said
 * the pane is in, as the address names it: the repositories as last read may
 * not list a newly chosen checkout's vault yet.
 * @param view The shell view.
 * @returns The marks, in reading order.
 */
function paneMarks(view: ShellView): PaneMark[] {
	return view.panes.map((pane, index) => {
		const { repository } = pane.status;
		const shell = view.repositories.find((each) => each.repository.name === repository);
		return {
			letter: paneLetter(index),
			repository,
			board: boardAddressOf(pane.status.boardKey)?.board ?? null,
			key:
				shell === undefined
					? pane.status.boardKey
					: listedBoardKey(shell.boards, pane.status.boardKey),
			active: pane.status.paneId === view.activePaneId,
		};
	});
}

/**
 * The boards agents are working on, in every repository, named as its vault lists them.
 * @param view The shell view.
 * @param panes The panes, marked.
 * @returns The entries.
 */
function workingEntries(view: ShellView, panes: readonly PaneMark[]): WorkingEntry[] {
	const named = view.repositories.length > 1;
	return view.repositories.flatMap((shell) => {
		const repository = shell.repository.name;
		return Object.values(shell.activity).map((activity) => {
			const name = listedBoard(shell.boards, activity.board)?.name ?? activity.board;
			const letters =
				panes.length < 2
					? []
					: panes
							.filter(
								(pane) =>
									pane.repository === repository &&
									pane.board?.toLowerCase() === name.toLowerCase(),
							)
							.map((pane) => pane.letter);
			return { activity, name, repository, named, onScreen: letters };
		});
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
	const active = panes.find((pane) => pane.active);
	if (active?.board == null || active.repository === null) return null;
	return scopedRowId(active.repository, boardRowId(active.board));
}

/**
 * Open a key of a repository where the person asked: the active pane, or beside it.
 * @param actions The shell actions.
 * @param key The board key.
 * @param beside Whether it opens beside.
 * @param repository The repository the board is in.
 */
function openKey(actions: ShellActions, key: string, beside: boolean, repository: string): void {
	if (beside) actions.openBeside(key, repository);
	else void actions.selectBoard(key, undefined, repository);
}

/**
 * Whether a repository's boards are read from its chosen checkout's vault. One
 * that is not says why in its own row, and the empty listing's advice would
 * not help it.
 * @param shell The repository.
 * @returns True when its vault has answered with its boards.
 */
function readyAndRead(shell: ShellRepository): boolean {
	return shell.repository.state === "ready" && !shell.loading && shell.error === null;
}

/**
 * Why the navigator cannot show what it should: the repositories or the panes
 * could not be read, or else the first repository whose boards could not be,
 * named. Its row marks it too; this is where the way to read it again is.
 * @param view The shell view.
 * @returns The reason, or null.
 */
function listingFailure(view: ShellView): string | null {
	if (view.boardsError !== null) return view.boardsError;
	const failed = view.repositories.find((shell) => shell.error !== null);
	return failed === undefined ? null : `${failed.repository.name}: ${failed.error}`;
}

/**
 * How many boards every repository lists.
 * @param view The shell view.
 * @returns The count.
 */
function boardTotal(view: ShellView): number {
	return view.repositories.reduce((total, shell) => total + shell.boards.boards.length, 0);
}

/**
 * The board navigator.
 * @param props The shell view and actions.
 * @returns The navigator column.
 */
function Navigator(props: NavigatorProps): JSX.Element {
	const { view, actions } = props;
	const input = useRef<HTMLInputElement>(null);
	const column = useRef<HTMLElement>(null);
	useFindShortcut(input);
	const [query, setQuery] = useState("");
	// Which pane shows which board, kept while that is so: pane news that changes
	// nothing here leaves the rows, their expansion and their handlers as they were.
	const panes = useKept(paneMarks(view), sameData);
	const expansion = useNavigatorExpansion(view.repositories, panes);
	const folded = foldQuery(query);
	const rows = useMemo(
		() =>
			navigatorRows({
				repositories: view.repositories,
				expanded: expansion.expanded,
				query: folded,
				panes,
			}),
		[view.repositories, expansion, folded, panes],
	);
	const open = useCallback(
		(row: NavigatorRow, beside: boolean): void => {
			const key = rowKey(row);
			if (key !== null) openKey(actions, key, beside, row.repository);
		},
		[actions],
	);
	const openBoard = useCallback(
		(board: string, beside: boolean, repository: string): void =>
			openKey(actions, board, beside, repository),
		[actions],
	);
	const onChooseCheckout = useCallback(
		(repository: string, root: string): void => actions.chooseCheckout(repository, root),
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
	const total = boardTotal(view);
	useRevealActive(
		column,
		homeId,
		rows.some((row) => row.id === homeId),
	);

	return (
		<div
			data-slot="navigator-column"
			className="border-border bg-sidebar text-sidebar-foreground shadow-edge-side relative z-30 flex w-(--shell-navigator-width) shrink-0 flex-col border-r"
		>
			{props.head}
			<nav
				ref={column}
				aria-label="Boards"
				data-slot="navigator"
				className="flex min-h-0 flex-1 flex-col"
			>
				<NavigatorFilter
					input={input}
					query={query}
					onQuery={setQuery}
					count={filterCount(rows, total)}
					onOpenFirst={onOpenFirst}
					onEnterTree={onEnterTree}
				/>
				<div className="min-h-0 flex-1 overflow-y-auto">
					<ListingState
						emptyNotice={props.emptyNotice}
						loading={view.boardsLoading}
						error={listingFailure(view)}
						empty={total === 0 && view.repositories.every(readyAndRead)}
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
						onChooseCheckout={onChooseCheckout}
						onTypeAhead={onTypeAhead}
						filtering={folded.length > 0}
					/>
				</div>
				<WorkingNow entries={workingEntries(view, panes)} onOpen={openBoard} />
			</nav>
			{props.foot}
		</div>
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
	readonly emptyNotice?: ReactNode;
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
				className="text-body rounded-control m-2 flex items-start gap-2 border px-3 py-2"
			>
				<RiErrorWarningLine
					className="text-destructive mt-px size-3.5 shrink-0"
					aria-hidden="true"
				/>
				<span className="min-w-0 flex-1">{props.error}</span>
				<button
					type="button"
					onClick={retry}
					className="text-primary-text decoration-primary-mark shrink-0 font-medium underline underline-offset-2 hover:decoration-2"
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
				<button
					type="button"
					onClick={clear}
					className="text-primary-text decoration-primary-mark font-medium underline underline-offset-2 hover:decoration-2"
				>
					Clear
				</button>
			</p>
		);
	}
	if (!props.empty) return null;
	if (props.loading) return <ListingSkeleton />;
	return props.emptyNotice === undefined ? <EmptyBoardNotice /> : <>{props.emptyNotice}</>;
}

/**
 * Guidance for an empty legacy vault.
 * @returns The existing board creation instruction.
 */
function EmptyBoardNotice(): JSX.Element {
	return (
		<p
			data-slot="navigator-empty"
			style={MESSAGE_STYLE}
			className="text-body text-muted-foreground py-3 pr-4"
		>
			No boards yet. An agent makes one with{" "}
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
				<Skeleton key={width} className={`rounded-chip h-3 motion-reduce:animate-none ${width}`} />
			))}
		</div>
	);
}

export { Navigator, EmptyBoardNotice, type NavigatorProps };

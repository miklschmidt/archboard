// The left column: it lists where to go. The brand sits at its top, and the agent at its
// foot. The reader of the focused pane fills the two places it leaves for Find and for the
// destinations, so the column always speaks for the focused pane, and the shell knows
// nothing about a model. The repository switcher between them is the shell's own, because
// a pane with nothing to read still has to reach a repository.

import { RiErrorWarningLine } from "@remixicon/react";
import { useCallback, useRef, useState, type JSX, type ReactNode } from "react";

import { Popover } from "@archboard/ui-kit/components";
import { RepositoryChooser, RepositorySwitcher } from "#ui/components/shell/RepositorySwitcher.tsx";
import { WorkingNow, type WorkingEntry } from "#ui/components/shell/WorkingNow.tsx";
import { useKept } from "#ui/hooks/shell/use-kept.ts";
import { paneLetter } from "#ui/rules/shell/pane-letters.ts";
import type { PaneMark } from "#ui/rules/shell/repository-choices.ts";
import { sameData } from "#ui/rules/shell/same-data.ts";
import { nameX } from "#ui/rules/shell/tree-grid.ts";
import type { ShellActions, ShellRepository, ShellView } from "#ui/rules/shell/contracts.ts";

/** Inputs for the navigator. */
interface NavigatorProps {
	/** The application can replace empty-board guidance when another model format is present. */
	view: ShellView;
	actions: ShellActions;
	/** The column's top row: the brand and the application's own controls. */
	head: ReactNode;
	/** The column's foot: the agent dock, with its voice and the way to the conversation. */
	foot?: ReactNode;
	/** Where the focused pane puts its destinations. */
	attachDestinations: (element: HTMLDivElement | null) => void;
}

/** Messages line up with the names at the top of the tree. */
const MESSAGE_STYLE = { paddingLeft: nameX(0) } as const;

/**
 * Every pane contributes its letter, repository, and active state.
 * The repository is the one the server said
 * the pane is in, as the address names it: the repositories as last read may
 * not list a newly chosen checkout's vault yet.
 * @param view The shell view.
 * @returns The marks, in reading order.
 */
function paneMarks(view: ShellView): PaneMark[] {
	return view.panes.map((pane, index) => ({
		letter: paneLetter(index),
		repository: pane.status.repository,
		active: pane.status.paneId === view.activePaneId,
	}));
}

/**
 * Agent activity in each repository, named by its canonical model.
 * @param view The shell view.
 * @param panes The panes, marked.
 * @returns The entries.
 */
function workingEntries(view: ShellView, panes: readonly PaneMark[]): WorkingEntry[] {
	const named = view.repositories.length > 1;
	return view.repositories.flatMap((shell) => {
		const repository = shell.repository.name;
		return Object.values(shell.activity).map((activity) => {
			const name = shell.model?.name ?? activity.board;
			const letters =
				panes.length < 2
					? []
					: panes.filter((pane) => pane.repository === repository).map((pane) => pane.letter);
			return { activity, name, repository, named, onScreen: letters };
		});
	});
}

/**
 * Open a repository's canonical model in the requested pane.
 * @param actions The shell actions.
 * @param shell The repository.
 * @param beside Whether to use the adjacent pane.
 */
function openRepository(actions: ShellActions, shell: ShellRepository, beside: boolean): void {
	const model = shell.model?.id ?? null;
	if (beside) actions.openBeside(model, shell.repository.name);
	else void actions.openModel(model, shell.repository.name);
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
 * The left column.
 * @param props The shell view and actions.
 * @returns The navigator column.
 */
function Navigator(props: NavigatorProps): JSX.Element {
	const { view, actions, attachDestinations } = props;
	// Unchanged repository locations preserve the row values and handlers.
	const panes = useKept(paneMarks(view), sameData);
	const nothingListed = view.repositories.length === 0;
	const [choosing, setChoosing] = useState(false);
	const switcher = useRef<HTMLButtonElement>(null);
	const leave = useCallback((): void => {
		setChoosing(false);
		switcher.current?.focus();
	}, []);
	const open = useCallback(
		(shell: ShellRepository, beside: boolean): void => {
			setChoosing(false);
			openRepository(actions, shell, beside);
		},
		[actions],
	);
	const openBoard = useCallback(
		(_board: string, beside: boolean, repository: string): void => {
			const shell = view.repositories.find((entry) => entry.repository.name === repository);
			if (shell !== undefined) openRepository(actions, shell, beside);
		},
		[actions, view.repositories],
	);
	const onChooseCheckout = useCallback(
		(repository: string, root: string): void => {
			setChoosing(false);
			actions.chooseCheckout(repository, root);
		},
		[actions],
	);
	return (
		<div
			data-slot="navigator-column"
			className="border-border bg-sidebar text-sidebar-foreground shadow-edge-side relative z-30 flex w-(--shell-navigator-width) shrink-0 flex-col border-r"
		>
			{props.head}
			<nav
				aria-label="Reading"
				data-slot="navigator"
				className="group/navigator flex min-h-0 flex-1 flex-col"
			>
				{!nothingListed && (
					<Popover open={choosing} onOpenChange={setChoosing}>
						<RepositorySwitcher ref={switcher} panes={panes} open={choosing} />
						<Popover.Content
							align="start"
							data-slot="repository-dropdown"
							className="max-h-[60vh] w-(--anchor-width) gap-0 p-0 pt-2"
						>
							<RepositoryChooser
								repositories={view.repositories}
								panes={panes}
								asked
								className="flex"
								onOpen={open}
								onChooseCheckout={onChooseCheckout}
								onLeave={leave}
							/>
						</Popover.Content>
					</Popover>
				)}
				<ListingState
					loading={view.boardsLoading}
					error={listingFailure(view)}
					empty={view.repositories.length === 0}
					actions={actions}
				/>
				{/* A pane with nothing to list leaves this place empty, and the repositories take it. */}
				<div
					ref={attachDestinations}
					data-slot="navigator-destinations"
					className="peer flex min-h-0 flex-1 flex-col empty:hidden"
				/>
				{!nothingListed && (
					<RepositoryChooser
						repositories={view.repositories}
						panes={panes}
						asked={view.choosing}
						className="hidden peer-empty:flex"
						onOpen={open}
						onChooseCheckout={onChooseCheckout}
						onLeave={leave}
					/>
				)}
				<WorkingNow entries={workingEntries(view, panes)} onOpen={openBoard} />
			</nav>
			{props.foot}
		</div>
	);
}

/** Inputs for the line shown when the tree has nothing to show. */
interface ListingStateProps {
	readonly loading: boolean;
	readonly error: string | null;
	readonly empty: boolean;
	readonly actions: ShellActions;
}

/**
 * What the navigator says while it cannot list: that the repositories are being read, or why
 * the listing failed. The pane says that there are none.
 * @param props The listing state.
 * @returns The state, or nothing while repositories are listed.
 */
function ListingState(props: ListingStateProps): JSX.Element | null {
	const { actions } = props;
	const retry = useCallback(() => actions.refreshBoards(), [actions]);
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
	return props.empty && props.loading ? <ListingSkeleton /> : null;
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
				<div
					key={width}
					className={`bg-muted rounded-chip h-3 animate-pulse motion-reduce:animate-none ${width}`}
				/>
			))}
		</div>
	);
}

export { Navigator, type NavigatorProps };

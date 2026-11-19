// The left column: it lists where to go. The brand sits at its top, and the agent at its
// foot. The reader of the focused pane fills the two places it leaves for Find and for the
// destinations, so the column always speaks for the focused pane, and the shell knows
// nothing about a model. The repository switcher between them is the shell's own, because
// a pane with nothing to read still has to reach a repository.

import { useCallback, useRef, useState, type JSX, type ReactNode } from "react";

import { Popover } from "@archboard/ui-kit/components";
import { RepositoryChooser, RepositorySwitcher } from "#ui/shell/components/RepositorySwitcher.tsx";
import { WorkingNow, type WorkingEntry } from "#ui/shell/components/WorkingNow.tsx";
import { useKept } from "#ui/shell/hooks/use-kept.ts";
import { claimPurposes } from "#ui/shell/rules/claims.ts";
import { paneLetter } from "#ui/shell/rules/pane-letters.ts";
import type { PaneMark } from "#ui/shell/rules/repository-choices.ts";
import { sameData } from "#ui/shell/rules/same-data.ts";
import { nameX } from "#ui/shell/rules/tree-grid.ts";
import type { ShellActions, ShellRepository, ShellView } from "#ui/shell/rules/contracts.ts";

/** Inputs for the navigator. */
interface NavigatorProps {
	/** The application can replace empty-model guidance when another model format is present. */
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
			const name = shell.model?.name ?? activity.model;
			const letters =
				panes.length < 2
					? []
					: panes.filter((pane) => pane.repository === repository).map((pane) => pane.letter);
			return { activity, name, repository, named, onScreen: letters };
		});
	});
}

/** No agent claims the model. */
const NO_CLAIMS: readonly string[] = [];

/**
 * What the agents that claim the focused pane's model are doing.
 * @param view The shell view.
 * @param panes The panes, marked.
 * @returns The purpose of each claim, each once.
 */
function focusedClaims(view: ShellView, panes: readonly PaneMark[]): readonly string[] {
	const focused = panes.find((pane) => pane.active)?.repository ?? null;
	const shell = view.repositories.find((entry) => entry.repository.name === focused);
	return shell === undefined ? NO_CLAIMS : claimPurposes(shell);
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
	const openPaneKey = useCallback(
		(_model: string, beside: boolean, repository: string): void => {
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
	const working = <WorkingNow entries={workingEntries(view, panes)} onOpen={openPaneKey} />;
	return (
		<div
			data-slot="navigator-column"
			className="bg-sidebar text-sidebar-foreground relative z-30 flex w-full min-w-0 flex-col"
		>
			{props.head}
			<nav
				aria-label="Reading"
				data-slot="navigator"
				className="group/navigator flex min-h-0 flex-1 flex-col"
			>
				{!nothingListed && (
					<Popover open={choosing} onOpenChange={setChoosing}>
						<RepositorySwitcher
							ref={switcher}
							panes={panes}
							claims={focusedClaims(view, panes)}
							open={choosing}
						/>
						<Popover.Content
							align="start"
							data-slot="repository-dropdown"
							className="bg-sidebar max-h-[60vh] w-(--anchor-width) gap-0 p-0 pt-2"
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
				{/* A listing that fails says so in a toast, with Retry. */}
				<ListingSkeleton loading={view.modelsLoading} empty={nothingListed} />
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
				{props.foot === undefined && working}
			</nav>
			{props.foot !== undefined && (
				// The agent stands on the chrome under the list, under a line that parts it from the
				// list: what agents work on now at its top, then the dock, with the dock's keys at the
				// foot of the window. No card frames it, so the keys' row has the column's width.
				<div
					data-slot="navigator-foot"
					className="bg-sidebar border-border flex shrink-0 flex-col border-t"
				>
					{working}
					{props.foot}
				</div>
			)}
		</div>
	);
}

/**
 * The listing's loading state while nothing is listed yet: rows of the shape a model takes,
 * greyed, with the words for assistive technology.
 * @param props Whether the listing is being read, and whether nothing is listed.
 * @param props.loading Whether the listing is being read.
 * @param props.empty Whether nothing is listed.
 * @returns The skeleton, or nothing.
 */
function ListingSkeleton(props: {
	readonly loading: boolean;
	readonly empty: boolean;
}): JSX.Element | null {
	if (!props.loading || !props.empty) return null;
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

export { Navigator };

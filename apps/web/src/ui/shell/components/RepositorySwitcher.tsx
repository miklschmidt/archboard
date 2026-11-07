// The repository the focused pane reads, with the pane's letter, and the way to another.
// The list opens as a dropdown under the row, and it stands in the column while the pane has
// nothing else to list. A row opens that repository, and its chevron lists the checkouts of
// this machine. Those can be hundreds, so the field reaches them too.

import { RiArrowDownSLine, RiErrorWarningLine, RiGitRepositoryLine } from "@remixicon/react";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type JSX,
	type KeyboardEvent,
	type Ref,
} from "react";

import type { RepositoryEntry } from "@archboard/workspace/repositories";
import { Badge, cn, Popover, RepositoryName, shownRepository } from "@archboard/ui-kit/components";
import { MarkerLamp } from "#ui/shell/components/ActivityLamp.tsx";
import { PaneChips } from "#ui/shell/components/PaneChips.tsx";
import { PaneLetter } from "#ui/shell/components/PaneControls.tsx";
import { Tree } from "#ui/shell/components/Tree.tsx";
import { foldQuery } from "#ui/shell/rules/text-match.ts";
import {
	repositoryRows,
	type CheckoutChoice,
	type PaneMark,
	type RepositoryChoice,
	type RepositoryRow,
} from "#ui/shell/rules/repository-choices.ts";
import type { ShellRepository } from "#ui/shell/rules/contracts.ts";

/** What a repository's row says while it holds no model. */
const STATE_WORDS: Readonly<Record<Exclude<RepositoryEntry["state"], "ready">, string>> = {
	"no-vault": "no vault",
	gone: "checkout gone",
	unchosen: "no checkout chosen",
};

/**
 * What a repository's facts say: why it holds no model, or how many checkouts it has.
 * @param shell The repository.
 * @returns The words, or nothing.
 */
function repositoryFacts(shell: ShellRepository): string | null {
	if (shell.repository.state !== "ready") return STATE_WORDS[shell.repository.state];
	if (shell.migrationRequired === true) return "migration required";
	if (shell.model === undefined) return shell.loading ? "…" : "no model";
	return shell.repository.checkouts.length > 1 ? String(shell.repository.checkouts.length) : null;
}

/**
 * What a repository's row shows at its end: the number of its checkouts on a count, and any other
 * fact in words.
 * @param props The repository.
 * @param props.shell The repository.
 * @returns The fact, or nothing.
 */
function RepositoryFact(props: { readonly shell: ShellRepository }): JSX.Element | null {
	const fact = repositoryFacts(props.shell);
	if (fact === null) return null;
	if (!/^\d+$/.test(fact)) return <>{fact}</>;
	return (
		<Badge variant="count" size="technical" title="Checkouts on this machine">
			{fact}
		</Badge>
	);
}

/**
 * Keep the row a person is typing towards: the name that ends the path is what tells two
 * checkouts apart.
 * @param root The checkout's root.
 * @returns The last two steps of the path.
 */
function checkoutName(root: string): string {
	return root.split("/").filter(Boolean).slice(-2).join("/");
}

/**
 * Why a checkout cannot be chosen.
 * @param checkout The checkout.
 * @returns The words, or null for a checkout that can.
 */
function checkoutNote(checkout: RepositoryEntry["checkouts"][number]): string | null {
	if (!checkout.exists) return "gone";
	return checkout.hasVault ? null : "no vault";
}

/** Inputs for the switcher. */
interface RepositorySwitcherProps {
	/** Every pane, by its letter. */
	readonly panes: readonly PaneMark[];
	/** Whether the list is on screen. */
	readonly open: boolean;
	readonly ref?: Ref<HTMLButtonElement>;
}

/**
 * What the row says about the focused pane.
 * @param panes Every pane.
 * @returns Its repository, and its letter while there is another pane to tell it from.
 */
function focusedLine(panes: readonly PaneMark[]) {
	const focused = panes.find((pane) => pane.active);
	return {
		name: focused?.repository ?? null,
		letter: panes.length > 1 ? (focused?.letter ?? null) : null,
	};
}

/**
 * The repository, as the row names it.
 * @param props The repository's identity.
 * @param props.name The identity, or null for a pane in no repository.
 * @returns The name.
 */
function SwitcherName(props: { readonly name: string | null }): JSX.Element {
	const shown = props.name === null ? null : shownRepository(props.name);
	return (
		<>
			{shown?.onGitHub === true && (
				<RepositoryName.GitHubMark
					aria-hidden="true"
					className="text-muted-foreground size-3.5 shrink-0"
				/>
			)}
			<span className="min-w-0 flex-1 truncate">{shown?.name ?? "Choose a repository"}</span>
		</>
	);
}

/**
 * The row that names the focused pane's repository and opens the list.
 * @param props The panes, and whether the list is open.
 * @returns The row.
 */
function RepositorySwitcher(props: RepositorySwitcherProps): JSX.Element {
	const { open, ref } = props;
	const { name, letter } = focusedLine(props.panes);
	return (
		<Popover.Trigger
			ref={ref}
			data-slot="repository-switcher"
			title={name ?? undefined}
			className="border-input bg-card shadow-raised hover:bg-secondary aria-expanded:bg-secondary aria-expanded:shadow-pressed active:shadow-pressed focus-visible:ring-ring rounded-control text-control m-2 flex h-8 shrink-0 items-center gap-2 border px-2.5 text-left font-medium outline-none focus-visible:ring-2"
		>
			{letter !== null && <PaneLetter letter={letter} active />}
			<SwitcherName name={name} />
			<RiArrowDownSLine
				aria-hidden="true"
				className={cn(
					"text-muted-foreground size-4 shrink-0 transition-transform motion-reduce:transition-none",
					open && "rotate-180",
				)}
			/>
		</Popover.Trigger>
	);
}

/** Inputs for the list. */
interface RepositoryChooserProps {
	readonly repositories: readonly ShellRepository[];
	readonly panes: readonly PaneMark[];
	readonly className?: string | undefined;
	/** Whether the person asked for the list, so the field takes the keys. */
	readonly asked: boolean;
	readonly onOpen: (shell: ShellRepository, beside: boolean) => void;
	readonly onChooseCheckout: (repository: string, root: string) => void;
	/** Leave the list without choosing. */
	readonly onLeave: () => void;
}

/**
 * The field and the list of repositories with their checkouts.
 * @param props The repositories, the panes and what a choice does.
 * @returns The list.
 */
function RepositoryChooser(props: RepositoryChooserProps): JSX.Element {
	const { repositories, panes, asked, onOpen, onChooseCheckout, onLeave } = props;
	const [query, setQuery] = useState("");
	const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
	const input = useRef<HTMLInputElement>(null);
	const list = useRef<HTMLDivElement>(null);
	const listId = useId();
	const folded = foldQuery(query);
	useEffect(() => {
		if (asked) input.current?.focus();
	}, [asked]);
	const rows = useMemo(
		() => repositoryRows({ repositories, query: folded, panes, opened }),
		[repositories, folded, panes, opened],
	);
	const toggle = useCallback((row: RepositoryRow): void => {
		if (row.kind !== "repository") return;
		setOpened((current) => {
			const next = new Set(current);
			if (!next.delete(row.shell.repository.name)) next.add(row.shell.repository.name);
			return next;
		});
	}, []);
	const choose = useCallback(
		(row: RepositoryRow, beside: boolean): void => {
			if (row.kind === "repository") onOpen(row.shell, beside);
			else if (checkoutNote(row.checkout) === null && !row.checkout.chosen)
				onChooseCheckout(row.repository, row.checkout.root);
		},
		[onOpen, onChooseCheckout],
	);
	const change = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
		setQuery(event.target.value);
	}, []);
	const chooseFirst = useCallback(
		(beside: boolean): void => {
			const [first] = rows;
			if (first !== undefined) choose(first, beside);
		},
		[rows, choose],
	);
	const backOut = useCallback((): void => {
		if (query === "") onLeave();
		else setQuery("");
	}, [query, onLeave]);
	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>): void => {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				list.current?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')?.focus();
			} else if (event.key === "Enter") {
				chooseFirst(event.altKey);
			} else if (event.key === "Escape") {
				event.stopPropagation();
				backOut();
			}
		},
		[chooseFirst, backOut],
	);
	const typeAhead = useCallback((text: string): void => {
		setQuery((current) => current + text);
		input.current?.focus();
	}, []);
	return (
		<div
			data-slot="repository-chooser"
			className={cn("min-h-0 flex-1 flex-col gap-2 px-2 pb-2", props.className)}
		>
			<input
				ref={input}
				type="search"
				value={query}
				onChange={change}
				onKeyDown={onKeyDown}
				placeholder="Find a repository or checkout"
				aria-label="Find a repository or checkout"
				aria-controls={listId}
				spellCheck={false}
				autoComplete="off"
				className="text-control placeholder:text-muted-foreground border-input bg-tray-sink shadow-well focus-visible:border-ring rounded-control h-8 w-full shrink-0 border px-2.5 outline-none [&::-webkit-search-cancel-button]:hidden"
			/>
			<div className="column-well flex-1">
				<div ref={list} id={listId} className="min-h-0 flex-1 overflow-y-auto">
					{query !== "" && rows.length === 0 && (
						<p className="text-body text-muted-foreground px-4 py-3">Nothing matches “{query}”.</p>
					)}
					<Tree
						label="Repositories"
						rows={rows}
						home={rows.find((row) => row.kind === "repository" && row.selected)?.id ?? null}
						onOpen={choose}
						onToggle={toggle}
						onTypeAhead={typeAhead}
						onLeave={onLeave}
					>
						{rows.map((row) =>
							row.kind === "repository" ? (
								<RepositoryLine key={row.id} row={row} onOpen={choose} onToggle={toggle} />
							) : (
								<CheckoutLine key={row.id} row={row} onOpen={choose} />
							),
						)}
					</Tree>
				</div>
			</div>
		</div>
	);
}

/**
 * What is said of a repository to assistive technology.
 * @param row The row.
 * @returns The label.
 */
function repositoryLabel(row: RepositoryChoice): string {
	const { shell } = row;
	return [shell.repository.name, "repository", repositoryFacts(shell), shell.error]
		.filter(Boolean)
		.join(", ");
}

/**
 * Mark the row of what agents are doing in a repository.
 * @param shell The repository.
 * @returns Active claims, a recent write, or no activity.
 */
function activityOf(shell: ShellRepository): "claimed" | "wrote" | null {
	const entries = Object.values(shell.activity);
	if (entries.length === 0) return null;
	return entries.some((entry) => entry.claims.length > 0) ? "claimed" : "wrote";
}

/**
 * One repository.
 * @param props The row and what it does.
 * @param props.row The row.
 * @param props.onOpen Open its model.
 * @param props.onToggle Fold its checkouts.
 * @returns The row.
 */
function RepositoryLine(props: {
	readonly row: RepositoryChoice;
	readonly onOpen: (row: RepositoryRow, beside: boolean) => void;
	readonly onToggle: (row: RepositoryRow) => void;
}): JSX.Element {
	const { row, onOpen, onToggle } = props;
	const { shell } = row;
	const shown = shownRepository(shell.repository.name);
	const open = useCallback((beside: boolean) => onOpen(row, beside), [onOpen, row]);
	const fold = useCallback(() => onToggle(row), [onToggle, row]);
	const activity = activityOf(shell);
	return (
		<Tree.Row
			id={row.id}
			depth={0}
			selected={row.selected}
			expanded={row.branch ? row.open : undefined}
			label={repositoryLabel(row)}
			disabled={shell.repository.state !== "ready"}
			onOpen={open}
			onToggle={fold}
		>
			<Tree.Marker
				icon={shown.onGitHub ? RepositoryName.GitHubMark : RiGitRepositoryLine}
				title={shown.onGitHub ? "GitHub repository" : "Repository"}
			>
				{activity !== null && (
					<MarkerLamp state={activity} title="Activity in this repository" slot="agent-activity" />
				)}
			</Tree.Marker>
			<Tree.Name
				text={shown.name}
				match={row.match}
				title={shell.repository.name}
				className="font-medium"
			/>
			<Tree.Facts>
				<PaneChips letters={row.letters} />
				{shell.error !== null && (
					<span title={shell.error} className="flex">
						<RiErrorWarningLine aria-hidden="true" className="text-destructive size-3.5" />
					</span>
				)}
				<RepositoryFact shell={shell} />
			</Tree.Facts>
		</Tree.Row>
	);
}

/**
 * One checkout of a repository.
 * @param props The row and what it does.
 * @param props.row The row.
 * @param props.onOpen Choose it.
 * @returns The row.
 */
function CheckoutLine(props: {
	readonly row: CheckoutChoice;
	readonly onOpen: (row: RepositoryRow, beside: boolean) => void;
}): JSX.Element {
	const { row, onOpen } = props;
	const { checkout } = row;
	const note = checkoutNote(checkout);
	const open = useCallback((beside: boolean) => onOpen(row, beside), [onOpen, row]);
	return (
		<Tree.Row
			id={row.id}
			depth={1}
			selected={checkout.chosen}
			disabled={note !== null}
			label={`${checkout.root}${checkout.chosen ? ", chosen" : ""}`}
			onOpen={open}
		>
			<Tree.Name
				text={checkoutName(checkout.root)}
				title={checkout.root}
				className="text-technical font-mono"
			/>
			{note !== null && <Tree.Facts>{note}</Tree.Facts>}
		</Tree.Row>
	);
}

export { RepositoryChooser, RepositorySwitcher };

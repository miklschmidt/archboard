import {
	RiErrorWarningLine,
	RiGitRepositoryLine,
	RiMoreLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import {
	memo,
	useCallback,
	useRef,
	useState,
	type JSX,
	type KeyboardEvent,
	type SyntheticEvent,
} from "react";

import type { RepositoryEntry } from "@archboard/workspace/repositories";
import { DropdownMenu, RepositoryName, shownRepository } from "@archboard/ui-kit/components";
import { MarkerLamp } from "#ui/components/shell/ActivityLamp.tsx";
import {
	TreeRow,
	TreeRowFacts,
	TreeRowMarker,
	TreeRowName,
	type RowHandlers,
} from "#ui/components/shell/TreeRow.tsx";
import type { RepositoryRow } from "#ui/rules/shell/navigator-row-types.ts";
import { PaneChips } from "#ui/components/shell/PaneChips.tsx";
import { sameData } from "#ui/rules/shell/same-data.ts";
import { RepositoryModelLink } from "#ui/components/architecture-model/RepositoryModelLink.tsx";

/** What a repository's facts say while it holds no boards to count. */
const STATE_WORDS: Readonly<Record<Exclude<RepositoryEntry["state"], "ready">, string>> = {
	"no-vault": "no vault",
	gone: "checkout gone",
	unchosen: "no checkout chosen",
};

/**
 * What a repository's facts say: why it holds no boards, or how many it holds.
 * @param row The row.
 * @returns The words.
 */
function repositoryFacts(row: RepositoryRow): string {
	if (row.entry.state !== "ready") return STATE_WORDS[row.entry.state];
	if (row.migrationRequired === true) return "migration required";
	if (row.model !== undefined) return "architecture";
	return row.loading ? "…" : "no model";
}

/**
 * Everything a repository's row says, for assistive technology: its name, what
 * it holds or why it holds nothing, and why its boards could not be read.
 * @param row The row.
 * @param facts What its facts say.
 * @returns The label.
 */
function repositoryLabel(row: RepositoryRow, facts: string): string {
	if (row.migrationRequired === true) return `${row.entry.name}, repository, migration required`;
	const holds =
		row.entry.state !== "ready" || row.model !== undefined
			? facts
			: row.loading
				? "reading its architecture"
				: facts;
	return [row.entry.name, "repository", holds, row.error].filter(Boolean).join(", ");
}

/** How a repository's row shows it: its marker, the marker's tooltip, and its name. */
interface RowLook {
	readonly icon: RemixiconComponentType;
	readonly marker: string;
	readonly text: string;
	/** The whole identity on hover, where the row shows less of it. */
	readonly whole: string | undefined;
}

/**
 * How a repository's row shows it: a repository on GitHub by GitHub's mark and
 * its owner and name, any other by the repository mark and its whole name.
 * @param name The repository identity, or an untracked vault's registry name.
 * @returns The marker, its tooltip and the name.
 */
function rowLook(name: string): RowLook {
	const shown = shownRepository(name);
	if (!shown.onGitHub)
		return { icon: RiGitRepositoryLine, marker: "Repository", text: name, whole: undefined };
	return {
		icon: RepositoryName.GitHubMark,
		marker: "GitHub repository",
		text: shown.name,
		whole: name,
	};
}

/**
 * Whether a key asks for a row's menu: Shift+F10 or the context-menu key.
 * @param event The key.
 * @returns True for those keys.
 */
function asksForMenu(event: KeyboardEvent<HTMLElement>): boolean {
	return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

/**
 * A repository's row.
 * @param props The row and the tree's handlers.
 * @returns The row.
 */
function RepositoryLine(props: RowHandlers & { readonly row: RepositoryRow }): JSX.Element {
	const { row, onRowKeyDown, onOpen } = props;
	const open = useCallback((): void => onOpen(row, false), [onOpen, row]);
	const name = row.entry.name;
	const [menuOpen, setMenuOpen] = useState(false);
	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (!asksForMenu(event) || row.entry.checkouts.length === 0) {
				onRowKeyDown(event);
				return;
			}
			event.preventDefault();
			setMenuOpen(true);
		},
		[onRowKeyDown, row.entry.checkouts.length],
	);
	const facts = repositoryFacts(row);
	const hasMenu = row.entry.checkouts.length > 0;
	const look = rowLook(name);
	return (
		<TreeRow
			{...props}
			onRowKeyDown={handleKeyDown}
			label={repositoryLabel(row, facts)}
			hasMenu={hasMenu}
		>
			<TreeRowMarker icon={look.icon} title={look.marker}>
				{row.activity !== null && (
					<MarkerLamp
						state={row.activity}
						title="Activity in this repository"
						slot="agent-activity"
					/>
				)}
			</TreeRowMarker>
			<TreeRowName
				text={look.text}
				match={row.match}
				title={look.whole}
				className="text-nav font-medium"
			/>
			<TreeRowFacts>
				<PaneChips letters={row.onScreen} />
				{row.error !== null && (
					<span title={row.error} className="flex">
						<RiErrorWarningLine aria-hidden="true" className="text-destructive size-3.5" />
					</span>
				)}
				{row.model === undefined ? facts : <RepositoryModelLink model={row.model} onOpen={open} />}
				{hasMenu && (
					<CheckoutMenu
						entry={row.entry}
						open={menuOpen}
						onOpenChange={setMenuOpen}
						onChoose={props.onChooseCheckout}
					/>
				)}
			</TreeRowFacts>
		</TreeRow>
	);
}

/** Inputs for a repository's checkout menu. */
interface CheckoutMenuProps {
	readonly entry: RepositoryEntry;
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly onChoose: (repository: string, root: string) => void;
}

/**
 * Keep an event inside the menu: the row would open or close on its click, and
 * walk the tree on its keys, because the menu, popup included, is the row's
 * React child.
 * @param event The event.
 */
function stayInMenu(event: SyntheticEvent): void {
	event.stopPropagation();
}

/**
 * A repository's known checkouts, the chosen one marked. A checkout that is
 * gone or has no vault is listed and cannot be chosen.
 * @param props The repository, whether the menu is open, and the choice.
 * @returns The menu.
 */
function CheckoutMenu(props: CheckoutMenuProps): JSX.Element {
	const { entry, onChoose } = props;
	const trigger = useRef<HTMLButtonElement>(null);
	const chosen = entry.checkouts.find((checkout) => checkout.chosen)?.root ?? "";
	const choose = useCallback(
		(root: unknown) => {
			if (typeof root === "string" && root !== chosen) onChoose(entry.name, root);
		},
		[onChoose, entry.name, chosen],
	);
	// Focus goes back to the row, the tree's one tab stop, never to the trigger.
	const rowOfTrigger = useCallback(
		(): HTMLElement | null => trigger.current?.closest<HTMLElement>('[role="treeitem"]') ?? null,
		[],
	);
	return (
		<DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
			<DropdownMenu.Trigger
				ref={trigger}
				tabIndex={-1}
				onClick={stayInMenu}
				aria-label={`Checkouts of ${entry.name}`}
				className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-chip flex size-5 items-center justify-center"
			>
				<RiMoreLine className="size-3.5" aria-hidden="true" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				align="end"
				sideOffset={4}
				finalFocus={rowOfTrigger}
				onClick={stayInMenu}
				onKeyDown={stayInMenu}
				className="w-80"
			>
				<DropdownMenu.Group>
					<DropdownMenu.Label>Checkout</DropdownMenu.Label>
					<DropdownMenu.RadioGroup value={chosen} onValueChange={choose}>
						{entry.checkouts.map((checkout) => (
							<DropdownMenu.RadioItem
								key={checkout.root}
								value={checkout.root}
								disabled={!checkout.exists || !checkout.hasVault}
								className="font-mono"
							>
								{/* Worktrees share a long prefix, so a path wraps rather than losing its end. */}
								<span className="min-w-0 flex-1 break-all">{checkout.root}</span>
								{checkoutNote(checkout)}
							</DropdownMenu.RadioItem>
						))}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.Group>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

/**
 * Why a checkout cannot be chosen, or nothing.
 * @param checkout The checkout.
 * @returns The note.
 */
function checkoutNote(checkout: RepositoryEntry["checkouts"][number]): JSX.Element | null {
	const note = !checkout.exists ? "gone" : !checkout.hasVault ? "no vault" : null;
	return note === null ? null : (
		<span className="text-muted-foreground shrink-0 font-sans">{note}</span>
	);
}

const MemoRepositoryLine = memo(RepositoryLine, sameData);

export { MemoRepositoryLine as RepositoryLine };

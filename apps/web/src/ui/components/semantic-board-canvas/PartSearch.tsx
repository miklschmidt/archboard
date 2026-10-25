// The search at the top of a pane's sidebar, level with the navigator's search
// for a board: parts by their names, what they are for and where their code
// is, across every board of the vault. Choosing a result shows its board in
// this pane and picks the part out, so it is explained right under the field,
// and the keyboard goes with it to the selection tab.
//
// It only reads. The boards are read as the pages read them, on the same cache,
// and only once somebody reaches for the field, so a shell nobody searches
// reads nothing extra. The shortcut that reaches the field is heard by the
// sidebar's frame, which shows the sidebar when it is away and asks for the
// field (use-search-request.ts): the field takes focus when it is drawn.

import { useQueries, useQuery } from "@tanstack/react-query";
import { RiSearchLine } from "@remixicon/react";
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
	type MouseEvent,
	type RefObject,
} from "react";

import { addressedVariant } from "@archboard/board/document";
import { cn } from "@archboard/ui-kit/components";
import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";
import { useSearchRequested } from "#ui/hooks/semantic-board-canvas/use-search-request.ts";
import {
	searchShortcutKeys,
	searchShortcutLabel,
} from "#ui/rules/semantic-board-canvas/board/search-shortcut.ts";
import { readBoard } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import {
	semanticBoardDocumentQuery,
	vaultCheckQuery,
} from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";

/** A board the search reads. */
interface SearchedBoard {
	/** The board's name. */
	readonly name: string;
	/** The key a pane opens it by. */
	readonly key: string;
}

/** A part the search found. */
interface PartHit {
	/** The board it is on. */
	readonly board: SearchedBoard;
	/** Its id on that board. */
	readonly id: string;
	readonly name: string;
	readonly kind: string;
	/** Where in the parts the words were found: 0 its name's start, 1 inside its name, 2 elsewhere. */
	readonly rank: number;
}

/** What one board's parts say about themselves, as the search reads them. */
interface IndexedPart {
	readonly board: SearchedBoard;
	readonly id: string;
	readonly name: string;
	readonly kind: string;
	/** What it is for and where its code is, lowercased. */
	readonly rest: string;
}

/** The results the list shows at most. */
const RESULT_LIMIT = 8;

/**
 * The parts of a board's current variant, as the search reads them.
 * @param board The board.
 * @param document What its route answered, or undefined before it has.
 * @returns Its parts, or none for a board that is not read or not readable.
 */
function partsOf(board: SearchedBoard, document: unknown): readonly IndexedPart[] {
	if (document === undefined) {
		return [];
	}
	const reading = readBoard(document);
	if (!reading.ok) {
		return [];
	}
	const opened = addressedVariant(reading.board, undefined);
	if (!opened.ok) {
		return [];
	}
	return opened.variant.content.nodes.map((node) => ({
		board,
		id: node.id,
		name: node.name,
		kind: node.kind,
		rest: [node.responsibility, node.description, node.binding?.path, node.binding?.symbol]
			.filter((said) => said !== undefined)
			.join(" ")
			.toLowerCase(),
	}));
}

/**
 * Where in a part the words are found.
 * @param part The part.
 * @param needle The words, lowercased.
 * @returns 0 for the start of its name, 1 inside it, 2 in what it is for or where its code is, or null when they are nowhere in it.
 */
function rankOf(part: IndexedPart, needle: string): number | null {
	const at = part.name.toLowerCase().indexOf(needle);
	if (at === 0) return 0;
	if (at > 0) return 1;
	return part.rest.includes(needle) ? 2 : null;
}

/**
 * The parts whose name, purpose or code path hold the words typed.
 * @param index Every part of every board read.
 * @param query The words.
 * @returns The best few, the names that start with the words first.
 */
function findParts(index: readonly IndexedPart[], query: string): PartHit[] {
	const needle = query.trim().toLowerCase();
	if (needle === "") {
		return [];
	}
	const hits: PartHit[] = [];
	for (const part of index) {
		const rank = rankOf(part, needle);
		if (rank !== null) {
			hits.push({ board: part.board, id: part.id, name: part.name, kind: part.kind, rank });
		}
	}
	return hits
		.toSorted((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
		.slice(0, RESULT_LIMIT);
}

/** Inputs for the search. */
interface PartSearchProps {
	/** The boards of the vault. */
	readonly boards: readonly SearchedBoard[];
	/**
	 * The person chose a part.
	 * @param hit The part and the board it is on.
	 */
	readonly onChoose: (hit: PartHit) => void;
}

/**
 * Keep the focus in the field while a result is pressed, so the field does not
 * lose it, and the list with it, before the press lands.
 * @param event The press.
 */
function keepFocus(event: MouseEvent): void {
	event.preventDefault();
}

/** Inputs for one result. */
interface ResultProps {
	readonly hit: PartHit;
	/** Its place in the list, which names it for the field that points at it. */
	readonly id: string;
	readonly active: boolean;
	/** What its kind is called, in the vault's words. */
	readonly kind: string;
	readonly onChoose: (hit: PartHit) => void;
}

/**
 * One part found: its name, what it is and the board it is on.
 * @param props The part and what choosing it does.
 * @returns The result.
 */
function Result(props: ResultProps): JSX.Element {
	const { hit, onChoose } = props;
	const choose = useCallback((): void => {
		onChoose(hit);
	}, [onChoose, hit]);
	return (
		// The list is the combobox pattern's listbox, its rows the options: the ARIA
		// Authoring Practices pattern for a field with results, which is neither a
		// select nor a datalist, so the rule that asks for those does not apply.
		// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the ARIA combobox pattern's option
		<div id={props.id} role="option" aria-selected={props.active}>
			<button
				type="button"
				tabIndex={-1}
				data-active={props.active ? "" : undefined}
				onMouseDown={keepFocus}
				onClick={choose}
				className="data-active:bg-sidebar-accent hover:bg-sidebar-accent/50 relative flex w-full flex-col px-4 py-1.5 text-left"
			>
				{props.active && (
					<span
						aria-hidden="true"
						className="bg-primary-mark absolute inset-y-1 left-0 w-0.5 rounded-full"
					/>
				)}
				<span className="text-control truncate" title={hit.name}>
					{hit.name}
				</span>
				<span
					className="text-body text-muted-foreground truncate"
					title={`${props.kind} on ${hit.board.name}`}
				>
					{props.kind} on {hit.board.name}
				</span>
			</button>
		</div>
	);
}

/** Inputs for the list of results. */
interface ResultsProps {
	readonly id: string;
	readonly results: readonly PartHit[];
	readonly active: number;
	readonly kinds: Readonly<Record<string, { readonly name?: string | undefined }>> | undefined;
	readonly onChoose: (hit: PartHit) => void;
}

/**
 * The results under the field, or the word that none match.
 * @param props The results, which is active and what choosing one does.
 * @returns The list.
 */
function Results(props: ResultsProps): JSX.Element {
	const { results, kinds } = props;
	return (
		<div
			id={props.id}
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the ARIA combobox pattern's listbox
			role="listbox"
			aria-label="Matching parts"
			className="bg-popover text-popover-foreground border-border shadow-float absolute top-full right-0 left-0 z-40 max-h-[60vh] overflow-y-auto border-b py-1"
		>
			{results.map((hit, at) => (
				<Result
					key={`${hit.board.key}-${hit.id}`}
					hit={hit}
					id={`${props.id}-${at}`}
					active={at === props.active}
					kind={kinds?.[hit.kind]?.name ?? hit.kind}
					onChoose={props.onChoose}
				/>
			))}
			{results.length === 0 && (
				// The one row of a list with nothing in it, which cannot be chosen.
				<div
					// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the ARIA combobox pattern's option
					role="option"
					aria-disabled="true"
					aria-selected="false"
					className="text-body text-muted-foreground px-4 py-2"
				>
					No part matches.
				</div>
			)}
		</div>
	);
}

/**
 * Take focus when the sidebar's frame says the shortcut was pressed.
 * @param input The field.
 */
function useTakeFocusWhenAsked(input: RefObject<HTMLInputElement | null>): void {
	const { requested, settled } = useSearchRequested();
	useEffect(() => {
		if (!requested) {
			return;
		}
		input.current?.focus();
		input.current?.select();
		settled();
	}, [requested, settled, input]);
}

/**
 * What the boards' routes answered, in the boards' order.
 * @param results Each route's query result.
 * @returns Each answer, or undefined before it came.
 */
function answersOf(results: readonly { readonly data: unknown }[]): unknown[] {
	return results.map((result) => result.data);
}

/**
 * The parts the words typed find on any board, and what the vault calls their
 * kinds. The boards are read once the field has focus, and not before.
 * @param boards The boards to search.
 * @param query The words typed.
 * @param reading Whether to read the boards.
 * @returns The results and the kinds.
 */
function useFoundParts(boards: readonly SearchedBoard[], query: string, reading: boolean) {
	const vault = usePaneVault();
	const kinds = useQuery(vaultCheckQuery(vault)).data?.policy.nodeKinds;
	const answers = useQueries({
		queries: boards.map((board) => ({
			...semanticBoardDocumentQuery(vault, board.name),
			enabled: reading,
		})),
		combine: answersOf,
	});
	const parts = useMemo(
		() => boards.flatMap((board, at) => partsOf(board, answers[at])),
		[boards, answers],
	);
	const results = useMemo(() => findParts(parts, query), [parts, query]);
	return { results, kinds };
}

/**
 * The shortcut as the field says it. The shortcut reaches the field of the pane
 * with focus, so only that pane's field shows it, and not while it is typed in.
 * @param props Whether the field has focus.
 * @param props.typing Whether the field has focus.
 * @returns The key hint.
 */
function ShortcutHint(props: { readonly typing: boolean }): JSX.Element {
	const { active } = usePaneChrome();
	return (
		<kbd
			aria-hidden="true"
			className={cn(
				"text-technical text-muted-foreground border-border bg-card shadow-raised dark:bg-input/30 rounded-control shrink-0 border px-1 font-mono leading-4",
				(props.typing || !active) && "invisible",
			)}
		>
			{searchShortcutLabel()}
		</kbd>
	);
}

/**
 * The search field with its results.
 * @param props The boards to read and what to do with a choice.
 * @returns The field.
 */
function PartSearch(props: PartSearchProps): JSX.Element {
	const { boards, onChoose } = props;
	const input = useRef<HTMLInputElement>(null);
	const listId = useId();
	const [query, setQuery] = useState("");
	const [focused, setFocused] = useState(false);
	const [active, setActive] = useState(0);
	const { results, kinds } = useFoundParts(boards, query, focused);
	const open = focused && query.trim().length > 0;
	// The results can change under a pointed-at row without a new query, as the
	// boards arrive or one changes, so what is pointed at is kept inside the list.
	const last = Math.max(results.length - 1, 0);
	const pointed = Math.min(active, last);
	useTakeFocusWhenAsked(input);
	const { chosen } = useSearchRequested();
	const choose = useCallback(
		(hit: PartHit | undefined): void => {
			if (hit === undefined) {
				return;
			}
			// The keyboard goes first, to the tab that explains the part, so that the
			// list closing under it leaves nothing on the page's body.
			chosen();
			onChoose(hit);
			setQuery("");
		},
		[chosen, onChoose],
	);
	const change = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
		setQuery(event.target.value);
		setActive(0);
	}, []);
	const focus = useCallback((): void => {
		setFocused(true);
	}, []);
	const blur = useCallback((): void => {
		setFocused(false);
	}, []);
	// The first Escape lets go of what was typed. The next leaves the field, and
	// reaches the sidebar around it, which puts away a panel that is laid over the picture.
	const onEscape = useCallback(
		(event: KeyboardEvent<HTMLInputElement>): void => {
			if (query === "") {
				input.current?.blur();
				return;
			}
			event.stopPropagation();
			setQuery("");
		},
		[query],
	);
	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>): void => {
			if (event.key === "Escape") {
				onEscape(event);
			} else if (event.key === "ArrowDown") {
				event.preventDefault();
				setActive(Math.min(pointed + 1, last));
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setActive(Math.max(pointed - 1, 0));
			} else if (event.key === "Enter") {
				choose(results[pointed]);
			}
		},
		[pointed, last, choose, onEscape, results],
	);
	return (
		<div
			data-slot="part-search"
			className="border-border h-band relative flex shrink-0 items-center gap-2 border-b pr-3 pl-4"
		>
			<RiSearchLine aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
			<input
				ref={input}
				value={query}
				placeholder="Find a part"
				aria-label="Find a part on any board"
				aria-keyshortcuts={searchShortcutKeys()}
				role="combobox"
				aria-expanded={open}
				aria-controls={open ? listId : undefined}
				aria-activedescendant={open && results.length > 0 ? `${listId}-${pointed}` : undefined}
				aria-autocomplete="list"
				autoComplete="off"
				spellCheck={false}
				onChange={change}
				onFocus={focus}
				onBlur={blur}
				onKeyDown={onKeyDown}
				className="text-control placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent font-normal outline-none"
			/>
			<ShortcutHint typing={focused} />
			{open && (
				<Results id={listId} results={results} active={pointed} kinds={kinds} onChoose={choose} />
			)}
		</div>
	);
}

export { PartSearch, type PartHit, type PartSearchProps, type SearchedBoard };

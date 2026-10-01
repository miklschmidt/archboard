// The search at the top of the shell: parts by their names, what they are for
// and where their code is, across every board of the vault. Choosing a result
// opens its board and picks the part out.
//
// It only reads. The boards are read as the pages read them, on the same cache,
// and only once somebody reaches for the field, so a shell nobody searches
// reads nothing extra.

import { useQueries, useQuery } from "@tanstack/react-query";
import { RiSearchLine } from "@remixicon/react";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type JSX,
	type KeyboardEvent,
} from "react";

import { addressedVariant } from "@/shared/semantic-board/index";
import { cn } from "@/ui/components/class-names";
import { readBoard } from "@/ui/semantic-board-canvas/lib/board-document";
import {
	semanticBoardDocumentQuery,
	vaultCheckQuery,
} from "@/ui/semantic-board-canvas/lib/queries";

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
		rest: `${node.responsibility ?? ""} ${node.description ?? ""} ${node.binding?.path ?? ""}`.toLowerCase(),
	}));
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
		const at = part.name.toLowerCase().indexOf(needle);
		if (at < 0 && !part.rest.includes(needle)) {
			continue;
		}
		hits.push({
			board: part.board,
			id: part.id,
			name: part.name,
			kind: part.kind,
			rank: at === 0 ? 0 : at > 0 ? 1 : 2,
		});
	}
	return hits
		.toSorted((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
		.slice(0, RESULT_LIMIT);
}

/** Whether a key event asks for the search: Ctrl or Command, Shift and F. */
function asksForSearch(event: globalThis.KeyboardEvent): boolean {
	return (
		(event.ctrlKey || event.metaKey) &&
		event.shiftKey &&
		!event.altKey &&
		event.key.toLowerCase() === "f"
	);
}

/** The shortcut as the field says it. */
const SHORTCUT = "Ctrl ⇧ F";

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
	const kinds = useQuery(vaultCheckQuery()).data?.policy.nodeKinds;
	const index = useQueries({
		queries: boards.map((board) => ({
			...semanticBoardDocumentQuery(board.name),
			enabled: focused,
		})),
		combine: (results) => results.map((result) => result.data),
	});
	const parts = useMemo(
		() => boards.flatMap((board, at) => partsOf(board, index[at])),
		[boards, index],
	);
	const results = useMemo(() => findParts(parts, query), [parts, query]);
	const open = focused && query.trim().length > 0;

	useEffect(() => {
		const onKey = (event: globalThis.KeyboardEvent): void => {
			if (document.fullscreenElement !== null || !asksForSearch(event)) {
				return;
			}
			event.preventDefault();
			input.current?.focus();
			input.current?.select();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const choose = useCallback(
		(hit: PartHit | undefined): void => {
			if (hit === undefined) {
				return;
			}
			onChoose(hit);
			setQuery("");
			input.current?.blur();
		},
		[onChoose],
	);
	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>): void => {
			if (event.key === "Escape") {
				event.stopPropagation();
				setQuery("");
				input.current?.blur();
			} else if (event.key === "ArrowDown") {
				event.preventDefault();
				setActive((at) => Math.min(at + 1, results.length - 1));
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setActive((at) => Math.max(at - 1, 0));
			} else if (event.key === "Enter") {
				choose(results[active]);
			}
		},
		[active, choose, results],
	);

	return (
		<div
			data-slot="part-search"
			className={cn(
				"bg-background border-input relative flex h-8 w-full max-w-[26rem] min-w-0 items-center gap-2 rounded-[4px] border px-2.5",
				focused && "border-ring ring-ring ring-1",
			)}
		>
			<RiSearchLine aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
			<input
				ref={input}
				value={query}
				placeholder="Search parts, purposes, or code…"
				aria-label="Search the parts of every board"
				aria-keyshortcuts="Control+Shift+F"
				role="combobox"
				aria-expanded={open}
				aria-controls={listId}
				aria-autocomplete="list"
				autoComplete="off"
				spellCheck={false}
				onChange={(event) => {
					setQuery(event.target.value);
					setActive(0);
				}}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				onKeyDown={onKeyDown}
				className="text-control placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent outline-none"
			/>
			<kbd
				aria-hidden="true"
				className="text-technical text-muted-foreground bg-muted shrink-0 rounded-[2px] px-1.5 py-px font-mono"
			>
				{SHORTCUT}
			</kbd>
			{open && (
				<ul
					id={listId}
					role="listbox"
					aria-label="Matching parts"
					className="bg-popover text-popover-foreground border-border absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-[4px] border py-1 shadow-md"
				>
					{results.map((hit, at) => (
						<li key={`${hit.board.key}-${hit.id}`} role="option" aria-selected={at === active}>
							<button
								type="button"
								data-active={at === active ? "" : undefined}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => choose(hit)}
								className="data-active:bg-sidebar-accent hover:bg-sidebar-accent/60 flex w-full flex-col px-3 py-1.5 text-left"
							>
								<span className="text-control truncate font-medium">{hit.name}</span>
								<span className="text-technical text-muted-foreground truncate">
									{kinds?.[hit.kind]?.name ?? hit.kind} on {hit.board.name}
								</span>
							</button>
						</li>
					))}
					{results.length === 0 && (
						<li className="text-body text-muted-foreground px-3 py-2">No part matches.</li>
					)}
				</ul>
			)}
		</div>
	);
}

export { PartSearch, type PartHit, type PartSearchProps, type SearchedBoard };

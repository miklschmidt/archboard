import { RiSearchLine } from "@remixicon/react";
import {
	useCallback,
	useId,
	useMemo,
	useState,
	type ChangeEvent,
	type JSX,
	type KeyboardEvent,
	type MouseEvent,
	type RefObject,
} from "react";

import { usesCommandKey } from "@archboard/ui-kit/components";
import { useFindShortcut } from "#ui/hooks/shell/use-find-shortcut.ts";
import { findInModel, type FindHit, type FindKind } from "#ui/rules/architecture-model/search.ts";
import { FACTS_INSET, markerX, MARKER_WIDTH, NAME_GAP } from "#ui/rules/shell/tree-grid.ts";

/** The field's icon in the marker column, and its text the grid's gap after it. */
const FIND_STYLE = { paddingLeft: markerX(0), paddingRight: FACTS_INSET, gap: NAME_GAP } as const;
const ICON_STYLE = { width: MARKER_WIDTH } as const;

/** What a hit is called, for a hit that is not a module. */
const KIND_WORDS: Readonly<Record<FindKind, string | null>> = {
	module: null,
	flow: "Flow",
	walkthrough: "Walkthrough",
	bookmark: "Bookmark",
	address: "Former address",
};

/** Inputs for Find. */
interface ModelFindProps {
	/** The complete selected architecture, including hidden descendants. */
	readonly model: Parameters<typeof findInModel>[0];
	readonly input: RefObject<HTMLInputElement | null>;
	readonly query: string;
	readonly onQuery: (query: string) => void;
	/**
	 * The person chose a hit.
	 * @param hit What they chose.
	 * @param beside Whether it opens in the other pane.
	 */
	readonly onChoose: (hit: FindHit, beside: boolean) => void;
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
	readonly hit: FindHit;
	/** Its place in the list, which names it for the field that points at it. */
	readonly id: string;
	readonly active: boolean;
	readonly onChoose: (hit: FindHit, beside: boolean) => void;
}

/**
 * One thing found: its name, and where it is or what it is.
 * @param props The hit and what choosing it does.
 * @returns The result.
 */
function Result(props: ResultProps): JSX.Element {
	const { hit, onChoose } = props;
	const choose = useCallback(
		(event: MouseEvent): void => {
			onChoose(hit, event.altKey);
		},
		[onChoose, hit],
	);
	const detail = [KIND_WORDS[hit.kind], hit.detail].filter(Boolean).join(" · ");
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
				data-find-kind={hit.kind}
				data-find-id={hit.id}
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
				{detail !== "" && (
					<span className="text-body text-muted-foreground truncate" title={detail}>
						{detail}
					</span>
				)}
			</button>
		</div>
	);
}

/** Inputs for the list of results. */
interface ResultsProps {
	readonly id: string;
	readonly results: readonly FindHit[];
	readonly active: number;
	readonly onChoose: (hit: FindHit, beside: boolean) => void;
}

/**
 * The results under the field, or the word that none match.
 * @param props The results, which is active and what choosing one does.
 * @returns The list.
 */
function Results(props: ResultsProps): JSX.Element {
	const { results } = props;
	return (
		<div
			id={props.id}
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the ARIA combobox pattern's listbox
			role="listbox"
			aria-label="Found in this architecture"
			className="bg-popover text-popover-foreground border-border shadow-float absolute top-full right-0 left-0 z-40 max-h-[60vh] overflow-y-auto border-b py-1"
		>
			{results.map((hit, at) => (
				<Result
					key={`${hit.kind}:${hit.id}`}
					hit={hit}
					id={`${props.id}-${at}`}
					active={at === props.active}
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
					Nothing matches.
				</div>
			)}
		</div>
	);
}

/**
 * The row a walking key points at.
 * @param key The key.
 * @param pointed The row pointed at.
 * @param last The last row.
 * @returns The row, or null for a key that does not walk.
 */
function walkedTo(key: string, pointed: number, last: number): number | null {
	if (key === "ArrowDown") return Math.min(pointed + 1, last);
	return key === "ArrowUp" ? Math.max(pointed - 1, 0) : null;
}

/**
 * The result the field points at.
 * @param list The id of the list, while it is drawn.
 * @param results The results.
 * @param pointed Where the field points.
 * @returns The id of the row, or undefined with no row to point at.
 */
function pointedRow(
	list: string | undefined,
	results: readonly FindHit[],
	pointed: number,
): string | undefined {
	return list === undefined || results.length === 0 ? undefined : `${list}-${pointed}`;
}

/**
 * The shortcut that brings the field up, while it is not in use.
 * @returns The hint.
 */
function FindHint(): JSX.Element {
	return (
		<kbd className="text-technical text-muted-foreground border-border bg-card shadow-raised dark:bg-input/30 rounded-control shrink-0 border px-1 font-mono leading-4">
			{usesCommandKey() ? "⌘K" : "Ctrl K"}
		</kbd>
	);
}

/**
 * The field that finds anything a reading can open, with its results.
 * @param props The architecture and what a choice does.
 * @returns The field.
 */
function ModelFind(props: ModelFindProps): JSX.Element {
	const { model, input, query, onQuery, onChoose } = props;
	useFindShortcut(input);
	const listId = useId();
	const [focused, setFocused] = useState(false);
	const [active, setActive] = useState(0);
	const results = useMemo(() => findInModel(model, query), [model, query]);
	const open = focused && query.trim().length > 0;
	// The results can change under a pointed-at row without a new query, as the
	// architecture changes, so what is pointed at is kept inside the list.
	const last = Math.max(results.length - 1, 0);
	const pointed = Math.min(active, last);
	const choose = useCallback(
		(hit: FindHit | undefined, beside: boolean): void => {
			if (hit === undefined) return;
			onQuery("");
			input.current?.blur();
			onChoose(hit, beside);
		},
		[input, onQuery, onChoose],
	);
	const change = useCallback(
		(event: ChangeEvent<HTMLInputElement>): void => {
			onQuery(event.target.value);
			setActive(0);
		},
		[onQuery],
	);
	const focus = useCallback((): void => {
		setFocused(true);
	}, []);
	const blur = useCallback((): void => {
		setFocused(false);
	}, []);
	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>): void => {
			const walked = walkedTo(event.key, pointed, last);
			if (walked !== null) {
				event.preventDefault();
				setActive(walked);
			} else if (event.key === "Enter") {
				choose(results[pointed], event.altKey);
			} else if (event.key === "Escape") {
				if (query === "") input.current?.blur();
				onQuery("");
			}
		},
		[pointed, last, choose, query, onQuery, input, results],
	);
	const list = open ? listId : undefined;
	return (
		<div
			data-slot="model-find"
			style={FIND_STYLE}
			className="border-border h-band relative flex shrink-0 items-center border-b"
		>
			<span style={ICON_STYLE} className="flex shrink-0 justify-center">
				<RiSearchLine aria-hidden="true" className="text-muted-foreground size-3.5" />
			</span>
			<input
				ref={input}
				value={query}
				placeholder="Find"
				aria-label="Find in this architecture"
				aria-keyshortcuts="Control+K Meta+K /"
				role="combobox"
				aria-expanded={open}
				aria-controls={list}
				aria-activedescendant={pointedRow(list, results, pointed)}
				aria-autocomplete="list"
				autoComplete="off"
				spellCheck={false}
				onChange={change}
				onFocus={focus}
				onBlur={blur}
				onKeyDown={onKeyDown}
				className="text-control placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent font-normal outline-none"
			/>
			{!focused && <FindHint />}
			{open && <Results id={listId} results={results} active={pointed} onChoose={choose} />}
		</div>
	);
}

export { ModelFind };

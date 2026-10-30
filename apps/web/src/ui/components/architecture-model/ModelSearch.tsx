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
} from "react";

import type { Model } from "@archboard/board/content";
import { findModules } from "#ui/rules/architecture-model/search.ts";
import { cn } from "@archboard/ui-kit/components";
import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";
import { useSearchRequested } from "#ui/hooks/semantic-board-canvas/use-search-request.ts";
import {
	searchShortcutKeys,
	searchShortcutLabel,
} from "#ui/rules/semantic-board-canvas/board/search-shortcut.ts";
type PartHit = ReturnType<typeof findModules>[number];

/** Inputs for the search. */
interface ModelSearchProps {
	/** The complete selected architecture, including hidden descendants. */
	readonly model: Pick<Model, "manifest" | "modules" | "policy">;
	/**
	 * The person chose a part.
	 * @param id The canonical module identity.
	 */
	readonly onChoose: (id: string) => void;
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
 * One module found: its name, kind, and containing scope.
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
					title={`${props.kind} in ${hit.scope}`}
				>
					{props.kind} in {hit.scope}
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
			aria-label="Matching modules"
			className="bg-popover text-popover-foreground border-border shadow-float absolute top-full right-0 left-0 z-40 max-h-[60vh] overflow-y-auto border-b py-1"
		>
			{results.map((hit, at) => (
				<Result
					key={hit.id}
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
					No module matches.
				</div>
			)}
		</div>
	);
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
 * @param props The architecture and the module selection action.
 * @returns The field.
 */
function ModelSearch(props: ModelSearchProps): JSX.Element {
	const { model, onChoose } = props;
	const input = useRef<HTMLInputElement>(null);
	const listId = useId();
	const [query, setQuery] = useState("");
	const [focused, setFocused] = useState(false);
	const [active, setActive] = useState(0);
	const results = useMemo(() => findModules(model, query), [model, query]);
	const kinds = model.policy.nodeKinds;
	const open = focused && query.trim().length > 0;
	// The results can change under a pointed-at row without a new query, as the
	// architecture changes, so what is pointed at is kept inside the list.
	const last = Math.max(results.length - 1, 0);
	const pointed = Math.min(active, last);
	const { requested, settled, chosen } = useSearchRequested();
	useEffect(() => {
		if (!requested) return;
		input.current?.focus();
		input.current?.select();
		settled();
	}, [requested, settled]);
	const choose = useCallback(
		(hit: PartHit | undefined): void => {
			if (hit === undefined) {
				return;
			}
			// The keyboard goes first, to the tab that explains the part, so that the
			// list closing under it leaves nothing on the page's body.
			chosen();
			onChoose(hit.id);
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
				placeholder="Find a module"
				aria-label="Find a module in this architecture"
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

export { ModelSearch };

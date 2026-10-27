// The navigator's filter: one field at the top of the column, under the
// brand bar, that narrows the tree in place as a person types. While it holds
// text it says how many boards it found; Enter opens the first, Alt+Enter
// opens it beside, the down arrow walks into the tree, Escape clears. Its icon
// sits in the tree's marker column and its text starts where the names of the
// top rows start.

import { RiCloseLine, RiSearchLine } from "@remixicon/react";
import { useCallback, type ChangeEvent, type JSX, type KeyboardEvent, type RefObject } from "react";

import { usesCommandKey } from "@archboard/ui-kit/components";
import { FACTS_INSET, MARKER_WIDTH, markerX, NAME_GAP } from "#ui/rules/shell/tree-grid.ts";

/**
 * The field's icon in the marker column of the top rows, its text the grid's
 * gap after it, and its facts on the tree's right edge.
 */
const FILTER_STYLE = { paddingLeft: markerX(0), paddingRight: FACTS_INSET, gap: NAME_GAP } as const;

/** The icon's column, as wide as the tree's marker column. */
const ICON_STYLE = { width: MARKER_WIDTH } as const;

/** Inputs for the filter. */
interface NavigatorFilterProps {
	readonly input: RefObject<HTMLInputElement | null>;
	readonly query: string;
	readonly onQuery: (query: string) => void;
	/** How many boards the filter found, and how many the vault lists. */
	readonly count: { readonly found: number; readonly total: number };
	/** Open the first thing the filter found, in the active pane or beside it. */
	readonly onOpenFirst: (beside: boolean) => void;
	/** Move into the tree. */
	readonly onEnterTree: () => void;
}

/** What a key in the filter asks for. */
type FilterIntent = "open" | "openBeside" | "enterTree" | "clear" | "leave";

/**
 * What a key in the filter asks for.
 * @param key The key.
 * @param altKey Whether Alt was held.
 * @param query What the filter holds.
 * @returns The intent, or null for a key the field keeps.
 */
function filterIntent(key: string, altKey: boolean, query: string): FilterIntent | null {
	const intents: Readonly<Record<string, FilterIntent | null>> = {
		ArrowDown: "enterTree",
		Escape: query === "" ? "leave" : "clear",
		Enter: query.trim() === "" ? null : altKey ? "openBeside" : "open",
	};
	return intents[key] ?? null;
}

/**
 * Do what a key in the filter asked for.
 * @param intent The intent.
 * @param moves What the filter can do.
 */
function carryOut(
	intent: FilterIntent,
	moves: Pick<NavigatorFilterProps, "onOpenFirst" | "onEnterTree" | "onQuery" | "input">,
): void {
	if (intent === "open" || intent === "openBeside") moves.onOpenFirst(intent === "openBeside");
	else if (intent === "enterTree") moves.onEnterTree();
	else if (intent === "clear") moves.onQuery("");
	else moves.input.current?.blur();
}

/**
 * The navigator's filter.
 * @param props The field, the query, the count and the handlers.
 * @returns The filter row.
 */
function NavigatorFilter(props: NavigatorFilterProps): JSX.Element {
	const { input, query, onQuery, onOpenFirst, onEnterTree } = props;
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => onQuery(event.target.value),
		[onQuery],
	);
	const handleClear = useCallback(() => {
		onQuery("");
		input.current?.focus();
	}, [onQuery, input]);
	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			const intent = filterIntent(event.key, event.altKey, query);
			if (intent === null) return;
			event.preventDefault();
			carryOut(intent, { onOpenFirst, onEnterTree, onQuery, input });
		},
		[query, onQuery, onOpenFirst, onEnterTree, input],
	);
	const filtering = query.trim() !== "";
	return (
		<div style={FILTER_STYLE} className="border-border h-band flex shrink-0 items-center border-b">
			<span style={ICON_STYLE} className="flex shrink-0 justify-center">
				<RiSearchLine className="text-muted-foreground size-3.5" aria-hidden="true" />
			</span>
			<input
				ref={input}
				type="search"
				value={query}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				placeholder="Find a repository"
				aria-label="Find a repository"
				spellCheck={false}
				autoComplete="off"
				className="text-control placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent outline-none [&::-webkit-search-cancel-button]:hidden"
			/>
			{filtering ? (
				<>
					<output
						aria-live="polite"
						className="text-technical text-muted-foreground shrink-0 font-mono"
					>
						{props.count.found}/{props.count.total}
					</output>
					<button
						type="button"
						aria-label="Clear the filter"
						onClick={handleClear}
						className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-control flex size-6 shrink-0 items-center justify-center"
					>
						<RiCloseLine className="size-3.5" aria-hidden="true" />
					</button>
				</>
			) : (
				<kbd className="text-technical text-muted-foreground border-border bg-card shadow-raised dark:bg-input/30 rounded-control shrink-0 border px-1 font-mono leading-4">
					{usesCommandKey() ? "⌘K" : "Ctrl K"}
				</kbd>
			)}
		</div>
	);
}

export { NavigatorFilter, type NavigatorFilterProps };

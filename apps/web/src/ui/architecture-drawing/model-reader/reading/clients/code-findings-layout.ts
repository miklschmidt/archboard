// How the code findings of Measures are laid out: each as a card beside its code, or as a list
// beside the code of the one chosen (TASK-590.14).
//
// The choice is presentation, owned by this browser like the theme, remembered in its storage and
// never written anywhere else (ADR 0023). A page that cannot reach its storage keeps the cards.

/** How the findings are laid out. */
type CodeFindingsLayout = "cards" | "list";

/** Where the choice is remembered. */
const CODE_FINDINGS_LAYOUT_KEY = "archboard.code-findings-layout";

/** What the switch offers. */
const CODE_FINDINGS_LAYOUTS: readonly {
	readonly value: CodeFindingsLayout;
	readonly label: string;
}[] = [
	{ value: "cards", label: "Cards" },
	{ value: "list", label: "List" },
];

/**
 * The choice this browser remembers, or the cards.
 * @returns The layout.
 */
function remembered(): CodeFindingsLayout {
	try {
		return globalThis.localStorage.getItem(CODE_FINDINGS_LAYOUT_KEY) === "list" ? "list" : "cards";
	} catch {
		return "cards";
	}
}

let current: CodeFindingsLayout | undefined;
const listeners = new Set<() => void>();

/**
 * The layout now.
 * @returns The layout.
 */
function codeFindingsLayoutNow(): CodeFindingsLayout {
	current ??= remembered();
	return current;
}

/**
 * Change the layout from now on, and remember it.
 * @param layout The layout.
 */
function chooseCodeFindingsLayout(layout: CodeFindingsLayout): void {
	if (layout === codeFindingsLayoutNow()) return;
	current = layout;
	try {
		globalThis.localStorage.setItem(CODE_FINDINGS_LAYOUT_KEY, layout);
	} catch {
		// Storage can be unavailable; the choice still holds for this page.
	}
	for (const listener of listeners) listener();
}

/**
 * Be told when the layout changes.
 * @param listener Called after each change.
 * @returns Stops telling.
 */
function onCodeFindingsLayoutChange(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export {
	CODE_FINDINGS_LAYOUTS,
	CODE_FINDINGS_LAYOUT_KEY,
	chooseCodeFindingsLayout,
	codeFindingsLayoutNow,
	onCodeFindingsLayoutChange,
	type CodeFindingsLayout,
};

// What a browser owner reads from the part search in a pane's sidebar.

/** What the part search in the pane's sidebar is doing. */
interface PartSearchState {
	/** Whether the field has focus. */
	readonly focused: boolean;
	/** What is typed in it. */
	readonly value: string;
	/** Whether a list of results is open under it. */
	readonly listed: boolean;
	/** What the field says it controls: the list drawn, nothing that is drawn, or nothing at all. */
	readonly controls: "list" | "missing" | null;
	/** Whether every result keeps its whole name in its title, for a name the row cuts short. */
	readonly fullNames: boolean;
}

/**
 * What the Find field of the left column is doing.
 * @param evaluate How the owner evaluates an expression in the page.
 * @returns Whether the field has focus, what is typed, whether results are listed and what the field points at.
 */
function partSearchState(
	evaluate: <T>(expression: string) => Promise<T>,
): Promise<PartSearchState> {
	return evaluate<PartSearchState>(
		`(() => { const field = document.querySelector('[data-slot="model-find"] input');` +
			` const named = field?.getAttribute('aria-controls') ?? null;` +
			` const options = [...document.querySelectorAll('[role="option"] button')];` +
			` return { focused: field !== null && field === document.activeElement,` +
			` value: field === null ? "" : field.value,` +
			` listed: document.querySelector('[role="listbox"]') !== null,` +
			` controls: named === null ? null : document.getElementById(named)?.getAttribute('role') === 'listbox' ? 'list' : 'missing',` +
			` fullNames: options.length > 0 && options.every((option) => [...option.querySelectorAll('span[title]')]` +
			`.some((name) => name.getAttribute('title') === name.textContent)) }; })()`,
	);
}

export { partSearchState };

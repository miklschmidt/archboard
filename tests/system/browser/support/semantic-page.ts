// What a browser owner reads from the Find palette.

/** What the Find palette is doing. */
interface PartSearchState {
	/** Whether the field has focus. */
	readonly focused: boolean;
	/** What is typed in it. */
	readonly value: string;
	/** Whether it lists results. */
	readonly listed: boolean;
	/** Whether every result keeps its whole name in its title, for a name the row cuts short. */
	readonly fullNames: boolean;
}

/**
 * What the Find palette is doing.
 * @param evaluate How the owner evaluates an expression in the page.
 * @returns Whether the field has focus, what is typed and whether results are listed.
 */
function partSearchState(
	evaluate: <T>(expression: string) => Promise<T>,
): Promise<PartSearchState> {
	return evaluate<PartSearchState>(
		`(() => { const field = document.querySelector('[data-slot="model-find"] input');` +
			` const options = [...document.querySelectorAll('[data-slot="model-find"] [role="option"]')];` +
			` return { focused: field !== null && field === document.activeElement,` +
			` value: field === null ? "" : field.value,` +
			` listed: options.length > 0,` +
			` fullNames: options.length > 0 && options.every((option) => [...option.querySelectorAll('span[title]')]` +
			`.some((name) => name.getAttribute('title') === name.textContent)) }; })()`,
	);
}

export { partSearchState };

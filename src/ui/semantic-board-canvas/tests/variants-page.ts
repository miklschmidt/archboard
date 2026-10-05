// The Variants page of a pane's header, as a person uses it: opened from its
// tab, it lists every variant of the board on screen, and each entry reads that
// variant in the pane. The sidebar offers no variants, so this is where a test
// finds the states of a board, whether it is the pane's own or one a level down.

import { act } from "@testing-library/react";

/** Open the pane's Variants page. */
function openVariantsPage(): void {
	const trigger = document.querySelector<HTMLElement>(
		"[data-slot='board-tab'][data-tab='variants']",
	);
	if (trigger === null) {
		throw new Error("The pane header has no Variants tab.");
	}
	act(() => {
		trigger.click();
	});
}

/**
 * One variant's entry on the Variants page, by its id.
 * @param id The variant's id.
 * @returns The entry.
 */
function variantEntry(id: string): HTMLElement {
	return document.querySelector<HTMLElement>(`[data-slot='variant-entry'][data-variant='${id}']`)!;
}

/**
 * Each variant's id and lifecycle, in the order the Variants page lists them.
 * @returns The pairs.
 */
function listedVariants(): (string | undefined)[][] {
	return [...document.querySelectorAll<HTMLElement>("[data-slot='variant-entry']")].map((one) => [
		one.dataset["variant"],
		one.dataset["lifecycle"],
	]);
}

export { listedVariants, openVariantsPage, variantEntry };

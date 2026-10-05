// Reading a presented walkthrough back off a pane, and stepping through it the
// way a reader does, for the stage tests.

import { act, fireEvent } from "@testing-library/react";

import { settle, surface } from "@/ui/semantic-board-canvas/tests/stage-harness";

/**
 * Every walkthrough button on screen, in order.
 * @returns The buttons.
 */
function offers(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>("[data-slot='semantic-walkthrough-choice']")];
}

/**
 * The heading of the step on screen.
 * @returns It, or null while nothing is presented.
 */
function current(): string | null {
	return document.querySelector("[data-slot='semantic-presentation-heading']")?.textContent ?? null;
}

/**
 * Press a key the way a person does, wherever focus happens to be.
 * @param key The key.
 */
function press(key: string): void {
	act(() => {
		fireEvent.keyDown(document.body, { key });
	});
}

/**
 * Go to a step through its mark among the steps.
 * @param index The step.
 */
function goTo(index: number): void {
	act(() => {
		fireEvent.click(
			document.querySelector<HTMLElement>(
				`[data-slot='semantic-presentation-step'][data-step='${index}']`,
			)!,
		);
	});
}

/**
 * Present the first walkthrough the variant offers.
 * @returns Settles once the presentation is up.
 */
async function presenting(): Promise<void> {
	await settle();
	act(() => {
		fireEvent.click(offers()[0]!);
	});
	await settle();
}

/**
 * The subjects the picture rings.
 * @returns Their ids.
 */
function marked(): string[] {
	return [...surface().querySelectorAll("[data-semantic-id].is-selected")].map(
		(group) => group.getAttribute("data-semantic-id") ?? "",
	);
}

/**
 * The subjects the veil leaves standing.
 * @returns Their ids, or none while nothing recedes.
 */
function unveiled(): string[] {
	if (!surface().classList.contains("is-veiled")) {
		return [];
	}
	return [...surface().querySelectorAll("[data-semantic-id].is-lit")].map(
		(group) => group.getAttribute("data-semantic-id") ?? "",
	);
}

/**
 * The group regions the veil leaves standing.
 * @returns Their groups, or none while nothing recedes.
 */
function litRegions(): string[] {
	if (!surface().classList.contains("is-veiled")) {
		return [];
	}
	return [...surface().querySelectorAll("[data-members].is-lit")].map(
		(region) => region.getAttribute("data-group") ?? "",
	);
}

/**
 * The rows of the column of the presented step's words.
 * @returns Each row's slot, or its tag when it has none.
 */
function wordRows(): string[] {
	const rows = document.querySelector("[data-slot='presentation-slides']")?.parentElement?.children;
	return [...(rows ?? [])].map((row) => row.getAttribute("data-slot") ?? row.tagName);
}

export { current, goTo, litRegions, marked, offers, presenting, press, unveiled, wordRows };

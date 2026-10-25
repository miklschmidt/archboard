// The box of a presented walkthrough: what it holds, and how it hands one step to the next.
//
// What is guarded: which step is shown is a matter of where every step stands against it, so a step
// chosen out of order is handed over the same way as the next one (the stylesheet slides the places);
// only the step shown can be reached; the gold of the rail and the live region follow the step; a key
// that has nowhere to go stays a key, so keyboard focus is not left on nothing; Space presses a focused
// control and steps from anywhere else; and the box takes keyboard focus when it opens.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import type { PaneChrome } from "#ui/components/semantic-board-canvas/PaneChrome.tsx";
import {
	EXPLAINED_BOARD,
	drawing,
} from "#tests/ui/support/semantic-board-canvas/render-answers.ts";
import {
	mountStage,
	part,
	server,
	settle,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";
import {
	current,
	offers,
	presenting,
	press,
} from "#tests/ui/support/semantic-board-canvas/presentation-probes.ts";

/** A board that tells itself in three steps. */
const THREE_STEPS = {
	...EXPLAINED_BOARD,
	variants: [
		{
			id: "v1",
			name: "as it is",
			lifecycle: "current",
			content: {
				nodes: [{ id: "n1", name: "API", kind: "module" }],
				edges: [],
				walkthroughs: [
					{
						id: "tour",
						name: "The tour",
						beats: [
							{ id: "t1", heading: "One", body: "First words.", subjects: [] },
							{ id: "t2", heading: "Two", body: "Second words.", subjects: [] },
							{ id: "t3", heading: "Three", body: "Third words.", subjects: [] },
						],
					},
				],
			},
		},
	],
};

/** Present the walkthrough, with motion cut so that nothing waits on a timer. */
async function present(): Promise<void> {
	server.documents["pipeline"] = THREE_STEPS;
	server.reply = { status: 200, body: drawing(1) };
	mountStage(null, { reducedMotion: true });
	await presenting();
}

/**
 * Where each step of one stack stands against the step shown, in the order of the steps.
 * @param slot The stack's slot.
 * @returns The places.
 */
function placesIn(slot: string): string[] {
	return [...document.querySelectorAll(`[data-slot='${slot}'] > [data-place]`)].map(
		(step) => step.getAttribute("data-place") ?? "",
	);
}

/**
 * Where each step's words and number stand against the step shown, in the order of the steps.
 * @returns The words' places and the numbers' places.
 */
function places(): { readonly words: string[]; readonly numbers: string[] } {
	return { words: placesIn("presentation-slides"), numbers: placesIn("presentation-figures") };
}

/**
 * Which steps' words can be reached, in the order of the steps.
 * @returns Whether each can.
 */
function reachable(): boolean[] {
	return [...document.querySelectorAll("[data-slot='presentation-slides'] > [data-place]")].map(
		(step) => !step.hasAttribute("inert"),
	);
}

test("every step stands before the one shown, is shown, or comes after it, however it was reached", async () => {
	await present();
	expect(places()).toEqual({
		words: ["shown", "after", "after"],
		numbers: ["shown", "after", "after"],
	});
	press("ArrowRight");
	await settle();
	expect(places().words).toEqual(["before", "shown", "after"]);
	// A step chosen out of order is handed over by the same places: the one that was shown goes behind it.
	press("End");
	await settle();
	expect(places()).toEqual({
		words: ["before", "before", "shown"],
		numbers: ["before", "before", "shown"],
	});
	press("Home");
	await settle();
	expect(places().words).toEqual(["shown", "after", "after"]);
});

test("only the step shown can be reached, and the gold of the rail and the live region follow it", async () => {
	await present();
	expect(reachable()).toEqual([true, false, false]);
	const rail = part("semantic-presentation-rail");
	expect(rail.style.getPropertyValue("--at")).toBe("0");
	expect(rail.style.getPropertyValue("--count")).toBe("3");

	press("ArrowRight");
	await settle();
	expect(reachable()).toEqual([false, true, false]);
	expect(rail.style.getPropertyValue("--at")).toBe("1");
	// The one live region says the step once, with its place among the steps.
	expect(document.querySelectorAll("[data-slot='semantic-presentation'] output")).toHaveLength(1);
	expect(document.querySelector("[data-slot='semantic-presentation'] output")?.textContent).toBe(
		"Step 2 of 3. Two. Second words.",
	);
});

test("a key with nowhere to go is dimmed and stays a key, so focus is not left on nothing", async () => {
	await present();
	const previous = part("semantic-presentation-previous");
	const next = part("semantic-presentation-next");
	expect(previous.getAttribute("aria-disabled")).toBe("true");
	expect(previous.hasAttribute("disabled")).toBe(false);
	act(() => {
		fireEvent.click(previous);
	});
	await settle();
	expect(current()).toBe("One");

	press("ArrowRight");
	await settle();
	act(() => {
		next.focus();
		fireEvent.click(next);
	});
	await settle();
	expect(current()).toBe("Three");
	expect(next.getAttribute("aria-disabled")).toBe("true");
	expect(document.activeElement?.getAttribute("data-slot")).toBe("semantic-presentation-next");
});

test("Space presses a control that has focus and steps from anywhere else", async () => {
	await present();
	const segment = document.querySelector<HTMLElement>(
		"[data-slot='semantic-presentation-step'][data-step='2']",
	);
	act(() => {
		fireEvent.keyDown(segment ?? document.body, { key: " " });
	});
	await settle();
	expect(current()).toBe("One");

	press(" ");
	await settle();
	expect(current()).toBe("Two");
});

/**
 * A pane beside another, the active one or not, each with its sidebar docked so its walkthroughs are offered.
 * @param active Whether the pane is the active one.
 * @returns What the shell puts in its header.
 */
function besideAnother(active: boolean): PaneChrome {
	return { letter: null, controls: null, notice: null, shared: false, active };
}

/**
 * The step each presented walkthrough on the page shows, in the order the panes were mounted.
 * @returns The steps.
 */
function stepsShown(): (string | null)[] {
	return [...document.querySelectorAll("[data-slot='semantic-presentation']")].map((box) =>
		box.getAttribute("data-step"),
	);
}

test("with two panes presenting, the keys step the active pane's walkthrough and leave the other's", async () => {
	server.documents["pipeline"] = THREE_STEPS;
	server.reply = { status: 200, body: drawing(1) };
	// The pane that is not active presents first, so it is the first to listen.
	mountStage(null, { reducedMotion: true, chrome: besideAnother(false) });
	mountStage(null, { reducedMotion: true, chrome: besideAnother(true) });
	await settle();
	// Each pane offers the walkthrough in its sidebar, in the order the panes were mounted.
	for (const offer of offers()) {
		act(() => {
			fireEvent.click(offer);
		});
	}
	await settle();
	expect(stepsShown()).toEqual(["0", "0"]);

	press("ArrowRight");
	await settle();
	expect(stepsShown()).toEqual(["0", "1"]);
});

test("the box takes keyboard focus when it opens, since the control that opened it steps aside", async () => {
	server.documents["pipeline"] = THREE_STEPS;
	server.reply = { status: 200, body: drawing(1) };
	mountStage(null, { reducedMotion: true });
	await settle();
	// A row pressed in the sidebar has focus when the box opens, and the sidebar is then hidden.
	const row = offers()[0]!;
	act(() => {
		row.focus();
		fireEvent.click(row);
	});
	await settle();
	expect(document.activeElement?.getAttribute("data-slot")).toBe("semantic-presentation");
});

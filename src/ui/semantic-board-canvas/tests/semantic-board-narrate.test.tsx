// The control that narrates a walkthrough aloud, in the board tab's rows and in
// the caption of a presented one.
//
// What these catch: a Narrate control that is taken out of its row while voice
// runs or another pane is active, which resizes the row and moves everything
// under it, and a held control that still starts a narration when pressed.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import type { WalkthroughNarration } from "@/ui/semantic-board-canvas/index";
import {
	drawing,
	mountStage,
	server,
	settle,
} from "@/ui/semantic-board-canvas/tests/stage-harness";
import { offers } from "@/ui/semantic-board-canvas/tests/presentation-probes";

/**
 * A walkthrough of one step. Ids are one to eight characters, and a step's is its walkthrough's with a digit.
 * @param id Its id.
 * @param name Its name.
 * @returns The walkthrough.
 */
function walkthrough(id: string, name: string): Record<string, unknown> {
	return {
		id,
		name,
		beats: [{ id: `${id}1`, heading: "First", body: "The first step.", subjects: [] }],
	};
}

/** A board that explains itself twice. */
const BOARD = {
	schemaVersion: "2.0.0",
	kind: "semantic-board",
	id: "bd",
	name: "pipeline",
	level: "system",
	version: 1,
	createdAt: "2026-09-11T00:00:00.000Z",
	updatedAt: "2026-09-11T00:00:00.000Z",
	views: [],
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "as it is",
			lifecycle: "current",
			content: {
				nodes: [{ id: "n1", name: "API", kind: "module" }],
				edges: [],
				walkthroughs: [walkthrough("tour", "The tour"), walkthrough("deploy", "Deploying")],
			},
		},
	],
};

/**
 * A narration that records what it was asked to start.
 * @param held Why it cannot start now, or null.
 * @returns The narration and what it started.
 */
function narrating(held: string | null): {
	readonly narration: WalkthroughNarration;
	readonly started: string[];
} {
	const started: string[] = [];
	return {
		narration: {
			held,
			/**
			 * Record the narration.
			 * @param id The walkthrough's id.
			 */
			start: (id) => {
				started.push(id);
			},
		},
		started,
	};
}

/**
 * Mount a pane over a board that explains itself.
 * @param narration What the shell offers, or none.
 * @returns Settles once the board tab lists its walkthroughs.
 */
async function mountExplained(narration?: WalkthroughNarration): Promise<void> {
	server.documents["pipeline"] = BOARD;
	server.reply = { status: 200, body: drawing(1) };
	mountStage(null, { narration });
	await settle();
	await settle();
}

/**
 * Every Narrate control on screen, in the sidebar's rows.
 * @returns The controls, in row order.
 */
function narrateControls(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>("[data-slot='semantic-walkthrough-narrate']")];
}

test("every row has a Narrate control, and pressing one starts that row's walkthrough", async () => {
	const free = narrating(null);
	await mountExplained(free.narration);
	expect(narrateControls()).toHaveLength(2);
	expect(narrateControls().map((control) => control.getAttribute("aria-disabled"))).toEqual([
		null,
		null,
	]);

	act(() => {
		fireEvent.click(narrateControls()[1] ?? document.body);
	});
	expect(free.started).toEqual(["deploy"]);
});

test("while voice runs every row keeps its control, dimmed, and says why, and pressing one starts nothing", async () => {
	const held = narrating("Voice is on. End it to narrate.");
	await mountExplained(held.narration);
	expect(narrateControls()).toHaveLength(2);
	for (const control of narrateControls()) {
		expect(control.getAttribute("aria-disabled")).toBe("true");
		expect(control.getAttribute("aria-label")).toContain("Voice is on");
	}

	act(() => {
		fireEvent.click(narrateControls()[0] ?? document.body);
	});
	expect(held.started).toEqual([]);

	// The caption of a presented walkthrough keeps its control in the same way.
	act(() => {
		fireEvent.click(offers()[0] ?? document.body);
	});
	await settle();
	const caption = document.querySelector("[data-slot='semantic-presentation-narrate']");
	expect(caption?.getAttribute("aria-disabled")).toBe("true");
	act(() => {
		fireEvent.click(caption ?? document.body);
	});
	expect(held.started).toEqual([]);
});

test("a page that narrates nothing by hand offers no Narrate control", async () => {
	await mountExplained();
	expect(offers()).toHaveLength(2);
	expect(narrateControls()).toHaveLength(0);
});

// Reading one board two ways.
//
// A view is presentation, not content: choosing one changes what this pane asks
// the server to draw, and nothing else. Nothing here writes a board, because
// the viewer has no way to.

import { act, cleanup, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	drawing,
	mountStage,
	renderCalls,
	server,
	part,
	settle,
	surface,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

/** The two views this variant offers. */
const VIEWS = [
	{ id: "v1", name: "The parts", grammar: "architecture" },
	{ id: "v2", name: "One edit, in order", grammar: "data-flow" },
] as const;

/**
 * A drawing that says which view it is of and what else is on offer.
 * @param version The board version it was drawn from.
 * @param view The view it is of, or null for the whole variant.
 * @returns The reply body.
 */
function drawnAs(version: number, view: (typeof VIEWS)[number] | null): Record<string, unknown> {
	return { ...drawing(version), view, views: [...VIEWS] };
}

/**
 * Every view button on screen, in order.
 * @returns The buttons.
 */
function choices(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>("[data-slot='semantic-view-choice']")];
}

/** A pane that reports nothing about the choice, for cases that do not read it. */
function ignoreChoice(): void {
	// The choice is the shell's; these cases only care what was drawn.
}

test("a variant with two views offers both, and says which one is on screen", async () => {
	server.reply = { status: 200, body: drawnAs(1, VIEWS[0]) };
	const picked: (string | null)[] = [];
	/**
	 * Record the choice the pane reported.
	 * @param view The view's id, or null.
	 */
	function record(view: string | null): void {
		picked.push(view);
	}
	mountStage(null, { onViewChange: record });
	await settle();
	// The whole variant is first, then each named way of reading it.
	// Each button says the view's name and nothing else: the grammar is what the
	// picture is, and writing it under a name that already says it read as "The
	// parts the parts".
	expect(choices().map((one) => one.textContent)).toEqual([
		"Everything",
		"The parts",
		"One edit, in order",
	]);
	expect(choices()[1]?.getAttribute("aria-pressed")).toBe("true");
	expect(choices()[2]?.getAttribute("aria-pressed")).toBe("false");

	// Choosing another reports it upward. The pane does not decide what it is
	// showing; the shell does, because two panes hold two answers.
	act(() => {
		fireEvent.click(choices()[2]!);
	});
	expect(picked).toEqual(["v2"]);

	// And there is always a way back to the board as a whole, which is what
	// every view is a reading of.
	act(() => {
		fireEvent.click(choices()[0]!);
	});
	expect(picked).toEqual(["v2", null]);
});

test("the view the pane is told to read rides in the request", async () => {
	server.reply = { status: 200, body: drawnAs(1, VIEWS[1]) };
	mountStage(null, { view: "v2", onViewChange: ignoreChoice });
	await settle();
	expect(renderCalls().at(-1)).toContain("view=v2");
	expect(choices()[2]?.getAttribute("aria-pressed")).toBe("true");
});

test("two panes read one board two ways at once", async () => {
	server.reply = { status: 200, body: drawnAs(1, VIEWS[0]) };
	mountStage(null, { view: "v1", onViewChange: ignoreChoice });
	await settle();
	const asked = server.calls.filter((call) => call.includes("view=v1"));
	cleanup();

	server.reply = { status: 200, body: drawnAs(1, VIEWS[1]) };
	mountStage(null, { view: "v2", onViewChange: ignoreChoice });
	await settle();
	// Two different pictures of one board, cached apart: the request that fetched
	// each one names its own view, so neither pane can be handed the other's.
	expect(asked.length).toBeGreaterThan(0);
	expect(server.calls.filter((call) => call.includes("view=v2")).length).toBeGreaterThan(0);
	expect(surface().querySelector("svg")).not.toBeNull();
});

test("a variant that names no view of its own offers no switcher", async () => {
	server.reply = { status: 200, body: { ...drawing(1), view: null, views: [] } };
	mountStage(null, { onViewChange: ignoreChoice });
	await settle();
	expect(choices()).toHaveLength(0);
});

test("a variant with one view still offers the board as a whole beside it", async () => {
	server.reply = { status: 200, body: { ...drawing(1), view: VIEWS[0], views: [VIEWS[0]] } };
	mountStage(null, { view: "v1", onViewChange: ignoreChoice });
	await settle();
	expect(choices().map((one) => one.textContent)).toEqual(["Everything", "The parts"]);
	expect(choices()[0]?.getAttribute("aria-pressed")).toBe("false");
});

test("a state that is out of step with what it came from says so, in the board's words", async () => {
	server.reply = {
		status: 200,
		body: {
			...drawing(3),
			waiting: {
				against: "v1",
				atVersion: 3,
				issues: [
					{
						subject: "n1",
						what: "node",
						kind: "competing-field",
						field: "responsibility",
						mine: "Nothing",
						theirs: "Builds the overlay",
						repair: "Say which one this proposal means, or write a third answer.",
					},
				],
			},
		},
	};
	mountStage(null, { onViewChange: ignoreChoice });
	await settle();
	const said = part("semantic-standing");
	// Coherent and out of date: the picture cannot say that by itself, so the
	// pane does — quoting the guidance rather than inventing a second account.
	expect(said.textContent).toContain("out of step");
	expect(said.getAttribute("data-issues")).toBe("1");
	expect(said.textContent).toContain("Say which one this proposal means");
});

test("a state that is in step says nothing about being out of it", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage(null, { onViewChange: ignoreChoice });
	await settle();
	expect(document.querySelector("[data-slot='semantic-standing']")).toBeNull();
});

test("a state that has not been brought forward at all names what it is waiting for", async () => {
	server.reply = {
		status: 200,
		body: {
			...drawing(4),
			waiting: {
				against: "v1",
				atVersion: 4,
				issues: [],
				blockedBy: "v1",
			},
		},
	};
	server.documents["pipeline"] = {
		schemaVersion: "1.0.0",
		kind: "semantic-board",
		id: "bd1",
		name: "pipeline",
		version: 4,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "Drawing is the board",
				lifecycle: "current",
				content: { nodes: [], edges: [] },
			},
		],
	};
	mountStage(null, { onViewChange: ignoreChoice });
	await settle();
	const said = part("semantic-standing");
	// A blocked draft holds nothing of its own, so a count is the one thing it
	// must not lead with.
	expect(said.textContent).not.toContain("0 things");
	expect(said.textContent).toContain("has not been brought forward");
	// And the state it is waiting for is named the way the variant bar names it.
	// An id in the sentence is a reader being told to go and look it up.
	expect(said.textContent).toContain("Drawing is the board");
	expect(said.textContent).not.toContain('"v1" is itself unsettled');
	expect(said.getAttribute("data-blocked-by")).toBe("v1");
});

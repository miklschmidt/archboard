// Reading the board a level down.
//
// A drill-down opens another board in the same pane. It is not addressed — the
// trail is local and the address still names where the reader started — but it
// is still a board somebody is reading, so it offers what any board offers:
// its own ways of being read, and its own states. What it must not offer is the
// level above's: a view id belongs to one board and a variant id to
// one board, so the reading starts again at each level.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	drawing,
	mountStage,
	renderCalls,
	server,
	settle,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

/** The two ways the board below can be read. */
const ENGINE_VIEWS = [
	{ id: "ev1", name: "The parts", grammar: "architecture" },
	{ id: "ev2", name: "One write, in order", grammar: "data-flow" },
] as const;

/** The one way the board above can be read. */
const PIPELINE_VIEW = { id: "pv1", name: "Where writes go", grammar: "architecture" } as const;

/**
 * One board document.
 * @param name What the board is called.
 * @param variants Its variants, in the order it states them.
 * @param current Which variant is the current one.
 * @param views The ways this board can be read.
 * @returns The document.
 */
function boardOf(
	name: string,
	variants: readonly Record<string, unknown>[],
	current: string,
	views: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
	return {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: name === "pipeline" ? "bd1" : "bd2",
		name,
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views,
		current,
		variants,
	};
}

/** The board the pane is opened on: one node, with a link to the level below. */
const PIPELINE = boardOf(
	"pipeline",
	[
		{
			id: "v1",
			name: "as it is",
			lifecycle: "current",
			content: {
				nodes: [
					{
						id: "n1",
						name: "board-io",
						kind: "module",
						drillDown: { board: "engine", variant: { kind: "named", name: "as built" } },
					},
				],
				edges: [],
			},
		},
	],
	"v1",
	[{ ...PIPELINE_VIEW, scope: { kind: "all" } }],
);

/** The board below: two states, two ways of reading it. */
const ENGINE = boardOf(
	"engine",
	[
		{
			id: "e1",
			name: "as built",
			lifecycle: "draft",
			content: {
				nodes: [
					{ id: "m1", name: "atomic-write", kind: "module" },
					{ id: "m2", name: "fsync", kind: "module" },
				],
				edges: [],
				flows: [
					{
						id: "f1",
						name: "One write",
						participants: ["m1", "m2"],
						steps: [{ id: "s1", from: "m1", to: "m2", label: "flushes", kind: "sync" }],
					},
				],
			},
		},
		{
			id: "e2",
			name: "shipped",
			lifecycle: "current",
			content: { nodes: [{ id: "m1", name: "atomic-write", kind: "module" }], edges: [] },
		},
	],
	"e2",
	ENGINE_VIEWS.map((view) => ({ ...view, scope: { kind: "all" } })),
);

/**
 * Every button of one bar, in order.
 * @param slot Which bar's buttons.
 * @returns The buttons.
 */
function buttons(slot: string): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>(`[data-slot='${slot}']`)];
}

/**
 * Follow the selected node's drill-down.
 * @returns Settles once the level below is on screen.
 */
async function openDown(): Promise<void> {
	server.reply = {
		status: 200,
		body: { ...drawing(1, "engine"), views: [...ENGINE_VIEWS] },
	};
	await act(async () => {
		fireEvent.click(document.querySelector<HTMLElement>("[data-slot='semantic-drill-down-open']")!);
	});
	await settle();
}

/** A pane whose choice nothing records, for cases that ask other questions. */
function ignoreChoice(): void {
	// The pane's own board is the shell's; a level below is the pane's own.
}

test("a board a level down offers its own views and its own states", async () => {
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = ENGINE;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage("n1", { live: true, onViewChange: ignoreChoice, onVariantChange: ignoreChoice });
	await settle();
	await openDown();

	// The target's own views, not the ones from the board above: a view id is a
	// subject of one variant's content and means nothing here.
	expect(buttons("semantic-view-choice").map((one) => one.textContent)).toEqual([
		"Everything",
		"The parts",
		"One write, in order",
	]);
	// And its own states, so a reader can tell whether what they followed a link
	// into is the architecture, a proposal, or history.
	expect(buttons("semantic-variant-choice").map((one) => one.textContent)).toEqual([
		"as builtdraft",
		"shippedcurrent",
	]);
	// The link named "as built", so that is what is on screen.
	expect(buttons("semantic-variant-choice")[0]?.getAttribute("aria-pressed")).toBe("true");
});

test("choosing at the level below asks for that reading of the board below", async () => {
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = ENGINE;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage("n1", { live: true, onViewChange: ignoreChoice, onVariantChange: ignoreChoice });
	await settle();
	await openDown();

	server.reply = {
		status: 200,
		body: { ...drawing(1, "engine"), view: ENGINE_VIEWS[1], views: [...ENGINE_VIEWS] },
	};
	await act(async () => {
		fireEvent.click(buttons("semantic-view-choice")[2]!);
	});
	await settle();
	const asked = renderCalls().at(-1) ?? "";
	expect(asked).toContain("board=engine");
	expect(asked).toContain("view=ev2");

	// A different state of the board below keeps the board-owned view. The view
	// is one way of reading every state of the board, so changing state does not
	// silently change the reading the person chose.
	// The board below's current state is asked for as the absence of a variant,
	// the same way the pane asks for its own.
	await act(async () => {
		fireEvent.click(buttons("semantic-variant-choice")[1]!);
	});
	await settle();
	const afterwards = renderCalls().at(-1) ?? "";
	expect(afterwards).toContain("board=engine");
	expect(afterwards).toContain("view=ev2");
	expect(buttons("semantic-variant-choice")[1]?.getAttribute("aria-pressed")).toBe("true");
	expect(buttons("semantic-view-choice")[2]?.getAttribute("aria-pressed")).toBe("true");
});

test("coming back up leaves the pane reading its own board as it was", async () => {
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = ENGINE;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage("n1", { live: true, view: "pv1", onViewChange: ignoreChoice });
	await settle();
	await openDown();
	await act(async () => {
		fireEvent.click(buttons("semantic-view-choice")[2]!);
	});
	await settle();

	server.reply = {
		status: 200,
		body: { ...drawing(1), views: [PIPELINE_VIEW], view: PIPELINE_VIEW },
	};
	await act(async () => {
		fireEvent.click(
			document
				.querySelector<HTMLElement>("[data-slot='semantic-board-trail']")!
				.querySelector("button")!,
		);
	});
	await settle();
	// The level below's choice went with the level; the pane's own board is read
	// the way the shell says it is, which is where the address carries it.
	const stage = document.querySelector("[data-slot='semantic-board-stage']");
	expect(stage?.getAttribute("data-board")).toBe("pipeline");
	expect(buttons("semantic-view-choice").map((one) => one.textContent)).toEqual([
		"Everything",
		"Where writes go",
	]);
	expect(
		renderCalls().every((call) => !call.includes("view=pv1&") || call.includes("pipeline")),
	).toBe(true);
});

/** What the pane said it was reading, as these tests read it back. */
type Reading = { board: string; variant: string | null; view: string | null };

/**
 * Keep what the pane said it was reading.
 * @param reading What it is reading now.
 */
function report(reading: Reading): void {
	readings.push({ board: reading.board, variant: reading.variant, view: reading.view });
}

/** Everything the pane has said it was reading, in order. */
const readings: Reading[] = [];

test("the pane says which board it is actually reading, not the one it was opened on", async () => {
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = ENGINE;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage("n1", {
		live: true,
		onViewChange: ignoreChoice,
		onVariantChange: ignoreChoice,
		onReading: report,
	});
	await settle();
	// Before anything is followed, the pane is reading what it was opened on.
	expect(readings.at(-1)?.board).toBe("pipeline");

	await openDown();
	// A shell told "pipeline" here would say an agent is looking at a board
	// nobody has on screen, and would open the code of a node from the wrong one.
	expect(readings.at(-1)?.board).toBe("engine");

	await act(async () => {
		fireEvent.click(buttons("semantic-view-choice")[2]!);
	});
	await settle();
	expect(readings.at(-1)).toMatchObject({ board: "engine", view: "ev2" });
});

test("choosing a way of reading a level does not change which state it is", async () => {
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = ENGINE;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage("n1", { live: true, onViewChange: ignoreChoice, onVariantChange: ignoreChoice });
	await settle();
	await openDown();
	// The link named "as built", which is not the board below's current state.
	expect(renderCalls().at(-1)).toContain("variant=e1");

	await act(async () => {
		fireEvent.click(buttons("semantic-view-choice")[1]!);
	});
	await settle();
	// Choosing a grammar says nothing about which state to read it in. Losing the
	// named state here would show the current architecture under a link that
	// asked for what was built.
	const asked = renderCalls().at(-1) ?? "";
	expect(asked).toContain("board=engine");
	expect(asked).toContain("variant=e1");
	expect(buttons("semantic-variant-choice")[0]?.getAttribute("aria-pressed")).toBe("true");
});

test("choosing the current state at a level, then a view, stays on the current state", async () => {
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = ENGINE;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage("n1", { live: true, onViewChange: ignoreChoice, onVariantChange: ignoreChoice });
	await settle();
	await openDown();
	expect(renderCalls().at(-1)).toContain("variant=e1");

	// The link named a draft; the person asks for what is current instead, which
	// is asked for as the absence of a variant.
	await act(async () => {
		fireEvent.click(buttons("semantic-variant-choice")[1]!);
	});
	await settle();
	expect(renderCalls().at(-1)).not.toContain("variant=");

	// Then a different way of reading it. "Nothing chosen yet" and "the current
	// one" are both absences, and treating the second as the first would put the
	// link's draft back on screen under a choice somebody has just made.
	await act(async () => {
		fireEvent.click(buttons("semantic-view-choice")[1]!);
	});
	await settle();
	const asked = renderCalls().at(-1) ?? "";
	expect(asked).toContain("board=engine");
	expect(asked).not.toContain("variant=");
	expect(buttons("semantic-variant-choice")[1]?.getAttribute("aria-pressed")).toBe("true");
});

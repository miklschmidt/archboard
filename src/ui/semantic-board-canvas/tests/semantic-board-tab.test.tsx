// What the board tab says about the board on screen before anything is chosen
// (TASK-383): what the variant is about in its author's words, what the view on
// screen answers, and what a proposal changes.
//
// What these catch: a tab that drops the board's own statement of its scope, a
// tab that says nothing about the draft on screen of a board nobody has built,
// a view's summary shown under the wrong view, a view in which nothing differs
// taking away the control a reader needs further on, and a key to a proposal's marks
// that miscounts, keys a standing the proposal does not have, or lists them in
// an order that changes from one proposal to the next.

import { cleanup } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	drawing,
	mountStage,
	part,
	server,
	settle,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

/** The one view the board below offers, as the render answer lists it. */
const VIEW = { id: "w1", name: "One edit", grammar: "architecture" } as const;

/** What the variant below says it is about. */
const SUMMARY = "Where an edit goes, and what keeps it.";

/** What its view says it answers. */
const VIEW_SUMMARY = "The one path an edit takes.";

/** A board whose variant says what it is about and whose view says what it answers. */
const DESCRIBED = {
	schemaVersion: "2.0.0",
	kind: "semantic-board",
	id: "b1",
	name: "pipeline",
	level: "service",
	version: 1,
	createdAt: "2026-09-30T00:00:00.000Z",
	updatedAt: "2026-09-30T00:00:00.000Z",
	views: [{ ...VIEW, summary: VIEW_SUMMARY }],
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "as built",
			lifecycle: "current",
			summary: SUMMARY,
			content: { nodes: [{ id: "n1", name: "API", kind: "api" }], edges: [] },
		},
	],
};

/** A pane that reports nothing about the choice of view. */
function ignoreChoice(): void {
	// The choice is the shell's; this case only reads what the tab says.
}

test("the tab says what the variant is about, and what the view on screen answers under it", async () => {
	server.documents["pipeline"] = DESCRIBED;
	server.reply = { status: 200, body: { ...drawing(1), view: VIEW, views: [VIEW] } };
	mountStage(null, { view: VIEW.id, onViewChange: ignoreChoice });
	await settle();
	await settle();
	expect(part("semantic-board-summary").textContent).toBe(SUMMARY);
	const described = part("semantic-view-summary");
	expect(described.textContent).toBe(VIEW_SUMMARY);
	expect(
		described.previousElementSibling?.matches(
			`[data-slot='semantic-view-choice'][data-semantic-view='${VIEW.id}'][aria-pressed='true']`,
		),
	).toBe(true);
});

test("on a board nobody has built, the tab speaks for the draft its bare name opens", async () => {
	const draft = { ...DESCRIBED.variants[0], lifecycle: "draft", name: "first idea" };
	const { current: _current, ...unbuilt } = DESCRIBED;
	server.documents["pipeline"] = { ...unbuilt, variants: [draft] };
	server.reply = {
		status: 200,
		body: { ...drawing(1), variant: { id: draft.id, name: draft.name, lifecycle: "draft" } },
	};
	mountStage();
	await settle();
	await settle();
	expect(part("semantic-board-summary").textContent).toBe(SUMMARY);
});

test("a proposal's key counts each standing it has, in one order, and leaves out the rest", async () => {
	const changes = {
		against: { id: "v1", name: "current", lifecycle: "current" },
		standing: { n1: "changed", ghost: "removed", e1: "removed", n2: "unchanged" },
	};
	server.reply = {
		status: 200,
		body: {
			...drawing(1),
			variant: { id: "v2", name: "proposal", lifecycle: "draft" },
			changes,
		},
	};
	mountStage();
	await settle();
	const rows = [...part("semantic-change-key").querySelectorAll<HTMLElement>("li")].map((row) => [
		row.dataset["standing"],
		row.querySelector("[data-slot='semantic-change-count']")?.textContent,
	]);
	expect(rows).toEqual([
		["changed", "1"],
		["removed", "2"],
	]);
});

test("a reading in which nothing differs says so and keeps the control, the overview too", async () => {
	const proposal = { id: "v2", name: "proposal", lifecycle: "draft" };
	const against = { id: "v1", name: "as built", lifecycle: "current" };
	// The standings are of what the picture draws: the view draws only parts
	// that the proposal leaves as they were.
	const quiet = { against, standing: { n1: "unchanged" } };
	server.reply = {
		status: 200,
		body: { ...drawing(1), variant: proposal, changes: quiet, view: VIEW, views: [VIEW] },
	};
	mountStage(null, { view: VIEW.id, onViewChange: ignoreChoice });
	await settle();
	expect(part("semantic-comparison-toggle")).not.toBeNull();
	expect(part("semantic-change-none")).not.toBeNull();
	expect(document.querySelector("[data-slot='semantic-change-key']")).toBeNull();
	cleanup();

	server.reply = {
		status: 200,
		body: { ...drawing(1), variant: proposal, changes: quiet },
	};
	// The overview draws part of the variant as well (ADR 0052), so its
	// counts cannot say that the variant is identical (TASK-497).
	mountStage();
	await settle();
	expect(part("semantic-comparison-toggle")).not.toBeNull();
	expect(part("semantic-change-none")).not.toBeNull();
});

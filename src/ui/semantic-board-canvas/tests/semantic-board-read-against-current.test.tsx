// What the inspector says a subject differs by, once a board has history
// (decided by the user on 2026-09-27): the current variant is now and says
// nothing about having changed, and a historical variant is read against it, so
// what now has and history lacks reads as removed from history's picture.

import { expect, test } from "bun:test";

import {
	drawing,
	mountStage,
	server,
	settle,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

/** What was built first. */
const FIRST = {
	nodes: [
		{ id: "svc", name: "Board Runtime", kind: "service" },
		{ id: "io", name: "board-io", kind: "module", parent: "svc", responsibility: "Reads the note" },
		{ id: "legacy", name: "Legacy Bridge", kind: "module", parent: "svc" },
	],
	edges: [],
};

/** What replaced it and is built now. */
const NOW = {
	nodes: [
		{ id: "svc", name: "Board Runtime", kind: "service" },
		{
			id: "io",
			name: "board-io",
			kind: "module",
			parent: "svc",
			responsibility: "Reads and writes the note",
		},
		{ id: "queue", name: "Edit Queue", kind: "queue", parent: "svc" },
	],
	edges: [],
};

/**
 * A board whose first architecture was superseded by the current one.
 * @returns The document, as the board route answers with it.
 */
function superseded(): Record<string, unknown> {
	return {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: "b1",
		name: "pipeline",
		level: "system",
		version: 2,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-27T00:00:00.000Z",
		views: [],
		current: "v2",
		variants: [
			{ id: "v1", name: "as first built", lifecycle: "historical", content: FIRST },
			{ id: "v2", name: "as it is", lifecycle: "current", parent: "v1", content: NOW },
		],
	};
}

/**
 * Put the board in front of a pane showing one of its variants.
 * @param shown The variant the picture is of.
 * @param shown.id Its id.
 * @param shown.name Its name.
 * @param shown.lifecycle Where it stands.
 * @param selection What the user has picked out.
 */
async function inspecting(
	shown: { id: string; name: string; lifecycle: string },
	selection: string,
): Promise<void> {
	server.reply = { status: 200, body: { ...drawing(2), variant: shown } };
	server.documents["pipeline"] = superseded();
	mountStage(selection);
	await settle();
	await settle();
	await settle();
}

/**
 * One part of the inspector.
 * @param name The `data-slot` wanted.
 * @returns The element, or null when the panel drew none.
 */
function slot(name: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-slot='${name}']`);
}

/**
 * How the panel says the selected subject stands.
 * @returns The standing, or null when the panel says nothing about one.
 */
function standing(): string | null {
	return slot("semantic-inspector")?.getAttribute("data-standing") ?? null;
}

const HISTORICAL = { id: "v1", name: "as first built", lifecycle: "historical" };
const CURRENT = { id: "v2", name: "as it is", lifecycle: "current" };

test("the current variant says nothing about having changed, though it came from history", async () => {
	await inspecting(CURRENT, "io");

	expect(slot("semantic-inspector")?.textContent).toContain("board-io");
	expect(standing()).toBeNull();
	expect(slot("semantic-inspector-standing")).toBeNull();
	expect(slot("semantic-inspector-moved")).toBeNull();
});

test("a part only the current variant has stands removed on the historical one, named against current", async () => {
	await inspecting(HISTORICAL, "queue");

	expect(slot("semantic-inspector")?.textContent).toContain("Edit Queue");
	expect(standing()).toBe("removed");
	expect(slot("semantic-inspector-standing")?.textContent).toContain("as it is");
});

test("a part only history has stands added on the historical variant", async () => {
	await inspecting(HISTORICAL, "legacy");

	expect(standing()).toBe("added");
});

test("a changed field on the historical variant moves from what current says to what history says", async () => {
	await inspecting(HISTORICAL, "io");

	expect(standing()).toBe("changed");
	const field = slot("semantic-inspector-moved")?.querySelector("[data-field='responsibility']");
	const text = field?.textContent ?? "";
	expect(text.indexOf("Reads and writes the note")).toBeGreaterThanOrEqual(0);
	// Current's value comes first: it is what history is read against.
	expect(text.indexOf("Reads and writes the note")).toBeLessThan(
		text.lastIndexOf("Reads the note"),
	);
});

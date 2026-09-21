// What picking something out of a *proposal* tells a user.
//
// A proposal is drawn from its own content plus what its change took away, so
// the things a reader most wants to ask about — the service that is going, the
// responsibility that moved, the message that is no longer sent — are on the
// screen and can be clicked. These check that the panel answers for all of
// them, in the words a user reads rather than in the module's internals.

import { expect, test } from "bun:test";

import {
	drawing,
	mountStage,
	server,
	settle,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

/** The architecture as it is, before the change. */
const BEFORE = {
	nodes: [
		{ id: "svc", name: "Board Runtime", kind: "service", responsibility: "Owns every write" },
		{
			id: "io",
			name: "board-io",
			kind: "module",
			parent: "svc",
			responsibility: "Reads the note",
		},
		{ id: "legacy", name: "Excalidraw Bridge", kind: "module", parent: "svc" },
	],
	edges: [{ id: "x1", from: "io", to: "legacy", kind: "call", label: "mirrors" }],
	flows: [
		{
			id: "f1",
			name: "Agent edit",
			participants: ["io", "legacy"],
			steps: [
				{ id: "s1", from: "io", to: "legacy", label: "mirror to canvas", kind: "async" },
				{ id: "s2", from: "legacy", to: "io", label: "ack", kind: "return" },
			],
		},
		{
			id: "f2",
			name: "Canvas repair",
			participants: ["legacy", "io"],
			steps: [
				{ id: "s4", from: "legacy", to: "io", label: "reread note", kind: "sync" },
				{ id: "s5", from: "io", to: "legacy", label: "elements", kind: "return" },
			],
		},
	],
};

/** The architecture as the proposal would have it. */
const AFTER = {
	nodes: [
		{ id: "svc", name: "Board Runtime", kind: "service", responsibility: "Owns every write" },
		{
			id: "io",
			name: "board-io",
			kind: "module",
			parent: "svc",
			responsibility: "Reads and writes the note",
		},
		{ id: "queue", name: "Edit Queue", kind: "queue", parent: "svc" },
	],
	edges: [{ id: "x1", from: "io", to: "queue", kind: "call", label: "mirrors" }],
	flows: [
		{
			id: "f1",
			name: "Agent edit",
			participants: ["io", "queue"],
			steps: [{ id: "s3", from: "io", to: "queue", label: "enqueue", kind: "sync" }],
		},
	],
};

/**
 * A board holding the state it is in and one proposal derived from it.
 * @returns The document, as the board route answers with it.
 */
function branched(): Record<string, unknown> {
	return {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: "b1",
		name: "pipeline",
		level: "system",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{ id: "v1", name: "as it is", lifecycle: "current", content: BEFORE },
			{ id: "v2", name: "queue first", lifecycle: "draft", parent: "v1", content: AFTER },
		],
	};
}

/**
 * The picture of the proposal, as the render route answers with it.
 *
 * The reply says which variant it drew, which is how the panel knows what to
 * explain. What it says about the change is here for realism: the panel reads
 * the board rather than this, so that the words beside the picture and the
 * marks on it come from one comparison of one pair of variants.
 * @returns The render route's success body.
 */
function proposalDrawn(): Record<string, unknown> {
	return {
		...drawing(1),
		variant: { id: "v2", name: "queue first", lifecycle: "draft" },
		changes: {
			predecessor: { id: "v1", name: "as it is", lifecycle: "current" },
			standing: { queue: "added", s3: "added", io: "changed", legacy: "removed", s2: "removed" },
		},
	};
}

/**
 * Put the branched board and a picture of its proposal in front of a pane.
 * @param selection What the user has picked out.
 */
function inspecting(selection: string): void {
	server.reply = { status: 200, body: proposalDrawn() };
	server.documents["pipeline"] = branched();
	mountStage(selection);
}

/**
 * Let the picture, then the board behind it, reach the screen.
 * @returns Settles once nothing else is waiting.
 */
async function settled(): Promise<void> {
	await settle();
	await settle();
	await settle();
}

/**
 * What the inspector is saying.
 * @returns Its text, or an empty string when no inspector is up.
 */
function inspector(): string {
	return document.querySelector("[data-slot='semantic-inspector']")?.textContent ?? "";
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
	return (
		document.querySelector("[data-slot='semantic-inspector']")?.getAttribute("data-standing") ??
		null
	);
}

test("a subject the change takes away can still be asked about", async () => {
	inspecting("legacy");
	await settled();

	// It is in the picture — the server puts back what the change took away — so
	// the panel has to answer for it rather than claiming it has gone.
	expect(inspector()).toContain("Excalidraw Bridge");
	expect(inspector()).not.toContain("not on the board any more");
	expect(standing()).toBe("removed");
	// And it says what that means, naming the state it is being read against, so
	// "removed" is never removed-from-nowhere.
	expect(slot("semantic-inspector-standing")?.textContent).toContain("Not on this proposal");
	expect(slot("semantic-inspector-standing")?.textContent).toContain("as it is");
	expect(slot("semantic-inspector-ancestry")).toBeNull();
});

test("a changed subject says which field moved and what it moved between", async () => {
	inspecting("io");
	await settled();

	expect(standing()).toBe("changed");
	const moved = slot("semantic-inspector-moved");
	expect(moved).not.toBeNull();
	const field = moved!.querySelector("[data-field='responsibility']");
	// Both values, not merely a badge saying something happened.
	expect(field?.textContent).toContain("Reads the note");
	expect(field?.textContent).toContain("Reads and writes the note");
	// And nothing that did not move is listed beside it.
	expect(moved!.querySelector("[data-field='name']")).toBeNull();
	expect(moved!.querySelector("[data-field='kind']")).toBeNull();
});

test("a subject the proposal adds says so, and has nothing to show as moved", async () => {
	inspecting("queue");
	await settled();

	expect(inspector()).toContain("Edit Queue");
	expect(standing()).toBe("added");
	expect(slot("semantic-inspector-standing")?.textContent).toContain("New in this proposal");
	// Added is not changed: there is no earlier value for any of its fields.
	expect(slot("semantic-inspector-moved")).toBeNull();
});

test("a subject the proposal leaves alone is not told it is unchanged", async () => {
	inspecting("svc");
	await settled();

	// Most of a proposal is unchanged, and a sentence on every panel saying so
	// would bury the few subjects that did move. The panel still says which it
	// is in the attribute a viewer selects by, exactly as the picture does, so
	// that "unchanged on a proposal" and "not a proposal at all" stay two
	// different answers rather than one silence.
	expect(inspector()).toContain("Board Runtime");
	expect(standing()).toBe("unchanged");
	expect(slot("semantic-inspector-standing")).toBeNull();
	expect(slot("semantic-inspector-moved")).toBeNull();
});

test("an exchange is a subject a user can inspect", async () => {
	inspecting("f1");
	await settled();

	expect(inspector()).toContain("Agent edit");
	expect(slot("semantic-inspector-participants")?.textContent).toContain("board-io");
	expect(inspector()).not.toContain("not on the board any more");
	// Its cast moved, so it reads as changed like any other subject.
	expect(standing()).toBe("changed");
	expect(
		slot("semantic-inspector-moved")?.querySelector("[data-field='participants']"),
	).not.toBeNull();
});

test("one message of an exchange is a subject a user can inspect", async () => {
	inspecting("s3");
	await settled();

	expect(inspector()).toContain("enqueue");
	expect(inspector()).not.toContain("not on the board any more");
	expect(inspector()).toContain("Agent edit");
	// Who sent it and who received it, in names rather than ids.
	expect(inspector()).toContain("board-io");
	expect(inspector()).toContain("Edit Queue");
	expect(standing()).toBe("added");
});

test("a message the change stops sending can still be asked about", async () => {
	inspecting("s2");
	await settled();

	// A removed step is put back into the exchange it was told in, so it is in
	// the picture and the panel answers for it as it does for a removed card.
	expect(inspector()).toContain("ack");
	expect(inspector()).not.toContain("not on the board any more");
	expect(standing()).toBe("removed");
	expect(inspector()).toContain("Agent edit");
});

test("a board that came from nothing says nothing about having changed", async () => {
	server.reply = { status: 200, body: drawing(1) };
	server.documents["pipeline"] = {
		...branched(),
		variants: [{ id: "v1", name: "as it is", lifecycle: "current", content: BEFORE }],
	};
	mountStage("io");
	await settled();

	// The comparison exists only against a predecessor. A board with one state
	// has none, and a panel that invented one would be reporting a change
	// nobody proposed.
	expect(inspector()).toContain("board-io");
	expect(standing()).toBeNull();
	expect(slot("semantic-inspector-standing")).toBeNull();
	expect(slot("semantic-inspector-moved")).toBeNull();
});

test("a message the proposal adds is counted within the proposal", async () => {
	inspecting("s3");
	await settled();

	// The proposal's exchange has exactly this one message. The picture beside it
	// also shows the two the change removed, but that composition is a drawing of
	// a change and is nobody's architecture — counting against it would make the
	// only message of a one-message flow the third of three.
	expect(document.querySelector("[data-field='position']")?.textContent).toBe("1 of 1");
});

test("a message the change stops sending is counted within the state it belonged to", async () => {
	inspecting("s2");
	await settled();

	// It was the second of the two messages that exchange used to have. It is not
	// any-of the proposal, which no longer sends it at all.
	expect(document.querySelector("[data-field='position']")?.textContent).toBe("2 of 2");
	expect(document.querySelector("[data-field='flow']")?.textContent).toBe("Agent edit");
});

test("an exchange the proposal keeps reports the proposal's own message count", async () => {
	inspecting("f1");
	await settled();

	// The proposal states one message for this exchange. The picture beside it
	// also shows the two the change removed; that composition is a drawing and
	// is nobody's architecture, so the panel never counts against it.
	expect(slot("semantic-inspector-step-count")?.textContent).toBe("One message");
});

test("an exchange the proposal drops reports the count it had where it lived", async () => {
	inspecting("f2");
	await settled();

	expect(inspector()).toContain("Canvas repair");
	expect(standing()).toBe("removed");
	expect(slot("semantic-inspector-step-count")?.textContent).toBe("2 messages");
});

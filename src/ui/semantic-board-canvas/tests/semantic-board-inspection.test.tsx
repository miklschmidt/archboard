// What picking something out of a diagram tells a person, and where a link to
// the level below leads.
//
// The card in the picture carries a name, a kind and one line. Everything else
// an architecture says about a node — the longer description, where its code
// is, what contains it, the board under it — is reached by inspecting, and that
// is what these check. They read the rendered panel rather than the module's
// internals, because "a person can find this out" is the claim being made.

import { expect, test } from "bun:test";
import { act, fireEvent } from "@testing-library/react";

import { announceSemanticBoardChange } from "@/ui/semantic-board-canvas";
import {
	drawing,
	mountStage,
	NOTHING_DRAWN,
	server,
	settle,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

/** One node of a board document, as the board file spells it. */
type Node = Record<string, unknown>;

/**
 * One board document, as its route answers with it.
 * @param name What the board is called.
 * @param nodes Its nodes.
 * @param variants Its variants beyond the current one, if any.
 * @returns The document.
 */
function boardOf(
	name: string,
	nodes: readonly Node[],
	variants: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
	return {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: "b1",
		name,
		level: "system",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{ id: "v1", name: "as it is", lifecycle: "current", content: { nodes, edges: [] } },
			...variants,
		],
	};
}

/** The nodes of the board the pane is opened on. */
const NODES: readonly Node[] = [
	{ id: "svc", name: "Board Runtime", kind: "service", responsibility: "Owns every write" },
	{
		id: "n1",
		name: "board-io",
		kind: "module",
		parent: "svc",
		description: "The one place a note is read or written, synchronously on purpose.",
		binding: { repo: "archboard", path: "src/runtime/engine/board-io.ts" },
		drillDown: { board: "engine", variant: { kind: "named", name: "as built" } },
	},
	{ id: "n2", name: "Write Lease", kind: "module", parent: "svc" },
	{
		id: "n3",
		name: "Voice Bridge",
		kind: "external",
		binding: { repo: "coordinator", path: "src/voice/bridge.ts" },
	},
];

/**
 * One endpoint a predecessor took away, as the board holds the disagreement.
 *
 * Two of these on one relationship is the case that matters: the same kind, no
 * field on either, and nothing to tell them apart but what they say.
 * @param end Which endpoint went.
 * @returns The disagreement.
 */
function lostEnd(end: string): Record<string, unknown> {
	return {
		subject: "e1",
		what: "subject",
		kind: "reference-lost",
		mine: "kept what it said",
		theirs: "changed under it",
		repair:
			"Merging the change from the variant this proposal came from would leave it saying " +
			`something no board may hold — "${end}" is not a node on this board. This proposal keeps ` +
			"what it said; say what it should say instead.",
	};
}

/**
 * Put a board of nodes and a drawing of it in front of a pane.
 * @param nodes The board's nodes.
 */
function serving(nodes: readonly Node[] = NODES): void {
	server.reply = { status: 200, body: drawing(1) };
	server.documents["pipeline"] = boardOf("pipeline", nodes);
}

/**
 * Let every read the pane starts reach the screen.
 *
 * Inspection is three reads deep: the picture, then the board it is of, then —
 * when the picked node names one — the board below it. Each is only asked for
 * once the one before it has landed, so settling once is not enough.
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
 * One part of the mounted pane.
 * @param name The `data-slot` wanted.
 * @returns The element, or null when the pane drew none.
 */
function slot(name: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-slot='${name}']`);
}

test("picking a node shows what its card cannot: the description and the code", async () => {
	serving();
	mountStage("n1");
	await settled();

	expect(inspector()).toContain("board-io");
	expect(inspector()).toContain("The one place a note is read or written");
	expect(slot("semantic-inspector-binding")?.textContent).toContain("archboard");
	expect(slot("semantic-inspector-binding")?.textContent).toContain(
		"src/runtime/engine/board-io.ts",
	);
	// And where it sits, which the picture shows but the panel has to say in words.
	expect(slot("semantic-inspector-ancestry")?.textContent).toContain("Board Runtime");
});

test("an unbound node says so plainly rather than showing an empty binding", async () => {
	serving();
	mountStage("n2");
	await settled();

	// What is missing, not why. A part may be implemented and simply not bound
	// yet, and "planned" would be the panel guessing at the work from the board.
	expect(slot("semantic-inspector-unbound")?.textContent).toBe("No code binding.");
	expect(inspector()).not.toContain("Planned");
	expect(slot("semantic-inspector-binding")).toBeNull();
	// And nothing at all is said about a description nobody wrote: a heading over
	// an absence is a line to read in order to learn there is nothing to read.
	expect(inspector()).not.toContain("No description written.");
	expect(inspector()).not.toContain("Description");
	expect(slot("semantic-inspector-description")).toBeNull();
});

test("two nodes of one board can name two different repositories", async () => {
	serving();
	mountStage("n3");
	await settled();

	expect(slot("semantic-inspector-binding")?.textContent).toContain("coordinator");
	expect(slot("semantic-inspector-binding")?.textContent).not.toContain("archboard");
});

test("a container says what it holds", async () => {
	serving();
	mountStage("svc");
	await settled();

	expect(slot("semantic-inspector-holds")?.textContent).toContain("board-io");
	expect(slot("semantic-inspector-holds")?.textContent).toContain("Write Lease");
	expect(slot("semantic-inspector-ancestry")?.textContent).toContain("Nothing contains it.");
});

test("a drill-down discloses the target variant and where it stands before opening it", async () => {
	serving();
	server.documents["engine"] = boardOf(
		"engine",
		[{ id: "m1", name: "atomic-write", kind: "module" }],
		[
			{
				id: "v2",
				name: "as built",
				lifecycle: "draft",
				content: { nodes: [{ id: "m2", name: "fsync", kind: "module" }], edges: [] },
			},
		],
	);
	mountStage("n1");
	await settled();

	const open = slot("semantic-drill-down-open");
	expect(open?.textContent).toContain("engine");
	// Which variant, and what sort of state it is — not merely that there is one.
	expect(slot("semantic-drill-down")?.textContent).toContain("as built");
	expect(slot("semantic-drill-down")?.textContent).toContain("draft proposal");
	expect(open?.getAttribute("data-variant-lifecycle")).toBe("draft");
});

test("a drill-down that asks for whichever variant is current says that it asked", async () => {
	// The designation is a written intention, not the fallback for a name that
	// is not there — so a link that asks for it says so, and what it resolves to
	// is disclosed like any other target before it opens.
	serving([
		{
			id: "n1",
			name: "board-io",
			kind: "module",
			drillDown: { board: "engine", variant: { kind: "current" } },
		},
	]);
	server.documents["engine"] = boardOf("engine", [
		{ id: "m1", name: "atomic-write", kind: "module" },
	]);
	mountStage("n1");
	await settled();

	expect(slot("semantic-drill-down")?.textContent).toContain("whichever variant is current");
	expect(slot("semantic-drill-down")?.textContent).toContain("as it is");
	expect(slot("semantic-drill-down-open")?.getAttribute("data-variant-lifecycle")).toBe("current");
});

test("a drill-down naming a variant the target has not got says so and opens nothing", async () => {
	serving();
	server.documents["engine"] = boardOf("engine", [
		{ id: "m1", name: "atomic-write", kind: "module" },
	]);
	mountStage("n1");
	await settled();

	expect(slot("semantic-drill-down")?.textContent).toContain('no variant called "as built"');
	expect(slot("semantic-drill-down")?.textContent).toContain("Nothing was opened in its place");
	expect(slot("semantic-drill-down-open")).toBeNull();
});

test("a drill-down whose board the vault has not got names the board rather than shrugging", async () => {
	serving();
	mountStage("n1");
	await settled();

	expect(slot("semantic-drill-down")?.textContent).toContain("could not be opened");
	expect(slot("semantic-drill-down")?.textContent).toContain("engine");
	expect(slot("semantic-drill-down-open")).toBeNull();
});

test("following a drill-down shows the target board and offers the way back", async () => {
	serving();
	server.documents["engine"] = boardOf(
		"engine",
		[{ id: "m1", name: "atomic-write", kind: "module" }],
		[
			{
				id: "v2",
				name: "as built",
				lifecycle: "draft",
				content: { nodes: [{ id: "m2", name: "fsync", kind: "module" }], edges: [] },
			},
		],
	);
	mountStage("n1", { live: true });
	await settled();

	server.reply = { status: 200, body: drawing(1, "engine") };
	await act(async () => {
		fireEvent.click(slot("semantic-drill-down-open")!);
	});
	await settled();

	expect(slot("semantic-board-stage")?.getAttribute("data-board")).toBe("engine");
	expect(server.calls.some((url) => url.includes("board=engine&theme=light"))).toBe(true);
	// The pane says where it is and how to get back; the address still names the
	// board the pane was opened on, which is why the trail has to be on screen.
	expect(slot("semantic-board-trail")?.textContent).toContain("pipeline");

	await act(async () => {
		fireEvent.click(slot("semantic-board-trail")!.querySelector("button")!);
	});
	await settled();
	expect(slot("semantic-board-stage")?.getAttribute("data-board")).toBe("pipeline");
	expect(slot("semantic-board-trail")).toBeNull();
});

test("the way back survives drilling into a board with nothing on it", async () => {
	serving();
	server.documents["engine"] = boardOf(
		"engine",
		[{ id: "m1", name: "atomic-write", kind: "module" }],
		[{ id: "v2", name: "as built", lifecycle: "draft", content: { nodes: [], edges: [] } }],
	);
	mountStage("n1", { live: true });
	await settled();

	// The states somebody most needs the way back in are the ones with no
	// diagram. A pane that loses it there is a pane they cannot leave.
	server.reply = { status: 200, body: { ...NOTHING_DRAWN.body, board: "engine" } };
	await act(async () => {
		fireEvent.click(slot("semantic-drill-down-open")!);
	});
	await settled();

	expect(slot("semantic-board-stage")?.getAttribute("data-state")).toBe("empty");
	expect(slot("semantic-board-trail")?.textContent).toContain("pipeline");
	await act(async () => {
		fireEvent.click(slot("semantic-board-trail")!.querySelector("button")!);
	});
	await settled();
	expect(slot("semantic-board-stage")?.getAttribute("data-board")).toBe("pipeline");
});

test("a drill-down asking for the current variant follows it when it moves", async () => {
	serving([
		{
			id: "n1",
			name: "board-io",
			kind: "module",
			drillDown: { board: "engine", variant: { kind: "current" } },
		},
	]);
	server.documents["engine"] = boardOf("engine", [
		{ id: "m1", name: "atomic-write", kind: "module" },
	]);
	mountStage("n1", { live: true });
	await settled();
	expect(slot("semantic-drill-down")?.textContent).toContain("as it is");

	// The target board adopts something else. A preview pinned for the life of
	// the tab would go on calling the old state current and open it.
	server.documents["engine"] = {
		...boardOf("engine", []),
		current: "v2",
		variants: [
			{ id: "v1", name: "as it is", lifecycle: "historical", content: { nodes: [], edges: [] } },
			{
				id: "v2",
				name: "as it now is",
				lifecycle: "current",
				content: { nodes: [{ id: "m2", name: "fsync", kind: "module" }], edges: [] },
			},
		],
	};
	await act(async () => {
		announceSemanticBoardChange("engine", 2);
	});
	await settled();

	expect(slot("semantic-drill-down")?.textContent).toContain("as it now is");
	expect(slot("semantic-drill-down")?.textContent).not.toContain("as it is —");
	server.reply = { status: 200, body: { ...NOTHING_DRAWN.body, board: "engine" } };
	await act(async () => {
		fireEvent.click(slot("semantic-drill-down-open")!);
	});
	await settled();
	expect(
		server.calls.some((url) => url.includes("board=engine") && url.includes("variant=v2")),
	).toBe(true);
});

test("a subject held up by two disagreements of one kind says both", async () => {
	// A relationship on a draft whose predecessor took both of its endpoints
	// away: two disagreements, the same kind, neither about a field. Nothing
	// distinguishes them but what they say, so a panel keyed on the kind and the
	// field alone shows one of them — or, after an update, the wrong one.
	const wired = { nodes: NODES, edges: [{ id: "e1", from: "n1", to: "n2", kind: "call" }] };
	server.reply = {
		status: 200,
		body: { ...drawing(1), variant: { id: "v2", name: "proposed", lifecycle: "draft" } },
	};
	server.documents["pipeline"] = {
		...boardOf("pipeline", NODES),
		variants: [
			{ id: "v1", name: "as it is", lifecycle: "current", content: wired },
			{
				id: "v2",
				name: "proposed",
				lifecycle: "draft",
				parent: "v1",
				content: wired,
				reconciliation: {
					against: "v1",
					atVersion: 1,
					base: wired,
					issues: [lostEnd("gone-from"), lostEnd("gone-to")],
				},
			},
		],
	};
	// React is the thing that notices two children sharing an identity, and it
	// says so on the console rather than by rendering anything different — so
	// that is what is watched. A list keyed on the kind and the field alone
	// renders both of these once and then cannot tell them apart on an update.
	const complaints: string[] = [];
	const spoke = console.error;
	/**
	 * Keep what React complains about instead of printing it.
	 * @param said The parts of one complaint.
	 */
	console.error = (...said: unknown[]): void => {
		complaints.push(said.map((part) => String(part)).join(" "));
	};
	try {
		mountStage("e1");
		await settled();
	} finally {
		console.error = spoke;
	}

	const waiting = slot("semantic-inspector-waiting");
	expect(waiting?.textContent ?? "").toContain("gone-from");
	expect(waiting?.textContent ?? "").toContain("gone-to");
	expect(waiting?.children).toHaveLength(2);
	expect(complaints.filter((said) => said.includes("same key"))).toEqual([]);
});

test("a board the inspector cannot read says so rather than reading forever", async () => {
	// Nothing was put in `server.documents`, so the board route refuses.
	server.reply = { status: 200, body: drawing(1) };
	mountStage("n1");
	await settled();

	expect(inspector()).toContain("could not be read");
	expect(inspector()).not.toContain("Reading the board…");
});

test("a selection the board no longer holds says so instead of showing a blank panel", async () => {
	serving();
	mountStage("gone");
	await settled();

	expect(inspector()).toContain("not on the board any more");
});

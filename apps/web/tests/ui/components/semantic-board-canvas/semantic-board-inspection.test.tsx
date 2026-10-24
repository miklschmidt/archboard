// What picking something out of a diagram tells a person, and where a link to
// the level below leads.
//
// The card in the picture carries a name, a kind and one line. More of what
// an architecture says about a node — the longer description, where its code
// is, and the board under it — is reached by inspecting, and that
// is what these check. They read the rendered panel rather than the module's
// internals, because "a person can find this out" is the claim being made.
// The code and the board under it are the panel's foot, where a part's ways
// deeper are.

import { expect, test } from "bun:test";
import { act, fireEvent } from "@testing-library/react";

import type { CodeBinding } from "@archboard/code-binding/bindings";
import { announceSemanticBoardChange } from "#ui/state/semantic-board-canvas/board-changes.ts";
import {
	PANE_VAULT,
	drawing,
	mountStage,
	NOTHING_DRAWN,
	server,
	settle,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";

/** One node of a board document, as the board file spells it. */
type Node = Record<string, unknown>;

/**
 * One board document, as its route answers with it.
 * @param name What the board is called.
 * @param nodes Its nodes.
 * @param variants Its variants beyond the current one, if any.
 * @param edges The current variant's relationships.
 * @returns The document.
 */
function boardOf(
	name: string,
	nodes: readonly Node[],
	variants: readonly Record<string, unknown>[] = [],
	edges: readonly Record<string, unknown>[] = [],
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
			{ id: "v1", name: "as it is", lifecycle: "current", content: { nodes, edges } },
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
		binding: { repo: "coordinator", path: "src/voice/bridge.ts", symbol: "VoiceBridge.connect" },
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

/** What the person has asked the shell to open, in order. */
const opened: CodeBinding[] = [];

/**
 * The shell's way of opening a part's code: it keeps what it was asked for.
 * @param binding Where the code is.
 */
function record(binding: CodeBinding): void {
	opened.push(binding);
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
	mountStage("n1", { onOpenCode: record });
	await settled();

	expect(inspector()).toContain("board-io");
	expect(inspector()).toContain("The one place a note is read or written");
	// The bound file is said once, at the foot, with the way to open it and to
	// copy it; the repository is where the pointer rests on the way to open it.
	expect(slot("semantic-inspector-code")?.textContent).toContain("src/runtime/engine/board-io.ts");
	expect(slot("semantic-inspector-open-code")?.getAttribute("title")).toContain("archboard");
	expect(slot("semantic-inspector-copy")).not.toBeNull();
	// It names no symbol, so none is shown.
	expect(slot("semantic-inspector-symbol")).toBeNull();
});

test("an unbound node with nothing written says nothing of what it does not have", async () => {
	serving();
	mountStage("n2", { onOpenCode: record });
	await settled();

	// A part may be implemented and simply not bound yet, and "planned" would be
	// the panel guessing at the work from the board. A way to code that is not
	// there is not drawn, and no line says so: a line over an absence is a line
	// to read in order to learn there is nothing to read.
	expect(slot("semantic-inspector-code")).toBeNull();
	expect(slot("semantic-inspector-open-code")).toBeNull();
	expect(slot("semantic-go-deeper")).toBeNull();
	expect(slot("semantic-inspector-purpose")).toBeNull();
	expect(slot("semantic-inspector-description")).toBeNull();
	// What it does have is its name and its kind.
	expect(inspector()).toContain("Write Lease");
});

test("two nodes of one board can name two different repositories", async () => {
	serving();
	mountStage("n3", { onOpenCode: record });
	await settled();

	const open = slot("semantic-inspector-open-code");
	expect(open?.getAttribute("title")).toContain("coordinator");
	expect(open?.getAttribute("title")).not.toContain("archboard");
	expect(slot("semantic-inspector-code")?.textContent).toContain("src/voice/bridge.ts");
});

test("a binding that names a symbol shows it beside the file", async () => {
	serving();
	mountStage("n3", { onOpenCode: record });
	await settled();
	expect(slot("semantic-inspector-symbol")?.textContent).toBe("VoiceBridge.connect");
});

test("opening a part's code hands the shell the binding the board states", async () => {
	serving();
	opened.length = 0;
	mountStage("n1", { onOpenCode: record });
	await settled();

	await act(async () => {
		fireEvent.click(slot("semantic-inspector-open-code")!);
	});
	expect(opened).toEqual([{ repo: "archboard", path: "src/runtime/engine/board-io.ts" }]);
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
	expect(open?.textContent).toContain("as built");
	expect(open?.textContent).toContain("draft proposal");
	expect(open?.getAttribute("data-variant-lifecycle")).toBe("draft");
});

test("a drill-down that asks for whichever variant is current says that it asked", async () => {
	// The designation is a written intention, not the fallback for a name that
	// is not there — so a link that asks for it says so. What it resolves to is
	// the current architecture, which needs no name before it opens: only a
	// state that is not the architecture says what it is.
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

	expect(slot("semantic-go-deeper")?.textContent).toContain("whichever variant is current");
	expect(slot("semantic-drill-down-open")?.textContent).not.toContain("as it is");
	expect(slot("semantic-drill-down-open")?.getAttribute("data-variant-lifecycle")).toBe("current");
});

test("a drill-down naming a variant the target has not got says so and opens nothing", async () => {
	serving();
	server.documents["engine"] = boardOf("engine", [
		{ id: "m1", name: "atomic-write", kind: "module" },
	]);
	mountStage("n1");
	await settled();

	expect(slot("semantic-go-deeper")?.textContent).toContain('no variant called "as built"');
	expect(slot("semantic-go-deeper")?.textContent).toContain("Nothing was opened in its place");
	expect(slot("semantic-drill-down-open")).toBeNull();
});

test("a drill-down whose board the vault has not got names the board rather than shrugging", async () => {
	serving();
	mountStage("n1");
	await settled();

	expect(slot("semantic-go-deeper")?.textContent).toContain("could not be opened");
	expect(slot("semantic-go-deeper")?.textContent).toContain("engine");
	expect(slot("semantic-drill-down-open")).toBeNull();
});

test("following a drill-down shows the target board and offers the way back", async () => {
	serving();
	// The way back is named as the board is, not as its key is spelled.
	server.documents["pipeline"] = boardOf("Pipeline Board", NODES);
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
	expect(server.calls.some((url) => url.includes("board=engine"))).toBe(true);
	// The pane says where it came from and how to get back, with no navigator to
	// place the board: the address still names the board the pane was opened on,
	// so the way back has to be in the pane's own breadcrumb.
	expect(slot("pane-crumb")?.textContent).toContain("Pipeline Board");

	await act(async () => {
		fireEvent.click(slot("pane-crumb")!);
	});
	await settled();
	expect(slot("semantic-board-stage")?.getAttribute("data-board")).toBe("pipeline");
	expect(slot("pane-crumb")).toBeNull();
});

test("a link written before its board and variant were renamed opens them by the names they have now", async () => {
	// The link on n1 still says "engine" and "as built" (ADR 0036).
	serving();
	const renamed = {
		...boardOf(
			"Board Engine",
			[{ id: "m1", name: "atomic-write", kind: "module" }],
			[
				{
					id: "v2",
					name: "Fully built",
					formerNames: ["as built"],
					lifecycle: "draft",
					content: { nodes: [{ id: "m2", name: "fsync", kind: "module" }], edges: [] },
				},
			],
		),
		formerNames: ["engine"],
	};
	server.documents["engine"] = renamed;
	server.documents["Board Engine"] = renamed;
	mountStage("n1", { live: true });
	await settled();

	expect(slot("semantic-drill-down-open")?.getAttribute("data-variant-lifecycle")).toBe("draft");
	expect(slot("semantic-go-deeper")?.textContent).toContain("Board Engine");
	expect(slot("semantic-go-deeper")?.textContent).toContain("Fully built");

	server.reply = { status: 200, body: drawing(1, "Board Engine") };
	await act(async () => {
		fireEvent.click(slot("semantic-drill-down-open")!);
	});
	await settled();
	expect(slot("semantic-board-stage")?.getAttribute("data-board")).toBe("Board Engine");
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
	expect(slot("pane-crumb")?.textContent).toContain("pipeline");
	await act(async () => {
		fireEvent.click(slot("pane-crumb")!);
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
	expect(slot("semantic-drill-down-open")?.getAttribute("data-variant-lifecycle")).toBe("current");

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
		announceSemanticBoardChange(PANE_VAULT, "engine", 2);
	});
	await settled();

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

test("picking a joined line of the overview shows its drawn ends and every relationship it joins", async () => {
	// Two parts of Board Runtime reach the Voice Bridge, so the overview joins them into e1.
	const edges = [
		{ id: "e1", from: "n1", to: "n3", kind: "call", label: "reads notes" },
		{ id: "e2", from: "n2", to: "n3", kind: "call", label: "takes the lease" },
	];
	server.documents["pipeline"] = boardOf("pipeline", NODES, [], edges);
	server.reply = { status: 200, body: drawing(1) };
	mountStage("e1");
	await settled();

	expect(slot("semantic-inspector")?.dataset["subject"]).toBe("line");
	const joined = [
		...document.querySelectorAll<HTMLElement>("[data-slot='semantic-inspector-joined']"),
	];
	expect(joined.map((row) => row.dataset["edge"])).toEqual(["e1", "e2"]);
	expect(slot("semantic-inspector-about")?.textContent).toContain("Board Runtime");
	expect(slot("semantic-inspector-about")?.textContent).not.toContain("reads notes");
});

test("the same id in Everything is the one relationship it names", async () => {
	const edges = [
		{ id: "e1", from: "n1", to: "n3", kind: "call", label: "reads notes" },
		{ id: "e2", from: "n2", to: "n3", kind: "call", label: "takes the lease" },
	];
	server.documents["pipeline"] = boardOf("pipeline", NODES, [], edges);
	server.reply = {
		status: 200,
		body: {
			...drawing(1),
			view: { id: "Everything", name: "Everything", grammar: "architecture" },
		},
	};
	mountStage("e1");
	await settled();

	expect(slot("semantic-inspector")?.dataset["subject"]).toBe("edge");
	expect(slot("semantic-inspector-between")?.textContent).toContain("board-io");
});

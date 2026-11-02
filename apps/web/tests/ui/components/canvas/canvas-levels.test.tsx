// Reading the model a level down.
//
// A drill-down opens another model in the same pane. It is not addressed — the
// trail is local and the address still names where the reader started — but it
// is still a model somebody is reading, so it offers what any model offers:
// its own ways of being read, in the sidebar. What it must not offer is the
// level above's: a view id belongs to one model, so the reading starts again at
// each level.
//
// The pane is mounted with motion off throughout: these are about what a level
// reads, and a model that opens by flying into its card is the dive's tests.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	chooseVariantInShell,
	drawing,
	mountStage,
	renderCalls,
	server,
	settle,
} from "#tests/ui/support/canvas/stage-harness.tsx";
import {
	documentOf,
	cardDocument,
	twoCardDrawing,
	twoCardPipeline,
} from "#tests/ui/support/canvas/legacy-documents.ts";

/** The two ways the model below can be read. */
const ENGINE_VIEWS = [
	{ id: "ev1", name: "The parts", grammar: "architecture" },
	{ id: "ev2", name: "One write, in order", grammar: "sequence" },
] as const;

/** The one way the model above can be read. */
const PIPELINE_VIEW = { id: "pv1", name: "Where writes go", grammar: "architecture" } as const;

/** The current state of the model the pane is opened on: one node, with a link to the level below. */
const PIPELINE_CURRENT = {
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
} as const;

/** The model the pane is opened on. */
const PIPELINE = documentOf("pipeline", [PIPELINE_CURRENT], "v1", [
	{ ...PIPELINE_VIEW, scope: { kind: "all" } },
]);

/** The proposal the link above names. */
const AS_BUILT = {
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
};

/** The state the model below says is implemented. */
const SHIPPED = {
	id: "e2",
	name: "shipped",
	lifecycle: "current",
	content: { nodes: [{ id: "m1", name: "atomic-write", kind: "module" }], edges: [] },
};

/** The views the model below offers, scoped as its document states them. */
const ENGINE_SCOPES = ENGINE_VIEWS.map((view) => ({ ...view, scope: { kind: "all" } }));

/** The model below: two states, two ways of reading it. */
const ENGINE = documentOf("engine", [AS_BUILT, SHIPPED], "e2", ENGINE_SCOPES);

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
	// The pane's own model is the shell's; a level below is the pane's own.
}

test("a model a level down offers its own views and its own states", async () => {
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = ENGINE;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage("n1", {
		live: true,
		reducedMotion: true,
		onViewChange: ignoreChoice,
	});
	await settle();
	await openDown();

	// The target's own views, not the ones from the model above: a view id is a
	// subject of one variant's content and means nothing here.
	expect(buttons("semantic-view-choice").map((one) => one.textContent)).toEqual([
		"Overview",
		"The parts",
		"One write, in order",
		"Everything",
	]);
	// The link named "as built", so that is what is on screen.
	expect(renderCalls().at(-1)).toContain("variant=e1");
});

test("double-clicking a card opens the model it drills down to", async () => {
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = ENGINE;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage(null, {
		live: true,
		reducedMotion: true,
		onViewChange: ignoreChoice,
	});
	await settle();
	server.reply = { status: 200, body: { ...drawing(1, "engine"), views: [...ENGINE_VIEWS] } };
	await act(async () => {
		fireEvent.doubleClick(document.querySelector("#card")!);
	});
	await settle();
	const stage = document.querySelector("[data-slot='canvas-stage']");
	expect(stage?.getAttribute("data-model")).toBe("engine");
	// The variant the link names, as the inspector's way in would have opened.
	expect(renderCalls().at(-1)).toContain("variant=e1");
});

test("a double-click whose model answers after the pane moved on opens nothing", async () => {
	const proposed = {
		...PIPELINE_CURRENT,
		id: "v2",
		name: "proposed",
		lifecycle: "draft",
		parent: "v1",
	};
	server.documents["pipeline"] = documentOf("pipeline", [PIPELINE_CURRENT, proposed], "v1", [
		{ ...PIPELINE_VIEW, scope: { kind: "all" } },
	]);
	server.documents["engine"] = ENGINE;
	const engineRead = Promise.withResolvers<void>();
	server.held["engine"] = engineRead.promise;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage(null, {
		live: true,
		reducedMotion: true,
		onViewChange: ignoreChoice,
	});
	await settle();
	await act(async () => {
		fireEvent.doubleClick(document.querySelector("#card")!);
	});
	// The reader moves to another state of this model before the model below answers.
	server.reply = {
		status: 200,
		body: {
			...drawing(1),
			views: [PIPELINE_VIEW],
			variant: { id: "v2", name: "proposed", lifecycle: "draft" },
		},
	};
	chooseVariantInShell("v2");
	await settle();
	await act(async () => {
		engineRead.resolve();
	});
	await settle();
	// The pane never asks for a picture of the model below.
	expect(renderCalls().filter((call) => call.includes("model=engine"))).toEqual([]);
});

test("a newer double-click wins over an older one whose model answers first", async () => {
	// Two cards, each opening a different model.
	server.documents["pipeline"] = twoCardPipeline();
	server.documents["engine"] = cardDocument("engine", undefined);
	server.documents["store"] = cardDocument("store", undefined);
	const engineRead = Promise.withResolvers<void>();
	const storeRead = Promise.withResolvers<void>();
	server.held["engine"] = engineRead.promise;
	server.held["store"] = storeRead.promise;
	server.reply = { status: 200, body: twoCardDrawing() };
	mountStage(null, {
		live: true,
		reducedMotion: true,
		onViewChange: ignoreChoice,
	});
	await settle();
	await act(async () => {
		fireEvent.doubleClick(document.querySelector("#card")!);
	});
	await act(async () => {
		fireEvent.doubleClick(document.querySelector("#card2")!);
	});
	const stage = document.querySelector("[data-slot='canvas-stage']");

	// The older double-click's model answers while the newer one's is still being
	// read. The reader has asked for something else since, so it opens nothing.
	await act(async () => {
		engineRead.resolve();
	});
	await settle();
	expect(stage?.getAttribute("data-model")).toBe("pipeline");
	expect(renderCalls().filter((call) => call.includes("model=engine"))).toEqual([]);

	// The newer one's model then answers, and is the one that opens and stays open.
	server.reply = { status: 200, body: drawing(1, "store") };
	await act(async () => {
		storeRead.resolve();
	});
	await settle();
	expect(stage?.getAttribute("data-model")).toBe("store");
	expect(renderCalls().filter((call) => call.includes("model=engine"))).toEqual([]);
});

test("while the model below is drawn, the model above stays on the pane only to be seen leaving", async () => {
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = ENGINE;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage("n1", {
		live: true,
		reducedMotion: true,
		onViewChange: ignoreChoice,
	});
	await settle();

	server.reply = "pending";
	await act(async () => {
		fireEvent.click(document.querySelector<HTMLElement>("[data-slot='semantic-drill-down-open']")!);
	});
	await settle();
	const stage = document.querySelector("[data-slot='canvas-stage']");
	// The pane is waiting on the model below, and says so, under that model's name.
	expect(stage?.getAttribute("data-state")).toBe("loading");
	expect(stage?.getAttribute("aria-busy")).toBe("true");
	expect(stage?.getAttribute("aria-label")).toContain("engine");
	// What it shows is the model above, which cannot be reached into.
	const viewport = document.querySelector("[data-slot='canvas-viewport']");
	expect(viewport?.querySelector("g[data-semantic-id='n1']")).not.toBeNull();
	expect(viewport?.hasAttribute("inert")).toBe(true);
	expect(document.querySelector("[data-slot='semantic-inspector']")).toBeNull();
});

test("choosing at the level below asks for that reading of the model below", async () => {
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = ENGINE;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage("n1", {
		live: true,
		reducedMotion: true,
		onViewChange: ignoreChoice,
	});
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
	expect(asked).toContain("model=engine");
	expect(asked).toContain("view=ev2");
});

test("coming back up leaves the pane reading its own model as it was", async () => {
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = ENGINE;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage("n1", { live: true, reducedMotion: true, view: "pv1", onViewChange: ignoreChoice });
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
		fireEvent.click(document.querySelector<HTMLElement>("[data-slot='pane-crumb']")!);
	});
	await settle();
	// The level below's choice went with the level; the pane's own model is read
	// the way the shell says it is, which is where the address carries it.
	const stage = document.querySelector("[data-slot='canvas-stage']");
	expect(stage?.getAttribute("data-model")).toBe("pipeline");
	expect(buttons("semantic-view-choice").map((one) => one.textContent)).toEqual([
		"Overview",
		"Where writes go",
		"Everything",
	]);
	expect(
		renderCalls().every((call) => !call.includes("view=pv1&") || call.includes("pipeline")),
	).toBe(true);
});

/**
 * Open the legacy board the card drills down to, as a double-click on it does.
 * @param model The legacy board it opens, which the next picture is of.
 * @returns Settles once that legacy board is on screen.
 */
async function doubleClickInto(model: string): Promise<void> {
	server.reply = { status: 200, body: drawing(1, model) };
	await act(async () => {
		fireEvent.doubleClick(document.querySelector("#card")!);
	});
	await settle();
}

test("a crumb two levels up goes straight back to its model, as one change by hand", async () => {
	server.documents["pipeline"] = cardDocument("pipeline", "engine");
	server.documents["engine"] = cardDocument("engine", "store");
	server.documents["store"] = cardDocument("store", undefined);
	server.reply = { status: 200, body: drawing(1) };
	const changed: string[] = [];
	/**
	 * Keep what the shell heard the person changed by hand.
	 * @param part The part of the reading.
	 */
	function heard(part: string): void {
		changed.push(part);
	}
	mountStage(null, { live: true, reducedMotion: true, onUserChanged: heard });
	await settle();
	await doubleClickInto("engine");
	await doubleClickInto("store");
	const crumbs = buttons("pane-crumb");
	expect(crumbs.map((crumb) => crumb.textContent)).toEqual(["pipeline", "engine"]);

	changed.length = 0;
	server.reply = { status: 200, body: drawing(1) };
	await act(async () => {
		fireEvent.click(crumbs[0]!);
	});
	await settle();
	expect(document.querySelector("[data-slot='canvas-stage']")?.getAttribute("data-model")).toBe(
		"pipeline",
	);
	expect(buttons("pane-crumb")).toEqual([]);
	expect(changed).toEqual(["model"]);
});

/** What the pane said it was reading, as these tests read it back. */
type Reading = { model: string; variant: string | null; view: string | null };

/**
 * Keep what the pane said it was reading.
 * @param reading What it is reading now.
 */
function report(reading: Reading): void {
	readings.push({ model: reading.model, variant: reading.variant, view: reading.view });
}

/** Everything the pane has said it was reading, in order. */
const readings: Reading[] = [];

test("the pane says which model it is actually reading, not the one it was opened on", async () => {
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = ENGINE;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage("n1", {
		live: true,
		reducedMotion: true,
		onViewChange: ignoreChoice,
		onReading: report,
	});
	await settle();
	// Before anything is followed, the pane is reading what it was opened on.
	expect(readings.at(-1)?.model).toBe("pipeline");

	await openDown();
	// A shell told "pipeline" here would say an agent is looking at a model
	// nobody has on screen, and would open the code of a node from the wrong one.
	expect(readings.at(-1)?.model).toBe("engine");

	await act(async () => {
		fireEvent.click(buttons("semantic-view-choice")[2]!);
	});
	await settle();
	expect(readings.at(-1)).toMatchObject({ model: "engine", view: "ev2" });
});

test("choosing a way of reading a level does not change which state it is", async () => {
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = ENGINE;
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage("n1", {
		live: true,
		reducedMotion: true,
		onViewChange: ignoreChoice,
	});
	await settle();
	await openDown();
	// The link named "as built", which is not the model below's current state.
	expect(renderCalls().at(-1)).toContain("variant=e1");

	await act(async () => {
		fireEvent.click(buttons("semantic-view-choice")[1]!);
	});
	await settle();
	// Choosing a grammar says nothing about which state to read it in. Losing the
	// named state here would show the current architecture under a link that
	// asked for what was built.
	const asked = renderCalls().at(-1) ?? "";
	expect(asked).toContain("model=engine");
	expect(asked).toContain("variant=e1");
});

test("a link into a proposal that was let go says so before it opens, and after", async () => {
	// Shelving keeps the variant under its name precisely so a link like this one
	// goes on opening it (ADR 0030); what a reader must not be left guessing is
	// that what they followed is a proposal nobody is carrying out.
	server.documents["pipeline"] = PIPELINE;
	server.documents["engine"] = documentOf(
		"engine",
		[{ ...AS_BUILT, lifecycle: "shelved" }, SHIPPED],
		"e2",
		ENGINE_SCOPES,
	);
	server.reply = { status: 200, body: { ...drawing(1), views: [PIPELINE_VIEW] } };
	mountStage("n1", {
		live: true,
		reducedMotion: true,
		onViewChange: ignoreChoice,
	});
	await settle();

	// Disclosed before it is followed, beside the name the link asked for.
	const open = document.querySelector<HTMLElement>("[data-slot='semantic-drill-down-open']");
	expect(open?.getAttribute("data-variant-lifecycle")).toBe("shelved");

	await openDown();
	// And on screen once it is open: the header names the variant that is shown.
	expect(document.querySelector("[data-slot='crumb-state']")?.textContent).toContain("as built");
});

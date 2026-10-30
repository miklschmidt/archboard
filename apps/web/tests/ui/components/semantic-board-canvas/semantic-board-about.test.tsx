// The About page of a pane (TASK-475): everything a board says about itself on
// one page over the picture, for reading a board and finding a way in it.
//
// What these catch: a header that offers more ways to read a board than the
// picture and this page; a walkthrough step that loses its words, its view or
// its subjects on the page; a step that names no view and so shows none; a
// step's control that presents from another step; a page that comes back at
// its top rather than where the reader left it; parts listed flat instead of
// in their containment; a part that does not say which board it opens, or in
// which repository that board is; a row that picks nothing, or shows the
// diagram without the pick; a subject the view on screen does not draw that is
// never fitted, because what waits for the whole board's picture went with the
// page; an outline that does not take the keyboard to the section it names;
// and a section with nothing to show that takes room anyway.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	REST_MS,
	cameraNow,
	takeFrames,
	wheelAt,
} from "#tests/ui/support/semantic-board-canvas/camera-probes.ts";
import { current } from "#tests/ui/support/semantic-board-canvas/presentation-probes.ts";
import {
	VIEWPORT,
	drawing,
	mountStage,
	server,
	settle,
	viewport,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";
import { openAboutPage } from "#tests/ui/support/semantic-board-canvas/variants-page.ts";

/** The view one step is told through. */
const VIEW = {
	id: "vw1",
	name: "The writer alone",
	grammar: "architecture",
	summary: "Only the write path.",
	scope: { kind: "selection", nodes: ["n1"], edges: [], flows: [] },
} as const;

/** A walkthrough of two steps: one about the whole picture in the view on screen, one about a part and a relationship in a view of its own. */
const WALKTHROUGH = {
	id: "w1",
	name: "For the board",
	summary: "Where the writes go.",
	beats: [
		{ id: "b1", heading: "The shape of it", body: "Two parts and one write.", subjects: [] },
		{
			id: "b2",
			heading: "One write",
			body: "The API writes a revision.",
			subjects: ["n1", "e1"],
			view: VIEW.id,
		},
	],
};

/**
 * What the variant holds. The container is stated after the parts it holds,
 * so a list in the order the variant states its parts is not their containment.
 */
const CONTENT = {
	nodes: [
		{ id: "n1", name: "API", kind: "service", parent: "sys", responsibility: "Accepts changes." },
		{ id: "n2", name: "Board storage", kind: "service", parent: "sys" },
		{ id: "sys", name: "Board service", kind: "service" },
		{ id: "cli", name: "Agent CLI", kind: "service" },
	],
	edges: [{ id: "e1", from: "n1", to: "n2", kind: "data", label: "write revision" }],
	walkthroughs: [WALKTHROUGH],
};

/**
 * Put a board in front of the pane, and a picture of it that draws `n1` and `e1`.
 * @param content What the board's one variant holds.
 */
function serving(content: Record<string, unknown> = CONTENT): void {
	server.documents["pipeline"] = {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: "bd",
		name: "pipeline",
		level: "service",
		version: 1,
		createdAt: "2026-10-15T00:00:00.000Z",
		updatedAt: "2026-10-15T00:00:00.000Z",
		views: [VIEW],
		current: "v1",
		variants: [{ id: "v1", name: "as it is", lifecycle: "current", content }],
	};
	server.reply = { status: 200, body: drawing(1) };
}

/**
 * Every element of one slot on the page, by one of its data attributes.
 * @param slot The `data-slot`.
 * @param key The data attribute to read.
 * @returns The values, in the order of the page.
 */
function listed(slot: string, key: string): (string | undefined)[] {
	return [...document.querySelectorAll<HTMLElement>(`[data-slot='${slot}']`)].map(
		(element) => element.dataset[key],
	);
}

/**
 * One step on the page.
 * @param id The step's id.
 * @returns The step.
 */
function step(id: string): HTMLElement {
	return document.querySelector<HTMLElement>(`[data-slot='about-step'][data-step='${id}']`)!;
}

/**
 * The control at the end of a row that shows its subject on the diagram.
 * @param row The row's button.
 * @returns The control.
 */
function showOf(row: Element): Element {
	return row.closest("li")!.querySelector("[data-slot='about-show']")!;
}

/**
 * What one part's row says it opens.
 * @param part The part's id.
 * @returns The words of the row's Opens cell, or nothing for a part that opens no board.
 */
function opensOf(part: string): string | null | undefined {
	return document.querySelector(
		`[data-slot='about-part'][data-part='${part}'] [data-slot='about-part-opens']`,
	)?.textContent;
}

/**
 * The point of the picture in the middle of the window on it.
 * @returns The point, in the picture's own units.
 */
function middleOfView(): { readonly x: number; readonly y: number } {
	const { x, y, scale } = cameraNow();
	return { x: (VIEWPORT.width / 2 - x) / scale, y: (VIEWPORT.height / 2 - y) / scale };
}

/**
 * The About page on screen.
 * @returns The page, or null while the diagram is read.
 */
function aboutPage(): HTMLElement | null {
	return document.querySelector<HTMLElement>("[data-slot='board-page']");
}

/**
 * Click an element the way a person does, and let the pane answer.
 * @param element The element.
 */
async function click(element: Element): Promise<void> {
	act(() => {
		fireEvent.click(element);
	});
	await settle();
}

test("the header offers two ways to read a board: the picture, and the About page over it", async () => {
	serving();
	mountStage(null, { reducedMotion: true });
	await settle();
	expect(listed("board-tab", "tab")).toEqual(["diagram", "about"]);
	expect(document.querySelector("[data-slot='board-page']")).toBeNull();
	openAboutPage();
	await settle();
	expect(document.querySelector("[data-slot='board-page']")?.getAttribute("data-tab")).toBe(
		"about",
	);
});

test("each step shows its heading, its words, the view it is told through and the subjects it focuses", async () => {
	serving();
	mountStage(null, { reducedMotion: true });
	await settle();
	openAboutPage();
	await settle();

	expect(listed("about-step", "step")).toEqual(["b1", "b2"]);
	const told = step("b2");
	expect(told.querySelector("h5")?.textContent).toContain("One write");
	expect(told.textContent).toContain("The API writes a revision.");
	const view = told.querySelector<HTMLElement>("[data-slot='about-step-view']")!;
	expect(view.dataset["view"]).toBe(VIEW.id);
	expect(view.textContent).toContain(VIEW.name);
	expect(
		[...told.querySelectorAll<HTMLElement>("[data-slot='about-step-subject']")].map(
			(one) => one.dataset["subject"],
		),
	).toEqual(["n1", "e1"]);

	// A step that names no view is told through the view on screen, and still says where.
	const whole = step("b1");
	expect(whole.querySelector("[data-slot='about-step-view']")?.hasAttribute("data-view")).toBe(
		false,
	);
	expect(whole.querySelectorAll("[data-slot='about-step-subject']")).toHaveLength(0);
});

test("a step presents its walkthrough from there over the picture, and leaving it brings the page back where it was", async () => {
	serving();
	mountStage(null, { reducedMotion: true });
	await settle();
	openAboutPage();
	await settle();
	const page = aboutPage()!;
	act(() => {
		page.scrollTop = 640;
		fireEvent.scroll(page);
	});

	await click(step("b2").querySelector("[data-slot='about-present-step']")!);
	expect(current()).toBe("One write");
	expect(aboutPage()).toBeNull();

	await click(document.querySelector("[aria-label='Leave the walkthrough']")!);
	expect(current()).toBeNull();
	expect(aboutPage()?.scrollTop).toBe(640);
});

test("the parts stand in their containment: each container, then the parts it holds, a step in", async () => {
	serving();
	mountStage(null, { reducedMotion: true });
	await settle();
	openAboutPage();
	await settle();
	expect(listed("about-part", "part")).toEqual(["sys", "n1", "n2", "cli"]);
	expect(
		[...document.querySelectorAll<HTMLElement>("[data-slot='about-part']")].map(
			(row) => row.closest<HTMLElement>("[data-depth]")?.dataset["depth"],
		),
	).toEqual(["0", "1", "1", "0"]);
});

test("a part names the board it opens, and the repository of a board in another one", async () => {
	serving({
		nodes: [
			{
				id: "cli",
				name: "Agent CLI",
				kind: "service",
				drillDown: { board: "agent cli", variant: { kind: "current" } },
			},
			{
				id: "pay",
				name: "Payments",
				kind: "service",
				drillDown: {
					board: "payments",
					variant: { kind: "current" },
					repo: "github.com/acme/payments",
				},
			},
		],
		edges: [],
		walkthroughs: [],
	});
	mountStage(null, { reducedMotion: true });
	await settle();
	openAboutPage();
	await settle();
	expect(opensOf("cli")).toBe("agent cli");
	expect(opensOf("pay")).toContain("payments");
	expect(opensOf("pay")).toContain("github.com/acme/payments");
});

test("a row picks its subject, and its control picks it and shows it on the diagram", async () => {
	serving();
	const { picks } = mountStage(null, { reducedMotion: true });
	await settle();
	openAboutPage();
	await settle();

	await click(document.querySelector("[data-slot='about-part'][data-part='n2']")!);
	expect(picks.at(-1)).toBe("n2");
	expect(document.querySelector("[data-slot='board-page']")).not.toBeNull();

	await click(
		showOf(document.querySelector("[data-slot='about-relationship'][data-relationship='e1']")!),
	);
	expect(picks.at(-1)).toBe("e1");
	expect(document.querySelector("[data-slot='board-page']")).toBeNull();
	expect(
		document.querySelector("[data-slot='board-tab'][data-active]")?.getAttribute("data-tab"),
	).toBe("diagram");
});

test("showing a part the view on screen does not draw opens the whole board, then fits the part", async () => {
	serving();
	server.reply = {
		status: 200,
		body: {
			...drawing(1),
			view: { id: VIEW.id, name: VIEW.name, grammar: VIEW.grammar },
			width: 4000,
			height: 3000,
			drawn: { nodes: [], edges: [], flows: [], steps: [] },
			atlas: { nodes: {}, edges: {}, regions: {} },
		},
	};
	const { picks } = mountStage(null, { view: VIEW.id, live: true, reducedMotion: true });
	await settle();
	server.reply = { status: 200, body: drawing(1) };
	openAboutPage();
	await settle();

	await click(showOf(document.querySelector("[data-slot='about-part'][data-part='n1']")!));
	await settle();
	expect(picks.at(-1)).toBe("n1");
	expect(
		server.calls.some((url) => url.includes("render") && url.includes("view=Everything")),
	).toBe(true);
	// The whole board is 400 by 300, and the part is drawn at its corner, 80 by 40.
	const { x, y } = middleOfView();
	expect(Math.hypot(x - 40, y - 20)).toBeLessThan(Math.hypot(x - 200, y - 150));
});

test("the outline goes to the section it names and gives its heading the keyboard", async () => {
	serving();
	mountStage(null, { reducedMotion: true });
	await settle();
	openAboutPage();
	await settle();
	await click(
		document.querySelector("[data-slot='about-outline-entry'][data-section='relationships']")!,
	);
	expect(
		document.activeElement?.closest("[data-about-section]")?.getAttribute("data-about-section"),
	).toBe("relationships");
	expect(document.activeElement?.tagName).toBe("H3");
});

test("a section with nothing to show is absent from the page and from the outline", async () => {
	serving({ nodes: [{ id: "n1", name: "API", kind: "service" }], edges: [], walkthroughs: [] });
	mountStage(null, { reducedMotion: true });
	await settle();
	openAboutPage();
	await settle();
	const sections = [...document.querySelectorAll<HTMLElement>("[data-about-section]")].map(
		(section) => section.dataset["aboutSection"],
	);
	expect(sections).toEqual(["parts", "variants"]);
	expect(listed("about-outline-entry", "section")).toEqual(sections);
});

// An address can name a variant the board no longer has, as one written before
// the variant was renamed does. The page then has none of that variant's
// walkthroughs, parts or relationships to list, and a page that listed nothing
// at all would leave the reader no way to the variants the board does have.
test("a board with no such variant still lists its variants, and choosing one reads it", async () => {
	serving();
	const asked: (string | null)[] = [];
	/**
	 * Keep what the pane asked the shell to show.
	 * @param variant The variant's id, or null for whichever is current.
	 */
	function record(variant: string | null): void {
		asked.push(variant);
	}
	mountStage(null, { variant: "gone", onVariantChange: record, reducedMotion: true });
	await settle();
	openAboutPage();
	await settle();
	expect(
		[...document.querySelectorAll<HTMLElement>("[data-about-section]")].map(
			(section) => section.dataset["aboutSection"],
		),
	).toEqual(["variants"]);
	expect(listed("variant-entry", "variant")).toEqual(["v1"]);

	await click(document.querySelector("[data-slot='variant-entry'][data-variant='v1']")!);
	expect(asked).toEqual([null]);
});

// The pick that comes with a show moves the camera in its own right: a pick
// from off the picture glides just far enough to bring the part into view, and
// in a pane that shares the centre the panel the pick floats moves the picture
// clear of itself. Either, made after the fit, left the part at the edge of the
// view or out of it, at the zoom the reader had.
test.each([
	["alone", undefined],
	[
		"sharing the centre",
		{ letter: null, controls: null, notice: null, shared: true, active: true },
	],
] as const)(
	"showing a part fits it in the middle of the view in a pane %s, whatever the pick moves",
	async (_, chrome) => {
		serving();
		mountStage(null, { live: true, chrome });
		await settle();
		const frames = takeFrames();
		try {
			// Far into the corner opposite the part, so the part is out of view.
			act(() => {
				viewport().dispatchEvent(wheelAt(-2000, [VIEWPORT.width - 1, VIEWPORT.height - 1], true));
			});
			frames.run(REST_MS);
			openAboutPage();
			await settle();
			await click(showOf(document.querySelector("[data-slot='about-part'][data-part='n1']")!));
			frames.run(REST_MS);
		} finally {
			frames.restore();
		}
		// The part is drawn at the board's corner, 80 by 40.
		const { x, y } = middleOfView();
		expect(Math.hypot(x - 40, y - 20)).toBeLessThan(1);
	},
);

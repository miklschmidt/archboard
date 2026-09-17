// Presenting a variant's own explanation of itself over the picture of it.
//
// The claim being checked is the one a walkthrough lives or dies by: the steps
// are in the order somebody wrote them, one of them is the one on screen, the
// reader moves between them on purpose, and the diagram attends to whatever
// that one is about — gliding there, letting the rest recede, and giving the
// reader back where they were when they leave. Every position on screen comes
// out of the atlas the server sent; nothing here invents a coordinate, and a
// step about something this reading does not draw says so rather than pointing
// the camera at nothing.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import { PRESENTATION_STEP_MS } from "@/shared/timing/timing";
import {
	cameraNow,
	chooseVariantInShell,
	drawing,
	mountStage,
	part,
	renderCalls,
	server,
	settle,
	surface,
	viewport,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

/** The view the variant offers, which one step is told through. */
const VIEW = { id: "vw1", name: "The writer alone", grammar: "architecture" } as const;

/**
 * One walkthrough of four beats: the whole picture, one card, a beat read
 * through a view, and a beat about a node this drawing does not draw.
 */
const WALKTHROUGH = {
	id: "w1",
	name: "For the board",
	summary: "Ten minutes on where the writes go.",
	beats: [
		{ id: "b1", heading: "The shape of it", body: "Two modules and one call.", subjects: [] },
		{ id: "b2", heading: "One writer", body: "board-io owns every write.", subjects: ["n1"] },
		{
			id: "b3",
			heading: "One edit, end to end",
			body: "Follow a single write through.",
			subjects: ["e1"],
			view: VIEW.id,
		},
		{
			id: "b4",
			heading: "The lease",
			body: "Nobody else may write meanwhile.",
			subjects: ["n2"],
		},
	],
};

/** The variant's content: two nodes, one relationship and one explanation. */
const CONTENT = {
	nodes: [
		{ id: "n1", name: "board-io", kind: "module" },
		{ id: "n2", name: "Write Lease", kind: "module" },
	],
	edges: [{ id: "e1", from: "n1", to: "n2", kind: "call" }],
	walkthroughs: [WALKTHROUGH],
};

/** The board-owned view one walkthrough beat reads through. */
const VIEWS = [{ ...VIEW, scope: { kind: "selection", nodes: ["n1"], edges: [], flows: [] } }];

/**
 * One board document, as its route answers with it.
 * @param content What its one variant says.
 * @returns The document.
 */
function boardOf(content: Record<string, unknown>): Record<string, unknown> {
	return withVariants([{ id: "v1", name: "as it is", lifecycle: "current", content }]);
}

/** The variant the pane opens on. */
const CURRENT_VARIANT = { id: "v1", name: "as it is", lifecycle: "current", content: CONTENT };

/**
 * One board document holding a family of variants.
 * @param variants The variants, in the order the board states them.
 * @returns The document.
 */
function withVariants(variants: readonly Record<string, unknown>[]): Record<string, unknown> {
	return {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: "bd",
		name: "pipeline",
		level: "system",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views: VIEWS,
		current: "v1",
		variants,
	};
}

/**
 * Put a board that explains itself, and a picture of it, in front of a pane.
 *
 * The picture draws `n1` and `e1` and not `n2`, which is what a narrowed
 * reading of a variant looks like: the board holds the node, this drawing does
 * not show it.
 * @param content What the variant says; the explained one by default.
 */
function serving(content: Record<string, unknown> = CONTENT): void {
	server.documents["pipeline"] = boardOf(content);
	server.reply = { status: 200, body: { ...drawing(1), views: [VIEW] } };
}

/**
 * Every walkthrough button on screen, in order.
 * @returns The buttons.
 */
function offers(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>("[data-slot='semantic-walkthrough-choice']")];
}

/**
 * The heading of the step on screen.
 * @returns It, or null while nothing is presented.
 */
function current(): string | null {
	return document.querySelector("[data-slot='semantic-presentation-heading']")?.textContent ?? null;
}

/**
 * Press a key the way a person does, wherever focus happens to be.
 * @param key The key.
 */
function press(key: string): void {
	act(() => {
		fireEvent.keyDown(document.body, { key });
	});
}

/**
 * Go to a step through its mark among the steps.
 * @param index The step.
 */
function goTo(index: number): void {
	act(() => {
		fireEvent.click(
			document.querySelector<HTMLElement>(
				`[data-slot='semantic-presentation-dot'][data-step='${index}']`,
			)!,
		);
	});
}

/**
 * Present the first walkthrough the variant offers.
 * @returns Settles once the presentation is up.
 */
async function presenting(): Promise<void> {
	await settle();
	act(() => {
		fireEvent.click(offers()[0]!);
	});
	await settle();
}

/**
 * The subjects the picture rings.
 * @returns Their ids.
 */
function marked(): string[] {
	return [...surface().querySelectorAll("[data-semantic-id].is-selected")].map(
		(group) => group.getAttribute("data-semantic-id") ?? "",
	);
}

/**
 * The subjects the veil leaves standing.
 * @returns Their ids, or none while nothing recedes.
 */
function unveiled(): string[] {
	if (!surface().classList.contains("is-group-focus")) {
		return [];
	}
	return [...surface().querySelectorAll("[data-semantic-id].is-group-member")].map(
		(group) => group.getAttribute("data-semantic-id") ?? "",
	);
}

// The harness measures every element at 800×600, the caption included, so the
// caption keeps the most it may of the viewport clear: 40% of 600, which leaves
// 800×360 to fit into, less the margin.

/** The whole picture, fitted above the caption. */
const WHOLE_ABOVE_CAPTION = { x: 192, y: 24, scale: 1.04 };

/** `n1`, fitted above the caption: 80×40 at the origin, at half again its drawn size. */
const N1_ABOVE_CAPTION = { x: 340, y: 150, scale: 1.5 };

/** The whole picture, fitted to the whole viewport, as the reader had it before presenting. */
const WHOLE_PICTURE = { x: 32, y: 24, scale: 1.84 };

/**
 * Whether two cameras are the same, to within rounding.
 * @param actual The camera on screen.
 * @param expected The camera expected.
 */
function expectCamera(actual: typeof WHOLE_PICTURE, expected: typeof WHOLE_PICTURE): void {
	expect(actual.x).toBeCloseTo(expected.x, 3);
	expect(actual.y).toBeCloseTo(expected.y, 3);
	expect(actual.scale).toBeCloseTo(expected.scale, 5);
}

test("a variant that explains itself nowhere offers nothing at all", async () => {
	server.documents["pipeline"] = boardOf({ nodes: CONTENT.nodes, edges: [] });
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	expect(offers()).toHaveLength(0);
	expect(document.querySelector("[data-slot='semantic-walkthrough-bar']")).toBeNull();
	expect(document.querySelector("[data-slot='semantic-presentation']")).toBeNull();
});

test("choosing a walkthrough presents its first step, in the frame, with where it is in the walkthrough", async () => {
	serving();
	mountStage(null, { reducedMotion: true });
	await presenting();
	expect(current()).toBe("The shape of it");
	expect(part("semantic-presentation").textContent).toContain("Two modules and one call.");
	expect(part("semantic-presentation-count").textContent.replaceAll(/\s/g, "")).toBe("1/4");
	const dots = [...document.querySelectorAll("[data-slot='semantic-presentation-dot']")];
	expect(dots).toHaveLength(4);
	expect(dots[0]?.getAttribute("aria-current")).toBe("step");
	// The pane is the picture and its caption while it lasts: the sidebar steps aside.
	expect(part("semantic-reading-area").hasAttribute("data-walkthrough")).toBe(true);
	expect(part("semantic-board-stage").getAttribute("data-presentation-step")).toBe("0");
});

test("steps change only when the reader asks: keys, the controls, or a step chosen", async () => {
	serving();
	mountStage(null, { reducedMotion: true });
	await presenting();
	press("ArrowRight");
	await settle();
	expect(current()).toBe("One writer");
	press(" ");
	await settle();
	expect(current()).toBe("One edit, end to end");
	press("ArrowLeft");
	await settle();
	expect(current()).toBe("One writer");
	press("End");
	await settle();
	expect(current()).toBe("The lease");
	// The last step has nowhere further to go.
	press("PageDown");
	await settle();
	expect(current()).toBe("The lease");
	press("Home");
	await settle();
	expect(current()).toBe("The shape of it");
	act(() => {
		fireEvent.click(part("semantic-presentation-next"));
	});
	await settle();
	expect(current()).toBe("One writer");
	goTo(3);
	await settle();
	expect(current()).toBe("The lease");

	// Scrolling is not a way to step: the wheel over the picture zooms it.
	act(() => {
		fireEvent.wheel(viewport(), { deltaY: 120 });
		fireEvent.scroll(part("semantic-presentation"));
	});
	await settle();
	expect(current()).toBe("The lease");
});

test("a step lights what it is about, lets the rest recede, and brings it into view above the caption", async () => {
	serving();
	mountStage(null, { reducedMotion: true });
	await presenting();
	goTo(1);
	await settle();
	expect(marked()).toEqual(["n1"]);
	expect(unveiled()).toEqual(["n1"]);
	expectCamera(cameraNow(), N1_ABOVE_CAPTION);

	// An opening step is about the architecture rather than a part of it, so it
	// shows all of it and lets nothing recede.
	goTo(0);
	await settle();
	expectCamera(cameraNow(), WHOLE_ABOVE_CAPTION);
	expect(marked()).toEqual([]);
	expect(unveiled()).toEqual([]);
});

test("a step told through a view is read through that view", async () => {
	serving();
	mountStage(null, { reducedMotion: true });
	await presenting();
	goTo(2);
	await settle();
	expect(renderCalls().at(-1)).toContain(`view=${VIEW.id}`);
	expect(renderCalls().filter((call) => call.includes("view=")).length).toBe(1);
});

test("a step told through a view keeps the last step's framing until that view's picture is up", async () => {
	serving();
	mountStage(null, { reducedMotion: true });
	await presenting();
	goTo(1);
	await settle();
	expectCamera(cameraNow(), N1_ABOVE_CAPTION);
	expect(unveiled()).toEqual(["n1"]);

	// The view's picture is still being drawn. Worked out against the picture on
	// screen, the step would send the camera and the veil somewhere now and
	// somewhere else once its own picture came: it waits, and moves once.
	server.reply = "pending";
	goTo(2);
	await settle();
	expect(renderCalls().at(-1)).toContain(`view=${VIEW.id}`);
	expectCamera(cameraNow(), N1_ABOVE_CAPTION);
	expect(unveiled()).toEqual(["n1"]);
});

test("a step about something this reading does not draw says so", async () => {
	serving();
	mountStage(null, { reducedMotion: true });
	await presenting();
	goTo(3);
	await settle();
	expect(part("semantic-beat-missing").textContent).toBe("This reading does not draw Write Lease.");
	expect(marked()).toEqual([]);
	expectCamera(cameraNow(), WHOLE_ABOVE_CAPTION);
});

test("a reader who asked for reduced motion arrives at a step at once", async () => {
	serving();
	mountStage(null, { reducedMotion: true });
	await presenting();
	goTo(1);
	await settle();
	expect(surface().hasAttribute("data-camera-motion")).toBe(false);
	expectCamera(cameraNow(), N1_ABOVE_CAPTION);
});

test("a reader who did not ask for reduced motion is glided to the step, and it lands where the fit says", async () => {
	serving();
	mountStage();
	await presenting();
	await new Promise((resolve) => setTimeout(resolve, PRESENTATION_STEP_MS + 200));
	await settle();
	goTo(1);
	await settle();
	// Still on its way: the step has not finished arriving.
	expect(surface().hasAttribute("data-camera-motion")).toBe(true);
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, PRESENTATION_STEP_MS + 200));
	});
	await settle();
	expect(surface().hasAttribute("data-camera-motion")).toBe(false);
	expectCamera(cameraNow(), N1_ABOVE_CAPTION);
});

test("Escape leaves, and gives the reader back the camera and the view they had", async () => {
	serving();
	const views: (string | null)[] = [];
	/**
	 * Keep the view the pane says it is reading.
	 * @param reading What it is reading.
	 * @param reading.view The view, or null for the whole variant.
	 */
	function reported(reading: { readonly view: string | null }): void {
		views.push(reading.view);
	}
	mountStage(null, { reducedMotion: true, onReading: reported });
	await settle();
	expectCamera(cameraNow(), WHOLE_PICTURE);
	await presenting();
	goTo(2);
	await settle();
	expect(renderCalls().at(-1)).toContain(`view=${VIEW.id}`);

	press("Escape");
	await settle();
	await settle();
	expect(document.querySelector("[data-slot='semantic-presentation']")).toBeNull();
	expect(part("semantic-board-stage").hasAttribute("data-presentation-step")).toBe(false);
	// The step read the board through its view; the reader never chose one.
	expect(views).toContain(VIEW.id);
	expect(views.at(-1)).toBeNull();
	expect(unveiled()).toEqual([]);
	expectCamera(cameraNow(), WHOLE_PICTURE);
});

test("the same walkthrough stays presented when the reader moves to the proposal", async () => {
	// A proposal inherits its predecessor's explanations with the rest of its
	// content, ids and all. Somebody presenting the architecture and then the
	// change to it is presenting one explanation of two states, so their place
	// in it survives the move.
	const draft = {
		id: "v2",
		name: "Semantic boards",
		lifecycle: "draft",
		parent: "v1",
		content: CONTENT,
	};
	server.documents["pipeline"] = withVariants([CURRENT_VARIANT, draft]);
	server.reply = { status: 200, body: { ...drawing(1), views: [VIEW] } };
	mountStage(null, { live: true, reducedMotion: true });
	await presenting();
	goTo(1);
	await settle();
	expect(current()).toBe("One writer");

	chooseVariantInShell("v2");
	await settle();
	expect(renderCalls().at(-1)).toContain("variant=v2");
	expect(current()).toBe("One writer");
});

test("the subjects a disagreement is about are marked in the picture", async () => {
	server.documents["pipeline"] = boardOf(CONTENT);
	server.reply = {
		status: 200,
		body: {
			...drawing(1),
			waiting: {
				against: "v1",
				atVersion: 2,
				issues: [
					{
						subject: "n1",
						what: "node",
						kind: "competing-field",
						field: "name",
						mine: "board-io",
						theirs: "board writer",
						repair: "say which name stands",
					},
				],
			},
		},
	};
	// Picked out, and the subject picked out is the very one the argument is
	// about: the case a single mark per subject used to lose.
	mountStage("n1");
	await settle();
	// A dispute is a fact about the board rather than something the reader is
	// doing, so it is said whatever the reader is looking at — and it is said in
	// words somebody can act on, not only as a mark.
	expect(document.querySelector("[data-slot='semantic-standing']")?.textContent).toContain(
		"say which name stands",
	);
	// The viewer draws none of it. What the board has not decided is drawn into
	// the picture by the renderer, from the same reconciliation these words come
	// from, so the pane writes nothing onto the markup it was handed.
	const written = [...surface().querySelectorAll(".ab-halo")].map((halo) =>
		halo.getAttribute("style"),
	);
	expect(written).toEqual([null, null]);
	expect([...(surface().querySelector("[data-semantic-id='n1']")?.classList ?? [])]).toContain(
		"is-selected",
	);
	expect([...(surface().querySelector("[data-semantic-id='e1']")?.classList ?? [])]).not.toContain(
		"is-selected",
	);
});

test("picking a card out of the picture still reports it while a walkthrough is presented", async () => {
	serving();
	const stage = mountStage(null, { live: true, reducedMotion: true });
	await presenting();
	act(() => {
		fireEvent.click(surface().querySelector("#card")!);
	});
	await settle();
	// Presenting does not take the diagram away from the person: a pick still
	// reports, and the step on screen stays the step on screen.
	expect(stage.picks).toEqual(["n1"]);
	expect(current()).toBe("The shape of it");
});

// Reading a variant's own explanation of itself beside the picture of it.
//
// The claim being checked is the one a leadership walkthrough lives or dies
// by: the words are in the order somebody wrote them, one of them is the one
// being read, and the diagram attends to whatever that one is about. Every
// position on screen comes out of the atlas the server sent; nothing here
// invents a coordinate, and a beat about something this reading does not draw
// says so rather than pointing the camera at nothing.

import { act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "bun:test";

import {
	cameraNow,
	drawing,
	mountStage,
	part,
	renderCalls,
	server,
	settle,
	surface,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

/** The view the variant offers, which one beat is told through. */
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

/** The variant's content: two nodes, one relationship, one view, one explanation. */
const CONTENT = {
	nodes: [
		{ id: "n1", name: "board-io", kind: "module" },
		{ id: "n2", name: "Write Lease", kind: "module" },
	],
	edges: [{ id: "e1", from: "n1", to: "n2", kind: "call" }],
	views: [{ ...VIEW, scope: { kind: "selection", nodes: ["n1"], edges: [], flows: [] } }],
	walkthroughs: [WALKTHROUGH],
};

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
		schemaVersion: "1.0.0",
		kind: "semantic-board",
		id: "bd",
		name: "pipeline",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
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
 * Every beat on screen, in the order the rail lists them.
 * @returns The beats.
 */
function beats(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>("[data-slot='semantic-beat']")];
}

/**
 * Which beat the rail says is being read.
 * @returns Its heading, or null when none is current.
 */
function current(): string | null {
	const here = beats().find((beat) => beat.getAttribute("aria-current") === "step");
	return here?.querySelector("[data-slot='semantic-beat-heading']")?.textContent ?? null;
}

/**
 * Move to one beat by pressing its heading.
 * @param index Which beat.
 */
function goTo(index: number): void {
	const heading = beats()[index]?.querySelector<HTMLElement>("[data-slot='semantic-beat-heading']");
	act(() => {
		fireEvent.click(heading!);
	});
}

/**
 * Open the first explanation the pane offers.
 * @returns Settles once the rail is on screen.
 */
async function reading(): Promise<void> {
	await settle();
	act(() => {
		fireEvent.click(offers()[0]!);
	});
	await settle();
}

/**
 * Which subjects the picture is lighting up.
 * @returns Their semantic ids, in document order.
 */
function marked(): string[] {
	return [...surface().querySelectorAll("[data-semantic-id].is-selected")].map(
		(group) => group.getAttribute("data-semantic-id") ?? "",
	);
}

/**
 * Give each beat a place down the rail, since this DOM lays nothing out.
 * @param tops Where each beat's top is, measured from the rail's own top.
 */
function layOutBeats(tops: readonly number[]): void {
	beats().forEach((beat, index) => {
		/**
		 * Where this beat sits.
		 * @returns Its box, at the place the case asked for.
		 */
		function box(): DOMRect {
			return new DOMRect(0, tops[index] ?? 0, 352, 120);
		}
		Object.defineProperty(beat, "getBoundingClientRect", { configurable: true, value: box });
	});
}

/**
 * The behaviour of every scroll the rail has asked for.
 * @returns The rail, and what it recorded.
 */
function watchingScrolls(): { rail: HTMLElement; behaviours: string[] } {
	const rail = part("semantic-narrative-beats");
	const behaviours: string[] = [];
	/**
	 * Record how the rail asked to be scrolled.
	 * @param options What it asked for.
	 */
	function scrollTo(options: ScrollToOptions): void {
		behaviours.push(options.behavior ?? "unsaid");
	}
	Object.defineProperty(rail, "scrollTo", { configurable: true, value: scrollTo });
	return { rail, behaviours };
}

/** Where the camera sits when it is showing the whole 400×300 drawing. */
const WHOLE_PICTURE = { x: 32, y: 24, scale: 1.84 };

/** The rail, as the pane lays it out for the length of one case. */
const railBox: { height: number } = { height: 600 };

/**
 * Measure the rail at a height of its own, the way a pane of that height would.
 *
 * The workbench collapsing and a standing block appearing are both ordinary,
 * and each leaves the rail a different height; this is how a case says which
 * one it is about.
 * @param height How tall the scrollport is.
 */
function railOfHeight(height: number): void {
	railBox.height = height;
	const rail = document.querySelector("[data-slot='semantic-narrative-beats']");
	if (rail === null) {
		return;
	}
	/**
	 * How big the rail is.
	 * @returns Its box, at the height this case asked for.
	 */
	function box(): DOMRect {
		return new DOMRect(0, 0, 352, railBox.height);
	}
	Object.defineProperty(rail, "getBoundingClientRect", { configurable: true, value: box });
}

/**
 * What the rail leaves blank under its last beat, in pixels.
 * @returns The tail.
 */
function tail(): number {
	return Number.parseFloat(part("semantic-narrative-beats").style.paddingBottom);
}

/** Every resize the rail is watching for, so a case can cause one. */
const resizes: (() => void)[] = [];

/** A `ResizeObserver` a case drives itself, since this DOM lays nothing out. */
class WatchedResize implements ResizeObserver {
	/**
	 * Watch for a resize.
	 * @param run What to do when one happens.
	 */
	constructor(run: ResizeObserverCallback) {
		resizes.push((): void => run([], this));
	}

	/** Start watching. This DOM reports no size of its own; the case does. */
	observe(): void {
		// Nothing to do: a case causes the resize itself.
	}

	/** Stop watching one element. */
	unobserve(): void {
		// Nothing to release.
	}

	/** Stop watching. */
	disconnect(): void {
		// Nothing to release.
	}
}

/**
 * Resize the rail to a new height, as collapsing the workbench does.
 * @param height How tall the scrollport becomes.
 */
function resizeRailTo(height: number): void {
	railOfHeight(height);
	for (const run of resizes) {
		run();
	}
}

const realObserver = globalThis.ResizeObserver;

beforeEach(() => {
	resizes.length = 0;
	railBox.height = 600;
	globalThis.ResizeObserver = WatchedResize;
});

afterEach(() => {
	globalThis.ResizeObserver = realObserver;
});

test("a variant that explains itself nowhere offers nothing at all", async () => {
	server.documents["pipeline"] = boardOf({ nodes: CONTENT.nodes, edges: [] });
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	// No rail, no empty rail, no control that would only ever be disabled — and
	// no strip to put one in either. A variant that has nothing to offer takes
	// up none of the pane saying so.
	expect(offers()).toHaveLength(0);
	expect(document.querySelector("[data-slot='semantic-walkthrough-bar']")).toBeNull();
	expect(document.querySelector("[data-slot='semantic-narrative']")).toBeNull();
	expect(document.querySelector("[data-slot='semantic-reading-bar']")).toBeNull();
});

test("choosing an explanation shows its beats in the order they were written", async () => {
	serving();
	mountStage();
	await reading();
	expect(beats().map((beat) => beat.querySelector("h3")?.textContent)).toEqual([
		"The shape of it",
		"One writer",
		"One edit, end to end",
		"The lease",
	]);
	// The whole of what each beat says is beside the picture, not behind a
	// disclosure: it is prose somebody reads.
	expect(beats()[0]?.textContent).toContain("Two modules and one call.");
	expect(part("semantic-narrative").textContent).toContain("Ten minutes on where the writes go.");
	expect(current()).toBe("The shape of it");
});

test("scrolling the words moves which beat is being read", async () => {
	serving();
	mountStage();
	await reading();
	const { rail } = watchingScrolls();
	// The rail is 600 tall here, so its reading line is 198 down. Two beats have
	// passed it, and the later of the two is the one being read.
	layOutBeats([-320, -80, 150, 400]);
	act(() => {
		fireEvent.scroll(rail);
	});
	expect(current()).toBe("One edit, end to end");
});

test("moving to a beat lights up what that beat is about", async () => {
	serving();
	mountStage();
	await reading();
	goTo(1);
	await settle();
	expect(current()).toBe("One writer");
	expect(marked()).toEqual(["n1"]);
	// And the camera goes to the box the atlas gave that subject, never to a
	// coordinate the browser made up: n1 is 80×40 at the origin, so a fit that
	// stops at half again its drawn size centres it here.
	expect(cameraNow()).toEqual({ x: 340, y: 270, scale: 1.5 });
});

test("a beat about nothing in particular asks for the whole picture", async () => {
	serving();
	mountStage();
	await reading();
	goTo(1);
	await settle();
	expect(cameraNow().scale).toBe(1.5);
	// An opening beat is about the architecture rather than a part of it, so
	// coming back to it pulls out to all of it again — and stops singling
	// anything out.
	goTo(0);
	await settle();
	expect(cameraNow()).toEqual(WHOLE_PICTURE);
	expect(marked()).toEqual([]);
});

test("a beat told through a view is read through that view", async () => {
	serving();
	mountStage();
	await reading();
	goTo(2);
	await settle();
	// The beat says which reading it is told through, so the pane asks the
	// server for that picture. Nothing is written: this is a different request,
	// not a different board.
	expect(renderCalls().at(-1)).toContain(`view=${VIEW.id}`);
	expect(renderCalls().filter((call) => call.includes("view=")).length).toBe(1);
});

test("a beat about something this reading does not draw says so", async () => {
	serving();
	mountStage();
	await reading();
	goTo(3);
	await settle();
	// `n2` is on the board and not in this picture. The reader is told, in the
	// board's own words for it, rather than being left with a camera that moved
	// nowhere for no stated reason.
	expect(part("semantic-beat-missing").textContent).toBe("This reading does not draw Write Lease.");
	expect(marked()).toEqual([]);
	expect(cameraNow()).toEqual(WHOLE_PICTURE);
});

test("a reader who asked for reduced motion is not animated at", async () => {
	serving();
	mountStage(null, { reducedMotion: true });
	await reading();
	goTo(1);
	await settle();
	// The camera arrives at the beat's subject instead of easing into it.
	expect(surface().className).not.toContain("transition-transform");
	expect(cameraNow().scale).toBe(1.5);
});

test("a reader who did not ask for reduced motion gets the camera's ease", async () => {
	serving();
	mountStage();
	await reading();
	goTo(1);
	await settle();
	expect(surface().className).toContain("transition-transform");
	expect(cameraNow().scale).toBe(1.5);
});

test("a jump to a beat arrives there rather than gliding through the ones between", async () => {
	serving();
	mountStage();
	await reading();
	const { behaviours } = watchingScrolls();
	goTo(3);
	await settle();
	// A glide reports a scroll at every position it passes, and this rail reads
	// the current beat out of those; jumping from the first beat to the fourth
	// would make each beat between them current in turn, fly the camera through
	// subjects nobody asked to see, and fetch the picture of any view they are
	// told through. One gesture is one beat.
	expect(behaviours).toEqual(["auto"]);
	expect(current()).toBe("The lease");
});

test("a beat a fraction below the reading line has still reached it", async () => {
	serving();
	mountStage();
	await reading();
	const { rail } = watchingScrolls();
	// Measured in a real browser: bringing a beat to the line left its top 0.27
	// of a pixel short of it, and without a tolerance the rail put the reader
	// back on the beat before the one they had just asked for.
	layOutBeats([-320, -80, 198.3, 400]);
	act(() => {
		fireEvent.scroll(rail);
	});
	expect(current()).toBe("One edit, end to end");
});

test("the same explanation stays open when the reader moves to the proposal", async () => {
	// A proposal inherits its predecessor's explanations with the rest of its
	// content, ids and all. Somebody showing a board the architecture and then
	// the change to it is reading one explanation of two states, so their place
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
	mountStage(null, { live: true });
	await reading();
	goTo(1);
	await settle();
	expect(current()).toBe("One writer");

	act(() => {
		fireEvent.click(
			[...document.querySelectorAll<HTMLElement>("[data-slot='semantic-variant-choice']")].find(
				(one) => one.getAttribute("data-semantic-variant") === "v2",
			)!,
		);
	});
	await settle();
	expect(renderCalls().at(-1)).toContain("variant=v2");
	expect(current()).toBe("One writer");
});

test("the last beat can reach the reading line whatever height the pane leaves", async () => {
	serving();
	mountStage();
	await reading();
	// Measured in a browser with the workbench collapsed: the rail was 812 tall
	// with nothing to scroll, so the last beat sat at 322 against a line at 268
	// and could never be read. The tail has to be measured from the scrollport,
	// because a class that leaves enough room at one pane height leaves too
	// little at another.
	act(() => {
		resizeRailTo(812);
	});
	expect(tail()).toBeGreaterThanOrEqual(812 - 812 * 0.33);
	act(() => {
		resizeRailTo(400);
	});
	expect(tail()).toBeGreaterThanOrEqual(400 - 400 * 0.33);
	expect(tail()).toBeLessThan(812 - 812 * 0.33);
});

test("a resize that changes only the layout leaves the reader where they were", async () => {
	serving();
	mountStage();
	await reading();
	goTo(3);
	await settle();
	expect(current()).toBe("The lease");

	// Collapsing the workbench makes the rail taller, the browser clamps the
	// scroll, and the scroll it does on its own would otherwise be read as the
	// reader moving: it is not. The beat they were on is the beat they are on.
	const { behaviours, rail } = watchingScrolls();
	layOutBeats([-320, -80, 150, 400]);
	act(() => {
		resizeRailTo(812);
		fireEvent.scroll(rail);
	});
	await settle();
	expect(current()).toBe("The lease");
	// And they are put back to it rather than left wherever the clamp landed.
	expect(behaviours).toEqual(["auto"]);
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
	mountStage();
	await settle();
	// A dispute is a fact about the board rather than something the reader is
	// doing, so it shows with nothing selected and no walkthrough open — and it
	// shows on the card itself, not only in the list beside the picture.
	expect(surface().querySelector("#card-halo")?.getAttribute("style")).toContain(
		"stroke-dasharray",
	);
	expect(surface().querySelector("#wire-halo")?.getAttribute("style")).toBeNull();
	// And it is told apart from what the reader has picked out: the selection
	// keeps the solid ring the renderer draws for it.
	expect(surface().querySelector("[data-semantic-id='n1']")?.classList).not.toContain(
		"is-selected",
	);
});

test("picking a card out of the picture still inspects it while a rail is open", async () => {
	serving();
	const stage = mountStage(null, { live: true });
	await reading();
	act(() => {
		fireEvent.click(surface().querySelector("#card")!);
	});
	await settle();
	// Reading an explanation does not take the diagram away from the person: a
	// pick still reports, still opens the panel, and still shows beside the beat
	// that is being read.
	expect(stage.picks).toEqual(["n1"]);
	expect(part("semantic-inspector").textContent).toContain("board-io");
	expect(current()).toBe("The shape of it");
});

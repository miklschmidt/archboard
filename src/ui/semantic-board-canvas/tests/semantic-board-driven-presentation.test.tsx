// A walkthrough presented because somebody narrating it asked for a step.
//
// The position in a walkthrough is the pane's own, so a request is one more way
// of choosing it and the pane answers by saying where it got to. What is
// checked is what a narrator depends on: the step asked for is the one on
// screen, the pane says which request it answers and when the step has finished
// arriving, and a user's hand on the keys takes the position back for good.

import { act, cleanup, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";
import { createElement } from "react";

import { PRESENTATION_STEP_MS } from "@/shared/timing/timing";
import type { SemanticPaneReading } from "@/ui/semantic-board-canvas";
import {
	drawing,
	mountStage,
	part,
	server,
	settle,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

/** One walkthrough of three beats about the two drawn subjects. */
const WALKTHROUGH = {
	id: "w1",
	name: "For the board",
	beats: [
		{ id: "b1", heading: "The shape of it", body: "Two modules and one call.", subjects: [] },
		{ id: "b2", heading: "One writer", body: "board-io owns every write.", subjects: ["n1"] },
		{ id: "b3", heading: "The call", body: "One relationship.", subjects: ["e1"] },
	],
};

/** Put a board that explains itself, and a picture of it, in front of a pane. */
function serving(): void {
	server.documents["pipeline"] = {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: "bd",
		name: "pipeline",
		level: "system",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "as it is",
				lifecycle: "current",
				content: {
					nodes: [
						{ id: "n1", name: "board-io", kind: "module" },
						{ id: "n2", name: "Write Lease", kind: "module" },
					],
					edges: [{ id: "e1", from: "n1", to: "n2", kind: "call" }],
					walkthroughs: [WALKTHROUGH],
				},
			},
		],
	};
	server.reply = { status: 200, body: drawing(1) };
}

/**
 * Mount a pane asked for one beat, keeping what it reports.
 * @param beat Which beat the request names.
 * @param reducedMotion Whether motion is cut.
 * @returns Every presentation position the pane reported, in order.
 */
function driven(beat: number, reducedMotion: boolean): SemanticPaneReading["presentation"][] {
	const reported: SemanticPaneReading["presentation"][] = [];
	/**
	 * Keep what the pane says about its presentation.
	 * @param reading What the pane is reading.
	 */
	function onReading(reading: SemanticPaneReading): void {
		reported.push(reading.presentation);
	}
	mountStage(null, {
		reducedMotion,
		driven: { request: "request-1", walkthrough: WALKTHROUGH.id, beat },
		onReading,
	});
	return reported;
}

test("a requested step is presented without anybody choosing the walkthrough, and the pane says it arrived", async () => {
	serving();
	const reported = driven(1, true);
	await settle();
	expect(part("semantic-board-stage").getAttribute("data-presentation-step")).toBe("1");
	expect(part("semantic-presentation-heading").textContent).toBe("One writer");
	expect(reported.at(-1)).toEqual({
		walkthrough: "w1",
		beat: 1,
		of: 3,
		arrived: true,
		answering: "request-1",
	});
});

test("a requested step lights its subjects without raising anything a user's hand raises", async () => {
	// What the shell marks as the user's own doing hangs on these two callbacks (ADR 0034). A
	// driven step that raised either would be told to the voice model as the user's pick, and
	// answered by it: the loop of 2026-09-20.
	serving();
	const views: (string | null)[] = [];
	const mounted = mountStage(null, {
		reducedMotion: true,
		driven: { request: "request-1", walkthrough: WALKTHROUGH.id, beat: 1 },
		/**
		 * Keep every view change the stage raises.
		 * @param view The view it named.
		 */
		onViewChange: (view) => {
			views.push(view);
		},
	});
	await settle();
	expect(part("semantic-presentation-heading").textContent).toBe("One writer");
	expect(mounted.picks).toEqual([]);
	expect(views).toEqual([]);
});

test("a step still gliding is reported as on its way, and as arrived once the glide lands", async () => {
	serving();
	const reported = driven(1, false);
	await settle();
	expect(reported.at(-1)).toMatchObject({ beat: 1, arrived: false, answering: "request-1" });
	await act(async () => {
		await new Promise<void>((resolve) => setTimeout(resolve, PRESENTATION_STEP_MS + 100));
	});
	await settle();
	expect(reported.at(-1)).toMatchObject({ beat: 1, arrived: true, answering: "request-1" });
});

test("a user stepping by hand takes the position back, and the same request does not return it", async () => {
	serving();
	const reported = driven(1, true);
	await settle();
	act(() => {
		fireEvent.keyDown(window, { key: "ArrowRight" });
	});
	await settle();
	expect(reported.at(-1)).toMatchObject({ beat: 2, answering: null });
	act(() => {
		fireEvent.keyDown(window, { key: "Escape" });
	});
	await settle();
	expect(reported.at(-1)).toBeNull();
	expect(part("semantic-board-stage").hasAttribute("data-presentation-step")).toBe(false);
});

test("what the shell lays over the picture is drawn with and without a walkthrough presented", async () => {
	serving();
	const overlay = createElement("p", { "data-slot": "laid-over" }, "said aloud");
	mountStage(null, { reducedMotion: true, overlay });
	await settle();
	expect(part("semantic-stage-overlay").textContent).toBe("said aloud");
	cleanup();
	mountStage(null, {
		reducedMotion: true,
		overlay,
		driven: { request: "request-1", walkthrough: WALKTHROUGH.id, beat: 0 },
	});
	await settle();
	// Presented, it belongs to the caption, which keeps it above itself rather than under it.
	const caption = part("semantic-presentation-heading").closest(
		"[data-slot='semantic-presentation']",
	);
	expect(caption?.querySelector("[data-slot='semantic-stage-overlay']")?.textContent).toBe(
		"said aloud",
	);
});

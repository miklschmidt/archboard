// The list and the picture as one thing: a row of a part's relationships lights
// its line while it is pointed at, choosing one brings the part at its other end
// into view, and a trace lights how far a part reaches. Nothing here writes: all
// of it is attention, like the camera and the selection.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import { EXPLORING_MS } from "@/shared/timing/timing";
import { cameraNow, takeFrames } from "@/ui/semantic-board-canvas/tests/camera-probes";
import { openSidebarTab, surface } from "@/ui/semantic-board-canvas/tests/stage-harness";
import {
	graded,
	lighting,
	lit,
	pick,
	served,
} from "@/ui/semantic-board-canvas/tests/wiring-fixture";

/**
 * The row of the selection tab about one relationship.
 * @param edge The relationship.
 * @returns The row.
 */
function row(edge: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(
		`[data-slot='semantic-inspector-link'][data-edge='${edge}']`,
	);
	if (found === null) throw new Error(`The selection tab has no row for ${edge}.`);
	return found;
}

/**
 * The control that traces what the picked part reaches one way.
 * @param way Onward or back.
 * @returns The control.
 */
function trace(way: "onward" | "back"): HTMLElement {
	const found = document.querySelector<HTMLElement>(
		`[data-slot='semantic-inspector-trace'][data-way='${way}']`,
	);
	if (found === null) throw new Error(`The selection tab offers no trace ${way}.`);
	return found;
}

/**
 * Pick a part out and open its selection tab.
 * @param id The part.
 */
async function pickWithDetails(id: string): Promise<void> {
	await pick(id);
	openSidebarTab("selection");
}

test("pointing at a row lights its relationship and the parts at its ends, and leaving gives the pick back", async () => {
	await served();
	await pickWithDetails("w");
	const picked = ["e3", "e4", "l", "orders", "q", "shipping", "w"].toSorted();
	expect(lit()).toEqual(picked);

	act(() => {
		fireEvent.pointerEnter(row("e4"));
	});
	expect(lighting()).toBe("hover");
	expect(lit()).toEqual(["e4", "l", "shipping", "w"]);

	act(() => {
		fireEvent.pointerLeave(row("e4"));
	});
	expect(lighting()).toBe("pick");
	expect(lit()).toEqual(picked);

	// A row is reached from the keyboard too.
	act(() => {
		fireEvent.focus(row("e3"));
	});
	expect(lit()).toEqual(["e3", "orders", "q", "shipping", "w"]);
});

test("each list of a part's relationships is headed by its title and its count, read apart", async () => {
	await served();
	await pickWithDetails("w");
	const headings = [
		...document.querySelectorAll("[data-slot='semantic-inspector-links'] :is(h2, h3)"),
	];
	expect(headings).toHaveLength(2);
	// A heading is named by its text as it stands, so the count needs a space before it.
	for (const heading of headings) expect(heading.textContent).toMatch(/\S \d+$/);
});

test("a trace onward lights what a part reaches beyond its connections, the nearer the stronger", async () => {
	await served();
	await pickWithDetails("q");
	expect(graded()).toEqual([]);
	const onward = trace("onward");
	expect(onward.getAttribute("aria-pressed")).toBe("false");
	// The worker and the ledger: two parts, one of them beyond the first hop.
	expect(onward.getAttribute("aria-label")).toContain("2 parts");

	act(() => {
		fireEvent.click(onward);
	});
	expect(trace("onward").getAttribute("aria-pressed")).toBe("true");
	expect(graded()).toEqual(["e4:is-reach-2", "l:is-reach-2"]);
	expect(lit()).toEqual(["e2", "e3", "e4", "h", "l", "orders", "q", "shipping", "w"]);

	// Asking again takes it back.
	act(() => {
		fireEvent.click(trace("onward"));
	});
	expect(graded()).toEqual([]);
	expect(lit()).toEqual(["e2", "e3", "h", "orders", "q", "shipping", "w"]);
});

test("a trace back goes against the relationships, and belongs to the part it was asked of", async () => {
	await served();
	await pickWithDetails("q");
	act(() => {
		fireEvent.click(trace("back"));
	});
	expect(graded()).toEqual(["e1:is-reach-2", "g:is-reach-2"]);

	// Another pick is another part: the trace is not carried to it.
	await pickWithDetails("w");
	expect(graded()).toEqual([]);
	expect(trace("back").getAttribute("aria-pressed")).toBe("false");
});

test("a part that nothing reaches offers no trace that way", async () => {
	await served();
	await pickWithDetails("g");
	expect(
		document.querySelector("[data-slot='semantic-inspector-trace'][data-way='back']"),
	).toBeNull();
	expect(trace("onward").getAttribute("aria-label")).toContain("4 parts");
});

const FAR_AWAY = { l: { x: 1200, y: 800, width: 10, height: 10 } };

test("choosing a row brings the part at its other end into view, and moves nothing for one already in view", async () => {
	await served({ places: FAR_AWAY });
	await pickWithDetails("w");
	const frames = takeFrames();
	try {
		const before = cameraNow();
		// The queue is on screen: choosing it moves nothing.
		act(() => {
			fireEvent.click(row("e3"));
		});
		frames.run(EXPLORING_MS.reveal + 200);
		expect(cameraNow()).toEqual(before);

		// The ledger is far off to the right: the camera glides, once, to show it.
		await pickWithDetails("w");
		act(() => {
			fireEvent.click(row("e4"));
		});
		expect(surface().hasAttribute("data-camera-motion")).toBe(true);
		frames.run(EXPLORING_MS.reveal + 200);
		const after = cameraNow();
		expect(surface().hasAttribute("data-camera-motion")).toBe(false);
		const left = 1200 * after.scale + after.x;
		const right = left + 10 * after.scale;
		expect(left).toBeGreaterThanOrEqual(0);
		expect(right).toBeLessThanOrEqual(800);
		// Just far enough: it stands inside the margin, not in the middle of the room.
		expect(after.scale).toBeCloseTo(before.scale, 6);
		expect(right).toBeCloseTo(800 - 48, 6);
	} finally {
		frames.restore();
	}
});

/** The ledger, bigger than the room at any scale the board is fitted at: it is never all in view. */
const BIGGER_THAN_THE_ROOM = { l: { x: -2000, y: -2000, width: 5000, height: 5000 } };

test("a click on the picture leaves the camera where it is, even on a part bigger than the room, and the list still brings that part into view", async () => {
	await served({ places: BIGGER_THAN_THE_ROOM });
	const frames = takeFrames();
	try {
		const before = cameraNow();
		// The reader's own hand on a part that is there: the camera does not chase it.
		await pick("l");
		frames.run(EXPLORING_MS.reveal + 200);
		expect(cameraNow()).toEqual(before);

		// The same part chosen from a row of the list is somebody else's pick.
		await pickWithDetails("w");
		act(() => {
			fireEvent.click(row("e4"));
		});
		frames.run(EXPLORING_MS.reveal + 200);
		expect(cameraNow()).not.toEqual(before);
	} finally {
		frames.restore();
	}
});

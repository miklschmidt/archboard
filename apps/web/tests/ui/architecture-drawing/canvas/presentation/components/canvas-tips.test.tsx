// Where a tip stands: against the part it is about, inside its pane, and how long it stays there.

import { act, fireEvent } from "@testing-library/react";
import { expect, spyOn, test } from "bun:test";

import { EXPLORING_MS } from "@archboard/timing";
import { takeFrames } from "#tests/ui/support/canvas/camera-probes.ts";
import { viewport } from "#tests/ui/support/canvas/stage-harness.tsx";
import { group, served } from "#tests/ui/support/canvas/wiring-fixture.tsx";

/**
 * Give an element a box, in a DOM that does no layout.
 * @param element The element.
 * @param box Its box on the screen.
 */
function boxed(element: Element, box: DOMRect): void {
	spyOn(element, "getBoundingClientRect").mockReturnValue(box);
}

/**
 * The element that stands a picture's tips.
 * @returns The element.
 */
function tipPlace(): HTMLElement {
	const place = document.querySelector<HTMLElement>("[data-slot='picture-tip-place']");
	if (place === null) throw new Error("The picture has no place for tips.");
	return place;
}

/**
 * Rest the pointer on a part.
 * @param id The part.
 */
function restOn(id: string): void {
	act(() => {
		fireEvent.pointerMove(group(id), { pointerId: 2, buttons: 0, clientX: 5, clientY: 5 });
	});
}

test("a tip stands against its part, and the next part's tip keeps inside the pane", async () => {
	await served();
	const place = tipPlace();
	boxed(place.parentElement!, new DOMRect(0, 0, 1000, 600));
	boxed(place, new DOMRect(0, 0, 200, 100));
	boxed(group("q"), new DOMRect(100, 100, 80, 40));
	boxed(group("l"), new DOMRect(860, 100, 130, 40));
	const frames = takeFrames();
	try {
		restOn("q");
		expect(place.style.visibility).toBe("hidden");
		frames.run(500);
		expect(place.querySelector("[data-slot='semantic-subject-tip']")).not.toBeNull();
		expect(place.style.transform).toStartWith("translate(190px,");
		// The next part's tip opens at once, and the pane's edge turns it to where it has room.
		restOn("l");
		const [left = 0] = (place.style.transform.match(/\d+/g) ?? []).map(Number);
		expect(left).toBeGreaterThan(190);
		expect(left + 200).toBeLessThanOrEqual(1000);
	} finally {
		frames.restore();
	}
});

test("a tip stays open while the camera is asked for the view it already shows", async () => {
	await served();
	const frames = takeFrames();
	try {
		restOn("q");
		frames.run(500);
		expect(tipPlace().querySelector("[data-slot='semantic-subject-tip']")).not.toBeNull();
		// The picture is fitted already, so the fit key moves nothing, and the part is where it was.
		act(() => {
			fireEvent.keyDown(viewport(), { key: "0" });
		});
		frames.run(EXPLORING_MS.cameraFit);
		expect(tipPlace().querySelector("[data-slot='semantic-subject-tip']")).not.toBeNull();
	} finally {
		frames.restore();
	}
});

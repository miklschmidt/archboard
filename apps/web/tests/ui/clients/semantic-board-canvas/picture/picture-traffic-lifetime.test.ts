// How long a picture's traffic runs.
//
// What this catches: traffic that is left running after its picture was put
// away. A browser does not stop an animation when its element leaves the
// document, so a picture that was replaced kept its animations going with
// nothing to move, and the page was asked for a frame on every vsync because of
// them (all the animations that were still on screen cost a style pass each).

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";

import { stagePicture } from "#ui/clients/semantic-board-canvas/picture/picture-transition.ts";

beforeAll(() => {
	GlobalRegistrator.register();
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/** An animation reduced to what stopping traffic touches. */
class FakeAnimation {
	currentTime: number | null = null;
	cancelled = false;

	/** Take it away. */
	cancel(): void {
		this.cancelled = true;
	}
}

let started: FakeAnimation[] = [];
let realAnimate: PropertyDescriptor | undefined;

/**
 * Start an animation, as far as this DOM does: it is only remembered.
 * @returns The animation.
 */
function animate(): FakeAnimation {
	const animation = new FakeAnimation();
	started.push(animation);
	return animation;
}

beforeEach(() => {
	started = [];
	realAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
	Object.defineProperty(Element.prototype, "animate", {
		value: animate,
		configurable: true,
		writable: true,
	});
});

afterEach(() => {
	if (realAnimate === undefined) delete (Element.prototype as { animate?: unknown }).animate;
	else Object.defineProperty(Element.prototype, "animate", realAnimate);
});

/**
 * A picture with one line of traffic, as the renderer writes it.
 * @param id What the picture is told apart by.
 * @returns The markup.
 */
function pictureWithTraffic(id: string): string {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg"><rect id="${id}">` +
		`<animateTransform attributeName="transform" type="translate" from="0 0" to="10 0" ` +
		`dur="1s" repeatCount="indefinite"/></rect></svg>`
	);
}

test("a picture put up in place of another stops the traffic of the one it replaces", () => {
	const surface = document.createElement("div");
	document.body.append(surface);

	stagePicture(surface, pictureWithTraffic("first"));
	expect(started).toHaveLength(1);
	expect(started[0]!.cancelled).toBe(false);

	stagePicture(surface, pictureWithTraffic("second"));

	expect(started).toHaveLength(2);
	expect(started.map(({ cancelled }) => cancelled)).toEqual([true, false]);
});

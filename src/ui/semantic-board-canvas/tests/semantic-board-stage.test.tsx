// The four states a semantic pane can be in, and the camera over the picture.
//
// Picking is a gesture rather than a state, and it has its own owner beside
// this one.

import { act, cleanup, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	PANE_VAULT,
	NOTHING_DRAWN,
	NO_SUCH_BOARD,
	UNREADABLE,
	drawing,
	mountStage,
	renderCalls,
	part,
	server,
	settle,
	stageState,
	surface,
	viewport,
} from "@/ui/semantic-board-canvas/tests/stage-harness";
import { EXPLORING_MS } from "@/shared/timing/timing";
import {
	cameraNow,
	diagramPointUnder,
	pointerAt,
	pressKey,
	takeFrames,
	wheelAt,
} from "@/ui/semantic-board-canvas/tests/camera-probes";
import { announceSemanticBoardChange } from "@/ui/semantic-board-canvas";

test("a pane with no answer yet shows the shape of a diagram rather than a void", () => {
	mountStage();
	expect(stageState()).toBe("loading");
	expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
	expect(document.body.textContent).toContain("Drawing pipeline");
});

test("a board that is there with nothing on it says exactly that", async () => {
	server.reply = NOTHING_DRAWN;
	mountStage();
	await settle();
	expect(stageState()).toBe("empty");
	expect(document.body.textContent).toContain("has nothing on it yet");
});

test("a board the vault has not got is named rather than shrugged at", async () => {
	server.reply = NO_SUCH_BOARD;
	mountStage();
	await settle();
	expect(stageState()).toBe("error");
	expect(document.body.textContent).toContain("There is no such board");
	expect(document.body.textContent).toContain("pipeline");
});

test("a drawn board puts the server's picture on screen, asked for in no theme", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	expect(stageState()).toBe("drawn");
	expect(surface().querySelector("svg")).not.toBeNull();
	expect(surface().querySelectorAll("[data-semantic-id]").length).toBe(3);
	expect(renderCalls()[0]).toContain("board=pipeline");
	// The picture takes the page's theme, so the request names none.
	expect(renderCalls()[0]).not.toContain("theme=");
});

test("a drawn board is fitted to the pane, and `0` puts it back", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	// The reported size is what a fit is computed from, so the whole diagram is
	// inside the viewport and centred in it.
	const fit = cameraNow();
	expect(fit.scale).toBeCloseTo(Math.min((800 - 48) / 400, (600 - 48) / 300), 6);
	expect(fit.x).toBeCloseTo((800 - 400 * fit.scale) / 2, 6);
	expect(fit.y).toBeCloseTo((600 - 300 * fit.scale) / 2, 6);

	pressKey("ArrowDown");
	expect(cameraNow()).not.toEqual(fit);
	// The fit key glides: it is on its way partway through, and lands on the fit.
	const frames = takeFrames();
	try {
		act(() => {
			fireEvent.keyDown(viewport(), { key: "0" });
		});
		frames.run(EXPLORING_MS.cameraFit / 2);
		expect(surface().hasAttribute("data-camera-motion")).toBe(true);
		expect(cameraNow()).not.toEqual(fit);
		frames.run(EXPLORING_MS.cameraFit);
		expect(surface().hasAttribute("data-camera-motion")).toBe(false);
		expect(cameraNow()).toEqual(fit);
	} finally {
		frames.restore();
	}
});

test("the camera moves with the keyboard and survives the board changing under it", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	const before = cameraNow();

	pressKey("ArrowLeft");
	const panned = cameraNow();
	expect(panned.x - before.x).toBeCloseTo(64, 6);
	expect(panned.y).toBeCloseTo(before.y, 6);
	expect(panned.scale).toBeCloseTo(before.scale, 6);

	// Zooming by key is about the middle of the viewport: what is in the middle
	// stays in the middle.
	const middle = [400, 300] as const;
	pressKey("+");
	const zoomed = cameraNow();
	expect(zoomed.scale).toBeCloseTo(panned.scale * 1.1, 6);
	const [wasX, wasY] = diagramPointUnder(panned, middle);
	const [isX, isY] = diagramPointUnder(zoomed, middle);
	expect(isX).toBeCloseTo(wasX, 6);
	expect(isY).toBeCloseTo(wasY, 6);

	// The board changes, the pane is told, and it asks for a new picture. Where
	// the person was looking is not the board's business.
	const asked = server.calls.length;
	const transform = surface().style.transform;
	server.reply = { status: 200, body: drawing(2) };
	// News of a board of the same name in another repository is not news of this one.
	act(() => announceSemanticBoardChange("/work/payments/.archboard/vault", "pipeline", 2));
	await settle();
	expect(server.calls.length).toBe(asked);
	act(() => announceSemanticBoardChange(PANE_VAULT, "pipeline", 2));
	await settle();
	expect(server.calls.length).toBeGreaterThan(asked);
	expect(part("semantic-board-stage").getAttribute("data-version")).toBe("2");
	expect(surface().style.transform).toBe(transform);
});

test("a wheel over the diagram zooms about the pointer, by how far it turned", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	const stage = viewport();
	const pointer = [200, 150] as const;
	const frames = takeFrames();
	try {
		const before = cameraNow();
		act(() => {
			stage.dispatchEvent(wheelAt(-100, pointer));
		});
		// The camera runs toward the zoom, and is not there on the first frame.
		frames.run(16);
		expect(cameraNow().scale).toBeGreaterThan(before.scale);
		expect(cameraNow().scale).toBeLessThan(before.scale * 1.1);
		// Whatever was under the pointer stays under it on the way.
		const [wasX, wasY] = diagramPointUnder(before, pointer);
		const [midX, midY] = diagramPointUnder(cameraNow(), pointer);
		expect(midX).toBeCloseTo(wasX, 6);
		expect(midY).toBeCloseTo(wasY, 6);
		frames.run(EXPLORING_MS.cameraEase * 20);
		const after = cameraNow();
		// One notch of a mouse wheel is the step a key zooms by.
		expect(after.scale).toBeCloseTo(before.scale * 1.1, 6);
		const [isX, isY] = diagramPointUnder(after, pointer);
		expect(isX).toBeCloseTo(wasX, 6);
		expect(isY).toBeCloseTo(wasY, 6);

		// A gentler turn zooms by less, and a pinch (a wheel with Control held) turns far less to do as much.
		act(() => {
			stage.dispatchEvent(wheelAt(-50, pointer));
		});
		frames.run(EXPLORING_MS.cameraEase * 20);
		expect(cameraNow().scale).toBeCloseTo(after.scale * Math.sqrt(1.1), 6);
	} finally {
		frames.restore();
	}
});

test("a pinch, on a trackpad or with two fingers, moves the camera at once and asks for no frame", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	const frames = takeFrames();
	try {
		// A trackpad pinches with a wheel that holds Control, ten times finer than a notch.
		const pointer = [200, 150] as const;
		const before = cameraNow();
		act(() => {
			viewport().dispatchEvent(wheelAt(-10, pointer, true));
		});
		const pinched = cameraNow();
		expect(pinched.scale).toBeCloseTo(before.scale * 1.1, 6);
		const [wasX, wasY] = diagramPointUnder(before, pointer);
		const [isX, isY] = diagramPointUnder(pinched, pointer);
		expect(isX).toBeCloseTo(wasX, 6);
		expect(isY).toBeCloseTo(wasY, 6);

		// Two fingers spread to twice as far apart: the picture is twice the size at once.
		const touch = { pointerType: "touch", button: 0, buttons: 1, clientY: 200 };
		act(() => {
			fireEvent.pointerDown(viewport(), { ...touch, pointerId: 11, clientX: 300 });
			fireEvent.pointerDown(viewport(), { ...touch, pointerId: 12, clientX: 400 });
			fireEvent.pointerMove(viewport(), { ...touch, pointerId: 12, clientX: 500 });
		});
		expect(cameraNow().scale).toBeCloseTo(pinched.scale * 2, 6);
		act(() => {
			fireEvent.pointerUp(viewport(), { ...touch, pointerId: 12, clientX: 500 });
			fireEvent.pointerUp(viewport(), { ...touch, pointerId: 11, clientX: 300 });
		});
		// Nothing was left for a frame to do.
		expect(frames.asked()).toBe(0);
	} finally {
		frames.restore();
	}
});

test("a camera at rest asks for no more frames", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	const frames = takeFrames();
	try {
		act(() => {
			viewport().dispatchEvent(wheelAt(-100, [200, 150]));
		});
		expect(frames.asked()).toBeGreaterThan(0);
		frames.run(EXPLORING_MS.cameraEase * 20);
		const asked = frames.asked();
		frames.run(1000);
		expect(frames.asked()).toBe(asked);
	} finally {
		frames.restore();
	}
});

test("a reader who asked for reduced motion has the camera land at once", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage(null, { reducedMotion: true });
	await settle();
	const frames = takeFrames();
	try {
		const fit = cameraNow();
		act(() => {
			viewport().dispatchEvent(wheelAt(-100, [200, 150]));
		});
		expect(cameraNow().scale).toBeCloseTo(fit.scale * 1.1, 6);
		const zoomed = cameraNow();
		act(() => {
			fireEvent.keyDown(viewport(), { key: "ArrowLeft" });
		});
		expect(cameraNow().x - zoomed.x).toBeCloseTo(64, 6);
		act(() => {
			fireEvent.keyDown(viewport(), { key: "0" });
		});
		expect(cameraNow()).toEqual(fit);
		expect(surface().hasAttribute("data-camera-motion")).toBe(false);
		// Nothing was left for a frame to do.
		expect(frames.asked()).toBe(0);
	} finally {
		frames.restore();
	}
});

test("a drag let go while it is moving fast stops where it is drawn", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	const frames = takeFrames();
	try {
		const before = cameraNow().x;
		// 200 pixels in 80 milliseconds, let go at once: 2.5 pixels a millisecond.
		pointerAt("pointerdown", { x: 100, t: 1000 });
		for (let step = 1; step <= 5; step += 1) {
			pointerAt("pointermove", { x: 100 + step * 40, t: 1000 + step * 16 });
		}
		const asked = frames.asked();
		pointerAt("pointerup", { x: 300, t: 1082 });
		const letGo = cameraNow().x;
		expect(letGo - before).toBeCloseTo(200, 6);
		frames.run(1000);
		expect(cameraNow().x).toBe(letGo);
		// Nothing carries the camera on: the release asks for no frame.
		expect(frames.asked()).toBe(asked);
	} finally {
		frames.restore();
	}
});

test("a press stops a wheel's zoom where it is drawn", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	const frames = takeFrames();
	try {
		act(() => {
			viewport().dispatchEvent(wheelAt(-100, [200, 150]));
		});
		frames.run(32);
		pointerAt("pointerdown", { x: 300, t: 5000 });
		pointerAt("pointerup", { x: 300, t: 5010 });
		const held = cameraNow();
		frames.run(500);
		expect(cameraNow()).toEqual(held);
	} finally {
		frames.restore();
	}
});

test("a refresh that fails keeps the diagram, says the picture is old, and retries", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	pressKey("ArrowLeft");
	const camera = surface().style.transform;

	// The board stops being readable after it had been readable. The picture
	// stays: showing nothing would be worse than showing something old.
	server.reply = UNREADABLE;
	act(() => announceSemanticBoardChange(PANE_VAULT, "pipeline", 2));
	await settle();
	expect(stageState()).toBe("stale");
	expect(surface().querySelector("svg")).not.toBeNull();
	expect(part("semantic-board-stage").getAttribute("data-version")).toBe("1");
	const disclosure = part("semantic-board-refresh-failure");
	expect(disclosure.textContent).toContain("last picture that loaded");
	expect(disclosure.textContent).toContain("not valid JSON");
	expect(surface().style.transform).toBe(camera);

	// The retry actually re-reads, and a read that works takes the strip away.
	const asked = server.calls.length;
	server.reply = { status: 200, body: drawing(2) };
	const retry = disclosure.querySelector("button");
	if (retry === null) {
		throw new Error("The disclosure offered no way to try again.");
	}
	act(() => {
		fireEvent.click(retry);
	});
	await settle();
	expect(server.calls.length).toBeGreaterThan(asked);
	expect(stageState()).toBe("drawn");
	expect(document.querySelector("[data-slot='semantic-board-refresh-failure']")).toBeNull();
	expect(part("semantic-board-stage").getAttribute("data-version")).toBe("2");
	expect(surface().style.transform).toBe(camera);
});

test("an empty board whose refresh fails says so rather than looking current", async () => {
	server.reply = NOTHING_DRAWN;
	mountStage();
	await settle();
	expect(stageState()).toBe("empty");

	// The board has probably been filled in — that is what the announcement
	// said — and the read failed. Nothing on screen may go on implying that
	// this board is still the empty one it was.
	server.reply = UNREADABLE;
	act(() => announceSemanticBoardChange(PANE_VAULT, "pipeline", 4));
	await settle();
	expect(stageState()).toBe("stale");
	const disclosure = part("semantic-board-refresh-failure");
	expect(disclosure.textContent).toContain("last picture that loaded");

	const retry = disclosure.querySelector("button");
	if (retry === null) {
		throw new Error("The disclosure offered no way to try again.");
	}
	server.reply = { status: 200, body: drawing(4) };
	act(() => {
		fireEvent.click(retry);
	});
	await settle();
	expect(stageState()).toBe("drawn");
	expect(document.querySelector("[data-slot='semantic-board-refresh-failure']")).toBeNull();
});

/**
 * Mount a pane over one half-answer and say what the pane made of it.
 * @param body The reply the render route gives.
 * @returns The state the pane settled in.
 */
async function stateOverReply(body: Record<string, unknown>): Promise<string | null> {
	server.reply = { status: 200, body };
	mountStage();
	await settle();
	const state = stageState();
	expect(document.body.textContent).not.toContain("has nothing on it yet");
	cleanup();
	return state;
}

test("a torn render answer is a failure, and never looks like an empty board", async () => {
	// The half-answers a bag of optional fields would have accepted: a picture
	// with no size, a size with no picture, and an identity with neither. A
	// board with an architecture on it must never be shown as one nobody has
	// started, so every one of these is the pane's failure state.
	const whole = drawing(1);
	expect(await stateOverReply({ ...whole, svg: undefined })).toBe("error");
	expect(await stateOverReply({ ...whole, width: 0, height: 0 })).toBe("error");
	expect(
		await stateOverReply({
			success: true,
			board: "pipeline",
			version: 1,
			variant: whole["variant"],
		}),
	).toBe("error");
});

test("a picture seen from far away is told so through a pan, and told again when zoomed in to read", async () => {
	server.reply = { status: 200, body: { ...drawing(1), width: 4000, height: 3000 } };
	mountStage();
	await settle();
	// Fitted, a card's responsibility is too small to read: its name is drawn instead.
	expect(surface().classList.contains("is-far")).toBe(true);
	// A pan redraws the surface's class, and the far view stays through it.
	act(() => {
		fireEvent.pointerDown(viewport(), { pointerId: 1, button: 0, clientX: 40, clientY: 40 });
		fireEvent.pointerMove(viewport(), { pointerId: 1, buttons: 1, clientX: 90, clientY: 40 });
	});
	expect(surface().classList.contains("is-far")).toBe(true);
	act(() => {
		fireEvent.pointerUp(viewport(), { pointerId: 1, clientX: 90, clientY: 40 });
	});
	expect(surface().classList.contains("is-far")).toBe(true);
	// Twenty presses ask for a zoom. While the hand moves the camera the surface
	// is a layer of its own, and the far view holds, so nothing is swapped in the
	// middle of the zoom.
	const frames = takeFrames();
	try {
		for (let press = 0; press < 20; press += 1)
			act(() => {
				fireEvent.keyDown(viewport(), { key: "+" });
			});
		frames.run(EXPLORING_MS.cameraEase * 3);
		expect(cameraNow().scale).toBeGreaterThan(0.75);
		expect(surface().classList.contains("is-far")).toBe(true);
		expect(surface().classList.contains("will-change-transform")).toBe(true);
		frames.run(EXPLORING_MS.cameraEase * 20);
	} finally {
		frames.restore();
	}
	// At rest, close enough to read: the far view ends, and the picture is drawn again at its size.
	expect(surface().classList.contains("is-far")).toBe(false);
	expect(surface().classList.contains("will-change-transform")).toBe(false);
});

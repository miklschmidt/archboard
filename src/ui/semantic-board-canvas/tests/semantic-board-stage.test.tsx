// The four states a semantic pane can be in, and the camera over the picture.
//
// Picking is a gesture rather than a state, and it has its own owner beside
// this one.

import { act, cleanup, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	NOTHING_DRAWN,
	NO_SUCH_BOARD,
	UNREADABLE,
	cameraNow,
	diagramPointUnder,
	drawing,
	mountStage,
	renderCalls,
	part,
	server,
	settle,
	stageState,
	surface,
	viewport,
	wheelAt,
} from "@/ui/semantic-board-canvas/tests/stage-harness";
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

test("a drawn board puts the server's picture on screen in the shell's theme", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	expect(stageState()).toBe("drawn");
	expect(surface().querySelector("svg")).not.toBeNull();
	expect(surface().querySelectorAll("[data-semantic-id]").length).toBe(3);
	expect(renderCalls()[0]).toContain("board=pipeline");
	expect(renderCalls()[0]).toContain("theme=light");
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

	act(() => {
		fireEvent.keyDown(viewport(), { key: "ArrowDown" });
	});
	expect(cameraNow()).not.toEqual(fit);
	act(() => {
		fireEvent.keyDown(viewport(), { key: "0" });
	});
	expect(cameraNow()).toEqual(fit);
});

test("the camera moves with the keyboard and survives the board changing under it", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	const before = cameraNow();

	act(() => {
		fireEvent.keyDown(viewport(), { key: "ArrowLeft" });
	});
	const panned = cameraNow();
	expect(panned.x - before.x).toBeCloseTo(64, 6);
	expect(panned.y).toBeCloseTo(before.y, 6);
	expect(panned.scale).toBeCloseTo(before.scale, 6);

	// Zooming by key is about the middle of the viewport: what is in the middle
	// stays in the middle.
	const middle = [400, 300] as const;
	act(() => {
		fireEvent.keyDown(viewport(), { key: "+" });
	});
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
	act(() => announceSemanticBoardChange("pipeline", 2));
	await settle();
	expect(server.calls.length).toBeGreaterThan(asked);
	expect(part("semantic-board-stage").getAttribute("data-version")).toBe("2");
	expect(surface().style.transform).toBe(transform);
});

test("a wheel over the diagram zooms about the pointer", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	const stage = viewport();
	const before = cameraNow();
	const pointer = [200, 150] as const;

	act(() => {
		stage.dispatchEvent(wheelAt(-120, pointer));
	});
	const after = cameraNow();
	expect(after.scale).toBeCloseTo(before.scale * 1.1, 6);
	// Anchored on the pointer: whatever was under it is still under it.
	const [wasX, wasY] = diagramPointUnder(before, pointer);
	const [isX, isY] = diagramPointUnder(after, pointer);
	expect(isX).toBeCloseTo(wasX, 6);
	expect(isY).toBeCloseTo(wasY, 6);
});

test("a refresh that fails keeps the diagram, says the picture is old, and retries", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	act(() => {
		fireEvent.keyDown(viewport(), { key: "ArrowLeft" });
	});
	const camera = surface().style.transform;

	// The board stops being readable after it had been readable. The picture
	// stays: showing nothing would be worse than showing something old.
	server.reply = UNREADABLE;
	act(() => announceSemanticBoardChange("pipeline", 2));
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
	act(() => announceSemanticBoardChange("pipeline", 4));
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
			theme: "light",
		}),
	).toBe("error");
});

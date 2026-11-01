// The traffic of a picture while its camera is moved by a hand.
//
// What this catches: traffic that keeps running under a drag; traffic that does
// not come back as the drag is let go; traffic that jumps to its full speed rather
// than gathering it; a wheel or a key that leaves traffic running; and a camera
// the stage moves itself, which never needs the traffic stood still.

import { act, fireEvent } from "@testing-library/react";
import { beforeEach, expect, test } from "bun:test";

import { EXPLORING_MS } from "@archboard/timing";
import {
	cameraNow,
	pointerAt,
	takeFrames,
} from "#tests/ui/support/semantic-board-canvas/camera-probes.ts";
import {
	drawing,
	inPicture,
	mountStage,
	server,
	settle,
	viewport,
	type MountOptions,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";
import {
	calls,
	forgetCalls,
	told,
} from "#tests/ui/support/semantic-board-canvas/recording-stage.ts";

beforeEach(() => {
	forgetCalls();
});

/**
 * Mount a pane, and forget what the mount told the stage.
 * @param options How the pane is mounted, when not alone with nothing picked.
 */
async function mountAtRest(options?: MountOptions): Promise<void> {
	server.reply = { status: 200, body: drawing(1) };
	mountStage(null, options);
	await settle();
	forgetCalls();
}

/**
 * The last thing the stage was told about its traffic.
 * @returns The call's name, or null when it was told nothing.
 */
function lastPace(): string | null {
	const paces = new Set(["holdTraffic", "resumeTraffic", "releaseTraffic"]);
	return told.findLast((one) => paces.has(one.call))?.call ?? null;
}

/** Drag the picture fast, and keep the pointer down. */
function dragPicture(): void {
	// 200 pixels in 80 milliseconds: 2.5 pixels a millisecond.
	pointerAt("pointerdown", { x: 100, t: 1000 });
	for (let step = 1; step <= 5; step += 1) {
		pointerAt("pointermove", { x: 100 + step * 40, t: 1000 + step * 16 });
	}
}

test("traffic stands still under a drag and comes back gently the moment the drag is let go", async () => {
	await mountAtRest();
	const frames = takeFrames();
	try {
		dragPicture();
		expect(lastPace()).toBe("holdTraffic");

		pointerAt("pointerup", { x: 300, t: 1082 });
		frames.run(100);

		expect(lastPace()).toBe("resumeTraffic");
		expect(calls("resumeTraffic").at(-1)).toEqual([EXPLORING_MS.trafficStart]);
	} finally {
		frames.restore();
	}
});

test("a drag that rests with the pointer held down keeps the traffic still", async () => {
	await mountAtRest();
	const frames = takeFrames();
	try {
		dragPicture();
		frames.run(EXPLORING_MS.cameraRest * 4);

		expect(lastPace()).toBe("holdTraffic");
	} finally {
		frames.restore();
	}
});

test("a key that moves the camera stands the traffic still until the camera has settled", async () => {
	await mountAtRest();
	const frames = takeFrames();
	try {
		act(() => {
			fireEvent.keyDown(viewport(), { key: "ArrowLeft" });
		});
		frames.run(32);
		expect(lastPace()).toBe("holdTraffic");

		frames.run(3000);
		expect(lastPace()).toBe("resumeTraffic");
	} finally {
		frames.restore();
	}
});

test("a camera the stage moves itself leaves the traffic running", async () => {
	await mountAtRest();
	const frames = takeFrames();
	try {
		act(() => {
			fireEvent.keyDown(viewport(), { key: "0" });
		});
		frames.run(EXPLORING_MS.cameraFit + 100);

		expect(calls("holdTraffic")).toEqual([]);
	} finally {
		frames.restore();
	}
});

/**
 * A card that reaches under the panel, with room to its left to move.
 * @returns Where it stands.
 */
function reachesUnderThePanel(): DOMRect {
	return new DOMRect(600, 0, 200, 100);
}

test("a pick that a panel laid over the picture would cover moves the picture clear and leaves the traffic running", async () => {
	// Two panes share the centre, so a pick lays the sidebar's panel over the
	// picture's edge. This DOM lays nothing out, so the card says where it stands.
	await mountAtRest({
		live: true,
		chrome: {
			letter: null,
			controls: null,
			notice: null,
			shared: true,
			active: true,
			column: null,
			openBeside: null,
		},
	});
	const frames = takeFrames();
	try {
		const before = cameraNow().x;
		const card = inPicture("card");
		Object.assign(card.parentElement ?? card, { getBoundingClientRect: reachesUnderThePanel });
		act(() => {
			fireEvent.click(card);
		});
		// The pick opens the sidebar, whose inspector reads the board. Let that read
		// land inside this test: answered after it, it renders outside act and
		// leaves React a passive-effect flush that runs after the DOM is gone.
		await settle();
		frames.run(1032);
		expect(cameraNow().x).toBeLessThan(before);
		expect(calls("holdTraffic")).toEqual([]);
	} finally {
		frames.restore();
	}
});

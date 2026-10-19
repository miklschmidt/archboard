// What a camera move draws again (TASK-385.02): the surface it moves, and nothing
// around it. A pan, a zoom or a glide's landing can come every frame; the stage,
// its sidebar and its inspector have nothing in them that depends on where the
// camera is.

import { expect, test } from "bun:test";

import { rendersDuring } from "#tests/ui/support/semantic-board-canvas/render-watch.ts";

// React's renderer is loaded only now, once the watch is there for it to find.
const { act, fireEvent } = await import("@testing-library/react");
const { cameraNow, takeFrames, wheelAt } =
	await import("#tests/ui/support/semantic-board-canvas/camera-probes.ts");
const { drawing, mountStage, server, settle, viewport } =
	await import("#tests/ui/support/semantic-board-canvas/stage-harness.tsx");

/** Components that are drawn around the picture and must not be drawn again for a camera move. */
const AROUND_THE_PICTURE = ["SemanticBoardStage", "SemanticStageSidebar", "SemanticDiagram"];

test("a pan or a zoom draws the surface again and nothing around it", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	const before = cameraNow();
	// Both run over many frames now, and each frame draws the surface and nothing else.
	const frames = takeFrames();
	try {
		const panned = rendersDuring(() => {
			act(() => {
				fireEvent.keyDown(viewport(), { key: "ArrowLeft" });
			});
			frames.run(400);
		});
		const zoomed = rendersDuring(() => {
			act(() => {
				viewport().dispatchEvent(wheelAt(-100, [400, 300]));
			});
			frames.run(400);
		});

		expect(cameraNow()).not.toEqual(before);
		expect(panned.length).toBeGreaterThan(0);
		expect(zoomed.length).toBeGreaterThan(0);
		for (const name of AROUND_THE_PICTURE) {
			expect(panned).not.toContain(name);
			expect(zoomed).not.toContain(name);
		}
	} finally {
		frames.restore();
	}
});

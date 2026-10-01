// What a camera move draws again (TASK-385.02): the surface it moves, and nothing
// around it. A pan, a zoom or a glide's landing can come every frame; the stage,
// its sidebar and its inspector have nothing in them that depends on where the
// camera is.

import { expect, test } from "bun:test";

import { rendersDuring } from "@/ui/semantic-board-canvas/tests/render-watch";

// React's renderer is loaded only now, once the watch is there for it to find.
const { act, fireEvent } = await import("@testing-library/react");
const { cameraNow, wheelAt } = await import("@/ui/semantic-board-canvas/tests/camera-probes");
const { drawing, mountStage, server, settle, viewport } =
	await import("@/ui/semantic-board-canvas/tests/stage-harness");

/** Components that are drawn around the picture and must not be drawn again for a camera move. */
const AROUND_THE_PICTURE = ["SemanticBoardStage", "SemanticStageSidebar", "SemanticDiagram"];

test("a pan or a zoom draws the surface again and nothing around it", async () => {
	server.reply = { status: 200, body: drawing(1) };
	mountStage();
	await settle();
	const before = cameraNow();

	const panned = rendersDuring(() => {
		act(() => {
			fireEvent.keyDown(viewport(), { key: "ArrowLeft" });
		});
	});
	const zoomed = rendersDuring(() => {
		act(() => {
			viewport().dispatchEvent(wheelAt(-100, [400, 300]));
		});
	});

	expect(cameraNow()).not.toEqual(before);
	expect(panned.length).toBeGreaterThan(0);
	expect(zoomed.length).toBeGreaterThan(0);
	for (const name of AROUND_THE_PICTURE) {
		expect(panned).not.toContain(name);
		expect(zoomed).not.toContain(name);
	}
});

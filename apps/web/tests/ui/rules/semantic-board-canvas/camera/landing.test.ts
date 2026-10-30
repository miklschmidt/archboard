import { expect, test } from "bun:test";
import { FIT_MARGIN } from "@archboard/renderer/shell-geometry";
import { cameraFor } from "#ui/rules/semantic-board-canvas/camera/camera.ts";

const pane = { width: 1551, height: 960 };

test("a picture that reads whole lands whole, centred", () => {
	const camera = cameraFor(pane, { kind: "landing", content: { width: 1800, height: 1000 } });
	expect(camera?.scale).toBeCloseTo(0.835, 3);
	expect(camera?.y).toBeCloseTo((960 - 1000 * camera!.scale) / 2, 6);
});

test("a small picture lands at the size it was drawn", () => {
	expect(cameraFor(pane, { kind: "landing", content: { width: 400, height: 300 } })?.scale).toBe(1);
});

test("a picture too large to read whole lands at the floor, on the head of its frame", () => {
	const head = { x: 100, y: 500, width: 1000, height: 1200 };
	const camera = cameraFor(pane, { kind: "landing", content: { width: 2000, height: 3000 }, head });
	expect(camera?.scale).toBe(0.6);
	expect(camera?.y).toBe(FIT_MARGIN - 500 * 0.6);
	expect(camera?.x).toBeCloseTo(1551 / 2 - 600 * 0.6, 6);
});

test("a frame wider than the pane lands on its left edge", () => {
	const head = { x: 40, y: 0, width: 4000, height: 2000 };
	const camera = cameraFor(pane, { kind: "landing", content: { width: 4100, height: 2000 }, head });
	expect(camera?.x).toBe(FIT_MARGIN - 40 * 0.6);
});

test("the fit key still shows the whole of a picture that lands at the floor", () => {
	const content = { width: 2000, height: 3000 };
	expect(cameraFor(pane, { kind: "whole", content })?.scale).toBeLessThan(0.6);
});

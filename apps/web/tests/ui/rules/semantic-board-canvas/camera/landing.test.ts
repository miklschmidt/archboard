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

test("a picture larger than the pane lands whole, however small that makes it", () => {
	const content = { width: 4000, height: 3000 };
	const camera = cameraFor(pane, { kind: "landing", content });
	expect(camera).toEqual(cameraFor(pane, { kind: "whole", content }));
	expect(camera?.scale).toBeLessThan(0.6);
});

test("a long flow lands on its first steps, centred, at a scale that reads", () => {
	const content = { width: 800, height: 3000 };
	const camera = cameraFor(pane, { kind: "flow", content });
	expect(camera?.scale).toBe(0.6);
	expect(camera?.x).toBeCloseTo((1551 - 800 * 0.6) / 2, 6);
	expect(camera?.y).toBe(FIT_MARGIN);
});

test("a flow that reads whole lands whole", () => {
	const content = { width: 800, height: 600 };
	expect(cameraFor(pane, { kind: "flow", content })).toEqual(
		cameraFor(pane, { kind: "landing", content }),
	);
});

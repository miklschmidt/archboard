import { expect, test } from "bun:test";
import { improveProjection, type LabelAttempt } from "@/runtime/semantic-renderer/layout";

const current: LabelAttempt = {
	drawing: { direction: "down", width: 400, height: 300, cards: [], containers: [], edges: [] },
	missing: [],
	unused: [],
};

test("an optional waypoint refusal preserves the complete drawing across the native worker boundary", async () => {
	const result = await improveProjection(current, async () => {
		throw new Error("NativeRouteUnavailable: blocked waypoint");
	});
	expect(result).toBe(current);
});

test("an unexpected projection failure remains visible", async () => {
	const failure = new TypeError("invalid layout input");
	await expect(
		improveProjection(current, async () => {
			throw failure;
		}),
	).rejects.toBe(failure);
});

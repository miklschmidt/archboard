import { expect, test } from "bun:test";
import { AFTER } from "#ui/rules/architecture-model/comparison-intent.ts";
import { modelReading } from "#ui/rules/board-routing/model-address.ts";

const ADDRESS = { id: "Shop", scope: null, checkpoint: null };

test("After reaches the server as a reading with its comparison turned off", () => {
	const reading = modelReading({ ...ADDRESS, state: "Queued", against: AFTER });
	expect(reading).toMatchObject({ state: "Queued", compare: false });
	expect(reading.against).toBeUndefined();
});

test("a named base stays a base", () => {
	const reading = modelReading({ ...ADDRESS, against: "current" });
	expect(reading.against).toBe("current");
	expect(reading.compare).toBeUndefined();
});

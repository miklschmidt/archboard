import { expect, test } from "bun:test";

import { transportRefusalMessage } from "#ui/composer/rules/vocabulary.ts";

test("an unknown transport refusal has a stable nonempty fallback", () => {
	const fallback = transportRefusalMessage("something_new");
	expect(fallback).toMatch(/\S/u);
	expect(transportRefusalMessage("something_else")).toBe(fallback);
});

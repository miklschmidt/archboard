import { expect, test } from "bun:test";

import { variantOrder } from "#ui/rules/variant-lifecycle/lifecycle.ts";

test("a board's variants list the one its name opens, then the live ones, then the receding ones newest first", () => {
	const variants = [
		{ id: "first", lifecycle: "historical" },
		{ id: "shelf", lifecycle: "shelved" },
		{ id: "draft", lifecycle: "draft" },
		{ id: "older", lifecycle: "historical" },
		{ id: "now", lifecycle: "current" },
		{ id: "late", lifecycle: "draft" },
	] as const;
	expect(variantOrder(variants, "now").map((variant) => variant.id)).toEqual([
		"now",
		"draft",
		"late",
		"older",
		"shelf",
		"first",
	]);
	// A board nobody has built opens its first draft; nothing else moves.
	expect(variantOrder(variants, "late").map((variant) => variant.id)).toEqual([
		"late",
		"draft",
		"now",
		"older",
		"shelf",
		"first",
	]);
});

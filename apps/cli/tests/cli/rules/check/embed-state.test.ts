// How an embed stands against its recipe drawn again (ADR 0057): a changed
// picture is outdated when the fingerprint moved too and a renderer change
// when it did not; a changed fingerprint alone is current, with a recipe
// `--fix` writes again; and only a recipe of the current variant's overview or
// Everything, read against nothing, can follow a deleted board's name.

import { expect, test } from "bun:test";
import type { RenderRecipe } from "@archboard/renderer/recipe";
import { embedStanding, isRepointable } from "#cli/rules/check/embed-state.ts";

const digest = (digit: string) => `sha256:${digit.repeat(64)}`;
const kept: RenderRecipe = {
	recipe: 1,
	board: { id: "b1", name: "Ledger" },
	vault: { repo: "github.com/example/docs" },
	variant: "current",
	view: "overview",
	comparison: "on",
	theme: "dark",
	layout: null,
	title: null,
	legend: { layout: "horizontal", alone: false },
	fingerprint: digest("1"),
	picture: digest("2"),
};

test("a changed picture is outdated with a changed fingerprint and a renderer change without one", () => {
	expect(embedStanding(kept, kept)).toBe("current");
	expect(embedStanding(kept, { ...kept, fingerprint: digest("3"), picture: digest("4") })).toBe(
		"outdated",
	);
	expect(embedStanding(kept, { ...kept, picture: digest("4") })).toBe("renderer-changed");
	expect(embedStanding(kept, { ...kept, fingerprint: digest("3") })).toBe("recipe-stale");
	expect(embedStanding(kept, { ...kept, board: { id: "b1", name: "Books" } })).toBe("recipe-stale");
	// The route draws a bitmap's SVG, so its scale and region are the kept ones.
	const bitmap = { ...kept, raster: { scale: 2, region: null } };
	expect(embedStanding(bitmap, kept)).toBe("current");
});

test("only the current variant's overview or Everything, read against nothing, follows a deleted board's name", () => {
	expect(isRepointable(kept)).toBe(true);
	expect(isRepointable({ ...kept, view: { id: "Everything" }, comparison: "off" })).toBe(true);
	expect(isRepointable({ ...kept, view: { id: "v1" } })).toBe(false);
	expect(isRepointable({ ...kept, variant: { id: "x1" } })).toBe(false);
	expect(isRepointable({ ...kept, comparison: { against: "x1" } })).toBe(false);
});

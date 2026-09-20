import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { expect, test } from "bun:test";
import { themeColor } from "@/shared/theme/server";
import { paletteFor, renderArchitecture } from "@/runtime/semantic-renderer/index";
import { groupOf } from "@/runtime/semantic-renderer/tests/drawn-subjects";

const content = orderedFixture({
	nodes: [
		{ id: "one", name: "One", kind: "service" },
		{ id: "two", name: "Two", kind: "service" },
	],
	edges: [{ id: "edge", from: "one", to: "two", kind: "call" }],
});

test("standalone SVGs embed the shared theme's literal surface and comparison colors", async () => {
	for (const theme of ["light", "dark"] as const) {
		const unmarked = await renderArchitecture({ content, theme });
		expect(groupOf(unmarked.svg, "edge", "edge")!.markup).toContain(
			`stroke="${themeColor(theme, "--diagram-edge")}"`,
		);
		const { svg } = await renderArchitecture({ content, theme, standing: { edge: "added" } });
		// The ground, a card's fill and rule, and a standing: literal, as the
		// palette resolves them from the shared tokens, whichever tokens those are.
		const palette = paletteFor(theme);
		for (const color of [
			palette.background,
			palette.card,
			palette.cardBorder,
			palette.standingAdded,
		]) {
			expect(svg).toContain(`"${color}"`);
		}
		expect(svg).not.toMatch(/(?:var|oklch|oklab|color)\(/u);
		expect(svg).not.toContain("theme.css");
	}
});

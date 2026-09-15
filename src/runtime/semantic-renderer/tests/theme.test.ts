import { expect, test } from "bun:test";
import { themeColor } from "@/shared/theme/server";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { groupOf } from "@/runtime/semantic-renderer/tests/drawn-subjects";

const content = VariantContentSchema.parse({
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
		for (const token of ["--background", "--card", "--border", "--standing-added"]) {
			expect(svg).toContain(`"${themeColor(theme, token)}"`);
		}
		expect(svg).not.toMatch(/(?:var|oklch|oklab|color)\(/u);
		expect(svg).not.toContain("theme.css");
	}
});

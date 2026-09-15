import { expect, test } from "bun:test";
import { readThemeColors, themeColor } from "@/shared/theme/server";

// The contract is an inherited light/dark theme of literal portable colors,
// not a browser cascade or a second set of hand-maintained color constants.
test("theme declarations resolve colors, dark overrides and opacity for standalone export", () => {
	const colors = readThemeColors(`
		:root { --card: #fff; --background: oklch(1 0 0); --border: oklch(0 0 0 / 15%); }
		:root[data-theme="dark"] { --background: oklch(0 0 0); }
	`);
	expect(colors.light).toEqual({
		"--card": "#ffffff",
		"--background": "#ffffff",
		"--border": "rgba(0, 0, 0, 0.15)",
	});
	expect(colors.dark).toEqual({ ...colors.light, "--background": "#000000" });
	expect(() => themeColor("dark", "--missing")).toThrow();
});

test("unsupported CSS cannot silently give exports a different theme from the browser", () => {
	for (const source of [
		":root { --background: var(--card); }",
		":root { --background: currentcolor; }",
		"@media (prefers-color-scheme: dark) { :root { --background: black; } }",
		":root { --background: black !important; }",
	])
		expect(() => readThemeColors(source)).toThrow();
});
